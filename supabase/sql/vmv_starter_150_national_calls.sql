-- VMV Smart Call — separate Starter national-call minutes.
-- Additive; code gates usage behind a Preview-only, allowlisted feature flag.
-- Count only answered direct-call conversations, rounded up per call.
-- No Stripe product, paid national top-up, or production entitlements created.

create table if not exists public.smartjob_national_periods (
 user_id uuid not null references auth.users(id) on delete cascade,
 period_start timestamptz not null,
 period_end timestamptz not null,
 included_minutes integer not null default 150,
 used_minutes integer not null default 0,
 reserved_minutes integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(user_id,period_start),
 constraint sj_nat_valid_period check(period_end>period_start),
 constraint sj_nat_fixed_starter check(included_minutes=150),
 constraint sj_nat_used_check check(used_minutes>=0 and used_minutes<=150),
 constraint sj_nat_reserved_check check(reserved_minutes>=0 and reserved_minutes<=150),
 constraint sj_nat_total_check check(used_minutes+reserved_minutes<=included_minutes)
);
create table if not exists public.smartjob_national_calls (
 call_key text primary key,
 user_id uuid not null,
 period_start timestamptz not null,
 reserved_minutes integer not null,
 billed_minutes integer not null default 0,
 status text not null default 'reserved',
 opened_at timestamptz not null default now(),
 settled_at timestamptz,
 constraint sj_nat_call_key_check check(call_key ~ '^(in:CA[[:xdigit:]]{32}|out:[[:xdigit:]-]{36})$'),
 constraint sj_nat_call_reserved check(reserved_minutes between 1 and 10),
 constraint sj_nat_call_billed check(billed_minutes>=0 and billed_minutes<=reserved_minutes),
 constraint sj_nat_call_status check(status in ('reserved','settled','expired')),
 constraint sj_nat_call_reference foreign key(user_id,period_start)
  references public.smartjob_national_periods(user_id,period_start) on delete cascade
);
create index if not exists sj_national_calls_owner_period on public.smartjob_national_calls(user_id,period_start,opened_at desc);
create index if not exists sj_national_calls_active on public.smartjob_national_calls(user_id,opened_at) where status='reserved';

alter table public.smartjob_national_periods enable row level security;
alter table public.smartjob_national_calls enable row level security;
revoke all on public.smartjob_national_periods,public.smartjob_national_calls from public,anon,authenticated;
grant select,insert,update,delete on public.smartjob_national_periods,public.smartjob_national_calls to service_role;

-- All mutations lock the period row first: safe under simultaneous calls.
-- Reaper only releases reservations >20m (real pilot calls are capped to <=10m).
create or replace function public.smartjob_national_claim(
 p_user_id uuid, p_call_key text, p_max_minutes integer default 10)
returns integer language plpgsql security definer set search_path=''
as $body$
declare
 a record; w record; prior record;
 grant_minutes integer; expired_total integer;
begin
 if p_user_id is null or p_call_key is null or
    p_call_key !~ '^(in:CA[[:xdigit:]]{32}|out:[[:xdigit:]-]{36})$' or
    p_max_minutes not between 1 and 10 then return 0; end if;

 select plan_code,status,current_period_start,current_period_end
 into a from public.smartjob_billing_accounts
 where user_id=p_user_id for update;
 if not found or a.plan_code<>'starter' or a.status not in ('active','trialing')
    or a.current_period_start is null or a.current_period_end is null
    or a.current_period_start>=now() or a.current_period_end<=now() then return 0; end if;

 insert into public.smartjob_national_periods(user_id,period_start,period_end)
 values(p_user_id,a.current_period_start,a.current_period_end)
 on conflict(user_id,period_start) do nothing;
 select * into w from public.smartjob_national_periods
 where user_id=p_user_id and period_start=a.current_period_start for update;
 if not found or w.period_end<>a.current_period_end then return 0; end if;

 -- Reclaim abandoned attempts before checking available minutes.
 with reaped as (
  update public.smartjob_national_calls
  set status='expired',settled_at=now()
  where user_id=p_user_id and period_start=a.current_period_start
    and status='reserved' and opened_at<now()-interval '20 minutes'
  returning reserved_minutes
 )
 select coalesce(sum(reserved_minutes),0)::integer into expired_total from reaped;
 if expired_total>0 then
  update public.smartjob_national_periods
  set reserved_minutes=reserved_minutes-expired_total,updated_at=now()
  where user_id=p_user_id and period_start=a.current_period_start;
  w.reserved_minutes:=w.reserved_minutes-expired_total;
 end if;

 select * into prior from public.smartjob_national_calls where call_key=p_call_key for update;
 if found then
  if prior.user_id=p_user_id and prior.period_start=a.current_period_start
    and prior.status='reserved' then return prior.reserved_minutes; end if;
  return 0;
 end if;
 grant_minutes:=least(p_max_minutes,w.included_minutes-w.used_minutes-w.reserved_minutes);
 if grant_minutes<=0 then return 0; end if;
 insert into public.smartjob_national_calls(call_key,user_id,period_start,reserved_minutes)
 values(p_call_key,p_user_id,a.current_period_start,grant_minutes);
 update public.smartjob_national_periods
 set reserved_minutes=reserved_minutes+grant_minutes,updated_at=now()
 where user_id=p_user_id and period_start=a.current_period_start;
 return grant_minutes;
end
$body$;

create or replace function public.smartjob_national_settle(
 p_call_key text,p_duration_seconds integer)
returns integer language plpgsql security definer set search_path=''
as $body$
declare c record; w record; bill integer;
begin
 if p_call_key is null or p_duration_seconds is null or p_duration_seconds<0
    or p_duration_seconds>14400 then return -1; end if;
 select user_id,period_start into c from public.smartjob_national_calls
 where call_key=p_call_key;
 if not found then return -1; end if;
 select * into w from public.smartjob_national_periods
 where user_id=c.user_id and period_start=c.period_start for update;
 if not found then return -1; end if;
 select * into c from public.smartjob_national_calls where call_key=p_call_key for update;
 if c.status<>'reserved' then return c.billed_minutes; end if;
 bill:=least(c.reserved_minutes,(p_duration_seconds+59)/60);
 update public.smartjob_national_calls
 set billed_minutes=bill,status='settled',settled_at=now() where call_key=p_call_key;
 update public.smartjob_national_periods
 set reserved_minutes=reserved_minutes-c.reserved_minutes,
     used_minutes=used_minutes+bill,updated_at=now()
 where user_id=c.user_id and period_start=c.period_start;
 return bill;
end
$body$;

create or replace function public.smartjob_national_reap(p_user_id uuid)
returns integer language plpgsql security definer set search_path=''
as $body$
declare w record; expired_total integer; total_reaped integer:=0;
begin
 if p_user_id is null then return 0; end if;
 for w in select user_id,period_start from public.smartjob_national_periods
  where user_id=p_user_id order by period_start for update loop
  with reaped as (
   update public.smartjob_national_calls
   set status='expired',settled_at=now()
   where user_id=w.user_id and period_start=w.period_start and
    status='reserved' and opened_at<now()-interval '20 minutes'
   returning reserved_minutes
  )
  select coalesce(sum(reserved_minutes),0)::integer into expired_total from reaped;
  if expired_total>0 then
   update public.smartjob_national_periods
   set reserved_minutes=reserved_minutes-expired_total,updated_at=now()
   where user_id=w.user_id and period_start=w.period_start;
   total_reaped:=total_reaped+expired_total;
  end if;
 end loop;
 return total_reaped;
end
$body$;

revoke execute on function public.smartjob_national_claim(uuid,text,integer) from public,anon,authenticated;
revoke execute on function public.smartjob_national_settle(text,integer) from public,anon,authenticated;
revoke execute on function public.smartjob_national_reap(uuid) from public,anon,authenticated;
grant execute on function public.smartjob_national_claim(uuid,text,integer) to service_role;
grant execute on function public.smartjob_national_settle(text,integer) to service_role;
grant execute on function public.smartjob_national_reap(uuid) to service_role;
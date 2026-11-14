-- Atomic, server-only quotas for Web Studio AI site generation.
-- Separate from image quota: 2 generated websites per owner/day, 80 globally/day UTC.
create table if not exists public.smartjob_web_site_ai_usage (
 owner_id uuid not null references auth.users(id) on delete cascade,
 usage_day date not null,
 calls integer not null default 0 check (calls >= 0 and calls <= 2),
 updated_at timestamptz not null default now(),
 primary key (owner_id, usage_day)
);
create table if not exists public.smartjob_web_site_ai_global_usage (
 usage_day date primary key,
 calls integer not null default 0 check (calls >= 0 and calls <= 80),
 updated_at timestamptz not null default now()
);
alter table public.smartjob_web_site_ai_usage enable row level security;
alter table public.smartjob_web_site_ai_global_usage enable row level security;
revoke all on public.smartjob_web_site_ai_usage from public, anon, authenticated;
revoke all on public.smartjob_web_site_ai_global_usage from public, anon, authenticated;
grant select, insert, update on public.smartjob_web_site_ai_usage to service_role;
grant select, insert, update on public.smartjob_web_site_ai_global_usage to service_role;
create or replace function public.smartjob_web_site_ai_claim_slot(p_owner uuid)
returns boolean language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
 day_utc date := (now() at time zone 'utc')::date;
 owner_calls integer;
 global_calls integer;
begin
 if p_owner is null then return false; end if;
 perform pg_advisory_xact_lock(782491, 20261113);
 select calls into owner_calls from public.smartjob_web_site_ai_usage
 where owner_id=p_owner and usage_day=day_utc;
 select calls into global_calls from public.smartjob_web_site_ai_global_usage
 where usage_day=day_utc;
 if coalesce(owner_calls,0)>=2 or coalesce(global_calls,0)>=80 then return false; end if;
 insert into public.smartjob_web_site_ai_usage(owner_id,usage_day,calls) values(p_owner,day_utc,1)
 on conflict(owner_id,usage_day) do update set calls=public.smartjob_web_site_ai_usage.calls+1,updated_at=now();
 insert into public.smartjob_web_site_ai_global_usage(usage_day,calls) values(day_utc,1)
 on conflict(usage_day) do update set calls=public.smartjob_web_site_ai_global_usage.calls+1,updated_at=now();
 return true;
end;$$;
revoke all on function public.smartjob_web_site_ai_claim_slot(uuid) from public, anon, authenticated;
grant execute on function public.smartjob_web_site_ai_claim_slot(uuid) to service_role;
comment on function public.smartjob_web_site_ai_claim_slot(uuid) is
 'Server-only quota: two AI sites per owner per UTC day; eighty per day globally.';
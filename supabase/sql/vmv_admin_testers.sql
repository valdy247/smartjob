-- VMV Admin Testers: private contacts, immutable deployment snapshots and durable send attempts.
-- All writes are server-only and validated again against vmv_marketing_staff.
create table if not exists public.vmv_admin_testers(
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(btrim(name)) between 2 and 100),
 email text check(email is null or (char_length(email)<=254 and email ~* '^[A-Za-z0-9.!#$%&''*+/=?^_\x60{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')),
 phone_e164 text check(phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 preferred_channel text not null default 'email' check(preferred_channel in ('email','sms')),
 active boolean not null default true,
 email_opt_in boolean not null default false,
 email_opted_out_at timestamptz,
 sms_consent_at timestamptz,
 sms_consent_source text check(sms_consent_source is null or char_length(sms_consent_source) between 3 and 120),
 sms_opted_out_at timestamptz,
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint tester_contact check(email is not null or phone_e164 is not null),
 constraint tester_channel check((preferred_channel='email' and email is not null) or (preferred_channel='sms' and phone_e164 is not null)),
 constraint tester_sms_consent check(sms_consent_at is null or sms_consent_source is not null)
);
create unique index if not exists vmv_admin_testers_email_uq on public.vmv_admin_testers(lower(email)) where email is not null;
create unique index if not exists vmv_admin_testers_phone_uq on public.vmv_admin_testers(phone_e164) where phone_e164 is not null;
create index if not exists vmv_admin_testers_active_idx on public.vmv_admin_testers(active,created_at desc);

create table if not exists public.vmv_admin_tester_batches(
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references auth.users(id),
 request_key uuid not null,
 deployment_id text not null check(char_length(deployment_id) between 10 and 100),
 deployment_url text not null check(deployment_url like 'https://%' and char_length(deployment_url)<400),
 deployment_sha text not null check(deployment_sha ~ '^[a-f0-9]{40}$'),
 deployment_message text not null check(char_length(deployment_message)<=250),
 deployment_created_at timestamptz not null,
 channel_mode text not null check(channel_mode in ('auto','email','sms')),
 created_at timestamptz not null default now(),
 unique(created_by,request_key)
);
create index if not exists vmv_admin_tester_batches_recent_idx on public.vmv_admin_tester_batches(created_at desc);

create table if not exists public.vmv_admin_tester_deliveries(
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null references public.vmv_admin_tester_batches(id),
 tester_id uuid not null references public.vmv_admin_testers(id),
 channel text not null check(channel in ('email','sms')),
 address_snapshot text not null check(char_length(address_snapshot) between 3 and 254),
 state text not null default 'pending' check(state in ('pending','processing','accepted','delivered','failed','unknown')),
 provider text,
 provider_id text,
 error_code text,
 attempt_count integer not null default 0 check(attempt_count between 0 and 3),
 attempt_key uuid,
 claimed_at timestamptz,
 provider_at timestamptz,
 delivered_at timestamptz,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(batch_id,tester_id)
);
create index if not exists vmv_admin_tester_deliveries_state_idx on public.vmv_admin_tester_deliveries(state,created_at);
create index if not exists vmv_admin_tester_deliveries_provider_idx on public.vmv_admin_tester_deliveries(provider,provider_id) where provider_id is not null;
create index if not exists vmv_admin_tester_deliveries_test_idx on public.vmv_admin_tester_deliveries(tester_id,channel,state,created_at desc);

create table if not exists public.vmv_admin_tester_events(
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id),
 tester_id uuid references public.vmv_admin_testers(id),
 delivery_id uuid references public.vmv_admin_tester_deliveries(id),
 operation text not null,
 context jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists vmv_admin_tester_events_created_idx on public.vmv_admin_tester_events(created_at desc);

alter table public.vmv_admin_testers enable row level security;
alter table public.vmv_admin_tester_batches enable row level security;
alter table public.vmv_admin_tester_deliveries enable row level security;
alter table public.vmv_admin_tester_events enable row level security;
revoke all on public.vmv_admin_testers,public.vmv_admin_tester_batches,public.vmv_admin_tester_deliveries,public.vmv_admin_tester_events from PUBLIC,anon,authenticated;
grant select,insert,update,delete on public.vmv_admin_testers,public.vmv_admin_tester_batches,public.vmv_admin_tester_deliveries,public.vmv_admin_tester_events to service_role;
grant usage,select on sequence public.vmv_admin_tester_events_id_seq to service_role;

create or replace function public.vmv_admin_tester_save(
 p_actor uuid,p_id uuid,p_name text,p_email text,p_phone text,
 p_preferred text,p_active boolean,p_email_opt_in boolean,
 p_sms_consent boolean,p_sms_source text,p_expected timestamptz default null
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid;v_old public.vmv_admin_testers%rowtype;
 v_email text:=nullif(lower(btrim(coalesce(p_email,''))),'');
 v_phone text:=nullif(btrim(coalesce(p_phone,'')),'');
 v_sms_time timestamptz;v_sms_source text;
begin
 if not exists(select 1 from public.vmv_marketing_staff where user_id=p_actor and role='admin') then raise exception 'forbidden'; end if;
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 100 or
    (v_email is null and v_phone is null) or
    (v_email is not null and (char_length(v_email)>254 or v_email !~* '^[A-Za-z0-9.!#$%&''*+/=?^_\x60{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')) or
    (v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$') or
    p_preferred not in ('email','sms') or
    (p_preferred='email' and v_email is null) or (p_preferred='sms' and v_phone is null) then raise exception 'invalid_tester'; end if;
 if p_id is not null then
  select * into v_old from public.vmv_admin_testers where id=p_id for update;
  if not found then raise exception 'tester_not_found'; end if;
  if p_expected is null or v_old.updated_at<>p_expected then raise exception 'conflict'; end if;
  v_sms_time:=case when p_sms_consent then coalesce(v_old.sms_consent_at,now()) else null end;
  v_sms_source:=case when p_sms_consent then coalesce(nullif(btrim(p_sms_source),''),v_old.sms_consent_source) else null end;
  if v_phone is distinct from v_old.phone_e164 then
   v_sms_time:=case when p_sms_consent then now() else null end;
   v_sms_source:=case when p_sms_consent then nullif(btrim(p_sms_source),'') else null end;
  end if;
  if p_sms_consent and (v_sms_source is null or char_length(v_sms_source) not between 3 and 120) then raise exception 'sms_consent_source_required'; end if;
  update public.vmv_admin_testers set name=btrim(p_name),email=v_email,phone_e164=v_phone,
    preferred_channel=p_preferred,active=p_active,email_opt_in=p_email_opt_in,
    sms_consent_at=v_sms_time,sms_consent_source=v_sms_source,
    sms_opted_out_at=case when v_phone is distinct from v_old.phone_e164 then null else v_old.sms_opted_out_at end,
    updated_by=p_actor,updated_at=clock_timestamp()
   where id=p_id returning id into v_id;
 else
  if p_sms_consent and (p_sms_source is null or char_length(btrim(p_sms_source)) not between 3 and 120) then raise exception 'sms_consent_source_required'; end if;
  insert into public.vmv_admin_testers(name,email,phone_e164,preferred_channel,active,email_opt_in,
    sms_consent_at,sms_consent_source,created_by,updated_by)
   values(btrim(p_name),v_email,v_phone,p_preferred,coalesce(p_active,true),coalesce(p_email_opt_in,false),
    case when p_sms_consent then now() end,case when p_sms_consent then btrim(p_sms_source) end,p_actor,p_actor)
   returning id into v_id;
 end if;
 insert into public.vmv_admin_tester_events(actor_id,tester_id,operation,context)
  values(p_actor,v_id,case when p_id is null then 'created' else 'updated' end,jsonb_build_object('active',p_active,'preferred',p_preferred));
 return v_id;
end;$$;
revoke all on function public.vmv_admin_tester_save(uuid,uuid,text,text,text,text,boolean,boolean,boolean,text,timestamptz) from PUBLIC,anon,authenticated;
grant execute on function public.vmv_admin_tester_save(uuid,uuid,text,text,text,text,boolean,boolean,boolean,text,timestamptz) to service_role;

create or replace function public.vmv_admin_tester_prepare(
 p_actor uuid,p_key uuid,p_deployment text,p_url text,p_sha text,p_message text,
 p_created timestamptz,p_mode text,p_testers uuid[]
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_batch uuid;v_tester public.vmv_admin_testers%rowtype;v_channel text;v_count integer:=0;v_id uuid;
begin
 if not exists(select 1 from public.vmv_marketing_staff where user_id=p_actor and role='admin') then raise exception 'forbidden'; end if;
 if p_key is null or p_created is null or p_mode not in ('auto','email','sms') or p_sha !~ '^[a-f0-9]{40}$' or
    p_deployment !~ '^dpl_[A-Za-z0-9]+$' or p_url not like 'https://%' or
    p_testers is null or array_length(p_testers,1) not between 1 and 15 then raise exception 'invalid_batch'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tester-dispatch:'||p_actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('tester-deployment:'||p_deployment,0));
 select id into v_batch from public.vmv_admin_tester_batches where created_by=p_actor and request_key=p_key;
 if v_batch is not null then return jsonb_build_object('batch_id',v_batch,'reused',true); end if;
 if (select count(*) from public.vmv_admin_tester_batches where created_by=p_actor and created_at>now()-interval '1 hour')>=4 or
    (select count(*) from public.vmv_admin_tester_deliveries d join public.vmv_admin_tester_batches b on d.batch_id=b.id
      where b.created_by=p_actor and b.created_at>now()-interval '24 hours')+array_length(p_testers,1)>50 then raise exception 'send_rate_limited'; end if;
 insert into public.vmv_admin_tester_batches(created_by,request_key,deployment_id,deployment_url,deployment_sha,deployment_message,deployment_created_at,channel_mode)
 values(p_actor,p_key,p_deployment,p_url,p_sha,left(coalesce(p_message,''),250),p_created,p_mode) returning id into v_batch;
 for v_tester in select * from public.vmv_admin_testers where id=any(p_testers) and active=true order by id loop
  v_channel:=case when p_mode='auto' then v_tester.preferred_channel else p_mode end;
  if v_channel='email' and (v_tester.email is null or not v_tester.email_opt_in or v_tester.email_opted_out_at is not null) then continue; end if;
  if v_channel='sms' and (v_tester.phone_e164 is null or v_tester.sms_consent_at is null or v_tester.sms_opted_out_at is not null) then continue; end if;
  if exists(select 1 from public.vmv_admin_tester_deliveries d join public.vmv_admin_tester_batches b on b.id=d.batch_id
    where d.tester_id=v_tester.id and d.channel=v_channel and b.deployment_id=p_deployment
      and d.state in ('pending','processing','accepted','delivered','unknown','failed')) then continue; end if;
  insert into public.vmv_admin_tester_deliveries(batch_id,tester_id,channel,address_snapshot)
   values(v_batch,v_tester.id,v_channel,case when v_channel='email' then v_tester.email else v_tester.phone_e164 end)
   returning id into v_id;
  v_count:=v_count+1;
 end loop;
 if v_count=0 then raise exception 'no_eligible_testers'; end if;
 insert into public.vmv_admin_tester_events(actor_id,operation,context)
 values(p_actor,'batch_prepared',jsonb_build_object('batch_id',v_batch,'count',v_count,'deployment',p_deployment));
 return jsonb_build_object('batch_id',v_batch,'count',v_count,'reused',false);
end;$$;
revoke all on function public.vmv_admin_tester_prepare(uuid,uuid,text,text,text,text,timestamptz,text,uuid[]) from PUBLIC,anon,authenticated;
grant execute on function public.vmv_admin_tester_prepare(uuid,uuid,text,text,text,text,timestamptz,text,uuid[]) to service_role;

create or replace function public.vmv_admin_tester_claim(p_actor uuid,p_id uuid,p_retry boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_delivery public.vmv_admin_tester_deliveries%rowtype;v_test public.vmv_admin_testers%rowtype;v_attempt uuid;
begin
 if not exists(select 1 from public.vmv_marketing_staff where user_id=p_actor and role='admin') then raise exception 'forbidden'; end if;
 select * into v_delivery from public.vmv_admin_tester_deliveries where id=p_id for update;
 if not found then raise exception 'delivery_not_found'; end if;
 if v_delivery.state not in (case when p_retry then 'failed' else 'pending' end) or v_delivery.attempt_count>=3 then raise exception 'delivery_not_retryable'; end if;
 select * into v_test from public.vmv_admin_testers where id=v_delivery.tester_id for update;
 if not v_test.active or (v_delivery.channel='email' and
     (not v_test.email_opt_in or v_test.email_opted_out_at is not null or v_test.email is distinct from v_delivery.address_snapshot)) or
    (v_delivery.channel='sms' and
     (v_test.sms_consent_at is null or v_test.sms_opted_out_at is not null or v_test.phone_e164 is distinct from v_delivery.address_snapshot))
 then raise exception 'tester_no_longer_eligible'; end if;
 v_attempt:=gen_random_uuid();
 update public.vmv_admin_tester_deliveries set state='processing',attempt_count=attempt_count+1,attempt_key=v_attempt,
  claimed_at=now(),updated_at=clock_timestamp(),error_code=null where id=p_id;
 insert into public.vmv_admin_tester_events(actor_id,tester_id,delivery_id,operation)
  values(p_actor,v_delivery.tester_id,p_id,'delivery_claimed');
 return jsonb_build_object('id',p_id,'attempt_key',v_attempt,'channel',v_delivery.channel,'address',v_delivery.address_snapshot);
end;$$;
revoke all on function public.vmv_admin_tester_claim(uuid,uuid,boolean) from PUBLIC,anon,authenticated;
grant execute on function public.vmv_admin_tester_claim(uuid,uuid,boolean) to service_role;

create or replace function public.vmv_admin_tester_finish(p_actor uuid,p_id uuid,p_attempt uuid,p_state text,p_provider text,p_provider_id text,p_error text default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_tester uuid;
begin
 if not exists(select 1 from public.vmv_marketing_staff where user_id=p_actor and role='admin') then raise exception 'forbidden'; end if;
 if p_state not in ('accepted','delivered','failed','unknown') then raise exception 'invalid_state'; end if;
 update public.vmv_admin_tester_deliveries
 set state=p_state,provider=nullif(p_provider,''),provider_id=nullif(p_provider_id,''),
   error_code=left(nullif(p_error,''),80),provider_at=now(),updated_at=clock_timestamp(),
   delivered_at=case when p_state='delivered' then now() else delivered_at end
 where id=p_id and attempt_key=p_attempt and state='processing'
 returning tester_id into v_tester;
 if v_tester is null then return false; end if;
 insert into public.vmv_admin_tester_events(actor_id,tester_id,delivery_id,operation,context)
 values(p_actor,v_tester,p_id,'delivery_'||p_state,jsonb_build_object('provider',p_provider,'error_code',left(coalesce(p_error,''),80)));
 return true;
end;$$;
revoke all on function public.vmv_admin_tester_finish(uuid,uuid,uuid,text,text,text,text) from PUBLIC,anon,authenticated;
grant execute on function public.vmv_admin_tester_finish(uuid,uuid,uuid,text,text,text,text) to service_role;

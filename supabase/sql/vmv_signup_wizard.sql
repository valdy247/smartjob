-- VMV Call signup wizard: optional profile fields and SMS attestation.
-- Private verification data is service-role-only; never trust user_metadata for verification.
alter table public.smartjob_profiles
 add column if not exists account_type text not null default 'business',
 add column if not exists occupation_code text,
 add column if not exists use_case text,
 add column if not exists business_name text,
 add column if not exists website_url text,
 add column if not exists theme_color text not null default 'mint',
 add column if not exists font_scale text not null default 'normal',
 add column if not exists appearance text not null default 'light',
 add column if not exists reduce_motion boolean not null default false;
alter table public.smartjob_profiles drop constraint if exists vmv_profile_account_type_check;
alter table public.smartjob_profiles add constraint vmv_profile_account_type_check check(account_type in ('personal','business'));
alter table public.smartjob_profiles drop constraint if exists vmv_profile_theme_check;
alter table public.smartjob_profiles add constraint vmv_profile_theme_check check(theme_color in ('mint','blue','violet'));
alter table public.smartjob_profiles drop constraint if exists vmv_profile_font_check;
alter table public.smartjob_profiles add constraint vmv_profile_font_check check(font_scale in ('small','normal','large'));
alter table public.smartjob_profiles drop constraint if exists vmv_profile_appearance_check;
alter table public.smartjob_profiles add constraint vmv_profile_appearance_check check(appearance in ('light','dark','system'));

create table if not exists public.vmv_signup_sms_limits(
 key_hash text primary key,
 attempts integer not null default 0,
 window_started timestamptz not null default now(),
 last_sent_at timestamptz not null default now()
);
alter table public.vmv_signup_sms_limits enable row level security;
revoke all on public.vmv_signup_sms_limits from PUBLIC, anon, authenticated;

create table if not exists public.vmv_signup_sms_tickets(
 token_hash text primary key,
 phone text not null,
 expires_at timestamptz not null,
 claimed_by uuid references auth.users(id) on delete cascade,
 claimed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists vmv_signup_sms_tickets_expires_idx on public.vmv_signup_sms_tickets(expires_at);
alter table public.vmv_signup_sms_tickets enable row level security;
revoke all on public.vmv_signup_sms_tickets from PUBLIC, anon, authenticated;

create table if not exists public.vmv_signup_phone_verified(
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone text not null,
 verified_at timestamptz not null default now()
);
alter table public.vmv_signup_phone_verified enable row level security;
revoke all on public.vmv_signup_phone_verified from PUBLIC, anon, authenticated;

create or replace function public.vmv_signup_sms_reserve(p_ip_hash text,p_phone_hash text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_now timestamptz := now();
 v_ip public.vmv_signup_sms_limits%rowtype;
 v_phone public.vmv_signup_sms_limits%rowtype;
begin
 if p_ip_hash !~ '^[a-f0-9]{64}$' or p_phone_hash !~ '^[a-f0-9]{64}$' or p_ip_hash=p_phone_hash then return false; end if;
 -- Serialize each key independently; two parallel sends cannot bypass quotas.
 perform pg_advisory_xact_lock(hashtext(p_ip_hash));
 perform pg_advisory_xact_lock(hashtext(p_phone_hash));
 select * into v_ip from public.vmv_signup_sms_limits where key_hash=p_ip_hash for update;
 select * into v_phone from public.vmv_signup_sms_limits where key_hash=p_phone_hash for update;
 if v_ip.key_hash is not null and v_ip.window_started>v_now-interval '24 hours' and v_ip.attempts>=12 then return false; end if;
 if v_phone.key_hash is not null and v_phone.window_started>v_now-interval '24 hours' and v_phone.attempts>=4 then return false; end if;
 if v_phone.key_hash is not null and v_phone.last_sent_at>v_now-interval '75 seconds' then return false; end if;
 insert into public.vmv_signup_sms_limits(key_hash,attempts,window_started,last_sent_at)
 values(p_ip_hash,1,v_now,v_now)
 on conflict(key_hash) do update set attempts=case when public.vmv_signup_sms_limits.window_started<v_now-interval '24 hours' then 1 else public.vmv_signup_sms_limits.attempts+1 end,
 window_started=case when public.vmv_signup_sms_limits.window_started<v_now-interval '24 hours' then v_now else public.vmv_signup_sms_limits.window_started end,last_sent_at=v_now;
 insert into public.vmv_signup_sms_limits(key_hash,attempts,window_started,last_sent_at)
 values(p_phone_hash,1,v_now,v_now)
 on conflict(key_hash) do update set attempts=case when public.vmv_signup_sms_limits.window_started<v_now-interval '24 hours' then 1 else public.vmv_signup_sms_limits.attempts+1 end,
 window_started=case when public.vmv_signup_sms_limits.window_started<v_now-interval '24 hours' then v_now else public.vmv_signup_sms_limits.window_started end,last_sent_at=v_now;
 return true;
end $$;
revoke all on function public.vmv_signup_sms_reserve(text,text) from PUBLIC,anon,authenticated;
grant execute on function public.vmv_signup_sms_reserve(text,text) to service_role;

create or replace function public.vmv_claim_signup_phone_ticket(p_uid uuid,p_phone text,p_ticket_hash text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ticket text;
begin
 if p_phone !~ '^\\+[1-9][0-9]{7,14}$' or p_ticket_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 update public.vmv_signup_sms_tickets set claimed_by=p_uid,claimed_at=now()
 where token_hash=p_ticket_hash and phone=p_phone and claimed_by is null and expires_at>now()
 returning phone into v_ticket;
 if v_ticket is null then return false; end if;
 insert into public.vmv_signup_phone_verified(user_id,phone,verified_at)
 values(p_uid,p_phone,now()) on conflict(user_id) do update
 set phone=excluded.phone,verified_at=excluded.verified_at;
 return true;
end $$;
revoke all on function public.vmv_claim_signup_phone_ticket(uuid,text,text) from PUBLIC,anon,authenticated;
grant execute on function public.vmv_claim_signup_phone_ticket(uuid,text,text) to service_role;

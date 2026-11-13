-- Web Studio onboarding: optional social links saved privately per business owner.
create table if not exists public.smartjob_web_intake_socials(
 owner_id uuid primary key references auth.users(id) on delete cascade,
 links jsonb not null default '{}'::jsonb
  check(jsonb_typeof(links)='object' and pg_column_size(links)<=3000),
 updated_at timestamptz not null default now()
);
alter table public.smartjob_web_intake_socials enable row level security;
revoke all on public.smartjob_web_intake_socials from public,anon,authenticated;
grant select,insert,update on public.smartjob_web_intake_socials to authenticated;
do $$
begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='smartjob_web_intake_socials'
 and policyname='vmv_web_socials_select_own') then
  create policy vmv_web_socials_select_own on public.smartjob_web_intake_socials
   for select to authenticated using ((select auth.uid())=owner_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='smartjob_web_intake_socials'
 and policyname='vmv_web_socials_insert_own') then
  create policy vmv_web_socials_insert_own on public.smartjob_web_intake_socials
   for insert to authenticated with check ((select auth.uid())=owner_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='smartjob_web_intake_socials'
 and policyname='vmv_web_socials_update_own') then
  create policy vmv_web_socials_update_own on public.smartjob_web_intake_socials
   for update to authenticated using ((select auth.uid())=owner_id)
   with check ((select auth.uid())=owner_id);
 end if;
end$$;

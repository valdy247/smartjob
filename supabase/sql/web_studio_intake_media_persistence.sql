-- Web Studio 2.0: persist the initial logo, cover and work-photo selections
-- separately from the legacy site's historical draft.
-- Explicit empty strings are authoritative deletions, never "missing data" to reimport.
create table if not exists public.smartjob_web_intake_media(
 owner_id uuid primary key references auth.users(id) on delete cascade,
 logo_url text not null default '' check (length(logo_url)<=450),
 cover_url text not null default '' check (length(cover_url)<=450),
 work_url text not null default '' check (length(work_url)<=450),
 updated_at timestamptz not null default now()
);
alter table public.smartjob_web_intake_media enable row level security;
revoke all on table public.smartjob_web_intake_media from public,anon,authenticated;
grant select,insert,update on table public.smartjob_web_intake_media to authenticated;

do $$
begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='smartjob_web_intake_media' and policyname='web_intake_media_select_own') then
  create policy web_intake_media_select_own on public.smartjob_web_intake_media
   for select to authenticated using ((select auth.uid())=owner_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='smartjob_web_intake_media' and policyname='web_intake_media_insert_own') then
  create policy web_intake_media_insert_own on public.smartjob_web_intake_media
   for insert to authenticated with check ((select auth.uid())=owner_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='smartjob_web_intake_media' and policyname='web_intake_media_update_own') then
  create policy web_intake_media_update_own on public.smartjob_web_intake_media
   for update to authenticated using ((select auth.uid())=owner_id)
   with check ((select auth.uid())=owner_id);
 end if;
end$$;

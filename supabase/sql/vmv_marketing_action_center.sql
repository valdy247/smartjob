-- VMV Marketing Action Center MVP, additive and isolated from other VMV modules.
-- Owner can create/read requests; only explicitly provisioned staff can quote or update them.
create table if not exists public.vmv_marketing_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('admin','agent')),
  granted_at timestamptz not null default now()
);
alter table public.vmv_marketing_staff enable row level security;
revoke all on public.vmv_marketing_staff from anon, authenticated;
grant select on public.vmv_marketing_staff to authenticated;
create policy "vmv_marketing_staff_self_read" on public.vmv_marketing_staff
 for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.vmv_marketing_requests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.smartjob_profiles(id) on delete cascade,
 service_code text not null check (service_code in (
   'google_profile','apple_maps','bing_places','yelp_profile',
   'search_console','seo_improvement','campaign_setup','review_strategy','other'
 )),
 business_name text not null check (char_length(btrim(business_name)) between 2 and 150),
 category_id text not null default 'other' check (char_length(category_id) between 2 and 80),
 website_url text check (website_url is null or char_length(website_url) <= 500),
 goal_text text not null check (char_length(btrim(goal_text)) between 12 and 1500),
 agreed_to_contact boolean not null default false check (agreed_to_contact = true),
 agreed_at timestamptz not null default now(),
 execution_mode text not null default 'assisted' check (execution_mode in ('assisted','automated')),
 status text not null default 'received' check (status in (
   'received','quoted','approved','in_progress','needs_customer','verified','cancelled'
 )),
 quoted_price_cents integer check (quoted_price_cents is null or quoted_price_cents >= 0),
 quote_note text check (quote_note is null or char_length(quote_note) <= 1500),
 quote_revision integer not null default 0 check (quote_revision >= 0),
 staff_update text check (staff_update is null or char_length(staff_update) <= 1500),
 evidence_url text check (evidence_url is null or char_length(evidence_url) <= 750),
 verified_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint vmv_marketing_verified_evidence check (status <> 'verified' or (verified_at is not null and char_length(btrim(coalesce(evidence_url,''))) > 0)),
 constraint vmv_marketing_quote_present check (status <> 'quoted' or quoted_price_cents is not null)
);
create index if not exists vmv_marketing_requests_owner_idx on public.vmv_marketing_requests(owner_id,created_at desc);
create index if not exists vmv_marketing_requests_queue_idx on public.vmv_marketing_requests(status,created_at desc);
alter table public.vmv_marketing_requests enable row level security;
revoke all on public.vmv_marketing_requests from anon, authenticated;
grant select,insert on public.vmv_marketing_requests to authenticated;
grant update (status,quoted_price_cents,quote_note,staff_update,evidence_url,verified_at,updated_at)
 on public.vmv_marketing_requests to authenticated;
create policy "vmv_marketing_requests_owner_staff_read" on public.vmv_marketing_requests
 for select to authenticated using (
   owner_id=(select auth.uid()) or exists (
     select 1 from public.vmv_marketing_staff s where s.user_id=(select auth.uid())
   )
 );
create policy "vmv_marketing_requests_owner_create" on public.vmv_marketing_requests
 for insert to authenticated with check (
   owner_id=(select auth.uid()) and agreed_to_contact=true
   and status='received' and quoted_price_cents is null and quote_revision=0
   and verified_at is null and evidence_url is null and execution_mode='assisted'
 );
create policy "vmv_marketing_requests_staff_update" on public.vmv_marketing_requests
 for update to authenticated
 using (exists (select 1 from public.vmv_marketing_staff s where s.user_id=(select auth.uid())))
 with check (exists (select 1 from public.vmv_marketing_staff s where s.user_id=(select auth.uid())));

create table if not exists public.vmv_marketing_quote_acceptances (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.vmv_marketing_requests(id) on delete cascade,
 owner_id uuid not null references public.smartjob_profiles(id) on delete cascade,
 quote_revision integer not null,
 quoted_price_cents integer not null check (quoted_price_cents >= 0),
 accepted_at timestamptz not null default now(),
 unique(request_id,quote_revision)
);
create index if not exists vmv_marketing_quote_acceptances_owner_idx on public.vmv_marketing_quote_acceptances(owner_id,accepted_at desc);
alter table public.vmv_marketing_quote_acceptances enable row level security;
revoke all on public.vmv_marketing_quote_acceptances from anon, authenticated;
grant select,insert on public.vmv_marketing_quote_acceptances to authenticated;
create policy "vmv_marketing_acceptances_owner_staff_read" on public.vmv_marketing_quote_acceptances
 for select to authenticated using (
   owner_id=(select auth.uid()) or exists (
      select 1 from public.vmv_marketing_staff s where s.user_id=(select auth.uid())
   )
 );
create policy "vmv_marketing_acceptances_owner_create" on public.vmv_marketing_quote_acceptances
 for insert to authenticated with check (
   owner_id=(select auth.uid()) and exists(
    select 1 from public.vmv_marketing_requests r
    where r.id=request_id and r.owner_id=(select auth.uid())
      and r.status='quoted'
      and r.quote_revision=quote_revision
      and r.quoted_price_cents=quoted_price_cents
      and r.quoted_price_cents is not null
   )
 );

create or replace function public.vmv_marketing_request_guard() returns trigger
 language plpgsql security invoker set search_path=public,pg_temp
 as $$
 declare approved boolean;
 begin
   -- Staff changes to the price invalidate all previous approvals.
   if new.quoted_price_cents is distinct from old.quoted_price_cents
      or new.quote_note is distinct from old.quote_note then
     if new.quoted_price_cents is null then
       raise exception 'A quote needs a nonnegative price before it can be offered';
     end if;
     new.quote_revision := old.quote_revision + 1;
     new.status := 'quoted';
     new.verified_at := null;
     new.evidence_url := null;
   end if;
   if new.status in ('approved','in_progress','verified') and old.status <> new.status then
     select exists (
       select 1 from public.vmv_marketing_quote_acceptances a
       where a.request_id=new.id and a.quote_revision=new.quote_revision
          and a.quoted_price_cents=new.quoted_price_cents
     ) into approved;
     if not approved then
       raise exception 'Customer approval of the current price is required';
     end if;
   end if;
   if new.status='verified' and (new.verified_at is null or btrim(coalesce(new.evidence_url,''))='') then
     raise exception 'Verification evidence and time are required';
   end if;
   new.updated_at:=now();
   return new;
 end;
 $$;
drop trigger if exists vmv_marketing_request_guard_trg on public.vmv_marketing_requests;
create trigger vmv_marketing_request_guard_trg
 before update on public.vmv_marketing_requests
 for each row execute function public.vmv_marketing_request_guard();
revoke all on function public.vmv_marketing_request_guard() from public,anon,authenticated;

comment on table public.vmv_marketing_requests is
 'VMV Marketing: customer-owned service requests. Listing submissions and external execution are NOT automated by this table.';
comment on table public.vmv_marketing_staff is
 'Explicitly provisioned VMV Marketing staff, no automatic self-elevation.';

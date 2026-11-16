-- Owner-controlled, independent service catalog for VMV Business.
-- Website links are independent and public reads remain server-side and approved-only.
create table if not exists public.vmv_ai_services (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid not null references public.vmv_ai_businesses(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 120),
 description text not null default '' check (length(description)<=700),
 price_cents integer check (price_cents is null or price_cents between 1 and 10000000),
 currency text not null default 'usd' check (currency='usd'),
 image_path text,
 approved boolean not null default false,
 active boolean not null default true,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index if not exists vmv_ai_services_owner_business_public_idx
 on public.vmv_ai_services(owner_id,business_id,approved,active);
alter table public.vmv_ai_services enable row level security;
drop policy if exists vmv_ai_services_owner_select on public.vmv_ai_services;
create policy vmv_ai_services_owner_select on public.vmv_ai_services for select to authenticated
 using (owner_id=(select auth.uid()) and exists(
  select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
drop policy if exists vmv_ai_services_owner_insert on public.vmv_ai_services;
create policy vmv_ai_services_owner_insert on public.vmv_ai_services for insert to authenticated
 with check (owner_id=(select auth.uid()) and exists(
  select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
drop policy if exists vmv_ai_services_owner_update on public.vmv_ai_services;
create policy vmv_ai_services_owner_update on public.vmv_ai_services for update to authenticated
 using (owner_id=(select auth.uid()))
 with check (owner_id=(select auth.uid()) and exists(
  select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
revoke all on table public.vmv_ai_services from anon;
grant select,insert,update on table public.vmv_ai_services to authenticated;
-- reuse the owner+business validated immutable image path guard on the same bucket.
drop trigger if exists vmv_ai_services_owner_image_guard on public.vmv_ai_services;
create trigger vmv_ai_services_owner_image_guard
 before insert or update of image_path on public.vmv_ai_services
 for each row execute function public.vmv_ai_catalog_owner_image_guard();
alter table public.smartjob_builder_sites
 add column if not exists inventory_connection_enabled boolean not null default true,
 add column if not exists services_business_id uuid,
 add column if not exists services_connection_enabled boolean not null default false;
create or replace function public.vmv_site_services_owner_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and new.services_business_id is not distinct from old.services_business_id
  and new.services_connection_enabled is not distinct from old.services_connection_enabled
  and new.inventory_connection_enabled is not distinct from old.inventory_connection_enabled then
  return new;
 end if;
 if coalesce(auth.role(),'')<>'authenticated' or auth.uid() is distinct from new.owner_id then
  raise exception 'Only the authenticated owner may change the website connections';
 end if;
 if new.services_connection_enabled and new.services_business_id is null then
  raise exception 'Choose a service catalog before enabling the website connection';
 end if;
 if new.services_business_id is not null and not exists(
  select 1 from public.vmv_ai_businesses b where b.id=new.services_business_id and b.owner_id=new.owner_id
 ) then raise exception 'Service catalog does not belong to the website owner'; end if;
 return new;
end $$;
drop trigger if exists vmv_site_services_owner_guard on public.smartjob_builder_sites;
create trigger vmv_site_services_owner_guard
 before insert or update of services_business_id,services_connection_enabled,inventory_connection_enabled
 on public.smartjob_builder_sites for each row execute function public.vmv_site_services_owner_guard();
notify pgrst,'reload schema';

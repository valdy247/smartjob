-- Owner-controlled canonical product photography for AI Agents × Web Studio.
-- Run once after review; additive and does not touch published site documents.
-- AI cannot update image_path: only the authenticated owner can change it.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('vmv-catalog-images','vmv-catalog-images',true,5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

drop policy if exists vmv_catalog_photos_owner_insert on storage.objects;
create policy vmv_catalog_photos_owner_insert on storage.objects
 for insert to authenticated
 with check (
  bucket_id='vmv-catalog-images'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp)$'
  and split_part(name,'/',1)=auth.uid()::text
  and exists (
   select 1 from public.vmv_ai_businesses b
    where b.owner_id=auth.uid() and b.id::text=split_part(name,'/',2)
  )
 );
drop policy if exists vmv_catalog_photos_owner_select on storage.objects;
create policy vmv_catalog_photos_owner_select on storage.objects
 for select to authenticated
 using (bucket_id='vmv-catalog-images' and split_part(name,'/',1)=auth.uid()::text);
-- Do not grant UPDATE/DELETE on this bucket to ordinary users or AI agents.
-- Image replacement uploads a new immutable object and updates the owner catalog row.

alter table public.vmv_ai_catalog_items add column if not exists image_path text;
alter table public.smartjob_builder_sites add column if not exists inventory_business_id uuid;

create or replace function public.vmv_ai_catalog_owner_image_guard()
returns trigger language plpgsql security invoker set search_path=public,storage,pg_temp as $$
declare p text;
begin
 if tg_op='INSERT' and new.image_path is null then return new; end if;
 if tg_op='UPDATE' and new.image_path is not distinct from old.image_path then
  return new;
 end if;
 if coalesce(auth.role(),'')<>'authenticated' or auth.uid() is distinct from new.owner_id then
  raise exception 'Only the authenticated owner may change the canonical product image';
 end if;
 p:=new.image_path;
 if p is null then return new; end if;
 if p !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp)$'
    or split_part(p,'/',1)<>new.owner_id::text
    or split_part(p,'/',2)<>new.business_id::text then
  raise exception 'Invalid product image path';
 end if;
 if not exists (select 1 from storage.objects o
  where o.bucket_id='vmv-catalog-images' and o.name=p) then
  raise exception 'Product image has not been uploaded';
 end if;
 return new;
end $$;
drop trigger if exists vmv_ai_catalog_owner_image_guard on public.vmv_ai_catalog_items;
create trigger vmv_ai_catalog_owner_image_guard
 before insert or update of image_path on public.vmv_ai_catalog_items
 for each row execute function public.vmv_ai_catalog_owner_image_guard();

create or replace function public.vmv_site_inventory_owner_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' and new.inventory_business_id is null then return new; end if;
 if tg_op='UPDATE' and new.inventory_business_id is not distinct from old.inventory_business_id then
  return new;
 end if;
 if coalesce(auth.role(),'')<>'authenticated' or auth.uid() is distinct from new.owner_id then
  raise exception 'Only the authenticated site owner may connect inventory';
 end if;
 if new.inventory_business_id is not null and not exists(
   select 1 from public.vmv_ai_businesses b where b.id=new.inventory_business_id
   and b.owner_id=new.owner_id
 ) then
  raise exception 'Inventory business does not belong to this site owner';
 end if;
 return new;
end $$;
drop trigger if exists vmv_site_inventory_owner_guard on public.smartjob_builder_sites;
create trigger vmv_site_inventory_owner_guard
 before insert or update of inventory_business_id on public.smartjob_builder_sites
 for each row execute function public.vmv_site_inventory_owner_guard();

create index if not exists vmv_catalog_visible_site_products on public.vmv_ai_catalog_items
 (owner_id,business_id,active,approved);
comment on column public.vmv_ai_catalog_items.image_path is
 'Immutable uploaded object path; user-only explicit change, AI read-only.';
comment on column public.smartjob_builder_sites.inventory_business_id is
 'Owner-approved canonical inventory connection; public page displays approved products read-only.';

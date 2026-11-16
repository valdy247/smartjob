-- Repair nested SQL column resolution in the catalog upload policy.
-- The business row also has a "name" column; qualify the storage object path.
drop policy if exists vmv_catalog_photos_owner_insert on storage.objects;
create policy vmv_catalog_photos_owner_insert on storage.objects
 for insert to authenticated
 with check (
  bucket_id='vmv-catalog-images'
  and storage.objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  and split_part(storage.objects.name,'/',1)=auth.uid()::text
  and exists (
   select 1 from public.vmv_ai_businesses b
    where b.owner_id=auth.uid()
      and b.id::text=split_part(storage.objects.name,'/',2)
  )
 );

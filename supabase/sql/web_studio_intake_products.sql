-- Web Studio creation: an owner-scoped list of editable product cards.
-- No checkout, stock or payment state. Prices are optional labels only.
create table if not exists public.smartjob_web_intake_products(
 owner_id uuid primary key references auth.users(id) on delete cascade,
 items jsonb not null default '[]'::jsonb
  check (jsonb_typeof(items)='array' and jsonb_array_length(items)<=30 and pg_column_size(items)<=40000),
 updated_at timestamptz not null default now()
);
alter table public.smartjob_web_intake_products enable row level security;
revoke all on table public.smartjob_web_intake_products from public,anon,authenticated;
grant select,insert,update on table public.smartjob_web_intake_products to authenticated;
do $$
begin
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='smartjob_web_intake_products' and policyname='vmv_intake_products_select_own') then
  create policy vmv_intake_products_select_own on public.smartjob_web_intake_products
   for select to authenticated using ((select auth.uid())=owner_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='smartjob_web_intake_products' and policyname='vmv_intake_products_insert_own') then
  create policy vmv_intake_products_insert_own on public.smartjob_web_intake_products
   for insert to authenticated with check ((select auth.uid())=owner_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public'
  and tablename='smartjob_web_intake_products' and policyname='vmv_intake_products_update_own') then
  create policy vmv_intake_products_update_own on public.smartjob_web_intake_products
   for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
 end if;
end$$;

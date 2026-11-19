-- VMV Business / Smart Quote — private owner-operated pilot.
-- Apply only to an approved development/staging Supabase environment.
-- No automated payments, invoices, messages, or external storefront publishing.
begin;
create extension if not exists pgcrypto;

create table if not exists public.vmv_smart_quote_catalog (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.smartjob_profiles(id) on delete cascade,
 business_id uuid not null references public.vmv_marketing_businesses(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 120),
 description text not null default '' check (char_length(description)<=500),
 unit_name text not null default 'unidad' check (char_length(btrim(unit_name)) between 1 and 35),
 unit_price_cents integer not null check (unit_price_cents between 0 and 100000000),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists vmv_smart_quote_catalog_tenant_idx on public.vmv_smart_quote_catalog(owner_id,business_id,created_at desc);

create table if not exists public.vmv_smart_quotes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.smartjob_profiles(id) on delete cascade,
 business_id uuid not null references public.vmv_marketing_businesses(id) on delete cascade,
 customer_name text not null check (char_length(btrim(customer_name)) between 2 and 120),
 customer_email text not null default '' check (char_length(customer_email)<=180),
 customer_phone text not null default '' check (char_length(customer_phone)<=35),
 currency text not null default 'USD' check (currency='USD'),
 lines jsonb not null check (jsonb_typeof(lines)='array' and jsonb_array_length(lines) between 1 and 25),
 subtotal_cents bigint not null check (subtotal_cents between 0 and 2000000000),
 discount_cents integer not null default 0 check (discount_cents >= 0),
 delivery_cents integer not null default 0 check (delivery_cents between 0 and 100000000),
 tax_bps integer not null default 0 check (tax_bps between 0 and 10000),
 tax_cents bigint not null default 0 check (tax_cents >= 0),
 deposit_bps integer not null default 0 check (deposit_bps between 0 and 10000),
 deposit_cents bigint not null default 0 check (deposit_cents >= 0),
 total_cents bigint not null check (total_cents between 0 and 2000000000),
 notes text not null default '' check (char_length(notes)<=1500),
 valid_until date not null,
 status text not null default 'draft' check (status in ('draft','approved','sent','cancelled')),
 revision integer not null default 1 check (revision between 1 and 1000),
 approved_at timestamptz, sent_at timestamptz, cancelled_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists vmv_smart_quotes_tenant_idx on public.vmv_smart_quotes(owner_id,business_id,created_at desc);

create table if not exists public.vmv_smart_quote_events (
 id bigint generated always as identity primary key,
 owner_id uuid not null references public.smartjob_profiles(id) on delete cascade,
 business_id uuid not null references public.vmv_marketing_businesses(id) on delete cascade,
 quote_id uuid not null references public.vmv_smart_quotes(id) on delete cascade,
 kind text not null check (kind in ('created','edited','approved','sent_manual','cancelled')),
 revision integer not null,
 created_at timestamptz not null default now()
);
create index if not exists vmv_smart_quote_events_quote_idx on public.vmv_smart_quote_events(quote_id,created_at desc);

alter table public.vmv_smart_quote_catalog enable row level security;
alter table public.vmv_smart_quotes enable row level security;
alter table public.vmv_smart_quote_events enable row level security;
revoke all on public.vmv_smart_quote_catalog,public.vmv_smart_quotes,public.vmv_smart_quote_events from public,anon,authenticated;

grant select on public.vmv_smart_quote_catalog,public.vmv_smart_quotes,public.vmv_smart_quote_events to authenticated;
grant insert (owner_id,business_id,name,description,unit_name,unit_price_cents,active) on public.vmv_smart_quote_catalog to authenticated;
grant update (name,description,unit_name,unit_price_cents,active,updated_at) on public.vmv_smart_quote_catalog to authenticated;

drop policy if exists vmv_smart_quote_catalog_owner_read on public.vmv_smart_quote_catalog;
create policy vmv_smart_quote_catalog_owner_read on public.vmv_smart_quote_catalog
 for select to authenticated using (owner_id=(select auth.uid()) and exists
 (select 1 from public.vmv_marketing_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
drop policy if exists vmv_smart_quote_catalog_owner_create on public.vmv_smart_quote_catalog;
create policy vmv_smart_quote_catalog_owner_create on public.vmv_smart_quote_catalog
 for insert to authenticated with check (owner_id=(select auth.uid()) and exists
 (select 1 from public.vmv_marketing_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
drop policy if exists vmv_smart_quote_catalog_owner_update on public.vmv_smart_quote_catalog;
create policy vmv_smart_quote_catalog_owner_update on public.vmv_smart_quote_catalog
 for update to authenticated using (owner_id=(select auth.uid()) and exists
 (select 1 from public.vmv_marketing_businesses b where b.id=business_id and b.owner_id=(select auth.uid())))
 with check (owner_id=(select auth.uid()) and exists
 (select 1 from public.vmv_marketing_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));

drop policy if exists vmv_smart_quotes_owner_read on public.vmv_smart_quotes;
create policy vmv_smart_quotes_owner_read on public.vmv_smart_quotes
 for select to authenticated using (owner_id=(select auth.uid()) and exists
 (select 1 from public.vmv_marketing_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
drop policy if exists vmv_smart_quote_events_owner_read on public.vmv_smart_quote_events;
create policy vmv_smart_quote_events_owner_read on public.vmv_smart_quote_events
 for select to authenticated using (owner_id=(select auth.uid()) and exists
 (select 1 from public.vmv_marketing_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));

-- Only the authenticated owner can use the RPC. Catalog prices are locked and
-- snapshotted on the server; no caller-supplied totals or catalog prices are trusted.
create or replace function public.vmv_smart_quote_save(
 p_business_id uuid,p_quote_id uuid,p_customer_name text,p_customer_email text,
 p_customer_phone text,p_items jsonb,p_tax_bps integer,p_delivery_cents integer,
 p_discount_cents integer,p_deposit_bps integer,p_valid_until date,p_notes text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 caller uuid:=auth.uid(); old_quote public.vmv_smart_quotes%rowtype;
 part record; product record; qty integer; catalog_id uuid;
 snapshot jsonb:='[]'::jsonb; subtotal bigint:=0; tax_total bigint; total bigint; deposit bigint;
 result_id uuid; item_count integer:=0; revision_number integer:=1; entry_price bigint;
begin
 if caller is null or not exists(select 1 from public.smartjob_profiles where id=caller)
    or not exists(select 1 from public.vmv_marketing_businesses
      where id=p_business_id and owner_id=caller) then raise exception 'Business not authorized'; end if;
 if char_length(btrim(coalesce(p_customer_name,''))) not between 2 and 120 or
    char_length(coalesce(p_customer_email,''))>180 or
    char_length(coalesce(p_customer_phone,''))>35 or
    char_length(coalesce(p_notes,''))>1500 or
    (coalesce(p_customer_email,'')<>'' and p_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    then raise exception 'Invalid customer details'; end if;
 if p_valid_until<current_date or p_valid_until>current_date+365 or p_valid_until is null
    then raise exception 'Quote expiry must be within 365 days'; end if;
 if p_tax_bps not between 0 and 10000 or p_deposit_bps not between 0 and 10000
    or p_delivery_cents not between 0 and 100000000 or
    p_discount_cents not between 0 and 100000000 then raise exception 'Invalid charge configuration'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Items must be an array'; end if;
 if jsonb_array_length(p_items) not between 1 and 25 then raise exception 'Add 1 to 25 catalog items'; end if;
 if p_quote_id is not null then
  select * into old_quote from public.vmv_smart_quotes
   where id=p_quote_id and business_id=p_business_id and owner_id=caller for update;
  if not found or old_quote.status<>'draft' then raise exception 'Only an owned draft can be edited'; end if;
  revision_number:=old_quote.revision+1;
 end if;
 for part in select value,ordinality from jsonb_array_elements(p_items) with ordinality loop
  if jsonb_typeof(part.value)<>'object' or
     coalesce(part.value->>'catalog_item_id','') !~ '^[0-9a-fA-F-]{36}$' or
     coalesce(part.value->>'quantity','') !~ '^[1-9][0-9]{0,3}$' then
     raise exception 'Invalid catalog item or quantity'; end if;
  catalog_id:=(part.value->>'catalog_item_id')::uuid;
  qty:=(part.value->>'quantity')::integer;
  select id,name,description,unit_name,unit_price_cents into product
  from public.vmv_smart_quote_catalog
  where id=catalog_id and business_id=p_business_id and owner_id=caller and active=true
  for share;
  if not found then raise exception 'Catalog item not available'; end if;
  entry_price:=product.unit_price_cents::bigint*qty;
  subtotal:=subtotal+entry_price;item_count:=item_count+1;
  if subtotal>2000000000 then raise exception 'Quote total exceeds pilot limit'; end if;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object(
   'catalog_item_id',product.id,'name',product.name,'description',product.description,
   'unit_name',product.unit_name,'quantity',qty,'unit_price_cents',product.unit_price_cents,
   'line_total_cents',entry_price));
 end loop;
 if p_discount_cents>subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
 -- Sales tax is calculated only on the discounted merchandise/service subtotal.
 -- The seller must set the applicable rate and assess actual tax obligations.
 tax_total:=round(((subtotal-p_discount_cents)*p_tax_bps)::numeric/10000);
 total:=subtotal-p_discount_cents+tax_total+p_delivery_cents;
 if total>2000000000 then raise exception 'Quote total exceeds pilot limit'; end if;
 deposit:=round((total*p_deposit_bps)::numeric/10000);
 if p_quote_id is null then
  insert into public.vmv_smart_quotes(owner_id,business_id,customer_name,customer_email,
   customer_phone,lines,subtotal_cents,discount_cents,delivery_cents,tax_bps,tax_cents,
   deposit_bps,deposit_cents,total_cents,valid_until,notes)
  values(caller,p_business_id,btrim(p_customer_name),btrim(coalesce(p_customer_email,'')),
   btrim(coalesce(p_customer_phone,'')),snapshot,subtotal,p_discount_cents,p_delivery_cents,
   p_tax_bps,tax_total,p_deposit_bps,deposit,total,p_valid_until,coalesce(p_notes,''))
  returning id into result_id;
 else
  update public.vmv_smart_quotes set customer_name=btrim(p_customer_name),
   customer_email=btrim(coalesce(p_customer_email,'')),customer_phone=btrim(coalesce(p_customer_phone,'')),
   lines=snapshot,subtotal_cents=subtotal,discount_cents=p_discount_cents,
   delivery_cents=p_delivery_cents,tax_bps=p_tax_bps,tax_cents=tax_total,
   deposit_bps=p_deposit_bps,deposit_cents=deposit,total_cents=total,valid_until=p_valid_until,
   notes=coalesce(p_notes,''),revision=revision_number,updated_at=now()
  where id=p_quote_id returning id into result_id;
 end if;
 insert into public.vmv_smart_quote_events(owner_id,business_id,quote_id,kind,revision)
 values(caller,p_business_id,result_id,case when p_quote_id is null then 'created' else 'edited' end,revision_number);
 return result_id;
end $$;
revoke all on function public.vmv_smart_quote_save(uuid,uuid,text,text,text,jsonb,integer,integer,integer,integer,date,text) from public,anon;
grant execute on function public.vmv_smart_quote_save(uuid,uuid,text,text,text,jsonb,integer,integer,integer,integer,date,text) to authenticated;

-- Manually controlled status changes; "sent" means owner recorded a manual
-- delivery, NOT confirmation of receipt/opening, acceptance or payment.
create or replace function public.vmv_smart_quote_set_status(p_quote_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare caller uuid:=auth.uid(); q public.vmv_smart_quotes%rowtype; next_status text; kind text;
begin
 if caller is null or not exists(select 1 from public.smartjob_profiles where id=caller)
    then return false; end if;
 select * into q from public.vmv_smart_quotes
  where id=p_quote_id and owner_id=caller and exists
  (select 1 from public.vmv_marketing_businesses b where b.id=business_id and b.owner_id=caller)
  for update;
 if not found then return false; end if;
 if p_action='approve' and q.status='draft' and q.valid_until>=current_date then
  next_status:='approved';kind:='approved';
 elsif p_action='mark_sent' and q.status='approved' and q.valid_until>=current_date then
  next_status:='sent';kind:='sent_manual';
 elsif p_action='cancel' and q.status in ('draft','approved','sent') then
  next_status:='cancelled';kind:='cancelled';
 else return false; end if;
 update public.vmv_smart_quotes set status=next_status,updated_at=now(),
  approved_at=case when next_status='approved' then now() else approved_at end,
  sent_at=case when next_status='sent' then now() else sent_at end,
  cancelled_at=case when next_status='cancelled' then now() else cancelled_at end
 where id=q.id;
 insert into public.vmv_smart_quote_events(owner_id,business_id,quote_id,kind,revision)
 values(caller,q.business_id,q.id,kind,q.revision);
 return true;
end $$;
revoke all on function public.vmv_smart_quote_set_status(uuid,text) from public,anon;
grant execute on function public.vmv_smart_quote_set_status(uuid,text) to authenticated;

comment on table public.vmv_smart_quotes is
 'Smart Quote owner-only manual pilot: no client acceptance, electronic delivery, invoice, Stripe/Square charge or payment verification.';
commit;

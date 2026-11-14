-- AI Agents · tenant-scoped, additive TEST commerce foundation.
-- No real merchant payments, VMV billing/Stripe modes or Smart Call tables modified.
create table if not exists public.vmv_ai_catalog_items(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid not null references public.vmv_ai_businesses(id) on delete cascade,
 sku text not null check(length(sku) between 1 and 45),
 name text not null check(length(name) between 1 and 120),
 description text not null default '' check(length(description)<=700),
 price_cents integer not null check(price_cents between 1 and 10000000),
 currency text not null default 'usd' check(currency='usd'),
 stock_mode text not null default 'manual' check(stock_mode in ('manual','tracked','unlimited')),
 available_qty integer check(available_qty>=0),
 variants jsonb not null default '[]'::jsonb check(jsonb_typeof(variants)='array'),
 extras jsonb not null default '[]'::jsonb check(jsonb_typeof(extras)='array'),
 approved boolean not null default false,
 active boolean not null default true,
 updated_at timestamptz not null default now(),
 unique(business_id,sku),
 constraint vmv_ai_tracked_inventory_check check(stock_mode<>'tracked' or available_qty is not null)
);
create index if not exists vmv_ai_catalog_business on public.vmv_ai_catalog_items(business_id,active,approved);
alter table public.vmv_ai_catalog_items enable row level security;
create policy vmv_ai_catalog_owner_read on public.vmv_ai_catalog_items for select to authenticated
 using (owner_id=(select auth.uid()) and exists
  (select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
create policy vmv_ai_catalog_owner_add on public.vmv_ai_catalog_items for insert to authenticated
 with check(owner_id=(select auth.uid()) and exists
  (select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
create policy vmv_ai_catalog_owner_edit on public.vmv_ai_catalog_items for update to authenticated
 using(owner_id=(select auth.uid())) with check
 (owner_id=(select auth.uid()) and exists
  (select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
revoke all on public.vmv_ai_catalog_items from anon,authenticated;
grant select,insert,update on public.vmv_ai_catalog_items to authenticated;

create table if not exists public.vmv_ai_orders(
 id uuid primary key default gen_random_uuid(),
 order_no bigint generated always as identity unique,
 owner_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid not null references public.vmv_ai_businesses(id) on delete cascade,
 agent_id uuid not null references public.vmv_ai_agents(id) on delete restrict,
 call_sid text,
 idempotency_key text not null check(length(idempotency_key) between 10 and 100),
 mode text not null default 'test' check(mode in ('test','live')),
 status text not null default 'awaiting_confirmation'
   check(status in ('awaiting_confirmation','awaiting_payment','requires_review','paid','cancelled','expired')),
 payment_status text not null default 'not_started'
   check(payment_status in ('not_started','pending','paid','failed','refunded')),
 currency text not null default 'usd' check(currency='usd'),
 subtotal_cents integer not null check(subtotal_cents>=0),
 total_cents integer not null check(total_cents>=0),
 fulfillment text not null default 'pickup' check(fulfillment in ('pickup','delivery')),
 delivery_address text,
 customer_name text,
 customer_email text,
 customer_phone text,
 buyer_accepted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,idempotency_key)
);
create index if not exists vmv_ai_orders_owner_date on public.vmv_ai_orders(owner_id,created_at desc);
alter table public.vmv_ai_orders enable row level security;
create policy vmv_ai_orders_owner_read on public.vmv_ai_orders for select to authenticated
 using(owner_id=(select auth.uid()));
revoke all on public.vmv_ai_orders from anon,authenticated;
grant select on public.vmv_ai_orders to authenticated;

create table if not exists public.vmv_ai_order_lines(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.vmv_ai_orders(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 item_id uuid not null references public.vmv_ai_catalog_items(id) on delete restrict,
 sku text not null,name text not null,
 qty integer not null check(qty between 1 and 50),
 unit_cents integer not null check(unit_cents>=0),
 subtotal_cents integer not null check(subtotal_cents>=0)
);
create index if not exists vmv_ai_lines_order on public.vmv_ai_order_lines(order_id);
alter table public.vmv_ai_order_lines enable row level security;
create policy vmv_ai_lines_owner_read on public.vmv_ai_order_lines for select to authenticated
 using(owner_id=(select auth.uid()));
revoke all on public.vmv_ai_order_lines from anon,authenticated;
grant select on public.vmv_ai_order_lines to authenticated;

create table if not exists public.vmv_ai_inventory_holds(
 order_id uuid not null references public.vmv_ai_orders(id) on delete cascade,
 item_id uuid not null references public.vmv_ai_catalog_items(id) on delete restrict,
 owner_id uuid not null references auth.users(id) on delete cascade,
 qty integer not null check(qty between 1 and 50),
 state text not null default 'held' check(state in ('held','committed','released')),
 expires_at timestamptz not null default now()+interval '15 minutes',
 primary key(order_id,item_id)
);
create index if not exists vmv_ai_holds_active on public.vmv_ai_inventory_holds(item_id,expires_at)
 where state='held';
alter table public.vmv_ai_inventory_holds enable row level security;
create policy vmv_ai_holds_owner_read on public.vmv_ai_inventory_holds for select to authenticated
 using(owner_id=(select auth.uid()));
revoke all on public.vmv_ai_inventory_holds from anon,authenticated;
grant select on public.vmv_ai_inventory_holds to authenticated;

create table if not exists public.vmv_ai_order_events(
 id bigint generated always as identity primary key,
 order_id uuid not null references public.vmv_ai_orders(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null check(length(event_type) between 3 and 70),
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists vmv_ai_events_order on public.vmv_ai_order_events(order_id,created_at);
alter table public.vmv_ai_order_events enable row level security;
create policy vmv_ai_events_owner_read on public.vmv_ai_order_events for select to authenticated
 using(owner_id=(select auth.uid()));
revoke all on public.vmv_ai_order_events from anon,authenticated;
grant select on public.vmv_ai_order_events to authenticated;

-- Separate merchant payment accounts from VMV SaaS subscription billing.
create table if not exists public.vmv_ai_merchant_payments(
 business_id uuid primary key references public.vmv_ai_businesses(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('stripe_connect','manual')),
 provider_account_id text,
 livemode boolean not null default false,
 verified_by_server boolean not null default false,
 can_accept_payments boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.vmv_ai_merchant_payments enable row level security;
create policy vmv_ai_merchant_owner_read on public.vmv_ai_merchant_payments for select to authenticated
 using(owner_id=(select auth.uid()));
revoke all on public.vmv_ai_merchant_payments from anon,authenticated;
grant select on public.vmv_ai_merchant_payments to authenticated;

-- No buyer payment status can be written via authenticated client.
create table if not exists public.vmv_ai_payment_attempts(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.vmv_ai_orders(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('stripe_connect','manual')),
 provider_session_id text unique,
 checkout_url text,
 mode text not null check(mode in ('test','live')),
 amount_cents integer not null check(amount_cents>=1),
 currency text not null default 'usd',
 state text not null default 'pending' check(state in ('pending','paid','failed','refunded')),
 created_at timestamptz not null default now(),
 verified_at timestamptz
);
create index if not exists vmv_ai_payments_order on public.vmv_ai_payment_attempts(order_id);
alter table public.vmv_ai_payment_attempts enable row level security;
create policy vmv_ai_payment_owner_read on public.vmv_ai_payment_attempts for select to authenticated
 using(owner_id=(select auth.uid()));
revoke all on public.vmv_ai_payment_attempts from anon,authenticated;
grant select on public.vmv_ai_payment_attempts to authenticated;

-- Server-only atomic quote based on APPROVED prices and actual stock.
create or replace function public.vmv_ai_test_prepare_order(
 p_owner_id uuid,p_business_id uuid,p_agent_id uuid,p_item_id uuid,p_qty integer,
 p_idempotency_key text,p_call_sid text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare product record; found_order uuid; held_qty integer; new_order uuid;
begin
 if p_qty not between 1 and 50 or length(p_idempotency_key) not between 10 and 100 then return null; end if;
 if not exists(select 1 from public.vmv_ai_agents a
   where a.id=p_agent_id and a.owner_id=p_owner_id and a.business_id=p_business_id)
   then return null; end if;
 perform pg_advisory_xact_lock(hashtext('vmv_ai_idempotency:'||p_owner_id::text||p_idempotency_key));
 select o.id into found_order from public.vmv_ai_orders o where
   o.owner_id=p_owner_id and o.idempotency_key=p_idempotency_key;
 if found_order is not null then return found_order; end if;
 select id,sku,name,price_cents,currency,stock_mode,available_qty,
   jsonb_array_length(variants) as variant_count,jsonb_array_length(extras) as extra_count
 into product from public.vmv_ai_catalog_items
 where id=p_item_id and business_id=p_business_id and owner_id=p_owner_id
  and active=true and approved=true for update;
 if not found then return null; end if;
 -- No unsupported priced variants, external delivery fees or subjective manual inventory.
 if product.variant_count<>0 or product.extra_count<>0 or product.stock_mode='manual' then return null; end if;
 if product.stock_mode='tracked' then
   select coalesce(sum(qty),0) into held_qty from public.vmv_ai_inventory_holds
   where item_id=p_item_id and state='held' and expires_at>now();
   if product.available_qty-held_qty < p_qty then return null; end if;
 end if;
 insert into public.vmv_ai_orders
  (owner_id,business_id,agent_id,call_sid,idempotency_key,mode,
   status,payment_status,currency,subtotal_cents,total_cents,fulfillment)
 values(p_owner_id,p_business_id,p_agent_id,p_call_sid,p_idempotency_key,'test',
  'awaiting_confirmation','not_started',product.currency,
  product.price_cents*p_qty,product.price_cents*p_qty,'pickup')
 returning id into new_order;
 insert into public.vmv_ai_order_lines
  (order_id,owner_id,item_id,sku,name,qty,unit_cents,subtotal_cents)
 values(new_order,p_owner_id,p_item_id,product.sku,product.name,p_qty,
  product.price_cents,product.price_cents*p_qty);
 if product.stock_mode='tracked' then
  insert into public.vmv_ai_inventory_holds(order_id,item_id,owner_id,qty)
   values(new_order,p_item_id,p_owner_id,p_qty);
 end if;
 insert into public.vmv_ai_order_events(order_id,owner_id,event_type,details)
 values(new_order,p_owner_id,'quote_created',jsonb_build_object('mode','test','price_source','approved_catalog'));
 return new_order;
end $$;
revoke all on function public.vmv_ai_test_prepare_order(uuid,uuid,uuid,uuid,integer,text,text)
 from public,anon,authenticated;
grant execute on function public.vmv_ai_test_prepare_order(uuid,uuid,uuid,uuid,integer,text,text)
 to service_role;

create or replace function public.vmv_ai_test_confirm_order(p_owner_id uuid,p_order_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare row_record record;
begin
 select * into row_record from public.vmv_ai_orders
 where id=p_order_id and owner_id=p_owner_id and mode='test' for update;
 if not found then return false; end if;
 if row_record.status='awaiting_payment' then return true; end if;
 if row_record.status<>'awaiting_confirmation' then return false; end if;
 if exists(select 1 from public.vmv_ai_inventory_holds
   where order_id=p_order_id and state='held' and expires_at<=now()) then
  update public.vmv_ai_orders set status='expired',updated_at=now() where id=p_order_id;
  return false;
 end if;
 update public.vmv_ai_orders
 set status='awaiting_payment',buyer_accepted_at=now(),updated_at=now() where id=p_order_id;
 insert into public.vmv_ai_order_events(order_id,owner_id,event_type,details)
 values(p_order_id,p_owner_id,'buyer_accepted_test',jsonb_build_object('paid',false));
 return true;
end $$;
revoke all on function public.vmv_ai_test_confirm_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vmv_ai_test_confirm_order(uuid,uuid) to service_role;

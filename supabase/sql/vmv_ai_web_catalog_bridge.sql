-- AI Agents catalog bridge: link Web Studio display cards to server-authorized products.
-- Source cards are MARKETING DRAFTS; never authorize sales, inventory or pricing automatically.
-- No change to Web Studio tables, owned by another VMV module.
alter table public.vmv_ai_catalog_items
 add column if not exists web_source_id uuid;
create unique index if not exists vmv_ai_catalog_web_source_owner
 on public.vmv_ai_catalog_items(owner_id,web_source_id)
 where web_source_id is not null;

create or replace function public.vmv_ai_owner_import_web_card(
 p_business_id uuid,p_web_product_id uuid)
returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 owner uuid; cards jsonb; card jsonb;
 card_title text;card_desc text;card_price text;price_text text;
 cents integer; sku text; existing uuid; created uuid;
begin
 owner:=(select auth.uid());
 if owner is null or p_business_id is null or p_web_product_id is null then
  raise exception 'Authentication and source card are required';
 end if;
 if not exists(select 1 from public.vmv_ai_businesses b
   where b.id=p_business_id and b.owner_id=owner) then
  raise exception 'Business not authorized';
 end if;
 select w.items into cards from public.smartjob_web_intake_products w
  where w.owner_id=owner;
 if cards is null then raise exception 'No Web Studio products found';end if;
 select x into card from jsonb_array_elements(cards) x
 where x->>'id'=p_web_product_id::text limit 1;
 if card is null then raise exception 'Web product no longer exists';end if;
 card_title:=trim(coalesce(card->>'title',''));
 card_desc:=left(trim(coalesce(card->>'description','')),700);
 card_price:=trim(coalesce(card->>'price',''));
 if length(card_title) not between 1 and 120 then
  raise exception 'The web card needs a valid product name';
 end if;
 -- No speculative prices: rejects ranges, "Desde", commas, missing amounts,
 -- discount labels, currency conversions, variants and extra charges.
 if card_price !~ '^[$]?[0-9]{1,5}([.][0-9]{1,2})?$' then
  raise exception 'Confirm a fixed USD price in Web Studio before importing';
 end if;
 price_text:=replace(card_price,'$','');
 cents:=round(price_text::numeric*100)::integer;
 if cents<1 or cents>10000000 then raise exception 'Invalid approved price range';end if;
 -- A linked product must never change price, approval or stock without owner review.
 select id into existing from public.vmv_ai_catalog_items
 where owner_id=owner and web_source_id=p_web_product_id;
 if existing is not null then return existing;end if;
 -- Avoid colliding with owner's hand-written SKU; prefix identifies origin, not stock.
 sku:='WEB-'||upper(substr(replace(p_web_product_id::text,'-',''),1,20));
 insert into public.vmv_ai_catalog_items(
  owner_id,business_id,sku,name,description,price_cents,currency,
  stock_mode,available_qty,approved,active,web_source_id)
 values(owner,p_business_id,sku,card_title,card_desc,cents,'usd',
  'manual',null,false,false,p_web_product_id)
 on conflict do nothing returning id into created;
 if created is null then
  select id into created from public.vmv_ai_catalog_items
   where owner_id=owner and web_source_id=p_web_product_id;
 end if;
 return created;
end $$;
revoke all on function public.vmv_ai_owner_import_web_card(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.vmv_ai_owner_import_web_card(uuid,uuid)
 to authenticated;

-- Source-link is immutable even for owner-level direct Supabase writes.
create or replace function public.vmv_ai_catalog_web_link_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and new.web_source_id is distinct from old.web_source_id then
  raise exception 'Web Studio source linkage cannot be reassigned';
 end if;
 if new.web_source_id is not null and
  not exists(select 1 from public.smartjob_web_intake_products w
    where w.owner_id=new.owner_id and exists(
      select 1 from jsonb_array_elements(w.items) card
      where card->>'id'=new.web_source_id::text)) then
  raise exception 'Source Web Studio card does not belong to owner';
 end if;
 return new;
end $$;
drop trigger if exists vmv_ai_catalog_web_link_guard on public.vmv_ai_catalog_items;
create trigger vmv_ai_catalog_web_link_guard before insert or update
 on public.vmv_ai_catalog_items for each row
 execute function public.vmv_ai_catalog_web_link_guard();

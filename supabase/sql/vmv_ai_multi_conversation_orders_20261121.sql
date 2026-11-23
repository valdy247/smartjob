-- Atomic, server-only, multi-item order capture for VMV agent conversations.
-- No inventory hold, payment intent, fulfillment promise or payment status change.
create or replace function public.vmv_ai_capture_conversation_order(
 p_owner uuid,p_business uuid,p_agent uuid,p_lines jsonb,p_key text,
 p_mode text,p_source text,p_session uuid,p_name text,p_email text,p_phone text
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 agent_row record; line jsonb; catalog_row record; order_id uuid;
 existing uuid; requested_item uuid; amount integer; subtotal bigint:=0;
 total_quantity integer:=0; seen uuid[]:=array[]::uuid[];
 priced_lines jsonb:='[]'::jsonb; stock_held integer;
begin
 if p_owner is null or p_business is null or p_agent is null or p_session is null or
  p_key is null or length(p_key) not between 10 and 100 or
  p_mode not in ('test','live') or
  (p_mode='test' and p_source<>'owner_preview') or
  (p_mode='live' and p_source<>'public_web_chat') or
  p_lines is null or jsonb_typeof(p_lines)<>'array' or
  jsonb_array_length(p_lines) not between 1 and 8 or
  length(btrim(coalesce(p_name,''))) not between 2 and 80 or
  length(coalesce(p_email,''))>180 or length(coalesce(p_phone,''))>35 or
  (nullif(btrim(coalesce(p_email,'')),'') is null and
   nullif(btrim(coalesce(p_phone,'')),'') is null)
 then return null; end if;

 select a.id,a.status,a.configuration into agent_row
 from public.vmv_ai_agents a
 join public.vmv_ai_businesses b on b.id=a.business_id and b.owner_id=p_owner
 where a.id=p_agent and a.owner_id=p_owner and a.business_id=p_business;
 if not found or agent_row.configuration->>'cap_catalog'<>'Sí'
  or agent_row.configuration->>'cap_sales'<>'Sí'
  or agent_row.configuration->>'perm_prepare_order'<>'Sí' then return null; end if;

 if p_mode='test' then
  if not exists(select 1 from public.vmv_ai_conversations c
   where c.id=p_session and c.agent_id=p_agent and c.owner_id=p_owner)
  then return null; end if;
 else
  if agent_row.status<>'active' or not exists (
   select 1 from public.vmv_web_public_chat_sessions s
   join public.vmv_web_chat_site_links link
    on link.owner_id=s.owner_id and link.agent_id=s.agent_id
    and link.site_kind=s.site_kind and link.site_slug=s.site_slug
   join public.vmv_web_chat_settings cfg
    on cfg.owner_id=s.owner_id and cfg.agent_id=s.agent_id
   where s.id=p_session and s.owner_id=p_owner and s.agent_id=p_agent
    and link.public_chat_enabled=true and cfg.sales_enabled=true
  ) then return null; end if;
 end if;

 perform pg_advisory_xact_lock(hashtext('vmv-ai-order:'||p_owner::text||':'||p_key));
 select o.id into existing from public.vmv_ai_orders o
 where o.owner_id=p_owner and o.idempotency_key=p_key;
 if existing is not null then return existing; end if;

 for line in select value from jsonb_array_elements(p_lines) order by value->>'id'
 loop
  if jsonb_typeof(line)<>'object' or
   coalesce(line->>'id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' or
   coalesce(line->>'qty','') !~ '^[1-9][0-9]?$'
  then return null; end if;
  requested_item:=(line->>'id')::uuid;
  amount:=(line->>'qty')::integer;
  if amount>50 or requested_item=any(seen) then return null; end if;
  seen:=array_append(seen,requested_item);
  total_quantity:=total_quantity+amount;
  if total_quantity>50 then return null; end if;

  if p_mode='live' and not exists(
   select 1 from public.vmv_web_public_chat_sessions s
   join public.vmv_web_chat_settings cfg
    on cfg.owner_id=s.owner_id and cfg.agent_id=s.agent_id
   where s.id=p_session and s.owner_id=p_owner and s.agent_id=p_agent
    and requested_item=any(cfg.sales_item_ids)
  ) then return null; end if;

  select id,sku,name,price_cents,currency,stock_mode,available_qty,
   jsonb_array_length(variants) as variant_count,
   jsonb_array_length(extras) as extra_count
  into catalog_row from public.vmv_ai_catalog_items
  where id=requested_item and owner_id=p_owner and business_id=p_business
   and active=true and approved=true for update;
  if not found or catalog_row.currency<>'usd' or catalog_row.price_cents<1 or
    catalog_row.variant_count<>0 or catalog_row.extra_count<>0
  then return null; end if;
  if catalog_row.stock_mode='tracked' then
   select coalesce(sum(h.qty),0) into stock_held from public.vmv_ai_inventory_holds h
   where h.item_id=requested_item and h.state='held' and h.expires_at>now();
   if catalog_row.available_qty-stock_held<amount then return null; end if;
  end if;
  subtotal:=subtotal+(catalog_row.price_cents::bigint*amount);
  if subtotal>2000000000 then return null; end if;
  priced_lines:=priced_lines||jsonb_build_array(jsonb_build_object(
   'id',requested_item,'sku',catalog_row.sku,'name',catalog_row.name,
   'qty',amount,'unit',catalog_row.price_cents));
 end loop;

 insert into public.vmv_ai_orders(
  owner_id,business_id,agent_id,idempotency_key,mode,status,payment_status,
  currency,subtotal_cents,total_cents,fulfillment,customer_name,
  customer_email,customer_phone,buyer_accepted_at)
 values(p_owner,p_business,p_agent,p_key,p_mode,'requires_review','not_started',
  'usd',subtotal::integer,subtotal::integer,'pickup',
  btrim(p_name),nullif(btrim(coalesce(p_email,'')),''),
  nullif(btrim(coalesce(p_phone,'')),''),now())
 returning id into order_id;

 for line in select value from jsonb_array_elements(priced_lines) loop
  insert into public.vmv_ai_order_lines(
   order_id,owner_id,item_id,sku,name,qty,unit_cents,subtotal_cents)
  values(order_id,p_owner,(line->>'id')::uuid,line->>'sku',line->>'name',
   (line->>'qty')::integer,(line->>'unit')::integer,
   (line->>'qty')::integer*(line->>'unit')::integer);
 end loop;
 insert into public.vmv_ai_order_events(order_id,owner_id,event_type,details)
 values(order_id,p_owner,'conversation_order_captured',
  jsonb_build_object('source',p_source,'mode',p_mode,'item_count',jsonb_array_length(priced_lines),
   'payment','not_started','requires_owner_review',true));
 return order_id;
end $$;
revoke all on function public.vmv_ai_capture_conversation_order(
 uuid,uuid,uuid,jsonb,text,text,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_capture_conversation_order(
 uuid,uuid,uuid,jsonb,text,text,text,uuid,text,text,text) to service_role;

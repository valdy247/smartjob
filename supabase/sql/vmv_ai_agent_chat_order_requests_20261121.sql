-- VMV AI Agents: recorded, unpaid purchase requests from a verified public chat
-- or the owner's private web-chat simulator. Never charges or reserves stock.
-- SERVER-ONLY atomic creation; the browser cannot provide prices or owner IDs.
create or replace function public.vmv_ai_agent_capture_order(
 p_owner uuid, p_business uuid, p_agent uuid, p_item uuid, p_qty integer,
 p_key text, p_mode text, p_source text, p_session uuid,
 p_name text, p_email text, p_phone text
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare product record; existing uuid; created uuid; holds integer:=0; ag record;
begin
 if p_qty not between 1 and 50 or length(p_key) not between 10 and 100 or
    p_mode not in ('test','live') or p_source not in ('owner_preview','public_web_chat') or
    (p_mode='live' and p_source<>'public_web_chat') or
    (p_mode='test' and p_source<>'owner_preview') or
    length(btrim(coalesce(p_name,''))) not between 2 and 80 or
    length(coalesce(p_email,''))>180 or length(coalesce(p_phone,''))>35 or
    (nullif(btrim(coalesce(p_email,'')),'') is null and
     nullif(btrim(coalesce(p_phone,'')),'') is null)
  then return null; end if;
 select a.id,a.status,a.configuration into ag from public.vmv_ai_agents a
 join public.vmv_ai_businesses b on b.id=a.business_id and b.owner_id=p_owner
 where a.id=p_agent and a.business_id=p_business and a.owner_id=p_owner;
 if not found or coalesce(ag.configuration->>'cap_catalog','')<>'Sí' or
    coalesce(ag.configuration->>'cap_sales','')<>'Sí' or
    coalesce(ag.configuration->>'perm_prepare_order','')<>'Sí'
 then return null; end if;
 if p_mode='live' then
  if ag.status<>'active' or not exists(
   select 1 from public.vmv_web_public_chat_sessions s
   join public.vmv_web_chat_site_links l
    on l.owner_id=s.owner_id and l.agent_id=s.agent_id
    and l.site_kind=s.site_kind and l.site_slug=s.site_slug
   join public.vmv_web_chat_settings settings
    on settings.owner_id=s.owner_id and settings.agent_id=s.agent_id
   where s.id=p_session and s.owner_id=p_owner and s.agent_id=p_agent
    and l.public_chat_enabled=true and settings.sales_enabled=true
    and p_item=any(settings.sales_item_ids)
  ) then return null; end if;
 else
  if not exists(select 1 from public.vmv_ai_conversations c
   where c.id=p_session and c.owner_id=p_owner and c.agent_id=p_agent)
  then return null; end if;
 end if;
 perform pg_advisory_xact_lock(hashtext('vmv-ai-chat-order:'||p_owner::text||':'||p_key));
 select o.id into existing from public.vmv_ai_orders o
 where o.owner_id=p_owner and o.idempotency_key=p_key;
 if existing is not null then return existing; end if;
 select id,sku,name,price_cents,currency,stock_mode,available_qty,
        jsonb_array_length(variants) as variant_count,
        jsonb_array_length(extras) as extra_count
 into product from public.vmv_ai_catalog_items
 where id=p_item and owner_id=p_owner and business_id=p_business
  and approved=true and active=true for update;
 if not found or product.currency<>'usd' or product.price_cents<1 or
    product.variant_count<>0 or product.extra_count<>0 then return null; end if;
 if product.stock_mode='tracked' then
  select coalesce(sum(h.qty),0) into holds from public.vmv_ai_inventory_holds h
  where h.item_id=p_item and h.state='held' and h.expires_at>now();
  if product.available_qty-holds<p_qty then return null; end if;
 end if;
 insert into public.vmv_ai_orders(
   owner_id,business_id,agent_id,idempotency_key,mode,status,payment_status,
   currency,subtotal_cents,total_cents,fulfillment,
   customer_name,customer_email,customer_phone,buyer_accepted_at)
 values(p_owner,p_business,p_agent,p_key,p_mode,'requires_review','not_started',
   product.currency,product.price_cents*p_qty,product.price_cents*p_qty,'pickup',
   btrim(p_name),nullif(btrim(coalesce(p_email,'')),''),
   nullif(btrim(coalesce(p_phone,'')),''),now())
 returning id into created;
 insert into public.vmv_ai_order_lines(order_id,owner_id,item_id,sku,name,qty,unit_cents,subtotal_cents)
 values(created,p_owner,p_item,product.sku,product.name,p_qty,product.price_cents,
  product.price_cents*p_qty);
 insert into public.vmv_ai_order_events(order_id,owner_id,event_type,details)
 values(created,p_owner,'chat_order_requested',
  jsonb_build_object('source',p_source,'mode',p_mode,
   'payment','not_started','requires_owner_review',true));
 return created;
end $$;
revoke all on function public.vmv_ai_agent_capture_order(
 uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_agent_capture_order(
 uuid,uuid,uuid,uuid,integer,text,text,text,uuid,text,text,text) to service_role;

-- The owner may approve the request for payment or decline it. No payment is created.
create or replace function public.vmv_ai_owner_review_chat_order(
 p_order uuid,p_decision text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare caller uuid:=auth.uid(); target record; line record; holds integer;
begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or
    p_decision not in ('awaiting_payment','cancelled') then return false; end if;
 select * into target from public.vmv_ai_orders
 where id=p_order and owner_id=caller and status='requires_review' for update;
 if not found then return false; end if;
 if p_decision='awaiting_payment' then
  for line in select l.item_id,l.qty from public.vmv_ai_order_lines l
   where l.order_id=p_order and l.owner_id=caller loop
   if not exists(select 1 from public.vmv_ai_catalog_items i
     where i.id=line.item_id and i.owner_id=caller and i.business_id=target.business_id
       and i.active=true and i.approved=true) then return false; end if;
   select i.available_qty-coalesce((
      select sum(h.qty) from public.vmv_ai_inventory_holds h
       where h.item_id=line.item_id and h.state='held' and h.expires_at>now()
    ),0) into holds from public.vmv_ai_catalog_items i
     where i.id=line.item_id and i.stock_mode='tracked';
   if holds is not null and holds<line.qty then return false; end if;
  end loop;
 end if;
 update public.vmv_ai_orders set status=p_decision,updated_at=now()
 where id=p_order and owner_id=caller and status='requires_review';
 insert into public.vmv_ai_order_events(order_id,owner_id,event_type,details)
 values(p_order,caller,'owner_order_reviewed',
  jsonb_build_object('decision',p_decision,'payment_status','not_started'));
 return true;
end $$;
revoke all on function public.vmv_ai_owner_review_chat_order(uuid,text)
 from public,anon,authenticated;
grant execute on function public.vmv_ai_owner_review_chat_order(uuid,text) to authenticated;

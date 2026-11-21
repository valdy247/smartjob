-- Phone-order TEST operations scoped to a signed call and preapproved owner permissions.
-- No payment, fulfillment or inventory settlement is performed here.
alter table public.vmv_ai_voice_calls
 add column if not exists order_id uuid references public.vmv_ai_orders(id) on delete set null;

create or replace function public.vmv_ai_phone_test_quote(
 p_call_sid text,p_item_id uuid,p_qty integer,p_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c record; new_order uuid; conf jsonb;
begin
 select * into c from public.vmv_ai_voice_calls
  where call_sid=p_call_sid and expires_at>now() for update;
 if not found then return null; end if;
 conf=c.agent_snapshot->'configuration';
 if conf->>'cap_sales'<>'Sí' or conf->>'perm_prepare_order'<>'Sí' then return null; end if;
 if c.order_id is not null then return c.order_id; end if;
 new_order:=public.vmv_ai_test_prepare_order(c.owner_id,
   (select a.business_id from public.vmv_ai_agents a where a.id=c.agent_id and a.owner_id=c.owner_id),
   c.agent_id,p_item_id,p_qty,p_key,p_call_sid);
 if new_order is null then return null; end if;
 update public.vmv_ai_voice_calls set order_id=new_order where call_sid=p_call_sid;
 return new_order;
end $$;
revoke all on function public.vmv_ai_phone_test_quote(text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_phone_test_quote(text,uuid,integer,text) to service_role;

create or replace function public.vmv_ai_phone_test_change_quantity(
 p_call_sid text,p_qty integer,p_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c record; o record; ln record; product record;
 reserved integer; new_order uuid;
begin
 if p_qty not between 1 and 50 then return null; end if;
 select * into c from public.vmv_ai_voice_calls where call_sid=p_call_sid
   and expires_at>now() and order_id is not null for update;
 if not found or c.agent_snapshot->'configuration'->>'cap_sales'<>'Sí' or
    c.agent_snapshot->'configuration'->>'perm_prepare_order'<>'Sí' then return null; end if;
 select * into o from public.vmv_ai_orders where id=c.order_id and owner_id=c.owner_id
   and agent_id=c.agent_id and call_sid=p_call_sid and mode='test' for update;
 if not found or o.status<>'awaiting_confirmation' then return null; end if;
 select * into ln from public.vmv_ai_order_lines where order_id=o.id;
 if not found then return null; end if;
 select * into product from public.vmv_ai_catalog_items where id=ln.item_id
   and owner_id=c.owner_id and approved and active for update;
 if not found or product.stock_mode='manual' or
   jsonb_array_length(product.variants)>0 or jsonb_array_length(product.extras)>0 then return null; end if;
 if product.stock_mode='tracked' then
   select coalesce(sum(qty),0) into reserved from public.vmv_ai_inventory_holds
   where item_id=ln.item_id and state='held' and expires_at>now() and order_id<>o.id;
   if product.available_qty-reserved<p_qty then return null; end if;
 end if;
 -- Validate before cancelling the old quote so failed changes preserve it.
 begin
  update public.vmv_ai_inventory_holds set state='released'
    where order_id=o.id and state='held';
  update public.vmv_ai_orders set status='cancelled',updated_at=now() where id=o.id;
  new_order:=public.vmv_ai_test_prepare_order(
    c.owner_id,o.business_id,c.agent_id,ln.item_id,p_qty,p_key,p_call_sid);
  if new_order is null then raise exception 'No available replacement quote'; end if;
  update public.vmv_ai_voice_calls set order_id=new_order where call_sid=p_call_sid;
  insert into public.vmv_ai_order_events(order_id,owner_id,event_type,details)
   values(new_order,c.owner_id,'phone_quantity_changed_test',
      jsonb_build_object('previous_order_id',o.id,'new_quantity',p_qty));
  return new_order;
 exception when others then return null;
 end;
end $$;
revoke all on function public.vmv_ai_phone_test_change_quantity(text,integer,text)
 from public,anon,authenticated;
grant execute on function public.vmv_ai_phone_test_change_quantity(text,integer,text)
 to service_role;

create or replace function public.vmv_ai_phone_test_accept(p_call_sid text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare c record;
begin
 select * into c from public.vmv_ai_voice_calls
  where call_sid=p_call_sid and expires_at>now() and order_id is not null for update;
 if not found or c.agent_snapshot->'configuration'->>'cap_sales'<>'Sí' or
   c.agent_snapshot->'configuration'->>'perm_confirm_order'<>'Sí' then return false; end if;
 return public.vmv_ai_test_confirm_order(c.owner_id,c.order_id);
end $$;
revoke all on function public.vmv_ai_phone_test_accept(text) from public,anon,authenticated;
grant execute on function public.vmv_ai_phone_test_accept(text) to service_role;

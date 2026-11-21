-- Stripe Connect TEST payments: separate from VMV SaaS subscriptions.
-- Functions server-only; never infer payment success from caller statements.
create or replace function public.vmv_ai_test_assign_checkout(
 p_owner uuid,p_order uuid,p_account text,p_session text,p_url text,p_expires timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare o record; c record;
begin
 if p_account !~ '^acct_[A-Za-z0-9]+$' or p_session !~ '^cs_test_[A-Za-z0-9_]+$'
    or p_url !~ '^https://checkout[.]stripe[.]com/' or
    p_expires<=now() or p_expires>now()+interval '40 minutes' then return false; end if;
 select * into o from public.vmv_ai_orders where id=p_order and owner_id=p_owner and
    mode='test' and status='awaiting_payment' for update;
 if not found then return false; end if;
 select * into c from public.vmv_ai_merchant_payments
   where business_id=o.business_id and owner_id=p_owner and provider='stripe_connect'
    and provider_account_id=p_account and verified_by_server and can_accept_payments and not livemode;
 if not found then return false; end if;
 if exists(select 1 from public.vmv_ai_inventory_holds
   where order_id=p_order and state='held' and expires_at<=now())then return false; end if;
 update public.vmv_ai_inventory_holds
  set expires_at=greatest(expires_at,p_expires+interval '3 minutes')
  where order_id=p_order and state='held';
 insert into public.vmv_ai_payment_attempts(order_id,owner_id,provider,
   provider_session_id,checkout_url,mode,amount_cents,currency,state)
 values(p_order,p_owner,'stripe_connect',p_session,p_url,'test',o.total_cents,o.currency,'pending')
 on conflict (provider_session_id) do nothing;
 update public.vmv_ai_orders set payment_status='pending',updated_at=now() where id=p_order;
 insert into public.vmv_ai_order_events(order_id,owner_id,event_type,details)
 values(p_order,p_owner,'checkout_test_created',jsonb_build_object('provider','stripe_connect','paid',false));
 return true;
end $$;
revoke all on function public.vmv_ai_test_assign_checkout(uuid,uuid,text,text,text,timestamptz)
 from public,anon,authenticated;
grant execute on function public.vmv_ai_test_assign_checkout(uuid,uuid,text,text,text,timestamptz)
 to service_role;

-- Called only AFTER server validates Stripe signature AND retrieves the Checkout
-- Session on the correct connected account with payment_status=paid.
create or replace function public.vmv_ai_test_verified_payment(
 p_order uuid,p_session text,p_account text,p_amount integer,p_currency text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare o record;m record;attempt record;h record;stock integer;expired boolean:=false;
begin
 select * into o from public.vmv_ai_orders where id=p_order and mode='test' for update;
 if not found then return 'not_found'; end if;
 select * into m from public.vmv_ai_merchant_payments where business_id=o.business_id
  and owner_id=o.owner_id and provider='stripe_connect' and verified_by_server
  and can_accept_payments and provider_account_id=p_account and not livemode;
 if not found or p_amount<>o.total_cents or p_currency<>o.currency then return 'invalid_payment'; end if;
 select * into attempt from public.vmv_ai_payment_attempts
  where order_id=p_order and owner_id=o.owner_id and provider='stripe_connect'
    and provider_session_id=p_session and amount_cents=p_amount and currency=p_currency for update;
 if not found then return 'unknown_attempt'; end if;
 if attempt.state='paid' then
  return case when o.status='paid' then 'already_paid' else 'paid_requires_review' end;
 end if;
 update public.vmv_ai_payment_attempts set state='paid',verified_at=now() where id=attempt.id;
 -- A paid external charge cannot be ignored if an inventory hold expired.
 for h in select * from public.vmv_ai_inventory_holds where order_id=p_order order by item_id for update loop
  if h.state<>'held' or h.expires_at<=now() then expired=true; end if;
  if not expired then
   select available_qty into stock from public.vmv_ai_catalog_items
    where id=h.item_id and owner_id=o.owner_id and stock_mode='tracked' for update;
   if stock is null or stock<h.qty then expired=true; end if;
  end if;
 end loop;
 if expired then
  update public.vmv_ai_orders set payment_status='paid',status='requires_review',updated_at=now()
   where id=p_order;
  insert into public.vmv_ai_order_events(order_id,owner_id,event_type,details)
   values(p_order,o.owner_id,'paid_requires_inventory_review',jsonb_build_object('paid',true,'fulfillment','review'));
  return 'paid_requires_review';
 end if;
 for h in select * from public.vmv_ai_inventory_holds
    where order_id=p_order and state='held' order by item_id for update loop
  update public.vmv_ai_catalog_items set available_qty=available_qty-h.qty,updated_at=now()
   where id=h.item_id and owner_id=o.owner_id and available_qty>=h.qty;
  update public.vmv_ai_inventory_holds set state='committed' where order_id=p_order and item_id=h.item_id;
 end loop;
 update public.vmv_ai_orders set payment_status='paid',status='paid',updated_at=now() where id=p_order;
 insert into public.vmv_ai_order_events(order_id,owner_id,event_type,details)
 values(p_order,o.owner_id,'payment_verified_test',jsonb_build_object('paid',true,'mode','test'));
 return 'paid';
end $$;
revoke all on function public.vmv_ai_test_verified_payment(uuid,text,text,integer,text)
 from public,anon,authenticated;
grant execute on function public.vmv_ai_test_verified_payment(uuid,text,text,integer,text)
 to service_role;

create or replace function public.vmv_ai_test_failed_payment(p_session text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare attempt record; found_id uuid;
begin
 select * into attempt from public.vmv_ai_payment_attempts
  where provider_session_id=p_session and mode='test' for update;
 if not found or attempt.state='paid' then return false; end if;
 update public.vmv_ai_payment_attempts set state='failed' where id=attempt.id;
 update public.vmv_ai_orders set payment_status='failed',updated_at=now()
  where id=attempt.order_id and payment_status<>'paid' returning id into found_id;
 if found_id is not null then
  insert into public.vmv_ai_order_events(order_id,owner_id,event_type,details)
  values(found_id,attempt.owner_id,'payment_failed_test',jsonb_build_object('paid',false));
 end if;
 return found_id is not null;
end $$;
revoke all on function public.vmv_ai_test_failed_payment(text) from public,anon,authenticated;
grant execute on function public.vmv_ai_test_failed_payment(text) to service_role;

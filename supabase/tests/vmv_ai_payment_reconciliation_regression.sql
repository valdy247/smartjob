-- INTERNAL SQL REGRESSION ONLY. Simulated provider responses, not a real Stripe payment.
-- BEGIN/ROLLBACK ensures no fake paid order or merchant credentials persist.
begin;
do $$
<<qa>>
declare owner_user uuid;biz uuid;agent uuid;item uuid;order_id uuid;result text;
 price_cents integer; paid_status text; qty integer; attempt_state text; forbidden text;
begin
 select a.owner_id,a.business_id,a.id into owner_user,biz,agent
 from public.vmv_ai_agents a where name='Asistente VMV · Prueba' limit 1;
 if agent is null then raise exception 'No test owner agent found';end if;
 insert into public.vmv_ai_catalog_items(owner_id,business_id,sku,name,price_cents,
  stock_mode,available_qty,approved)
 values(owner_user,biz,'PAY-QA-ROLLBACK','Payment SQL fixture (not real)',2150,'tracked',1,true)
 returning id into item;
 insert into public.vmv_ai_merchant_payments(
  business_id,owner_id,provider,provider_account_id,livemode,verified_by_server,can_accept_payments)
 values(biz,owner_user,'stripe_connect','acct_TESTRECONCILIATION',false,true,true);
 order_id:=public.vmv_ai_test_prepare_order(owner_user,biz,agent,item,1,'payment-qa-idempotent-00001',null);
 if order_id is null then raise exception 'Could not prepare order'; end if;
 if not public.vmv_ai_test_confirm_order(owner_user,order_id) then raise exception 'Order acceptance failed'; end if;
 if not public.vmv_ai_test_assign_checkout(
    owner_user,order_id,'acct_TESTRECONCILIATION','cs_test_TESTRECONCILIATION_001',
    'https://checkout.stripe.com/c/pay/cs_test_dummy',
    now()+interval '20 minutes') then raise exception 'Checkout attachment failed'; end if;
 select payment_status into paid_status from public.vmv_ai_orders where id=order_id;
 if paid_status<>'pending' then raise exception 'Pending checkout falsely completed'; end if;
 result:=public.vmv_ai_test_verified_payment(order_id,'cs_test_TESTRECONCILIATION_001',
    'acct_TESTRECONCILIATION',2200,'usd');
 if result<>'invalid_payment' then raise exception 'Amount mismatch not blocked: %',result;end if;
 result:=public.vmv_ai_test_verified_payment(order_id,'cs_test_TESTRECONCILIATION_001',
    'acct_TESTRECONCILIATION',2150,'usd');
 if result<>'paid' then raise exception 'Synthetic verified settlement failed: %',result;end if;
 result:=public.vmv_ai_test_verified_payment(order_id,'cs_test_TESTRECONCILIATION_001',
    'acct_TESTRECONCILIATION',2150,'usd');
 if result<>'already_paid' then raise exception 'Duplicate settlement not idempotent: %',result;end if;
 select available_qty into qty from public.vmv_ai_catalog_items where id=item;
 if qty<>0 then raise exception 'Inventory settled incorrectly; qty=%',qty;end if;
 select payment_status into paid_status from public.vmv_ai_orders where id=order_id;
 if paid_status<>'paid' then raise exception 'Payment mark missing after simulated validation';end if;
 select a.state into attempt_state from public.vmv_ai_payment_attempts a where a.order_id=qa.order_id;
 if attempt_state<>'paid' then raise exception 'Payment attempt did not settle';end if;
 forbidden:=public.vmv_ai_test_verified_payment(order_id,'cs_test_TESTRECONCILIATION_002',
   'acct_ANOTHERACCOUNT',2150,'usd');
 if forbidden<>'invalid_payment' then raise exception 'Merchant mismatch allowed';end if;
end $$;
rollback;

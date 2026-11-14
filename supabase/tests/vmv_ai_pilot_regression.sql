-- Deterministic database regression, *entire transaction rolls back*.
-- Test cases: owner selection, pinned revision/snapshot, duplicate callbacks,
-- approved price quote, idempotent retry, last-unit stock contention, not paid.
begin;
do $$
declare
 uid uuid;biz uuid;ag uuid;phone_id uuid;phone text;
 v_route uuid;sid text:='CA'||repeat('a',32);snap jsonb;old_version integer;
 item uuid;first_order uuid;retry_order uuid;competing uuid;found_order record;
begin
 select p.user_id,p.id,p.twilio_number into uid,phone_id,phone
 from public.smartjob_phone_routes p where p.enabled=true limit 1;
 select a.id,a.business_id,a.revision into ag,biz,old_version
 from public.vmv_ai_agents a where a.owner_id=uid order by a.created_at limit 1;
 if uid is null or ag is null then raise exception 'Pilot owner/agent fixture unavailable'; end if;

 insert into public.vmv_ai_phone_selections(route_id,owner_id,agent_id)
 values(phone_id,uid,ag)
 on conflict(route_id) do update set agent_id=excluded.agent_id;
 if exists(select 1 from public.vmv_ai_voice_routes where twilio_number=phone)
  then raise exception 'Unexpected live voice route. Refuse test mutation.'; end if;
 insert into public.vmv_ai_voice_routes
  (owner_id,agent_id,twilio_number,twilio_account_sid,enabled,verified_ownership,disclosure_approved,approved_at)
 values(uid,ag,phone,'AC'||repeat('b',32),true,true,true,now()) returning id into v_route;
 if not public.vmv_ai_open_voice_call(v_route,sid) then
  raise exception 'Selected agent failed to open call';end if;
 select agent_snapshot into snap from public.vmv_ai_voice_calls where call_sid=sid;
 if snap is null or snap->>'name' is null then raise exception 'No snapshot';end if;
 update public.vmv_ai_agents set purpose=purpose where id=ag;
 if not exists(select 1 from public.vmv_ai_agents where id=ag and revision=old_version+1)
  then raise exception 'Revision did not advance';end if;
 if exists(select 1 from public.vmv_ai_voice_calls where call_sid=sid and agent_revision<>old_version)
  then raise exception 'Live edit changed call version';end if;
 if not public.vmv_ai_claim_turn(sid,1) then raise exception 'First claim failed';end if;
 if public.vmv_ai_claim_turn(sid,1) then raise exception 'Duplicate claim was accepted';end if;
 if not public.vmv_ai_voice_save_turn(sid,1,'Hola','Hola, soy un agente.', 'es') then
  raise exception 'Conversation not saved';end if;
 if public.vmv_ai_voice_save_turn(sid,1,'Hola','duplicate', 'es') then
  raise exception 'Duplicate answer persisted';end if;
 if (select jsonb_array_length(turns) from public.vmv_ai_voice_calls where call_sid=sid)<>2
  then raise exception 'Unexpected conversation history';end if;

 insert into public.vmv_ai_catalog_items(owner_id,business_id,sku,name,price_cents,stock_mode,available_qty,approved)
 values(uid,biz,'QA-ROLLBACK-1','Synthetic test product',1599,'tracked',1,true)
 returning id into item;
 first_order:=public.vmv_ai_test_prepare_order(uid,biz,ag,item,1,'regression-key-0000001',null);
 retry_order:=public.vmv_ai_test_prepare_order(uid,biz,ag,item,1,'regression-key-0000001',null);
 competing:=public.vmv_ai_test_prepare_order(uid,biz,ag,item,1,'regression-key-0000002',null);
 if first_order is null or retry_order<>first_order or competing is not null then
  raise exception 'Stock reservation or idempotency incorrect';end if;
 if not public.vmv_ai_test_confirm_order(uid,first_order) then
  raise exception 'Test acceptance failed';end if;
 select status,payment_status,total_cents into found_order from public.vmv_ai_orders where id=first_order;
 if found_order.status<>'awaiting_payment' or found_order.payment_status<>'not_started'
   or found_order.total_cents<>1599 then
  raise exception 'Quote total or payment status incorrect';end if;
end $$;
rollback;

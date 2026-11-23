-- Owner-authenticated TEST-only quote/accept API. Never touches paid status or real payments.
-- Database is the authority for price, stock, ownership and idempotency.
create or replace function public.vmv_ai_owner_test_prepare_order(
 p_agent_id uuid,p_item_id uuid,p_qty integer,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare caller uuid:=auth.uid();business uuid;
begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then return null; end if;
 select a.business_id into business from public.vmv_ai_agents a
  join public.vmv_ai_businesses b on b.id=a.business_id and b.owner_id=caller
  where a.id=p_agent_id and a.owner_id=caller;
 if business is null then return null; end if;
 return public.vmv_ai_test_prepare_order(caller,business,p_agent_id,p_item_id,p_qty,p_idempotency_key,null);
end $$;
revoke all on function public.vmv_ai_owner_test_prepare_order(uuid,uuid,integer,text)
 from public,anon,authenticated;
grant execute on function public.vmv_ai_owner_test_prepare_order(uuid,uuid,integer,text) to authenticated;

create or replace function public.vmv_ai_owner_test_confirm_order(p_order_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare caller uuid:=auth.uid();
begin
 if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then return false; end if;
 return public.vmv_ai_test_confirm_order(caller,p_order_id);
end $$;
revoke all on function public.vmv_ai_owner_test_confirm_order(uuid)
 from public,anon,authenticated;
grant execute on function public.vmv_ai_owner_test_confirm_order(uuid) to authenticated;

-- Rollback-only primary-agent permission regression. No fixture persists.
begin;
do $seed$
declare
 v_owner uuid;v_central uuid;v_phone_owner uuid;
 v_w uuid;v_a uuid;v_other uuid;
begin
 select owner_id,id into v_owner,v_central from public.vmv_marketing_businesses limit 1;
 select user_id into v_phone_owner from public.smartjob_phone_routes where enabled limit 1;
 if v_owner is null or v_phone_owner is null or v_owner=v_phone_owner then
  raise exception 'Need different real test owners without guessing their IDs';
 end if;
 insert into public.vmv_ai_businesses(owner_id,name,central_business_id)
 values(v_owner,'Transactional principal-agent regression',v_central)
 returning id into v_w;
 insert into public.vmv_ai_agents(owner_id,business_id,name,kind,purpose,personality,language,instructions,knowledge,configuration,status)
 values(v_owner,v_w,'Transactional test agent','support','Testing ownership','Amable y profesional','es','','','{}'::jsonb,'draft')
 returning id into v_a;
 insert into public.vmv_ai_businesses(owner_id,name)
 values(v_owner,'Transactional incompatible workspace') returning id into v_other;
 perform set_config('vmv.test.primary_workspace',v_w::text,true);
 perform set_config('vmv.test.primary_agent',v_a::text,true);
 perform set_config('vmv.test.other_workspace',v_other::text,true);
 perform set_config('vmv.test.other_owner',v_phone_owner::text,true);
 perform set_config('request.jwt.claims',json_build_object(
  'sub',v_owner::text,'role','authenticated','is_anonymous',false)::text,true);
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
end
$seed$;
set local role authenticated;
do $checks$
declare w uuid:=current_setting('vmv.test.primary_workspace')::uuid;
 a uuid:=current_setting('vmv.test.primary_agent')::uuid;
 other uuid:=current_setting('vmv.test.other_workspace')::uuid;
begin
 if not public.vmv_ai_select_primary_agent(w,a,null) then
  raise exception 'OWNED_SELECTION_FAILED';
 end if;
 if public.vmv_ai_select_primary_agent(w,a,null) then
  raise exception 'STALE_DEVICE_WAS_ACCEPTED';
 end if;
 if public.vmv_ai_select_primary_agent(other,a,null) then
  raise exception 'UNLINKED_OR_CROSS_BUSINESS_AGENT_ACCEPTED';
 end if;
 begin
  update public.vmv_ai_businesses set primary_agent_id=a where id=other;
  raise exception 'DIRECT_CROSS_BUSINESS_UPDATE_ACCEPTED';
 exception when check_violation then null;
 end;
 perform set_config('request.jwt.claim.sub',current_setting('vmv.test.other_owner'),true);
 perform set_config('request.jwt.claims',json_build_object(
  'sub',current_setting('vmv.test.other_owner'),'role','authenticated',
  'is_anonymous',false)::text,true);
 if public.vmv_ai_select_primary_agent(w,a,a) then
  raise exception 'OTHER_OWNER_ACCEPTED';
 end if;
end
$checks$;
rollback;

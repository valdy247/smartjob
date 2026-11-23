-- Integration test: real case/message/history/notification functions, all rolled back.
begin;
select set_config('gbp.test_owner',(select p.id::text from public.smartjob_profiles p where not exists(select 1 from public.vmv_marketing_staff s where s.user_id=p.id) limit 1),true);
select set_config('gbp.test_staff',(select user_id::text from public.vmv_marketing_staff limit 1),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('gbp.test_owner'),'role','authenticated')::text,true);
do $$
declare owner_id uuid:=current_setting('gbp.test_owner')::uuid; staff_id uuid:=current_setting('gbp.test_staff')::uuid;
 rid uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); result jsonb; duplicate jsonb; blocked boolean;
begin
 if owner_id is null or staff_id is null then raise exception 'Existing customer and staff profiles required'; end if;
 insert into public.vmv_marketing_requests(id,owner_id,service_code,business_name,category_id,goal_text,agreed_to_contact,google_profile_data)
 values(rid,owner_id,'google_profile','VMV conversation rollback QA','bakery','QA communication integration only',true,
 jsonb_build_object('action','improve','kind','service_area','googleCategory','Bakery','country','US','serviceAreas','Columbus GA',
 'hoursEnabled',false,'hours',(select jsonb_agg(jsonb_build_object('closed',true,'start','09:00','end','17:00')) from generate_series(1,7)),'media','[]'::jsonb));
 perform set_config('gbp.test_id',rid::text,true);
 if not exists(select 1 from public.vmv_admin_case_index where source='marketing' and id=rid and vmv_admin_case_index.owner_id=current_setting('gbp.test_owner')::uuid)
 then raise exception 'Marketing case missing from Admin index'; end if;
 result:=public.vmv_admin_append_message(owner_id,'marketing',rid,'message','QA customer message',k);
 duplicate:=public.vmv_admin_append_message(owner_id,'marketing',rid,'message','QA customer message',k);
 if result->>'id'<>duplicate->>'id' or duplicate->>'reused'<>'true' or
  (select count(*) from public.vmv_admin_messages where source='marketing' and source_id=rid and author_id=owner_id)<>1
 then raise exception 'Message retry duplicated or lost'; end if;
 if not exists(select 1 from public.vmv_admin_notifications where source='marketing' and source_id=rid and recipient_id=staff_id)
 then raise exception 'Staff did not receive internal notification'; end if;
 blocked:=false;
 begin perform public.vmv_admin_append_message(owner_id,'marketing',rid,'internal_note','QA forbidden note',gen_random_uuid());
 exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Customer created an internal note'; end if;
 blocked:=false;
 begin perform public.vmv_admin_append_message(gen_random_uuid(),'marketing',rid,'message','QA intruder',gen_random_uuid());
 exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Another account posted a message'; end if;
 perform public.vmv_admin_append_message(staff_id,'marketing',rid,'message','QA team response',gen_random_uuid());
 perform public.vmv_admin_append_message(staff_id,'marketing',rid,'internal_note','QA private operator note',gen_random_uuid());
 if not exists(select 1 from public.vmv_admin_notifications where source='marketing' and source_id=rid and recipient_id=owner_id)
 then raise exception 'Customer did not receive internal notification'; end if;
end $$;
set local role authenticated;
do $$ declare rid uuid:=current_setting('gbp.test_id')::uuid; begin
 if (select count(*) from public.vmv_admin_messages where source='marketing' and source_id=rid)<>2
 then raise exception 'Owner cannot see exactly the two shared messages'; end if;
 if exists(select 1 from public.vmv_admin_case_history where source='marketing' and source_id=rid and visibility='internal')
 then raise exception 'Internal history exposed'; end if;
 if exists(select 1 from public.vmv_admin_notifications where source='marketing' and source_id=rid and recipient_id<>auth.uid())
 then raise exception 'Another user notification exposed'; end if;
end $$;
reset role;
update public.vmv_marketing_requests set status='cancelled' where id=current_setting('gbp.test_id')::uuid;
do $$ declare blocked boolean:=false; begin
 begin perform public.vmv_admin_append_message(current_setting('gbp.test_owner')::uuid,'marketing',current_setting('gbp.test_id')::uuid,'message','QA closed case',gen_random_uuid());
 exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Closed case accepted a new message'; end if;
end $$;
rollback;
select 'PASS: case index, messages, retries, access, internal notes, notifications and closed case; rollback complete' as result;

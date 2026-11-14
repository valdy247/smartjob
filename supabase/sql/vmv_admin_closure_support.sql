-- Admin closure 03: atomic, idempotent client tickets and append-only conversations.
create or replace function public.vmv_admin_create_ticket(
 p_actor uuid,p_request_key uuid,p_subject text,p_description text,
 p_service text,p_related uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid; v_status text; v_sla integer:=3; v_due timestamptz; v_staff record;
begin
 if p_actor is null or p_request_key is null or
    not exists(select 1 from public.smartjob_profiles where id=p_actor)
   then raise exception 'invalid_account'; end if;
 if length(btrim(coalesce(p_subject,''))) not between 5 and 140
   or length(btrim(coalesce(p_description,''))) not between 10 and 4000
   or p_service not in ('general','marketing','web_services','smart_call','ai_agents','billing','company_formation','other')
    then raise exception 'invalid_ticket'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ticket:'||p_actor::text,0));
 select id,status into v_id,v_status from public.vmv_admin_tickets
  where owner_id=p_actor and request_key=p_request_key;
 if v_id is not null then return jsonb_build_object('ok',true,'id',v_id,'status',v_status,'reused',true); end if;
 if (select count(*) from public.vmv_admin_tickets
     where owner_id=p_actor and created_at>now()-interval '24 hours')>=10
   then raise exception 'ticket_limit'; end if;
 if p_related is not null and not exists (
  select 1 from public.vmv_admin_tickets t where t.id=p_related
    and t.owner_id=p_actor and t.status in ('resolved','closed')
 ) then raise exception 'invalid_related_ticket'; end if;
 insert into public.vmv_admin_tickets(owner_id,request_key,subject,description,service_code,related_ticket_id)
  values(p_actor,p_request_key,btrim(p_subject),btrim(p_description),p_service,p_related)
  returning id,status into v_id,v_status;
 select coalesce((value->>'sla_days')::integer,3) into v_sla
  from public.vmv_admin_settings where key='support_defaults';
 v_sla:=greatest(1,least(30,coalesce(v_sla,3)));
 v_due:=now()+(v_sla||' days')::interval;
 insert into public.vmv_admin_case_meta(source,source_id,due_at)
  values('support',v_id,v_due);
 insert into public.vmv_admin_case_history(source,source_id,actor_id,action,summary,visibility)
  values('support',v_id,p_actor,'ticket_created',
   case when p_related is null then 'Solicitud de soporte creada' else 'Solicitud de seguimiento creada' end,'shared');
 for v_staff in select user_id from public.vmv_marketing_staff where user_id<>p_actor loop
  insert into public.vmv_admin_notifications(recipient_id,actor_id,source,source_id,kind,title)
   values(v_staff.user_id,p_actor,'support',v_id,'new_case','Nuevo caso de soporte');
 end loop;
 return jsonb_build_object('ok',true,'id',v_id,'status',v_status,'due_at',v_due,'reused',false);
end;
$$;
revoke all on function public.vmv_admin_create_ticket(uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.vmv_admin_create_ticket(uuid,uuid,text,text,text,uuid) to service_role;

create or replace function public.vmv_admin_append_message(
 p_actor uuid,p_source text,p_id uuid,p_kind text,p_body text,p_request_key uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_staff boolean; v_owner uuid; v_status text; v_message uuid;
 v_recipient uuid; v_assignee uuid; v_user record; v_public boolean;
begin
 if p_actor is null or p_id is null or p_request_key is null
  or p_source not in ('support','marketing','domain','provisioning')
  or p_kind not in ('message','internal_note')
  or length(btrim(coalesce(p_body,''))) not between 1 and 4000
   then raise exception 'invalid_message'; end if;
 v_staff:=exists(select 1 from public.vmv_marketing_staff where user_id=p_actor);
 if not v_staff and p_kind='internal_note' then raise exception 'forbidden'; end if;
 perform pg_advisory_xact_lock(hashtextextended('messages:'||p_actor::text,0));
 select id into v_message from public.vmv_admin_messages
  where author_id=p_actor and request_key=p_request_key;
 if v_message is not null then return jsonb_build_object('ok',true,'id',v_message,'reused',true); end if;
 case p_source
 when 'support' then select owner_id,status into v_owner,v_status from public.vmv_admin_tickets where id=p_id for update;
 when 'marketing' then select owner_id,status into v_owner,v_status from public.vmv_marketing_requests where id=p_id for update;
 when 'domain' then select owner_id,status into v_owner,v_status from public.smartjob_builder_domain_requests where id=p_id for update;
 when 'provisioning' then select user_id,status into v_owner,v_status from public.smartjob_provisioning_requests where id=p_id for update;
 end case;
 if v_owner is null then raise exception 'case_not_found'; end if;
 if not v_staff and v_owner<>p_actor then raise exception 'forbidden'; end if;
 if p_kind='message' then
  if p_source='support' and v_status in ('resolved','closed') then raise exception 'case_closed'; end if;
  if p_source='marketing' and v_status in ('verified','cancelled') then raise exception 'case_closed'; end if;
  if p_source='provisioning' and v_status in ('activated','cancelled','rejected') then raise exception 'case_closed'; end if;
  if p_source='domain' and v_status in ('connected','cancelled','rejected') then raise exception 'case_closed'; end if;
 end if;
 if not v_staff and (select count(*) from public.vmv_admin_messages
  where author_id=p_actor and created_at>now()-interval '24 hours')>=80
  then raise exception 'message_limit'; end if;
 insert into public.vmv_admin_messages(source,source_id,author_id,kind,body,request_key)
 values(p_source,p_id,p_actor,p_kind,btrim(p_body),p_request_key)
 returning id into v_message;
 -- Keep the canonical record's activity timestamp current. No service status is fabricated.
 if p_source='support' then
  update public.vmv_admin_tickets
    set status=case when not v_staff and status='needs_customer' then 'in_progress' else status end,
    updated_at=clock_timestamp() where id=p_id;
 elsif p_source='marketing' then
  update public.vmv_marketing_requests set updated_at=clock_timestamp() where id=p_id;
 elsif p_source='domain' then
  update public.smartjob_builder_domain_requests set updated_at=clock_timestamp() where id=p_id;
 elsif p_source='provisioning' then
  update public.smartjob_provisioning_requests set updated_at=clock_timestamp() where id=p_id;
 end if;
 v_public:=p_kind='message';
 insert into public.vmv_admin_case_history(source,source_id,actor_id,action,summary,visibility,detail)
 values(p_source,p_id,p_actor,case when v_public then 'message_added' else 'internal_note_added' end,
   case when v_public then 'Nuevo mensaje en la conversación' else 'Nueva nota interna' end,
   case when v_public then 'shared' else 'internal' end,
   jsonb_build_object('message_id',v_message));
 if v_staff then
  insert into public.vmv_admin_audit(actor_id,action,source,source_id,detail)
  values(p_actor,case when v_public then 'customer_message_added' else 'internal_note_added' end,
    p_source,p_id,jsonb_build_object('message_id',v_message));
 end if;
 if v_public then
  if v_staff and v_owner<>p_actor then
   insert into public.vmv_admin_notifications(recipient_id,actor_id,source,source_id,kind,title)
   values(v_owner,p_actor,p_source,p_id,'new_message','Nuevo mensaje de VMV Business');
  else
   select assigned_to into v_assignee from public.vmv_admin_case_meta
    where source=p_source and source_id=p_id;
   if v_assignee is not null and v_assignee<>p_actor then
    insert into public.vmv_admin_notifications(recipient_id,actor_id,source,source_id,kind,title)
     values(v_assignee,p_actor,p_source,p_id,'new_message','El cliente respondió');
   else
    for v_user in select user_id from public.vmv_marketing_staff where user_id<>p_actor loop
     insert into public.vmv_admin_notifications(recipient_id,actor_id,source,source_id,kind,title)
      values(v_user.user_id,p_actor,p_source,p_id,'new_message','Nuevo mensaje del cliente');
    end loop;
   end if;
  end if;
 end if;
 return jsonb_build_object('ok',true,'id',v_message,'reused',false);
end;
$$;
revoke all on function public.vmv_admin_append_message(uuid,text,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.vmv_admin_append_message(uuid,text,uuid,text,text,uuid) to service_role;

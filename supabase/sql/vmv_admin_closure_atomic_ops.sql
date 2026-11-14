-- Admin closure 02: atomic mutations, optimistic concurrency and audit.
-- Callable by service_role only after the Next.js route has verified the Supabase user.
create or replace function public.vmv_admin_apply(
 p_actor uuid, p_action text, p_source text default null, p_id uuid default null,
 p_expected text default null, p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_role text; v_old timestamptz; v_new timestamptz; v_assignee uuid; v_priority text;
 v_due timestamptz; v_target uuid; v_target_role text; v_status text;
 v_old_status text; v_customer uuid; v_revised integer; v_quote integer;
 v_quote_note text; v_note text; v_evidence text; v_setting text;
 v_value jsonb; v_details jsonb; v_visibility text := 'internal';
 v_summary text; v_kind text; v_action text;
begin
 select role into v_role from public.vmv_marketing_staff where user_id=p_actor;
 if v_role not in ('agent','admin') or v_role is null then raise exception 'forbidden'; end if;
 if p_action in ('case_meta','marketing_quote','marketing_status','ticket_status') then
  if p_source not in ('marketing','support','provisioning','domain') or p_id is null
   then raise exception 'invalid_case'; end if;
  case p_source
   when 'marketing' then
    select owner_id into v_customer from public.vmv_marketing_requests where id=p_id;
   when 'support' then
    select owner_id into v_customer from public.vmv_admin_tickets where id=p_id;
   when 'provisioning' then
    select user_id into v_customer from public.smartjob_provisioning_requests where id=p_id;
   when 'domain' then
    select owner_id into v_customer from public.smartjob_builder_domain_requests where id=p_id;
  end case;
  if v_customer is null then raise exception 'case_not_found'; end if;
 end if;
 if p_action='case_meta' then
  v_priority:=p_data->>'priority';
  if v_priority not in ('low','normal','high','urgent') or v_priority is null then raise exception 'invalid_priority'; end if;
  if nullif(p_data->>'assigned_to','') is not null then
   v_assignee:=(p_data->>'assigned_to')::uuid;
   if not exists(select 1 from public.vmv_marketing_staff where user_id=v_assignee) then
    raise exception 'invalid_assignee';
   end if;
  end if;
  if nullif(p_data->>'due_at','') is not null then
   v_due:=(p_data->>'due_at')::timestamptz;
   if v_due < now()-interval '20 years' or v_due>now()+interval '10 years' then raise exception 'invalid_due'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('meta:'||p_source||':'||p_id::text,0));
  select updated_at into v_old from public.vmv_admin_case_meta
   where source=p_source and source_id=p_id for update;
  if (v_old is null and nullif(p_expected,'') is not null)
   or (v_old is not null and (nullif(p_expected,'') is null or v_old<>p_expected::timestamptz))
   then raise exception 'conflict'; end if;
  insert into public.vmv_admin_case_meta(source,source_id,assigned_to,priority,due_at)
   values(p_source,p_id,v_assignee,v_priority,v_due)
   on conflict(source,source_id) do update set
    assigned_to=excluded.assigned_to,priority=excluded.priority,due_at=excluded.due_at,updated_at=clock_timestamp()
   returning updated_at into v_new;
  v_details:=jsonb_build_object('old_version',v_old,'new_version',v_new,'assigned_to',v_assignee,
    'priority',v_priority,'due_at',v_due);
  v_action:='case_organization'; v_summary:='Responsable, prioridad o plazo actualizados';
 elsif p_action in ('marketing_quote','marketing_status') then
  if p_source<>'marketing' then raise exception 'invalid_source'; end if;
  select updated_at,status into v_old,v_old_status from public.vmv_marketing_requests where id=p_id for update;
  if v_old is null then raise exception 'case_not_found'; end if;
  if nullif(p_expected,'') is null or v_old<>p_expected::timestamptz then raise exception 'conflict'; end if;
  if p_action='marketing_quote' then
   v_quote:=(p_data->>'amount_cents')::integer;
   v_quote_note:=btrim(coalesce(p_data->>'quote_note',''));
   if v_quote<0 or v_quote>100000000 or length(v_quote_note) not between 8 and 1500 then
    raise exception 'invalid_quote'; end if;
   if v_old_status not in ('received','quoted','needs_customer') then raise exception 'invalid_transition'; end if;
   update public.vmv_marketing_requests set
    quoted_price_cents=v_quote,quote_note=v_quote_note,status='quoted',
    staff_update='Presupuesto disponible. Pendiente de aprobación del cliente.'
    where id=p_id returning updated_at,quote_revision into v_new,v_revised;
   v_details:=jsonb_build_object('old_status',v_old_status,'new_status','quoted','amount_cents',v_quote,
    'currency','USD','quote_revision',v_revised);
   v_action:='marketing_quote';v_summary:='Presupuesto en USD preparado';v_visibility:='shared';v_kind:='quote_available';
  else
   v_status:=p_data->>'status';
   v_note:=btrim(coalesce(p_data->>'note',''));
   v_evidence:=btrim(coalesce(p_data->>'evidence_url',''));
   if v_status not in ('received','approved','in_progress','needs_customer','verified','cancelled')
      or length(v_note)>1500 then raise exception 'invalid_transition'; end if;
   if v_old_status in ('verified','cancelled') and v_status<>v_old_status then raise exception 'case_closed'; end if;
   if v_status='verified' and (v_evidence not like 'https://%' or length(v_evidence)>750) then
    raise exception 'invalid_evidence'; end if;
   if v_status='verified' then
    update public.vmv_marketing_requests set status=v_status,
     staff_update=nullif(v_note,''),evidence_url=v_evidence,verified_at=now()
     where id=p_id returning updated_at,quote_revision into v_new,v_revised;
   else
    update public.vmv_marketing_requests set status=v_status,staff_update=nullif(v_note,'')
     where id=p_id returning updated_at,quote_revision into v_new,v_revised;
   end if;
   v_action:='marketing_status';v_summary:='Estado de servicio: '||v_status;
   v_details:=jsonb_build_object('old_status',v_old_status,'new_status',v_status,'quote_revision',v_revised);
   v_visibility:='shared';
   v_kind:=case when v_status='verified' then 'delivered'
    when v_status='needs_customer' then 'information_requested'
    else 'status_changed' end;
  end if;
 elsif p_action='ticket_status' then
  if p_source<>'support' then raise exception 'invalid_source'; end if;
  v_status:=p_data->>'status';
  if v_status not in ('new','in_progress','needs_customer','resolved','closed') then raise exception 'invalid_transition'; end if;
  select updated_at,status into v_old,v_old_status from public.vmv_admin_tickets where id=p_id for update;
  if v_old is null then raise exception 'case_not_found'; end if;
  if nullif(p_expected,'') is null or v_old<>p_expected::timestamptz then raise exception 'conflict'; end if;
  if (v_old_status='closed' and v_status<>'closed')
     or (v_old_status='resolved' and v_status not in ('resolved','closed'))
     or (v_status='closed' and v_old_status not in ('resolved','closed'))
    then raise exception 'invalid_transition'; end if;
  update public.vmv_admin_tickets set
   status=v_status,updated_at=clock_timestamp(),
   closed_at=case when v_status='closed' then now() else null end
   where id=p_id returning updated_at into v_new;
  v_details:=jsonb_build_object('old_status',v_old_status,'new_status',v_status);
  v_action:='ticket_status';v_summary:='Estado de soporte: '||v_status;v_visibility:='shared';
  v_kind:=case when v_status='needs_customer' then 'information_requested' else 'status_changed' end;
 elsif p_action='settings' then
  if v_role<>'admin' then raise exception 'forbidden'; end if;
  v_setting:='support_defaults';
  perform pg_advisory_xact_lock(hashtextextended('settings:'||v_setting,0));
  select updated_at into v_old from public.vmv_admin_settings where key=v_setting for update;
  if (v_old is null and nullif(p_expected,'') is not null)
   or (v_old is not null and (nullif(p_expected,'') is null or v_old<>p_expected::timestamptz))
   then raise exception 'conflict'; end if;
  if (p_data->>'sla_days')::integer not between 1 and 30 or length(coalesce(p_data->>'welcome_message',''))>500
   then raise exception 'invalid_settings'; end if;
  v_value:=jsonb_build_object('sla_days',(p_data->>'sla_days')::integer,
    'welcome_message',coalesce(p_data->>'welcome_message',''));
  insert into public.vmv_admin_settings(key,value,updated_by)
   values(v_setting,v_value,p_actor)
   on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=clock_timestamp()
   returning updated_at into v_new;
  v_action:='settings_updated';v_summary:='Preferencias operativas actualizadas';
  v_details:=jsonb_build_object('key',v_setting,'new_version',v_new);
  p_source:='support';p_id:=p_actor;
 elsif p_action='staff' then
  if v_role<>'admin' then raise exception 'forbidden'; end if;
  v_target:=(p_data->>'user_id')::uuid;
  v_target_role:=p_data->>'role';
  if v_target_role not in ('admin','agent','remove') or v_target is null then raise exception 'invalid_staff'; end if;
  if v_target=p_actor and v_target_role<>'admin' then raise exception 'self_revocation_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vmv_admin_staff_roles',0));
  select updated_at,role into v_old,v_old_status from public.vmv_marketing_staff
    where user_id=v_target for update;
  if (v_old is null and nullif(p_expected,'') is not null)
   or (v_old is not null and (nullif(p_expected,'') is null or v_old<>p_expected::timestamptz))
   then raise exception 'conflict'; end if;
  if v_old_status='admin' and v_target_role<>'admin' then
   if (select count(*) from public.vmv_marketing_staff where role='admin')<=1 then
    raise exception 'last_admin_denied'; end if;
  end if;
  if v_target_role='remove' then
   if v_old is null then raise exception 'staff_not_found'; end if;
   delete from public.vmv_marketing_staff where user_id=v_target;
   v_new:=null;
  else
   if not exists (
    select 1 from auth.users u join public.smartjob_profiles p on p.id=u.id
     where u.id=v_target and u.email_confirmed_at is not null and u.deleted_at is null
   ) then raise exception 'unverified_account'; end if;
   insert into public.vmv_marketing_staff(user_id,role) values(v_target,v_target_role)
    on conflict(user_id) do update set role=excluded.role,updated_at=clock_timestamp()
    returning updated_at into v_new;
  end if;
  v_action:='staff_role';v_summary:='Permiso de operador modificado';
  v_details:=jsonb_build_object('target',v_target,'old_role',v_old_status,'new_role',v_target_role);
  p_source:='support';p_id:=v_target;
 else
  raise exception 'invalid_action';
 end if;

 insert into public.vmv_admin_audit(actor_id,action,source,source_id,detail)
 values(p_actor,v_action,coalesce(p_source,'support'),p_id,v_details);
 if v_action not in ('settings_updated','staff_role') then
  insert into public.vmv_admin_case_history(source,source_id,actor_id,action,summary,visibility,detail)
  values(p_source,p_id,p_actor,v_action,v_summary,v_visibility,v_details);
 end if;
 if v_kind is not null and v_customer is not null and v_customer<>p_actor then
  insert into public.vmv_admin_notifications(recipient_id,actor_id,source,source_id,kind,title)
  values(v_customer,p_actor,p_source,p_id,v_kind,v_summary);
 end if;
 return jsonb_build_object('ok',true,'updated_at',v_new,'action',v_action);
end;
$$;
revoke all on function public.vmv_admin_apply(uuid,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vmv_admin_apply(uuid,text,text,uuid,text,jsonb) to service_role;

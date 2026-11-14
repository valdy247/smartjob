-- Admin closure 04: atomic file metadata + audit/visibility, storage upload stays compensating.
create or replace function public.vmv_admin_register_file(
 p_actor uuid,p_source text,p_id uuid,p_path text,p_filename text,
 p_mime text,p_bytes integer,p_visibility text default 'shared'
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_staff boolean;v_owner uuid;v_id uuid;v_user record;
begin
 if p_actor is null or p_id is null or p_source not in ('support','marketing','provisioning','domain')
  or p_visibility not in ('shared','internal')
  or p_mime not in ('image/jpeg','image/png','image/webp','application/pdf')
  or p_bytes not between 1 and 3145728
  or char_length(p_filename) not between 1 and 150
  or char_length(p_path) not between 20 and 400
  or p_path not like p_source||'/'||p_id::text||'/%'
  then raise exception 'invalid_file'; end if;
 v_staff:=exists(select 1 from public.vmv_marketing_staff where user_id=p_actor);
 if not v_staff and p_visibility<>'shared' then raise exception 'forbidden'; end if;
 case p_source
 when 'support' then select owner_id into v_owner from public.vmv_admin_tickets where id=p_id;
 when 'marketing' then select owner_id into v_owner from public.vmv_marketing_requests where id=p_id;
 when 'provisioning' then select user_id into v_owner from public.smartjob_provisioning_requests where id=p_id;
 when 'domain' then select owner_id into v_owner from public.smartjob_builder_domain_requests where id=p_id;
 end case;
 if v_owner is null or (not v_staff and v_owner<>p_actor) then raise exception 'forbidden'; end if;
 insert into public.vmv_admin_attachments(source,source_id,uploader_id,object_path,filename,content_type,bytes,visibility)
 values(p_source,p_id,p_actor,p_path,p_filename,p_mime,p_bytes,p_visibility)
 returning id into v_id;
 insert into public.vmv_admin_case_history(source,source_id,actor_id,action,summary,visibility,detail)
 values(p_source,p_id,p_actor,'file_uploaded',
 case when p_visibility='internal' then 'Documento interno añadido' else 'Archivo compartido añadido' end,
 p_visibility,jsonb_build_object('file_id',v_id));
 if v_staff then
  insert into public.vmv_admin_audit(actor_id,action,source,source_id,detail)
  values(p_actor,'case_file_uploaded',p_source,p_id,jsonb_build_object('file_id',v_id,'visibility',p_visibility));
 end if;
 if p_visibility='shared' then
  if v_staff and v_owner<>p_actor then
   insert into public.vmv_admin_notifications(recipient_id,actor_id,source,source_id,kind,title)
   values(v_owner,p_actor,p_source,p_id,'status_changed','Nuevo archivo compartido por VMV');
  elsif not v_staff then
   for v_user in select user_id from public.vmv_marketing_staff where user_id<>p_actor loop
    insert into public.vmv_admin_notifications(recipient_id,actor_id,source,source_id,kind,title)
     values(v_user.user_id,p_actor,p_source,p_id,'new_message','Nuevo archivo del cliente');
   end loop;
  end if;
 end if;
 return jsonb_build_object('ok',true,'id',v_id);
end;
$$;
revoke all on function public.vmv_admin_register_file(uuid,text,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.vmv_admin_register_file(uuid,text,uuid,text,text,text,integer,text) to service_role;

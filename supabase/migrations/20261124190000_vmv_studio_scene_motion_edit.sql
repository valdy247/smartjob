-- Allow changing the animation method on an existing approved or pending
-- image. No image is regenerated, no ledger charge is made.
-- Called only by an authenticated owner's Next.js service-role route.
create or replace function public.vmv_studio_set_scene_motion(
 p_owner uuid,p_job uuid,p_index integer,p_motion text
) returns public.vmv_studio_jobs
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
 v_job public.vmv_studio_jobs%rowtype;
 v_scene jsonb;
begin
 if p_owner is null or p_job is null or p_index is null
  or p_motion not in ('zoom','animate') then
  raise exception 'studio_motion_invalid';
 end if;
 select * into v_job from public.vmv_studio_jobs
  where id=p_job and owner_id=p_owner and status='awaiting_image_approval'
  for update;
 if not found then raise exception 'studio_scene_locked';end if;
 if jsonb_typeof(v_job.scenes)<>'array' or p_index<0 or
  p_index>=jsonb_array_length(v_job.scenes) then
  raise exception 'studio_motion_invalid';
 end if;
 v_scene=v_job.scenes->p_index;
 if coalesce(v_scene->>'imagePath','')='' or
  coalesce(v_scene->>'imagePath','') not like
   p_owner::text||'/'||p_job::text||'/%' then
  raise exception 'studio_images_not_ready';
 end if;
 if coalesce(v_scene->>'motion','animate')=p_motion then
  return v_job;
 end if;
 update public.vmv_studio_jobs
  set scenes=jsonb_set(v_job.scenes,array[p_index::text,'motion'],
    to_jsonb(p_motion),true),
   version=version+1,updated_at=now()
  where id=p_job and owner_id=p_owner and status='awaiting_image_approval'
  returning * into v_job;
 return v_job;
end $function$;
revoke all on function public.vmv_studio_set_scene_motion(
 uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.vmv_studio_set_scene_motion(
 uuid,uuid,integer,text) to service_role;

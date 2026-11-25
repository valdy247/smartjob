-- After changing an image or animation mode on a video revision, invalidate
-- ONLY the stale rendered assets for that scene. Otherwise the worker restores
-- the parent clip and shows the old image/movement despite user edits.
-- No new credits are charged for motion-only changes.
CREATE OR REPLACE FUNCTION public.vmv_studio_scene_update(p_owner uuid, p_job uuid, p_action text, p_index integer DEFAULT NULL::integer, p_value text DEFAULT NULL::text, p_regen boolean DEFAULT false)
 RETURNS vmv_studio_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_job public.vmv_studio_jobs%rowtype;v_scene jsonb;v_scenes jsonb;v_n int;v_all boolean;v_path text;
begin
 select * into v_job from public.vmv_studio_jobs
 where id=p_job and owner_id=p_owner for update;
 if not found or v_job.status<>'awaiting_image_approval' then raise exception 'studio_scene_locked';end if;
 v_scenes=v_job.scenes;v_n=jsonb_array_length(v_scenes);
 if p_action='cancel' then
  update public.vmv_studio_jobs set status='cancelled',phase='Cancelado',lease_token=null,
   lease_expires_at=null,version=version+1,updated_at=now() where id=p_job returning * into v_job;
  perform public.vmv_studio_credit_finalize(p_job,false);
  return v_job;
 end if;
 if p_action='approve_all' then
  if exists(select 1 from jsonb_array_elements(v_scenes) x where
    coalesce(x->>'imagePath','')='') then raise exception 'studio_images_not_ready';end if;
  select jsonb_agg(x||'{"approved":true}'::jsonb) into v_scenes
  from jsonb_array_elements(v_scenes) x;
 elsif p_index is not null and p_index>=0 and p_index<v_n then
  v_scene=v_scenes->p_index;
  if p_action='approve' then
   if coalesce(v_scene->>'imagePath','')='' then raise exception 'studio_images_not_ready';end if;
   v_scene=v_scene||'{"approved":true}'::jsonb;
  elsif p_action='edit_scene' and p_value is not null and length(p_value) between 5 and 950 then
   if p_regen then
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text,602233));
    update public.vmv_studio_wallets set balance=balance-1,updated_at=now()
     where owner_id=p_owner and balance-reserved>=1;
    if not found then raise exception 'studio_insufficient_credits';end if;
    insert into public.vmv_studio_credit_ledger(owner_id,job_id,kind,balance_delta,external_ref)
    values(p_owner,p_job,'regenerate',-1,'regen:'||p_job::text||':'||v_job.version::text);
    -- Image descriptions support up to 950 characters; the 230 cap belongs to speech.
    -- Invalidate the frame, preserve all other approved frames.
    v_scene=v_scene||jsonb_build_object('imagePath',null,'approved',false);
   else
    -- Speech edits alone retain their original 230-character limit.
    if length(p_value)>230 then raise exception 'studio_speech_too_long';end if;
    v_scene=v_scene||'{"approved":false}'::jsonb;
   end if;
   -- p_value uses a JSON envelope {"field":"speech"|"imagePrompt","value":"..."}.
   if p_value is null then raise exception 'studio_invalid_edit';end if;
   v_path=case when p_regen then 'imagePrompt' else 'speech' end;
   v_scene=jsonb_set(v_scene,array[v_path],to_jsonb(p_value),true);
  else raise exception 'studio_invalid_action';end if;
  v_scenes=jsonb_set(v_scenes,array[p_index::text],v_scene,false);
 else raise exception 'studio_invalid_action';end if;
 select bool_and((x->>'approved')::boolean is true and coalesce(x->>'imagePath','')<>'')
 into v_all from jsonb_array_elements(v_scenes) x;
 update public.vmv_studio_jobs set scenes=v_scenes,
  -- A regenerated still must never reuse the previously rendered video or
  -- an in-flight animation task for that scene. Preserve every OTHER asset.
  assets=case when p_regen then coalesce(v_job.assets,'{}'::jsonb)
   - ('image_'||p_index)
   - ('clip_turbo_'||p_index) - ('clip_high_'||p_index)
   - ('task_turbo_'||p_index) - ('task_high_'||p_index)
   else v_job.assets end,
  status=case when p_action='approve_all' or v_all then 'queued_animation'
              when p_regen then 'queued_images' else status end,
  phase=case when p_action='approve_all' or v_all then 'Animación en cola'
             when p_regen then 'Regenerando fotograma' else 'Esperando aprobación' end,
  progress=case when p_regen then 12 else progress end,
  version=version+1,updated_at=now() where id=p_job returning * into v_job;
 return v_job;
end $function$
;

CREATE OR REPLACE FUNCTION public.vmv_studio_set_scene_motion(p_owner uuid, p_job uuid, p_index integer, p_motion text)
 RETURNS vmv_studio_jobs
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
   (p_owner::text||'/'||p_job::text||'/%') then
  raise exception 'studio_images_not_ready';
 end if;
 if coalesce(v_scene->>'motion','animate')=p_motion then
  return v_job;
 end if;
 update public.vmv_studio_jobs
  set scenes=jsonb_set(v_job.scenes,array[p_index::text,'motion'],
    to_jsonb(p_motion),true),
   -- Movement changes preserve the original image, but not the old clip.
   assets=coalesce(v_job.assets,'{}'::jsonb)
    - ('clip_turbo_'||p_index) - ('clip_high_'||p_index)
    - ('task_turbo_'||p_index) - ('task_high_'||p_index),
   version=version+1,updated_at=now()
  where id=p_job and owner_id=p_owner and status='awaiting_image_approval'
  returning * into v_job;
 return v_job;
end $function$
;

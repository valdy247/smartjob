-- The Manual Video Editor uses a separate entry point from automatic AI
-- video creation, yet shares the final Render montage pipeline.
-- Images are uploaded and validated privately BEFORE this atomic reservation.
-- Only the authenticated, owner-verifying service role may call this function.
create or replace function public.vmv_studio_create_manual_job(
 p_owner uuid,p_job uuid,p_key uuid,p_title text,
 p_quality text,p_scenes jsonb,p_expected integer
) returns uuid
language plpgsql security invoker
set search_path to 'public','pg_temp'
as $fn$
declare
 v_n integer;v_price integer:=2;v_seconds integer;
 v_old_owner uuid;v_old_key uuid;v_scene jsonb;v_index integer;
 v_available integer;
begin
 if p_owner is null or p_job is null or p_key is null or p_title is null
 or length(trim(p_title)) not between 3 and 140
 or p_quality not in ('turbo','high')
 or p_scenes is null or jsonb_typeof(p_scenes)<>'array' then
  raise exception 'manual_invalid_request';
 end if;
 v_n=jsonb_array_length(p_scenes);
 if v_n<3 or v_n>12 then raise exception 'manual_invalid_request';end if;
 v_seconds=v_n*5;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,602233));
 select owner_id,client_key into v_old_owner,v_old_key from public.vmv_studio_jobs
 where id=p_job;
 if found then
  if v_old_owner=p_owner and v_old_key=p_key then return p_job;end if;
  raise exception 'manual_job_conflict';
 end if;
 for v_index in 0..v_n-1 loop
  v_scene=p_scenes->v_index;
  if jsonb_typeof(v_scene)<>'object'
   or coalesce(v_scene->>'imagePath','')<>
      p_owner::text||'/'||p_job::text||'/image_'||v_index::text||'.jpg'
   or coalesce(v_scene->>'approved','')<>'true'
   or coalesce(v_scene->>'requiresReview','')<>'false'
   or coalesce(v_scene->>'motion','') not in ('animate','zoom','still')
   or length(trim(coalesce(v_scene->>'speech',''))) not between 5 and 230
   or length(trim(coalesce(v_scene->>'imagePrompt',''))) not between 20 and 950
   or length(coalesce(v_scene->>'caption',''))>110
  then raise exception 'manual_invalid_request';end if;
  v_price=v_price+case v_scene->>'motion'
   when 'animate' then (case when p_quality='high' then 13 else 5 end)
   when 'zoom' then 1 else 0 end;
 end loop;
 if p_expected is distinct from v_price then raise exception 'manual_price_changed';end if;
 insert into public.vmv_studio_wallets(owner_id) values(p_owner)
 on conflict(owner_id) do nothing;
 select balance-reserved into v_available from public.vmv_studio_wallets
 where owner_id=p_owner for update;
 if v_available<v_price then raise exception 'studio_insufficient_credits';end if;
 insert into public.vmv_studio_jobs(
  id,owner_id,client_key,title,topic,audience,style,seconds,language,
  voice_provider,voice_id,subtitles,quality_mode,source_platform,
  scenes,assets,charge_credits,status,phase,progress)
 values(
  p_job,p_owner,p_key,trim(p_title),'Montaje con mis imágenes',
  'Público general','illustrated',v_seconds,'es',
  'none','none',false,p_quality,'manual',
  p_scenes,'{"manual_editor":true}'::jsonb,v_price,
  'queued_animation','Preparando el montaje de tus imágenes',30);
 update public.vmv_studio_wallets set reserved=reserved+v_price,updated_at=now()
 where owner_id=p_owner;
 insert into public.vmv_studio_credit_ledger(owner_id,job_id,kind,reserved_delta,external_ref)
 values(p_owner,p_job,'reserve',v_price,'job:'||p_job::text);
 return p_job;
end $fn$;
revoke all on function public.vmv_studio_create_manual_job(
 uuid,uuid,uuid,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.vmv_studio_create_manual_job(
 uuid,uuid,uuid,text,text,jsonb,integer) to service_role;

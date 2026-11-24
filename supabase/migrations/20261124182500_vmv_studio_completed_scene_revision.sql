-- Create a separate revision from a completed video while reserving ONLY the
-- affected scene's image + pro-rata animation. The original MP4 is immutable.
-- Invoked by the authenticated owner-checking Next.js service-role backend.
create or replace function public.vmv_studio_create_scene_revision(
 p_owner uuid,p_source uuid,p_key uuid,p_index integer,p_prompt text,p_motion text
) returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
 v_source public.vmv_studio_jobs%rowtype;
 v_id uuid;
 v_scenes jsonb;
 v_count integer;
 v_price integer;
 v_index integer;
 v_quality text;
 v_path text;
begin
 if p_owner is null or p_source is null or p_key is null or p_index is null
  or p_prompt is null or length(trim(p_prompt)) not between 20 and 950
  or p_motion not in ('zoom','animate') then
  raise exception 'studio_revision_invalid';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,602233));
 select id into v_id from public.vmv_studio_jobs
 where owner_id=p_owner and client_key=p_key;
 if v_id is not null then return v_id; end if;

 select * into v_source from public.vmv_studio_jobs
 where id=p_source and owner_id=p_owner and status='completed' for share;
 if not found or v_source.output_path is null or
  left(v_source.output_path,length(p_owner::text||'/'||p_source::text||'/'))
   <>p_owner::text||'/'||p_source::text||'/' then
  raise exception 'studio_revision_source_invalid';
 end if;
 v_scenes=v_source.scenes;
 if v_scenes is null or jsonb_typeof(v_scenes)<>'array' then
  raise exception 'studio_revision_source_invalid';
 end if;
 v_count=jsonb_array_length(v_scenes);
 if v_count not between 3 and 36 or p_index<0 or p_index>=v_count then
  raise exception 'studio_revision_invalid';
 end if;
 if not exists(select 1 from jsonb_array_elements(v_scenes) x
  where coalesce(x->>'approved','false')='true') then
  raise exception 'studio_revision_source_invalid';
 end if;

 -- All other images and animation clips must be reusable, including for voice
 -- projects whose recorded duration differs from the estimated target.
 for v_index in 0..v_count-1 loop
  if v_index<>p_index then
   v_path=v_scenes->v_index->>'imagePath';
   if v_path is null or
    left(v_path,length(p_owner::text||'/'||p_source::text||'/'))
    <>p_owner::text||'/'||p_source::text||'/' or
    right(v_path,4)<>'.jpg' or
    coalesce(v_source.assets->>('clip_'||v_source.quality_mode||'_'||v_index),'')=''
   then raise exception 'studio_revision_assets_unavailable';end if;
  end if;
 end loop;
 if v_source.voice_provider<>'none' and (
  coalesce(v_source.assets->>'voice_continuous','')='' or
  coalesce(v_source.assets->'voice_timeline','null'::jsonb)='null'::jsonb)
 then raise exception 'studio_revision_assets_unavailable';end if;

 v_quality=v_source.quality_mode;
 v_price=1+greatest(1,ceil(v_source.seconds::numeric/v_count*
    (case when v_quality='high' then 2.5 else 1 end))::integer);
 insert into public.vmv_studio_wallets(owner_id) values(p_owner)
 on conflict(owner_id) do nothing;
 perform 1 from public.vmv_studio_wallets
 where owner_id=p_owner and balance-reserved>=v_price for update;
 if not found then raise exception 'studio_insufficient_credits';end if;

 v_scenes=jsonb_set(v_scenes,array[p_index::text],
  (v_scenes->p_index)||jsonb_build_object(
   'imagePrompt',trim(p_prompt),'motion',p_motion,
   'imagePath',null,'approved',false,'requiresReview',true),false);

 insert into public.vmv_studio_jobs(
  owner_id,client_key,title,topic,audience,style,seconds,language,
  voice_provider,voice_id,subtitles,quality_mode,source_platform,source_url,
  scenes,assets,charge_credits,status,phase,progress)
 values(
  p_owner,p_key,left(v_source.title||' · editado',140),v_source.topic,
  v_source.audience,v_source.style,v_source.seconds,v_source.language,
  v_source.voice_provider,v_source.voice_id,v_source.subtitles,
  v_source.quality_mode,v_source.source_platform,v_source.source_url,
  v_scenes,jsonb_build_object('revision_source_id',p_source::text,
   'revision_scene_index',p_index),v_price,'queued_images',
  'Preparando edición de escena',0)
 returning id into v_id;

 update public.vmv_studio_wallets
 set reserved=reserved+v_price,updated_at=now() where owner_id=p_owner;
 insert into public.vmv_studio_credit_ledger(
  owner_id,job_id,kind,reserved_delta,external_ref)
 values(p_owner,v_id,'reserve',v_price,'job:'||v_id::text);
 return v_id;
end $function$;
revoke all on function public.vmv_studio_create_scene_revision(
 uuid,uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.vmv_studio_create_scene_revision(
 uuid,uuid,uuid,integer,text,text) to service_role;

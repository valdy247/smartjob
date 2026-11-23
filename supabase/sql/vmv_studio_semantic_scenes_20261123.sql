-- VMV Video Studio: scene quantity is driven by the narrative, NOT seconds/5.
-- Safe upgrade: existing jobs remain valid. The total selected duration still
-- determines the credit quote; scene count can range from 3 to 36.
BEGIN;
ALTER TABLE public.vmv_studio_jobs
 DROP CONSTRAINT IF EXISTS vmv_studio_jobs_voice_provider_check;
ALTER TABLE public.vmv_studio_jobs
 ADD CONSTRAINT vmv_studio_jobs_voice_provider_check
 CHECK (voice_provider IN ('openai','elevenlabs','none'));

CREATE OR REPLACE FUNCTION public.vmv_studio_create_job(p_owner uuid, p_key uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid;v_seconds int;v_price int;v_available int;v_style text;v_quality text;v_scenes jsonb;
begin
 if p_owner is null or p_key is null or p_payload is null then raise exception 'studio_invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,602233));
 select id into v_id from public.vmv_studio_jobs where owner_id=p_owner and client_key=p_key;
 if v_id is not null then return v_id;end if;
 v_seconds=(p_payload->>'seconds')::integer;
 v_quality=p_payload->>'quality_mode';v_style=p_payload->>'style';v_scenes=p_payload->'scenes';
 if v_seconds is null or v_seconds<15 or v_seconds>180 or v_seconds%5<>0 or
  v_quality not in ('turbo','high') or
  v_style not in ('stickman','cartoon2d','cartoon3d','clay','illustrated') or
  v_scenes is null or jsonb_typeof(v_scenes)<>'array' or
  (jsonb_array_length(v_scenes)<3 or jsonb_array_length(v_scenes)>36) then raise exception 'studio_invalid_request';end if;
 v_price=case when v_quality='high' then (v_seconds*25+9)/10 else v_seconds end;
 insert into public.vmv_studio_wallets(owner_id) values(p_owner) on conflict(owner_id) do nothing;
 select balance-reserved into v_available from public.vmv_studio_wallets where owner_id=p_owner for update;
 if v_available<v_price then raise exception 'studio_insufficient_credits';end if;
 insert into public.vmv_studio_jobs(
  owner_id,client_key,title,topic,audience,style,seconds,language,voice_provider,
  voice_id,subtitles,quality_mode,source_platform,source_url,scenes,charge_credits)
 values(
  p_owner,p_key,left(p_payload->>'title',140),left(p_payload->>'topic',220),
  left(p_payload->>'audience',140),v_style,v_seconds,p_payload->>'language',
  p_payload->>'voice_provider',p_payload->>'voice_id',
  coalesce((p_payload->>'subtitles')::boolean,true),v_quality,
  left(coalesce(p_payload->>'source_platform','idea'),20),left(p_payload->>'source_url',1000),
  v_scenes,v_price) returning id into v_id;
 update public.vmv_studio_wallets set reserved=reserved+v_price,updated_at=now() where owner_id=p_owner;
 insert into public.vmv_studio_credit_ledger(owner_id,job_id,kind,reserved_delta,external_ref)
 values(p_owner,v_id,'reserve',v_price,'job:'||v_id::text);
 return v_id;
end $function$

-- Preserve the existing service-only RPC permission boundary.
REVOKE ALL ON FUNCTION public.vmv_studio_create_job(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_studio_create_job(uuid,uuid,jsonb) TO service_role;
COMMIT;

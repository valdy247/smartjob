-- Repair rounding for 15-second high quality (15*2.5 = 38 credits, not 37).
create or replace function public.vmv_studio_create_job(
 p_owner uuid,p_key uuid,p_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
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
  jsonb_array_length(v_scenes)<>v_seconds/5 then raise exception 'studio_invalid_request';end if;
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
end $$;
revoke all on function public.vmv_studio_create_job(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vmv_studio_create_job(uuid,uuid,jsonb) to service_role;

-- Finalize payment and video outcome atomically; no double-charge on retries.
create or replace function public.vmv_studio_finish(
 p_id uuid,p_token uuid,p_success boolean,p_output text default null,p_failure text default null
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.vmv_studio_jobs%rowtype;
begin
 select * into v_job from public.vmv_studio_jobs where id=p_id for update;
 if not found or v_job.lease_token is distinct from p_token then return false;end if;
 if v_job.status in ('completed','failed','cancelled') then return v_job.credits_settled;end if;
 if p_success and (p_output is null or left(p_output,length(v_job.owner_id::text||'/'||v_job.id::text||'/'))<>
   v_job.owner_id::text||'/'||v_job.id::text||'/')
 then raise exception 'studio_invalid_output';end if;
 update public.vmv_studio_jobs set status=case when p_success then 'completed' else 'failed' end,
   phase=case when p_success then 'Listo' else 'Error de procesamiento' end,
   progress=case when p_success then 100 else progress end,
   output_path=case when p_success then p_output else output_path end,
   failure_code=case when p_success then null else left(coalesce(p_failure,'studio_generation_failed'),100) end,
   lease_expires_at=null,finished_at=now(),updated_at=now()
 where id=p_id;
 return public.vmv_studio_credit_finalize(p_id,p_success);
end $$;
revoke all on function public.vmv_studio_finish(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.vmv_studio_finish(uuid,uuid,boolean,text,text) to service_role;

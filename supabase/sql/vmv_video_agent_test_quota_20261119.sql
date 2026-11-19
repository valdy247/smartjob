-- Preview-only video testing: the server can call these through service_role
-- exclusively for the whitelisted VMV_VIDEO_ALLOWED_OWNER_ID and only in Vercel Preview.
-- One active video at a time, 50 generations/24 h and 50 shared images/day remain.
-- Regular Web Studio users keep their existing two-image limit.
create or replace function public.smartjob_web_ai_claim_video_test_slot(p_owner uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare claimed integer;
begin
 if p_owner is null then return false;end if;
 insert into public.smartjob_web_ai_usage(owner_id,usage_day,calls)
 values(p_owner,(now() at time zone 'utc')::date,1)
 on conflict(owner_id,usage_day)
 do update set calls=public.smartjob_web_ai_usage.calls+1,updated_at=now()
 where public.smartjob_web_ai_usage.calls<50
 returning calls into claimed;
 return claimed is not null;
end $$;
revoke all on function public.smartjob_web_ai_claim_video_test_slot(uuid) from public,anon,authenticated;
grant execute on function public.smartjob_web_ai_claim_video_test_slot(uuid) to service_role;

create or replace function public.vmv_video_reserve_pilot_job(
 p_owner uuid,p_key uuid,p_prompt text,p_mode text,p_model text,p_ratio text,
 p_duration integer,p_pilot uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing_id uuid;created_id uuid;num integer;
begin
 if p_owner is null or p_key is null then raise exception 'Invalid pilot owner';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,53201));
 select id into existing_id from public.vmv_video_jobs
 where owner_id=p_owner and client_key=p_key;
 if existing_id is not null then
  return jsonb_build_object('id',existing_id,'reused',true);
 end if;
 update public.vmv_video_jobs set status='FAILED',failure_code='task_timeout',updated_at=now()
 where owner_id=p_owner and status in ('starting','PENDING','THROTTLED','RUNNING')
  and created_at<now()-interval '3 hours';
 select count(*) into num from public.vmv_video_jobs
  where owner_id=p_owner and created_at>now()-interval '24 hours';
 if num>=50 then raise exception 'video_daily_limit';end if;
 select count(*) into num from public.vmv_video_jobs
  where owner_id=p_owner and status in ('starting','PENDING','THROTTLED','RUNNING');
 if num>=1 then raise exception 'video_active_job_limit';end if;
 if p_pilot is not null and not exists(select 1 from public.vmv_video_pilots
  where id=p_pilot and owner_id=p_owner) then raise exception 'video_pilot_not_found';end if;
 insert into public.vmv_video_jobs(owner_id,client_key,pilot_id,prompt,mode,model,ratio,duration)
 values(p_owner,p_key,p_pilot,p_prompt,p_mode,p_model,p_ratio,p_duration)
 returning id into created_id;
 return jsonb_build_object('id',created_id,'reused',false);
end $$;
revoke all on function public.vmv_video_reserve_pilot_job(uuid,uuid,text,text,text,text,integer,uuid)
 from public,anon,authenticated;
grant execute on function public.vmv_video_reserve_pilot_job(uuid,uuid,text,text,text,text,integer,uuid)
 to service_role;
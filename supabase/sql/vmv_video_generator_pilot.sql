-- VMV Video Generator preview — applied to Supabase wrnlhjujsbigculndivs on 2026-11-18.
-- Customer-owned jobs. Server-only writes, RLS for authenticated reads and atomic quota.
CREATE TABLE IF NOT EXISTS public.vmv_video_pilots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 niche text NOT NULL CHECK(length(niche) BETWEEN 3 AND 160),
 audience text NOT NULL DEFAULT '' CHECK(length(audience)<=180),
 goal text NOT NULL DEFAULT '' CHECK(length(goal)<=180),
 style text NOT NULL DEFAULT 'realistic' CHECK(style IN ('realistic','cinematic','animated','product')),
 frequency integer NOT NULL DEFAULT 3 CHECK(frequency IN (1,3,5,7)),
 status text NOT NULL DEFAULT 'paused' CHECK(status IN ('paused','active')),
 next_run_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vmv_video_pilots_owner_idx ON public.vmv_video_pilots(owner_id,created_at DESC);
ALTER TABLE public.vmv_video_pilots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_video_pilots FROM anon,authenticated;
GRANT SELECT ON public.vmv_video_pilots TO authenticated;
DROP POLICY IF EXISTS vmv_video_pilots_own ON public.vmv_video_pilots;
CREATE POLICY vmv_video_pilots_own ON public.vmv_video_pilots FOR SELECT TO authenticated
 USING(owner_id=(SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.vmv_video_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 pilot_id uuid REFERENCES public.vmv_video_pilots(id) ON DELETE SET NULL,
 client_key uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN ('text','image')),
 model text NOT NULL CHECK(model IN ('gen4.5','kling')),
 ratio text NOT NULL CHECK(ratio IN ('1280:720','720:1280')),
 duration integer NOT NULL CHECK(duration IN (5,10)),
 prompt text NOT NULL CHECK(length(prompt) BETWEEN 3 AND 1000),
 status text NOT NULL DEFAULT 'starting' CHECK(status IN ('starting','PENDING','THROTTLED','RUNNING','SUCCEEDED','FAILED','CANCELED')),
 provider_task_id text,
 output_url text,
 failure_code text,
 caption text CHECK(length(caption)<=500),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,client_key)
);
CREATE INDEX IF NOT EXISTS vmv_video_jobs_owner_idx ON public.vmv_video_jobs(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS vmv_video_jobs_pilot_idx ON public.vmv_video_jobs(pilot_id,created_at DESC);
ALTER TABLE public.vmv_video_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_video_jobs FROM anon,authenticated;
GRANT SELECT ON public.vmv_video_jobs TO authenticated;
DROP POLICY IF EXISTS vmv_video_jobs_own ON public.vmv_video_jobs;
CREATE POLICY vmv_video_jobs_own ON public.vmv_video_jobs FOR SELECT TO authenticated
 USING(owner_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.vmv_video_reserve_job(
 p_owner uuid,p_key uuid,p_prompt text,p_mode text,p_model text,
 p_ratio text,p_duration integer,p_pilot uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing_id uuid; created_id uuid; num integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,53201));
 SELECT id INTO existing_id FROM public.vmv_video_jobs WHERE owner_id=p_owner AND client_key=p_key;
 IF existing_id IS NOT NULL THEN RETURN jsonb_build_object('id',existing_id,'reused',true); END IF;
 UPDATE public.vmv_video_jobs SET status='FAILED',failure_code='task_timeout',updated_at=now()
  WHERE owner_id=p_owner AND status IN ('starting','PENDING','THROTTLED','RUNNING')
   AND created_at < now()-interval '3 hours';
 SELECT count(*) INTO num FROM public.vmv_video_jobs
  WHERE owner_id=p_owner AND created_at>now()-interval '24 hours';
 IF num>=3 THEN RAISE EXCEPTION 'video_daily_limit'; END IF;
 SELECT count(*) INTO num FROM public.vmv_video_jobs WHERE owner_id=p_owner
  AND status IN ('starting','PENDING','THROTTLED','RUNNING');
 IF num>=1 THEN RAISE EXCEPTION 'video_active_job_limit'; END IF;
 IF p_pilot IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.vmv_video_pilots WHERE id=p_pilot AND owner_id=p_owner)
 THEN RAISE EXCEPTION 'video_pilot_not_found'; END IF;
 INSERT INTO public.vmv_video_jobs(owner_id,client_key,pilot_id,prompt,mode,model,ratio,duration)
 VALUES(p_owner,p_key,p_pilot,p_prompt,p_mode,p_model,p_ratio,p_duration)
 RETURNING id INTO created_id;
 RETURN jsonb_build_object('id',created_id,'reused',false);
END $$;
REVOKE ALL ON FUNCTION public.vmv_video_reserve_job(uuid,uuid,text,text,text,text,integer,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_video_reserve_job(uuid,uuid,text,text,text,text,integer,uuid)
 TO service_role;
COMMENT ON TABLE public.vmv_video_jobs IS
 'Preview only: 3 user-paid calls per day, 1 active generation. Files may expire; autopublishing is disabled.';

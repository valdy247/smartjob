-- VMV Pilot: durable, owner-scoped video renders. Preview-gated by API.
CREATE TABLE IF NOT EXISTS public.vmv_pilot_render_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 pilot_id uuid NOT NULL REFERENCES public.vmv_video_pilots(id) ON DELETE CASCADE,
 client_key uuid NOT NULL,
 topic text NOT NULL CHECK(length(topic) BETWEEN 3 AND 220),
 audience text NOT NULL DEFAULT '',
 goal text NOT NULL DEFAULT '',
 style text NOT NULL CHECK(style IN ('stickman','realistic','cinematic','animated','product')),
 seconds integer NOT NULL CHECK(seconds IN (15,30,60)),
 narration boolean NOT NULL DEFAULT true,
 subtitles boolean NOT NULL DEFAULT true,
 language text NOT NULL DEFAULT 'es' CHECK(language IN ('es','en')),
 credit_approved boolean NOT NULL DEFAULT false CHECK(credit_approved=true),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','planning','working','assembling','completed','failed')),
 progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
 phase text NOT NULL DEFAULT 'queued',
 title text NOT NULL DEFAULT '',
 scenes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(scenes)='array' AND jsonb_array_length(scenes)<=12),
 assets jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(assets)='object'),
 output_path text,
 failure_code text,
 lease_token uuid,
 lease_expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 UNIQUE(owner_id,client_key)
);
CREATE INDEX IF NOT EXISTS vmv_pilot_render_queue_idx ON public.vmv_pilot_render_jobs(status,lease_expires_at,created_at);
CREATE INDEX IF NOT EXISTS vmv_pilot_render_owner_idx ON public.vmv_pilot_render_jobs(owner_id,created_at DESC);
ALTER TABLE public.vmv_pilot_render_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_pilot_render_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vmv_pilot_render_jobs TO authenticated;
DROP POLICY IF EXISTS vmv_pilot_render_own_read ON public.vmv_pilot_render_jobs;
CREATE POLICY vmv_pilot_render_own_read ON public.vmv_pilot_render_jobs FOR SELECT TO authenticated
 USING(owner_id=(select auth.uid()));

-- Atomic one-active-job and one job per 24h safeguards. Internal service role ONLY.
CREATE OR REPLACE FUNCTION public.vmv_pilot_render_enqueue(
 p_owner uuid,p_pilot uuid,p_key uuid,p_topic text,p_audience text,p_goal text,
 p_style text,p_seconds integer,p_narration boolean,p_subtitles boolean,p_language text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_count integer;v_pilot_style text;
BEGIN
 IF p_owner IS NULL OR p_pilot IS NULL OR p_key IS NULL OR
    p_topic IS NULL OR length(p_topic) NOT BETWEEN 3 AND 220 OR
    p_style NOT IN ('stickman','realistic','cinematic','animated','product') OR
    p_seconds NOT IN (15,30,60) OR p_language NOT IN ('es','en')
 THEN RAISE EXCEPTION 'pilot_render_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,43210));
 SELECT id INTO v_id FROM public.vmv_pilot_render_jobs
  WHERE owner_id=p_owner AND client_key=p_key;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 SELECT style INTO v_pilot_style FROM public.vmv_video_pilots
  WHERE id=p_pilot AND owner_id=p_owner;
 IF v_pilot_style IS NULL OR v_pilot_style<>p_style
 THEN RAISE EXCEPTION 'pilot_render_owner_or_style'; END IF;
 SELECT count(*) INTO v_count FROM public.vmv_pilot_render_jobs
  WHERE owner_id=p_owner AND status IN ('queued','planning','working','assembling');
 IF v_count>0 THEN RAISE EXCEPTION 'pilot_render_active_limit'; END IF;
 SELECT count(*) INTO v_count FROM public.vmv_pilot_render_jobs
  WHERE owner_id=p_owner AND created_at>now()-interval '24 hours';
 IF v_count>=1 THEN RAISE EXCEPTION 'pilot_render_daily_limit'; END IF;
 INSERT INTO public.vmv_pilot_render_jobs
  (owner_id,pilot_id,client_key,topic,audience,goal,style,seconds,narration,subtitles,language,credit_approved)
 VALUES(p_owner,p_pilot,p_key,p_topic,left(coalesce(p_audience,''),180),
        left(coalesce(p_goal,''),180),p_style,p_seconds,p_narration,p_subtitles,p_language,true)
 RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.vmv_pilot_render_enqueue(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_pilot_render_enqueue(uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean,text) TO service_role;

CREATE OR REPLACE FUNCTION public.vmv_pilot_render_claim(p_token uuid)
RETURNS SETOF public.vmv_pilot_render_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_token IS NULL THEN RETURN; END IF;
 SELECT id INTO v_id FROM public.vmv_pilot_render_jobs
 WHERE status IN ('queued','planning','working','assembling')
   AND (lease_expires_at IS NULL OR lease_expires_at<now())
 ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF v_id IS NULL THEN RETURN; END IF;
 RETURN QUERY UPDATE public.vmv_pilot_render_jobs
  SET lease_token=p_token,lease_expires_at=now()+interval '15 minutes',
      updated_at=now()
  WHERE id=v_id RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.vmv_pilot_render_claim(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_pilot_render_claim(uuid) TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('vmv-pilot-renders','vmv-pilot-renders',false,104857600,ARRAY['video/mp4'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=104857600,
allowed_mime_types=ARRAY['video/mp4'];
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('vmv-pilot-working','vmv-pilot-working',false,52428800,
 ARRAY['video/mp4','image/png','image/jpeg','image/webp','audio/mpeg','audio/mp3'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=52428800,
allowed_mime_types=ARRAY['video/mp4','image/png','image/jpeg','image/webp','audio/mpeg','audio/mp3'];
-- Working assets have no authenticated policies; only trusted service role can access them.
COMMENT ON TABLE public.vmv_pilot_render_jobs IS
 'Private durable pilot renders; queued only after explicit user credit consent. One owner render per rolling 24h. Worker-only mutable state; final MP4 served through short-lived signed URL.';

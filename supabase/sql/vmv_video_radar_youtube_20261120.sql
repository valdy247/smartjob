-- VMV Video Generator / Radar Viral: secure public-metadata research snapshots.
-- Preview owner-only; no automated video generation, social posts, or provider payments.
CREATE TABLE IF NOT EXISTS public.vmv_video_radar_scans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 source text NOT NULL DEFAULT 'youtube' CHECK(source IN ('youtube')),
 query text NOT NULL CHECK(length(query) BETWEEN 3 AND 90),
 days integer NOT NULL CHECK(days IN (7,30,90)),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed')),
 results jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK(jsonb_typeof(results)='array' AND jsonb_array_length(results)<=12),
 ideas jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK(jsonb_typeof(ideas)='array' AND jsonb_array_length(ideas)<=5),
 failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vmv_video_radar_owner_idx
 ON public.vmv_video_radar_scans(owner_id,created_at DESC);
ALTER TABLE public.vmv_video_radar_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_video_radar_scans FROM public,anon,authenticated;
GRANT SELECT ON public.vmv_video_radar_scans TO authenticated;
DROP POLICY IF EXISTS vmv_video_radar_owner_select ON public.vmv_video_radar_scans;
CREATE POLICY vmv_video_radar_owner_select ON public.vmv_video_radar_scans
 FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));

-- Cache matching searches for six hours, prevent parallel provider requests
-- for the same owner, and limit fresh searches to six per owner per rolling day.
CREATE OR REPLACE FUNCTION public.vmv_video_radar_claim(
 p_owner uuid,p_query text,p_days integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing record; created uuid; used integer;
BEGIN
 IF p_owner IS NULL OR
  NOT EXISTS(SELECT 1 FROM public.smartjob_profiles WHERE id=p_owner) OR
  length(p_query) NOT BETWEEN 3 AND 90 OR p_days NOT IN (7,30,90)
 THEN RAISE EXCEPTION 'invalid_radar_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,53831));
 SELECT id,status INTO existing FROM public.vmv_video_radar_scans
  WHERE owner_id=p_owner AND source='youtube' AND query=lower(btrim(p_query))
    AND days=p_days AND
    ((status='ready' AND created_at>now()-interval '6 hours') OR
     (status='pending' AND created_at>now()-interval '90 seconds'))
  ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN
  RETURN jsonb_build_object('id',existing.id,'status',existing.status,'reused',true);
 END IF;
 SELECT count(*) INTO used FROM public.vmv_video_radar_scans
  WHERE owner_id=p_owner AND created_at>now()-interval '24 hours';
 IF used>=6 THEN RAISE EXCEPTION 'radar_daily_limit'; END IF;
 INSERT INTO public.vmv_video_radar_scans(owner_id,query,days)
  VALUES(p_owner,lower(btrim(p_query)),p_days)
  RETURNING id INTO created;
 RETURN jsonb_build_object('id',created,'status','pending','reused',false);
END $$;
REVOKE ALL ON FUNCTION public.vmv_video_radar_claim(uuid,text,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_video_radar_claim(uuid,text,integer) TO service_role;
COMMENT ON TABLE public.vmv_video_radar_scans IS
 'Private search snapshots from official YouTube Data API. Scores are metadata heuristics, not retention or live virality measurements.';

-- Owner-approved creative inspiration references; never auto-produce or auto-publish.
ALTER TABLE public.vmv_video_pilots
 ADD COLUMN IF NOT EXISTS creative_seed text NOT NULL DEFAULT ''
  CHECK(length(creative_seed)<=450),
 ADD COLUMN IF NOT EXISTS research_video_id text NOT NULL DEFAULT ''
  CHECK(research_video_id='' OR research_video_id ~ '^[a-zA-Z0-9_-]{11}$'),
 ADD COLUMN IF NOT EXISTS research_scan_id uuid
  REFERENCES public.vmv_video_radar_scans(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.vmv_video_pilots.creative_seed IS
 'Owner-selected original creative brief derived from explicitly linked public sources, not copied video material.';

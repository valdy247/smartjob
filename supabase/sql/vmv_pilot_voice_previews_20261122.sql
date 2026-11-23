-- Owner-only, server-side quota for on-demand (not autoplayed) voice samples.
CREATE TABLE IF NOT EXISTS public.vmv_pilot_voice_preview_usage(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 language text NOT NULL CHECK (language IN ('es','en','pt','fr','de','it')),
 provider text NOT NULL CHECK (provider IN ('openai','elevenlabs')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vmv_pilot_voice_preview_usage_owner_idx
 ON public.vmv_pilot_voice_preview_usage(owner_id,created_at DESC);
ALTER TABLE public.vmv_pilot_voice_preview_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_pilot_voice_preview_usage FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.vmv_pilot_voice_preview_claim(
 p_owner uuid,p_language text,p_provider text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF p_owner IS NULL OR p_language NOT IN ('es','en','pt','fr','de','it')
    OR p_provider NOT IN ('openai','elevenlabs')
    OR NOT EXISTS(SELECT 1 FROM public.smartjob_profiles WHERE id=p_owner) THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,91032));
 SELECT count(*) INTO n FROM public.vmv_pilot_voice_preview_usage
 WHERE owner_id=p_owner AND created_at>now()-interval '24 hours';
 IF n>=12 THEN RETURN false; END IF;
 INSERT INTO public.vmv_pilot_voice_preview_usage(owner_id,language,provider)
 VALUES(p_owner,p_language,p_provider);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.vmv_pilot_voice_preview_claim(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_pilot_voice_preview_claim(uuid,text,text) TO service_role;

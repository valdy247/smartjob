-- VMV Pilot: persist user-selected language + narrator and enforce exact video language.
ALTER TABLE public.vmv_video_pilots
 ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'es',
 ADD COLUMN IF NOT EXISTS voice_provider text NOT NULL DEFAULT 'openai',
 ADD COLUMN IF NOT EXISTS voice_id text NOT NULL DEFAULT 'alloy',
 ADD COLUMN IF NOT EXISTS subtitles boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS seconds integer NOT NULL DEFAULT 60;
ALTER TABLE public.vmv_video_pilots DROP CONSTRAINT IF EXISTS vmv_video_pilots_language_check;
ALTER TABLE public.vmv_video_pilots ADD CONSTRAINT vmv_video_pilots_language_check
 CHECK(language IN ('es','en','pt','fr','de','it'));
ALTER TABLE public.vmv_video_pilots DROP CONSTRAINT IF EXISTS vmv_video_pilots_voice_provider_check;
ALTER TABLE public.vmv_video_pilots ADD CONSTRAINT vmv_video_pilots_voice_provider_check
 CHECK(voice_provider IN ('openai','elevenlabs','none'));
ALTER TABLE public.vmv_video_pilots DROP CONSTRAINT IF EXISTS vmv_video_pilots_seconds_check;
ALTER TABLE public.vmv_video_pilots ADD CONSTRAINT vmv_video_pilots_seconds_check CHECK(seconds IN (15,30,60));

ALTER TABLE public.vmv_video_radar_scans
 ADD COLUMN IF NOT EXISTS ideas_language text NOT NULL DEFAULT 'es';
ALTER TABLE public.vmv_video_radar_scans DROP CONSTRAINT IF EXISTS vmv_video_radar_scans_ideas_language_check;
ALTER TABLE public.vmv_video_radar_scans ADD CONSTRAINT vmv_video_radar_scans_ideas_language_check
 CHECK(ideas_language IN ('es','en','pt','fr','de','it'));

ALTER TABLE public.vmv_pilot_render_jobs
 ADD COLUMN IF NOT EXISTS voice_provider text NOT NULL DEFAULT 'openai',
 ADD COLUMN IF NOT EXISTS voice_id text NOT NULL DEFAULT 'alloy';
ALTER TABLE public.vmv_pilot_render_jobs DROP CONSTRAINT IF EXISTS vmv_pilot_render_jobs_language_check;
ALTER TABLE public.vmv_pilot_render_jobs ADD CONSTRAINT vmv_pilot_render_jobs_language_check
 CHECK(language IN ('es','en','pt','fr','de','it'));
ALTER TABLE public.vmv_pilot_render_jobs DROP CONSTRAINT IF EXISTS vmv_pilot_render_jobs_voice_provider_check;
ALTER TABLE public.vmv_pilot_render_jobs ADD CONSTRAINT vmv_pilot_render_jobs_voice_provider_check
 CHECK(voice_provider IN ('openai','elevenlabs','none'));
ALTER TABLE public.vmv_pilot_render_jobs DROP CONSTRAINT IF EXISTS vmv_pilot_render_jobs_voice_id_check;
ALTER TABLE public.vmv_pilot_render_jobs ADD CONSTRAINT vmv_pilot_render_jobs_voice_id_check
 CHECK((voice_provider='none' AND voice_id='none' AND narration=false)
 OR (voice_provider='openai' AND voice_id IN ('alloy','nova','echo') AND narration=true)
 OR (voice_provider='elevenlabs' AND voice_id ~ '^[A-Za-z0-9]{15,32}$' AND narration=true));

CREATE OR REPLACE FUNCTION public.vmv_pilot_render_enqueue(
 p_owner uuid,p_pilot uuid,p_key uuid,p_topic text,p_audience text,p_goal text,
 p_style text,p_seconds integer,p_narration boolean,p_subtitles boolean,p_language text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_count integer;v_pilot_style text;
BEGIN
 IF p_owner IS NULL OR p_pilot IS NULL OR p_key IS NULL OR
    p_topic IS NULL OR length(p_topic) NOT BETWEEN 3 AND 220 OR
    p_style NOT IN ('stickman','realistic','cinematic','animated','product') OR
    p_seconds NOT IN (15,30,60) OR p_language NOT IN ('es','en','pt','fr','de','it')
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

CREATE OR REPLACE FUNCTION public.vmv_pilot_render_enqueue_v2(
 p_owner uuid,p_pilot uuid,p_key uuid,p_topic text,p_audience text,p_goal text,
 p_style text,p_seconds integer,p_narration boolean,p_subtitles boolean,p_language text,
 p_voice_provider text,p_voice_id text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF (p_voice_provider='none' AND p_voice_id='none' AND p_narration=false)
    OR (p_voice_provider='openai' AND p_voice_id IN ('alloy','nova','echo') AND p_narration=true)
    OR (p_voice_provider='elevenlabs' AND p_voice_id ~ '^[A-Za-z0-9]{15,32}$' AND p_narration=true)
 THEN NULL; ELSE RAISE EXCEPTION 'pilot_voice_invalid'; END IF;
 v_id:=public.vmv_pilot_render_enqueue(p_owner,p_pilot,p_key,p_topic,p_audience,p_goal,
     p_style,p_seconds,p_narration,p_subtitles,p_language);
 UPDATE public.vmv_pilot_render_jobs SET voice_provider=p_voice_provider,voice_id=p_voice_id
 WHERE id=v_id AND owner_id=p_owner;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.vmv_pilot_render_enqueue_v2(
 uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_pilot_render_enqueue_v2(
 uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean,text,text,text) TO service_role;

-- VMV Pilot: one paid job may create 1 or 2 quality variants using the SAME
-- storyboard, images, narration and subtitle timeline (no second AI prep bill).
ALTER TABLE public.vmv_video_pilots
 ADD COLUMN IF NOT EXISTS quality_mode text NOT NULL DEFAULT 'high';
ALTER TABLE public.vmv_video_pilots DROP CONSTRAINT IF EXISTS vmv_video_pilots_quality_mode_check;
ALTER TABLE public.vmv_video_pilots ADD CONSTRAINT vmv_video_pilots_quality_mode_check
 CHECK(quality_mode IN ('turbo','high','compare'));

ALTER TABLE public.vmv_pilot_render_jobs
 ADD COLUMN IF NOT EXISTS quality_mode text NOT NULL DEFAULT 'high',
 ADD COLUMN IF NOT EXISTS outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS preferred_model text;
ALTER TABLE public.vmv_pilot_render_jobs DROP CONSTRAINT IF EXISTS vmv_pilot_render_jobs_quality_mode_check;
ALTER TABLE public.vmv_pilot_render_jobs ADD CONSTRAINT vmv_pilot_render_jobs_quality_mode_check
 CHECK(quality_mode IN ('turbo','high','compare'));
ALTER TABLE public.vmv_pilot_render_jobs DROP CONSTRAINT IF EXISTS vmv_pilot_render_jobs_outputs_check;
ALTER TABLE public.vmv_pilot_render_jobs ADD CONSTRAINT vmv_pilot_render_jobs_outputs_check
 CHECK(jsonb_typeof(outputs)='object' AND
       (outputs - 'turbo' - 'high')='{}'::jsonb);
ALTER TABLE public.vmv_pilot_render_jobs DROP CONSTRAINT IF EXISTS vmv_pilot_render_jobs_preferred_model_check;
ALTER TABLE public.vmv_pilot_render_jobs ADD CONSTRAINT vmv_pilot_render_jobs_preferred_model_check
 CHECK(preferred_model IS NULL OR preferred_model IN ('turbo','high'));

-- Enqueue a comparison as ONE quota-limited job, not two separately chargeable jobs.
CREATE OR REPLACE FUNCTION public.vmv_pilot_render_enqueue_v3(
 p_owner uuid,p_pilot uuid,p_key uuid,p_topic text,p_audience text,p_goal text,
 p_style text,p_seconds integer,p_narration boolean,p_subtitles boolean,p_language text,
 p_voice_provider text,p_voice_id text,p_quality_mode text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_count integer;v_style text;v_lang text;v_provider text;
 v_voice text;v_seconds integer;v_quality text;
BEGIN
 IF p_owner IS NULL OR p_pilot IS NULL OR p_key IS NULL OR
    p_topic IS NULL OR length(p_topic) NOT BETWEEN 3 AND 220 OR
    p_style NOT IN ('stickman','realistic','cinematic','animated','product') OR
    p_seconds NOT IN (15,30,60) OR p_language NOT IN ('es','en','pt','fr','de','it') OR
    p_quality_mode NOT IN ('turbo','high','compare') OR
    NOT ((p_voice_provider='none' AND p_voice_id='none' AND p_narration=false)
      OR (p_voice_provider='openai' AND p_voice_id IN ('alloy','nova','echo') AND p_narration=true)
      OR (p_voice_provider='elevenlabs' AND p_voice_id ~ '^[A-Za-z0-9]{15,32}$' AND p_narration=true))
 THEN RAISE EXCEPTION 'pilot_render_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,43210));
 SELECT id INTO v_id FROM public.vmv_pilot_render_jobs
 WHERE owner_id=p_owner AND client_key=p_key;
 IF v_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.vmv_pilot_render_jobs
    WHERE id=v_id AND quality_mode=p_quality_mode AND style=p_style AND seconds=p_seconds
      AND language=p_language AND voice_provider=p_voice_provider AND voice_id=p_voice_id)
  THEN RAISE EXCEPTION 'pilot_render_key_conflict'; END IF;
  RETURN v_id;
 END IF;
 SELECT style,language,voice_provider,voice_id,seconds,quality_mode
 INTO v_style,v_lang,v_provider,v_voice,v_seconds,v_quality
 FROM public.vmv_video_pilots WHERE id=p_pilot AND owner_id=p_owner;
 IF v_style IS NULL OR v_style<>p_style OR v_lang<>p_language OR
    v_provider<>p_voice_provider OR v_voice<>p_voice_id OR
    v_seconds<>p_seconds OR v_quality<>p_quality_mode
 THEN RAISE EXCEPTION 'pilot_render_owner_or_settings'; END IF;
 SELECT count(*) INTO v_count FROM public.vmv_pilot_render_jobs
 WHERE owner_id=p_owner AND status IN ('queued','planning','working','assembling');
 IF v_count>0 THEN RAISE EXCEPTION 'pilot_render_active_limit'; END IF;
 SELECT count(*) INTO v_count FROM public.vmv_pilot_render_jobs
 WHERE owner_id=p_owner AND created_at>now()-interval '24 hours';
 IF v_count>=1 THEN RAISE EXCEPTION 'pilot_render_daily_limit'; END IF;
 INSERT INTO public.vmv_pilot_render_jobs
 (owner_id,pilot_id,client_key,topic,audience,goal,style,seconds,narration,subtitles,
  language,credit_approved,voice_provider,voice_id,quality_mode)
 VALUES(p_owner,p_pilot,p_key,p_topic,left(coalesce(p_audience,''),180),
   left(coalesce(p_goal,''),180),p_style,p_seconds,p_narration,p_subtitles,p_language,
   true,p_voice_provider,p_voice_id,p_quality_mode)
 RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.vmv_pilot_render_enqueue_v3(
 uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_pilot_render_enqueue_v3(
 uuid,uuid,uuid,text,text,text,text,integer,boolean,boolean,text,text,text,text)
 TO service_role;

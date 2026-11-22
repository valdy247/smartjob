-- Applied to preview Supabase via managed migration vmv_radar_owner_preview_quota_20.
-- Preserve owner validation, owner-specific transaction lock, six-hour cache and restricted execute.
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
  WHERE owner_id=p_owner AND created_at>now()-interval '24 hours'
    AND status IN ('ready','pending');
 IF used>=20 THEN RAISE EXCEPTION 'radar_daily_limit'; END IF;
 INSERT INTO public.vmv_video_radar_scans(owner_id,query,days)
  VALUES(p_owner,lower(btrim(p_query)),p_days)
  RETURNING id INTO created;
 RETURN jsonb_build_object('id',created,'status','pending','reused',false);
END $$;
REVOKE ALL ON FUNCTION public.vmv_video_radar_claim(uuid,text,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_video_radar_claim(uuid,text,integer) TO service_role;

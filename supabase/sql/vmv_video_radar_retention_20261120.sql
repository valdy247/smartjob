-- Required data retention and user-controlled deletion for YouTube public API metadata.
-- pg_cron is installed in the shared Supabase project. Do not publish without periodic cleanup.
CREATE OR REPLACE FUNCTION public.vmv_video_radar_clear_owner(p_owner uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE removed integer;
BEGIN
 IF p_owner IS NULL OR NOT EXISTS
   (SELECT 1 FROM public.smartjob_profiles WHERE id=p_owner)
 THEN RAISE EXCEPTION 'invalid_radar_owner'; END IF;
 UPDATE public.vmv_video_pilots SET creative_seed='',research_video_id='',
  research_scan_id=NULL,updated_at=now()
  WHERE owner_id=p_owner AND research_scan_id IS NOT NULL;
 DELETE FROM public.vmv_video_radar_scans WHERE owner_id=p_owner;
 GET DIAGNOSTICS removed = ROW_COUNT;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.vmv_video_radar_clear_owner(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_video_radar_clear_owner(uuid) TO service_role;
-- A daily database job ensures public YouTube metadata is not retained >30 days
-- even if nobody visits the application.
SELECT cron.schedule(
 'vmv-video-radar-prune-youtube-data',
 '0 4 * * *',
 $$DELETE FROM public.vmv_video_radar_scans WHERE created_at < now()-interval '29 days';$$
);

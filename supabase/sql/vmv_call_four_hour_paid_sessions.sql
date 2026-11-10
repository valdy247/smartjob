-- Allow calls up to the standard four-hour Twilio limit, constrained by paid balance.
DO $vmv_long_calls$
DECLARE
  claim_sql text;
  reap_sql text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO claim_sql
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='smartjob_claim_call_quota'
      AND pg_get_function_identity_arguments(p.oid)='p_bridge_sid text, p_user_id uuid, p_max_minutes integer';
  IF claim_sql IS NULL THEN RAISE EXCEPTION 'Missing call quota function'; END IF;
  IF position('p_max_minutes not between 1 and 30' IN claim_sql)>0 THEN
    EXECUTE replace(claim_sql,'p_max_minutes not between 1 and 30','p_max_minutes not between 1 and 240');
  ELSIF position('p_max_minutes not between 1 and 240' IN claim_sql)=0 THEN
    RAISE EXCEPTION 'Unexpected call quota definition';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO reap_sql
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='smartjob_reap_call_reservations'
      AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid';
  IF reap_sql IS NULL THEN RAISE EXCEPTION 'Missing reservation reaper'; END IF;
  IF position('s.started_at < now()-interval ''35 minutes''' IN reap_sql)>0 THEN
    EXECUTE replace(reap_sql,
      's.started_at < now()-interval ''35 minutes''',
      's.started_at < now()-interval ''250 minutes''');
  ELSIF position('s.started_at < now()-interval ''250 minutes''' IN reap_sql)=0 THEN
    RAISE EXCEPTION 'Unexpected reservation reaper definition';
  END IF;
END
$vmv_long_calls$;

-- Public AI chat usage limits. No visitor can read or change these counters.
CREATE TABLE IF NOT EXISTS public.vmv_ai_public_chat_limits (
  scope text NOT NULL CHECK (scope IN ('visitor_hour','business_day')),
  token text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (scope, token, window_start)
);
ALTER TABLE public.vmv_ai_public_chat_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vmv_ai_public_chat_limits FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.vmv_ai_public_chat_reserve(
  p_business_id uuid, p_client_key text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_updated integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR
     p_business_id IS NULL OR p_client_key !~ '^[0-9a-f]{64}$'
  THEN RETURN false; END IF;
  -- Atomic per visitor: max eight AI responses per hour.
  INSERT INTO public.vmv_ai_public_chat_limits(scope,token,window_start,hits)
  VALUES ('visitor_hour',p_business_id::text||':'||p_client_key,date_trunc('hour',now()),1)
  ON CONFLICT(scope,token,window_start) DO UPDATE
    SET hits=public.vmv_ai_public_chat_limits.hits+1
    WHERE public.vmv_ai_public_chat_limits.hits < 8
  RETURNING hits INTO v_updated;
  IF v_updated IS NULL THEN RETURN false; END IF;
  v_updated:=NULL;
  -- Atomic merchant cap: never more than 60 billable requests per day.
  INSERT INTO public.vmv_ai_public_chat_limits(scope,token,window_start,hits)
  VALUES ('business_day',p_business_id::text,date_trunc('day',now()),1)
  ON CONFLICT(scope,token,window_start) DO UPDATE
    SET hits=public.vmv_ai_public_chat_limits.hits+1
    WHERE public.vmv_ai_public_chat_limits.hits < 60
  RETURNING hits INTO v_updated;
  RETURN v_updated IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.vmv_ai_public_chat_reserve(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_ai_public_chat_reserve(uuid,text) TO service_role;

-- VMV Services/Bookings: owner-confirmed decisions with availability checked under locks.
-- This RPC never sends messages, creates charges or grants an agent new permissions.
CREATE TABLE IF NOT EXISTS public.vmv_ai_booking_owner_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 booking_id uuid NOT NULL REFERENCES public.vmv_ai_bookings(id) ON DELETE CASCADE,
 prior_status text NOT NULL CHECK(prior_status IN('requested','confirmed')),
 decision text NOT NULL CHECK(decision IN('confirmed','canceled')),
 decided_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vmv_ai_booking_owner_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_ai_booking_owner_decisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vmv_ai_booking_owner_decisions TO authenticated;
DROP POLICY IF EXISTS vmv_ai_booking_owner_decisions_owner ON public.vmv_ai_booking_owner_decisions;
CREATE POLICY vmv_ai_booking_owner_decisions_owner ON public.vmv_ai_booking_owner_decisions
 FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.vmv_ai_owner_review_booking(
 p_booking_id uuid, p_decision text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_owner uuid:=auth.uid();
 v_booking public.vmv_ai_bookings%ROWTYPE;
 v_slot public.vmv_ai_booking_slots%ROWTYPE;
 v_service public.vmv_ai_booking_services%ROWTYPE;
 v_reserved integer;
BEGIN
 IF v_owner IS NULL THEN RAISE EXCEPTION 'booking_auth_required'; END IF;
 IF p_booking_id IS NULL OR p_decision NOT IN ('confirmed','canceled') THEN
  RAISE EXCEPTION 'booking_decision_invalid';
 END IF;
 SELECT * INTO v_booking FROM public.vmv_ai_bookings
 WHERE id=p_booking_id AND owner_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF v_booking.status='canceled' OR
  (p_decision='confirmed' AND v_booking.status<>'requested') THEN RETURN false; END IF;
 IF p_decision='confirmed' THEN
  SELECT * INTO v_service FROM public.vmv_ai_booking_services
  WHERE id=v_booking.service_id AND owner_id=v_owner
   AND business_id=v_booking.business_id AND active AND approved;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_service_unavailable'; END IF;
  SELECT * INTO v_slot FROM public.vmv_ai_booking_slots
  WHERE id=v_booking.slot_id AND owner_id=v_owner AND
   business_id=v_booking.business_id AND service_id=v_service.id
   AND active AND start_at>now()+interval '5 minutes' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_slot_unavailable'; END IF;
  SELECT count(*) INTO v_reserved FROM public.vmv_ai_bookings
  WHERE slot_id=v_booking.slot_id AND id<>v_booking.id
  AND status IN ('requested','confirmed');
  IF v_reserved>=v_slot.capacity THEN RAISE EXCEPTION 'booking_slot_full'; END IF;
 END IF;
 UPDATE public.vmv_ai_bookings SET status=p_decision,updated_at=now()
 WHERE id=v_booking.id AND owner_id=v_owner;
 INSERT INTO public.vmv_ai_booking_owner_decisions(owner_id,booking_id,prior_status,decision)
 VALUES(v_owner,v_booking.id,v_booking.status,p_decision);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.vmv_ai_owner_review_booking(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_ai_owner_review_booking(uuid,text) TO authenticated;
COMMENT ON FUNCTION public.vmv_ai_owner_review_booking(uuid,text) IS
 'Authorized owner review of an existing VMV booking; never notifies clients or collects payment.';

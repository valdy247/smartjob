-- VMV Business: human handoff, explicit web leads and 1-100 tone controls.
ALTER TABLE public.vmv_web_chat_settings
 DROP CONSTRAINT IF EXISTS vmv_web_chat_settings_warmth_check,
 DROP CONSTRAINT IF EXISTS vmv_web_chat_settings_formality_check;
UPDATE public.vmv_web_chat_settings
 SET warmth=(warmth-1)*25+1,formality=(formality-1)*25+1
 WHERE warmth<=5 AND formality<=5;
ALTER TABLE public.vmv_web_chat_settings
 ALTER COLUMN warmth SET DEFAULT 80,
 ALTER COLUMN formality SET DEFAULT 55,
 ADD CONSTRAINT vmv_web_chat_settings_warmth_check CHECK(warmth BETWEEN 1 AND 100),
 ADD CONSTRAINT vmv_web_chat_settings_formality_check CHECK(formality BETWEEN 1 AND 100);

ALTER TABLE public.vmv_web_public_chat_sessions
 ADD COLUMN IF NOT EXISTS handoff_status text NOT NULL DEFAULT 'bot'
   CHECK(handoff_status IN ('bot','waiting','human')),
 ADD COLUMN IF NOT EXISTS handoff_at timestamptz;
ALTER TABLE public.vmv_web_public_chat_messages
 DROP CONSTRAINT IF EXISTS vmv_web_public_chat_messages_role_check;
ALTER TABLE public.vmv_web_public_chat_messages
 ADD CONSTRAINT vmv_web_public_chat_messages_role_check CHECK(role IN ('user','assistant','human'));

CREATE TABLE IF NOT EXISTS public.vmv_web_chat_leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 session_id uuid NOT NULL UNIQUE REFERENCES public.vmv_web_public_chat_sessions(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 80),
 phone_e164 text CHECK(phone_e164 IS NULL OR phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
 email text CHECK(email IS NULL OR (length(email)<=180 AND email ~* '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$')),
 consent_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(phone_e164 IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS vmv_web_chat_leads_owner_recent
 ON public.vmv_web_chat_leads(owner_id,created_at DESC);
ALTER TABLE public.vmv_web_chat_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_web_chat_leads FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vmv_web_chat_leads TO authenticated;
DROP POLICY IF EXISTS vmv_web_chat_leads_owner ON public.vmv_web_chat_leads;
CREATE POLICY vmv_web_chat_leads_owner ON public.vmv_web_chat_leads
 FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.vmv_web_chat_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 session_id uuid NOT NULL UNIQUE REFERENCES public.vmv_web_public_chat_sessions(id) ON DELETE CASCADE,
 source text NOT NULL DEFAULT 'handoff' CHECK(source IN ('handoff','ai_unavailable')),
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vmv_web_chat_alerts_owner_unread ON
 public.vmv_web_chat_alerts(owner_id,created_at DESC) WHERE read_at IS NULL;
ALTER TABLE public.vmv_web_chat_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_web_chat_alerts FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE(read_at) ON public.vmv_web_chat_alerts TO authenticated;
DROP POLICY IF EXISTS vmv_web_chat_alerts_read_owner ON public.vmv_web_chat_alerts;
CREATE POLICY vmv_web_chat_alerts_read_owner ON public.vmv_web_chat_alerts FOR SELECT TO authenticated
 USING(owner_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS vmv_web_chat_alerts_mark_read ON public.vmv_web_chat_alerts;
CREATE POLICY vmv_web_chat_alerts_mark_read ON public.vmv_web_chat_alerts FOR UPDATE TO authenticated
 USING(owner_id=(SELECT auth.uid()))
 WITH CHECK(owner_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.vmv_web_chat_handoff(
 p_owner uuid,p_session uuid,p_reason text DEFAULT 'handoff'
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_session public.vmv_web_public_chat_sessions%ROWTYPE;
BEGIN
 SELECT * INTO v_session FROM public.vmv_web_public_chat_sessions
 WHERE id=p_session AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF v_session.handoff_status='bot' THEN
  UPDATE public.vmv_web_public_chat_sessions SET handoff_status='waiting',handoff_at=now(),
   pending_since=NULL,updated_at=now() WHERE id=p_session;
  INSERT INTO public.vmv_web_public_chat_messages(owner_id,session_id,role,content)
  VALUES(p_owner,p_session,'assistant','Te pondré en contacto con una persona del negocio. Puedes dejar tu mensaje aquí.');
 END IF;
 INSERT INTO public.vmv_web_chat_alerts(owner_id,session_id,source)
 VALUES(p_owner,p_session,CASE WHEN p_reason='ai_unavailable' THEN 'ai_unavailable' ELSE 'handoff' END)
 ON CONFLICT(session_id) DO UPDATE SET read_at=NULL,created_at=now(),
  source=EXCLUDED.source;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.vmv_web_chat_handoff(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_web_chat_handoff(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.vmv_web_chat_save_lead(
 p_owner uuid,p_session uuid,p_name text,p_email text,p_phone text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_name text;b_email text;v_phone text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.vmv_web_public_chat_sessions
  WHERE id=p_session AND owner_id=p_owner) THEN RAISE EXCEPTION 'chat_lead_no_session'; END IF;
 v_name:=btrim(coalesce(p_name,''));b_email:=nullif(lower(btrim(coalesce(p_email,''))),'');
 v_phone:=nullif(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'),'');
 IF length(v_name) NOT BETWEEN 2 AND 80
 OR (b_email IS NULL AND v_phone IS NULL)
 OR (b_email IS NOT NULL AND (length(b_email)>180 OR b_email !~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'))
 OR (v_phone IS NOT NULL AND v_phone !~ '^\\+[1-9][0-9]{7,14}$')
 THEN RAISE EXCEPTION 'chat_lead_invalid'; END IF;
 INSERT INTO public.vmv_web_chat_leads(owner_id,session_id,name,email,phone_e164)
 VALUES(p_owner,p_session,v_name,b_email,v_phone)
 ON CONFLICT(session_id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,
  phone_e164=EXCLUDED.phone_e164,consent_at=now()
 RETURNING id INTO v_id;
 -- Existing VMV contact book uses phone as an essential identifier.
 -- Email-only leads remain in the separate web leads table for owner review.
 IF v_phone IS NOT NULL THEN
  INSERT INTO public.smartjob_contacts(owner_id,name,phone_e164,notes)
  VALUES(p_owner,v_name,v_phone,'Contacto de Chat web')
  ON CONFLICT(owner_id,phone_e164) DO NOTHING;
 END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.vmv_web_chat_save_lead(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_web_chat_save_lead(uuid,uuid,text,text,text) TO service_role;

-- Changes are broadcast only to authenticated users meeting RLS criteria.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
   AND tablename='vmv_web_chat_alerts' AND schemaname='public') THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.vmv_web_chat_alerts;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
   AND tablename='vmv_web_public_chat_messages' AND schemaname='public') THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.vmv_web_public_chat_messages;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
   AND tablename='vmv_web_public_chat_sessions' AND schemaname='public') THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.vmv_web_public_chat_sessions;
  END IF;
 END IF;
END $$;

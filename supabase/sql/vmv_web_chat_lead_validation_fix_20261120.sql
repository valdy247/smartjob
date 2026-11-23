-- Fix escaped regex patterns in the first Chat Web lead migration.
-- POSIX classes and character classes avoid ambiguity between SQL regex escaping modes.
ALTER TABLE public.vmv_web_chat_leads
 DROP CONSTRAINT IF EXISTS vmv_web_chat_leads_email_check,
 DROP CONSTRAINT IF EXISTS vmv_web_chat_leads_phone_e164_check,
 ADD CONSTRAINT vmv_web_chat_leads_email_check CHECK(
  email IS NULL OR (length(email)<=180 AND
  email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
 ADD CONSTRAINT vmv_web_chat_leads_phone_e164_check CHECK(
  phone_e164 IS NULL OR phone_e164 ~ '^[+][1-9][0-9]{7,14}$');

CREATE OR REPLACE FUNCTION public.vmv_web_chat_save_lead(
 p_owner uuid,p_session uuid,p_name text,p_email text,p_phone text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_name text;v_email text;v_phone text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.vmv_web_public_chat_sessions
  WHERE id=p_session AND owner_id=p_owner) THEN RAISE EXCEPTION 'chat_lead_no_session'; END IF;
 v_name:=btrim(coalesce(p_name,''));
 v_email:=nullif(lower(btrim(coalesce(p_email,''))),'');
 v_phone:=nullif(regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g'),'');
 IF length(v_name) NOT BETWEEN 2 AND 80
 OR (v_email IS NULL AND v_phone IS NULL)
 OR (v_email IS NOT NULL AND (length(v_email)>180 OR
  v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))
 OR (v_phone IS NOT NULL AND v_phone !~ '^[+][1-9][0-9]{7,14}$')
 THEN RAISE EXCEPTION 'chat_lead_invalid'; END IF;
 INSERT INTO public.vmv_web_chat_leads(owner_id,session_id,name,email,phone_e164)
 VALUES(p_owner,p_session,v_name,v_email,v_phone)
 ON CONFLICT(session_id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,
  phone_e164=EXCLUDED.phone_e164,consent_at=now()
 RETURNING id INTO v_id;
 IF v_phone IS NOT NULL THEN
  INSERT INTO public.smartjob_contacts(owner_id,name,phone_e164,notes)
  VALUES(p_owner,v_name,v_phone,'Contacto de Chat web')
  ON CONFLICT(owner_id,phone_e164) DO NOTHING;
 END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.vmv_web_chat_save_lead(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_web_chat_save_lead(uuid,uuid,text,text,text) TO service_role;

-- VMV Business · Real public website AI chat, stage 1
-- Data-source validation, owner opt-in, server-only atomic metering and private conversation history.
ALTER TABLE public.vmv_web_chat_site_links
 DROP CONSTRAINT IF EXISTS vmv_web_chat_site_links_site_slug_fkey,
 DROP CONSTRAINT IF EXISTS vmv_web_chat_site_links_public_chat_enabled_check;
ALTER TABLE public.vmv_web_chat_site_links
 ADD COLUMN IF NOT EXISTS site_kind text NOT NULL DEFAULT 'classic' CHECK(site_kind IN ('classic','builder'));
ALTER TABLE public.vmv_web_chat_site_links DROP CONSTRAINT vmv_web_chat_site_links_pkey;
ALTER TABLE public.vmv_web_chat_site_links
 ADD CONSTRAINT vmv_web_chat_site_links_pkey PRIMARY KEY(owner_id,site_kind,site_slug);

CREATE OR REPLACE FUNCTION public.vmv_web_chat_verify_site_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_owner uuid; v_name text; v_agent record; v_central record;
BEGIN
 IF NEW.site_kind='classic' THEN
  SELECT owner_id,content->>'business' INTO v_owner,v_name FROM public.smartjob_web_publications
  WHERE slug=NEW.site_slug;
 ELSIF NEW.site_kind='builder' THEN
  SELECT owner_id,site_name INTO v_owner,v_name FROM public.smartjob_builder_public_pages
  WHERE site_slug=NEW.site_slug AND page_slug='home' LIMIT 1;
 ELSE RAISE EXCEPTION 'invalid_chat_site_kind'; END IF;
 SELECT owner_id,business_id,status INTO v_agent FROM public.vmv_ai_agents
 WHERE id=NEW.agent_id;
 SELECT b.owner_id,m.name,b.primary_agent_id INTO v_central
 FROM public.vmv_ai_businesses b
 JOIN public.vmv_marketing_businesses m ON m.id=b.central_business_id AND m.owner_id=b.owner_id
 WHERE b.id=NEW.business_id;
 IF v_owner IS DISTINCT FROM NEW.owner_id
 OR v_agent.owner_id IS DISTINCT FROM NEW.owner_id
 OR v_agent.business_id IS DISTINCT FROM NEW.business_id
 OR v_central.owner_id IS DISTINCT FROM NEW.owner_id
 OR lower(btrim(coalesce(v_name,'')))<>lower(btrim(coalesce(v_central.name,'')))
 THEN RAISE EXCEPTION 'web_chat_site_business_mismatch'; END IF;
 IF NEW.public_chat_enabled AND (
  v_agent.status<>'active' OR v_central.primary_agent_id IS DISTINCT FROM NEW.agent_id OR
  NOT EXISTS(SELECT 1 FROM public.vmv_web_chat_settings WHERE
    owner_id=NEW.owner_id AND agent_id=NEW.agent_id AND business_id=NEW.business_id)
 ) THEN RAISE EXCEPTION 'web_chat_agent_not_ready'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vmv_web_chat_verify_site_link_trigger ON public.vmv_web_chat_site_links;
CREATE TRIGGER vmv_web_chat_verify_site_link_trigger
 BEFORE INSERT OR UPDATE ON public.vmv_web_chat_site_links
 FOR EACH ROW EXECUTE FUNCTION public.vmv_web_chat_verify_site_link();

CREATE TABLE IF NOT EXISTS public.vmv_web_public_chat_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 site_slug text NOT NULL,site_kind text NOT NULL CHECK(site_kind IN ('classic','builder')),
 agent_id uuid NOT NULL REFERENCES public.vmv_ai_agents(id) ON DELETE CASCADE,
 visitor_hash text NOT NULL CHECK(visitor_hash ~ '^[a-f0-9]{64}$'),
 ip_hash text NOT NULL CHECK(ip_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 pending_since timestamptz,
 UNIQUE(owner_id,site_kind,site_slug,visitor_hash)
);
CREATE INDEX IF NOT EXISTS vmv_web_public_chat_sessions_owner_recent
 ON public.vmv_web_public_chat_sessions(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS vmv_web_public_chat_sessions_agent
 ON public.vmv_web_public_chat_sessions(agent_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.vmv_web_public_chat_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES public.vmv_web_public_chat_sessions(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('user','assistant')),
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vmv_web_public_chat_messages_session
 ON public.vmv_web_public_chat_messages(session_id,created_at);
CREATE TABLE IF NOT EXISTS public.vmv_web_public_chat_usage(
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 site_kind text NOT NULL CHECK(site_kind IN ('classic','builder')),
 site_slug text NOT NULL,
 ip_hash text NOT NULL CHECK(ip_hash ~ '^[a-f0-9]{64}$'),
 usage_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
 turns integer NOT NULL DEFAULT 0 CHECK(turns BETWEEN 0 AND 1000),
 PRIMARY KEY(owner_id,site_kind,site_slug,ip_hash,usage_day)
);
ALTER TABLE public.vmv_web_public_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmv_web_public_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vmv_web_public_chat_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_web_public_chat_sessions FROM public,anon,authenticated;
REVOKE ALL ON public.vmv_web_public_chat_messages FROM public,anon,authenticated;
REVOKE ALL ON public.vmv_web_public_chat_usage FROM public,anon,authenticated;
GRANT SELECT ON public.vmv_web_public_chat_sessions TO authenticated;
GRANT SELECT ON public.vmv_web_public_chat_messages TO authenticated;
DROP POLICY IF EXISTS vmv_web_public_chat_sessions_owner ON public.vmv_web_public_chat_sessions;
CREATE POLICY vmv_web_public_chat_sessions_owner ON public.vmv_web_public_chat_sessions
 FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS vmv_web_public_chat_messages_owner ON public.vmv_web_public_chat_messages;
CREATE POLICY vmv_web_public_chat_messages_owner ON public.vmv_web_public_chat_messages
 FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()) AND EXISTS(
  SELECT 1 FROM public.vmv_web_public_chat_sessions s WHERE s.id=session_id
  AND s.owner_id=(SELECT auth.uid())));
-- The daily usage table is never directly visible to the browser.

CREATE OR REPLACE FUNCTION public.vmv_web_public_chat_claim(
 p_owner uuid,p_agent uuid,p_site_kind text,p_slug text,p_visitor_hash text,p_ip_hash text,p_message text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_session public.vmv_web_public_chat_sessions%ROWTYPE;
 v_count_ip integer;v_count_site integer;v_count_owner integer;v_count_session integer;
 v_today date:=(now() AT TIME ZONE 'UTC')::date;v_message_id uuid;
BEGIN
 IF p_owner IS NULL OR p_agent IS NULL OR p_site_kind NOT IN ('classic','builder')
 OR length(p_slug) NOT BETWEEN 1 AND 64 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
 OR p_visitor_hash !~ '^[a-f0-9]{64}$' OR p_ip_hash !~ '^[a-f0-9]{64}$'
 OR length(btrim(p_message)) NOT BETWEEN 1 AND 650
 THEN RAISE EXCEPTION 'web_chat_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,472913));
 IF NOT EXISTS(
  SELECT 1 FROM public.vmv_web_chat_site_links l
   JOIN public.vmv_ai_agents a ON a.id=l.agent_id AND a.owner_id=l.owner_id
   JOIN public.vmv_ai_businesses b ON b.id=a.business_id
   WHERE l.owner_id=p_owner AND l.agent_id=p_agent
   AND l.site_kind=p_site_kind AND l.site_slug=p_slug AND l.public_chat_enabled=true
   AND a.status='active' AND b.primary_agent_id=a.id
   AND EXISTS(SELECT 1 FROM public.vmv_web_chat_settings s WHERE s.agent_id=a.id)
   AND (p_site_kind='classic' AND EXISTS(
     SELECT 1 FROM public.smartjob_web_publications p WHERE p.owner_id=p_owner AND p.slug=p_slug
    ) OR p_site_kind='builder' AND EXISTS(
     SELECT 1 FROM public.smartjob_builder_public_pages p
      WHERE p.owner_id=p_owner AND p.site_slug=p_slug AND p.page_slug='home'
    ))
 ) THEN RAISE EXCEPTION 'web_chat_not_active'; END IF;
 SELECT COALESCE(sum(turns),0) INTO v_count_owner
 FROM public.vmv_web_public_chat_usage WHERE owner_id=p_owner AND usage_day=v_today;
 SELECT COALESCE(sum(turns),0) INTO v_count_site
 FROM public.vmv_web_public_chat_usage WHERE owner_id=p_owner
 AND site_kind=p_site_kind AND site_slug=p_slug AND usage_day=v_today;
 SELECT COALESCE(sum(turns),0) INTO v_count_ip
 FROM public.vmv_web_public_chat_usage WHERE owner_id=p_owner AND ip_hash=p_ip_hash
 AND usage_day=v_today;
 IF v_count_owner>=140 OR v_count_site>=80 OR v_count_ip>=16
 THEN RAISE EXCEPTION 'web_chat_daily_limit'; END IF;
 INSERT INTO public.vmv_web_public_chat_sessions
 (owner_id,agent_id,site_kind,site_slug,visitor_hash,ip_hash)
 VALUES(p_owner,p_agent,p_site_kind,p_slug,p_visitor_hash,p_ip_hash)
 ON CONFLICT(owner_id,site_kind,site_slug,visitor_hash) DO NOTHING;
 SELECT * INTO v_session FROM public.vmv_web_public_chat_sessions WHERE
 owner_id=p_owner AND site_kind=p_site_kind AND site_slug=p_slug AND visitor_hash=p_visitor_hash
 FOR UPDATE;
 IF NOT FOUND OR v_session.agent_id<>p_agent THEN RAISE EXCEPTION 'web_chat_session_invalid'; END IF;
 IF v_session.pending_since IS NOT NULL AND v_session.pending_since>now()-interval '45 seconds'
 THEN RAISE EXCEPTION 'web_chat_busy'; END IF;
 SELECT count(*) INTO v_count_session FROM public.vmv_web_public_chat_messages
 WHERE session_id=v_session.id AND role='user' AND created_at>now()-interval '24 hours';
 IF v_count_session>=12 THEN RAISE EXCEPTION 'web_chat_session_limit'; END IF;
 UPDATE public.vmv_web_public_chat_sessions SET pending_since=now(),updated_at=now(),ip_hash=p_ip_hash
 WHERE id=v_session.id;
 INSERT INTO public.vmv_web_public_chat_usage(owner_id,site_kind,site_slug,ip_hash,usage_day,turns)
 VALUES(p_owner,p_site_kind,p_slug,p_ip_hash,v_today,1)
 ON CONFLICT(owner_id,site_kind,site_slug,ip_hash,usage_day)
 DO UPDATE SET turns=public.vmv_web_public_chat_usage.turns+1;
 INSERT INTO public.vmv_web_public_chat_messages(owner_id,session_id,role,content)
 VALUES(p_owner,v_session.id,'user',btrim(p_message)) RETURNING id INTO v_message_id;
 RETURN jsonb_build_object('session_id',v_session.id,'message_id',v_message_id);
END $$;
REVOKE ALL ON FUNCTION public.vmv_web_public_chat_claim(uuid,uuid,text,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_web_public_chat_claim(uuid,uuid,text,text,text,text,text)
 TO service_role;

CREATE OR REPLACE FUNCTION public.vmv_web_public_chat_finish(
 p_owner uuid,p_session_id uuid,p_response text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_session public.vmv_web_public_chat_sessions%ROWTYPE;
BEGIN
 SELECT * INTO v_session FROM public.vmv_web_public_chat_sessions WHERE
 id=p_session_id AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND OR v_session.pending_since IS NULL THEN RETURN false; END IF;
 IF length(btrim(coalesce(p_response,'')))>0 THEN
  INSERT INTO public.vmv_web_public_chat_messages(owner_id,session_id,role,content)
  VALUES(p_owner,p_session_id,'assistant',left(btrim(p_response),1800));
 END IF;
 UPDATE public.vmv_web_public_chat_sessions SET pending_since=NULL,updated_at=now()
 WHERE id=p_session_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.vmv_web_public_chat_finish(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_web_public_chat_finish(uuid,uuid,text) TO service_role;

SELECT cron.schedule(
 'vmv-web-public-chat-retention',
 '15 4 * * *',
 $$DELETE FROM public.vmv_web_public_chat_sessions WHERE created_at<now()-interval '29 days';
   DELETE FROM public.vmv_web_public_chat_usage WHERE usage_day<(now() AT TIME ZONE 'UTC')::date-3;$$
);
COMMENT ON TABLE public.vmv_web_public_chat_sessions IS
 'Opt-in AI visitor chats on owner-authorized published websites; visitor tokens hashed; automatic deletion after 29 days.';
COMMENT ON FUNCTION public.vmv_web_public_chat_claim(uuid,uuid,text,text,text,text,text) IS
 'Server-role-only atomic per-owner, per-site and per-visitor quota, requires verified active agent and website.';

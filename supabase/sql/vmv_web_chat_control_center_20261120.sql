-- VMV Business · Chat web control center 2026-11-20
-- Owner-scoped preferences and prepared site links. Public AI chat is NOT enabled here.
CREATE TABLE IF NOT EXISTS public.vmv_web_chat_settings(
 agent_id uuid PRIMARY KEY REFERENCES public.vmv_ai_agents(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES public.vmv_ai_businesses(id) ON DELETE CASCADE,
 warmth smallint NOT NULL DEFAULT 4 CHECK(warmth BETWEEN 1 AND 5),
 formality smallint NOT NULL DEFAULT 3 CHECK(formality BETWEEN 1 AND 5),
 reply_style text NOT NULL DEFAULT 'balanced' CHECK(reply_style IN ('brief','balanced','detailed')),
 languages text NOT NULL DEFAULT 'auto' CHECK(languages IN ('auto','es','en')),
 sales_enabled boolean NOT NULL DEFAULT false,
 sales_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
   CHECK(cardinality(sales_item_ids)<=50),
 lead_capture boolean NOT NULL DEFAULT true,
 human_handoff boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT vmv_web_chat_settings_verified_business CHECK(owner_id IS NOT NULL AND business_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS vmv_web_chat_settings_owner ON public.vmv_web_chat_settings(owner_id);
ALTER TABLE public.vmv_web_chat_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_web_chat_settings FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.vmv_web_chat_settings TO authenticated;
DROP POLICY IF EXISTS vmv_web_chat_settings_owner ON public.vmv_web_chat_settings;
CREATE POLICY vmv_web_chat_settings_owner ON public.vmv_web_chat_settings
 FOR ALL TO authenticated
 USING(owner_id=(SELECT auth.uid()) AND EXISTS(
  SELECT 1 FROM public.vmv_ai_agents a
  WHERE a.id=agent_id AND a.owner_id=(SELECT auth.uid()) AND a.business_id=business_id))
 WITH CHECK(owner_id=(SELECT auth.uid()) AND EXISTS(
  SELECT 1 FROM public.vmv_ai_agents a
  WHERE a.id=agent_id AND a.owner_id=(SELECT auth.uid()) AND a.business_id=business_id));
-- Even when a user modifies the catalog afterwards, runtime must always revalidate every offer.
-- Owner permission to sell means suggesting eligible approved stock, never taking payments.
CREATE OR REPLACE FUNCTION public.vmv_web_chat_validate_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE agent_record record;
BEGIN
 SELECT owner_id,business_id,configuration INTO agent_record
 FROM public.vmv_ai_agents WHERE id=NEW.agent_id;
 IF NOT FOUND OR agent_record.owner_id<>NEW.owner_id OR agent_record.business_id<>NEW.business_id
 THEN RAISE EXCEPTION 'web_chat_agent_owner_mismatch'; END IF;
 IF NEW.sales_enabled AND (
  COALESCE(agent_record.configuration->>'cap_catalog','')<>'Sí' OR
  cardinality(NEW.sales_item_ids)=0 OR
  EXISTS(
   SELECT 1 FROM unnest(NEW.sales_item_ids) requested
   WHERE NOT EXISTS(
    SELECT 1 FROM public.vmv_ai_catalog_items c
    WHERE c.id=requested AND c.owner_id=NEW.owner_id AND c.business_id=NEW.business_id
    AND c.approved=true AND c.active=true AND c.price_cents>0
    AND (c.stock_mode='unlimited' OR
         (c.stock_mode='tracked' AND c.available_qty>0))
   )
  )
 ) THEN RAISE EXCEPTION 'web_chat_sales_require_approved_available_catalog'; END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vmv_web_chat_validate_settings_trigger ON public.vmv_web_chat_settings;
CREATE TRIGGER vmv_web_chat_validate_settings_trigger
 BEFORE INSERT OR UPDATE ON public.vmv_web_chat_settings
 FOR EACH ROW EXECUTE FUNCTION public.vmv_web_chat_validate_settings();

CREATE TABLE IF NOT EXISTS public.vmv_web_chat_site_links(
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 site_slug text NOT NULL REFERENCES public.smartjob_web_publications(slug) ON DELETE CASCADE,
 agent_id uuid NOT NULL REFERENCES public.vmv_ai_agents(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES public.vmv_ai_businesses(id) ON DELETE CASCADE,
 public_chat_enabled boolean NOT NULL DEFAULT false CHECK(public_chat_enabled=false),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,site_slug)
);
CREATE INDEX IF NOT EXISTS vmv_web_chat_site_links_agent ON public.vmv_web_chat_site_links(agent_id);
ALTER TABLE public.vmv_web_chat_site_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_web_chat_site_links FROM anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.vmv_web_chat_site_links TO authenticated;
DROP POLICY IF EXISTS vmv_web_chat_site_links_owner ON public.vmv_web_chat_site_links;
CREATE POLICY vmv_web_chat_site_links_owner ON public.vmv_web_chat_site_links
 FOR ALL TO authenticated
 USING(owner_id=(SELECT auth.uid()) AND EXISTS(
  SELECT 1 FROM public.vmv_ai_agents a WHERE a.id=agent_id
   AND a.owner_id=(SELECT auth.uid()) AND a.business_id=business_id))
 WITH CHECK(owner_id=(SELECT auth.uid()) AND EXISTS(
  SELECT 1 FROM public.vmv_ai_agents a WHERE a.id=agent_id
   AND a.owner_id=(SELECT auth.uid()) AND a.business_id=business_id));
CREATE OR REPLACE FUNCTION public.vmv_web_chat_verify_site_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE site_record record; agent_record record; central_record record;
BEGIN
 SELECT p.owner_id,p.content->>'business' AS name INTO site_record
 FROM public.smartjob_web_publications p WHERE p.slug=NEW.site_slug;
 SELECT a.owner_id,a.business_id INTO agent_record
 FROM public.vmv_ai_agents a WHERE a.id=NEW.agent_id;
 SELECT b.owner_id,m.name INTO central_record
 FROM public.vmv_ai_businesses b JOIN public.vmv_marketing_businesses m
 ON m.id=b.central_business_id AND m.owner_id=b.owner_id
 WHERE b.id=NEW.business_id;
 IF NOT FOUND OR site_record.owner_id IS DISTINCT FROM NEW.owner_id
 OR agent_record.owner_id IS DISTINCT FROM NEW.owner_id
 OR agent_record.business_id IS DISTINCT FROM NEW.business_id
 OR central_record.owner_id IS DISTINCT FROM NEW.owner_id
 OR lower(btrim(coalesce(site_record.name,'')))<>lower(btrim(central_record.name))
 THEN RAISE EXCEPTION 'web_chat_site_business_mismatch'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vmv_web_chat_verify_site_link_trigger ON public.vmv_web_chat_site_links;
CREATE TRIGGER vmv_web_chat_verify_site_link_trigger
 BEFORE INSERT ON public.vmv_web_chat_site_links
 FOR EACH ROW EXECUTE FUNCTION public.vmv_web_chat_verify_site_link();
COMMENT ON TABLE public.vmv_web_chat_site_links IS
 'Prepared business-matched associations only. public_chat_enabled is forced false until an authenticated, abuse-protected public chat runtime ships.';

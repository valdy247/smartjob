-- Smart Quote follows AI Agents' approved canonical products and services.
-- Preserve legacy quote-only items and quote snapshots. No payment or publication side effects.
BEGIN;
ALTER TABLE public.vmv_smart_quote_catalog
 ADD COLUMN IF NOT EXISTS source_kind text,
 ADD COLUMN IF NOT EXISTS source_id uuid;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vmv_quote_source_pair_ck') THEN
  ALTER TABLE public.vmv_smart_quote_catalog ADD CONSTRAINT vmv_quote_source_pair_ck
   CHECK ((source_kind IS NULL AND source_id IS NULL)
    OR (source_kind IN ('product','service') AND source_id IS NOT NULL));
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS vmv_quote_source_identity_idx
 ON public.vmv_smart_quote_catalog(owner_id,business_id,source_kind,source_id);

-- Client edits to a linked mirror would otherwise drift from the canonical catalog.
CREATE OR REPLACE FUNCTION public.vmv_quote_reject_linked_edits()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.source_kind IS NOT NULL AND current_user='authenticated' THEN
  RAISE EXCEPTION 'Edit linked products and services in AI Agents';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS vmv_quote_linked_edit_guard ON public.vmv_smart_quote_catalog;
CREATE TRIGGER vmv_quote_linked_edit_guard BEFORE UPDATE ON public.vmv_smart_quote_catalog
 FOR EACH ROW EXECUTE FUNCTION public.vmv_quote_reject_linked_edits();

CREATE OR REPLACE FUNCTION public.vmv_quote_sync_from_ai_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 original record; central uuid; kind text; usable boolean; price integer;
 item_name text; item_description text; unit text;
BEGIN
 kind:=CASE WHEN TG_TABLE_NAME='vmv_ai_catalog_items' THEN 'product' ELSE 'service' END;
 IF TG_OP='DELETE' THEN
  original:=OLD;
 ELSE
  original:=NEW;
 END IF;
 -- In the unlikely event of a workspace transfer, disable the old link.
 IF TG_OP='UPDATE' AND (OLD.business_id IS DISTINCT FROM NEW.business_id
  OR OLD.owner_id IS DISTINCT FROM NEW.owner_id) THEN
  UPDATE public.vmv_smart_quote_catalog
   SET active=false,updated_at=now()
   WHERE owner_id=OLD.owner_id AND source_kind=kind AND source_id=OLD.id;
 END IF;
 IF TG_OP='DELETE' THEN
  UPDATE public.vmv_smart_quote_catalog
   SET active=false,updated_at=now()
   WHERE owner_id=OLD.owner_id AND source_kind=kind AND source_id=OLD.id;
  RETURN OLD;
 END IF;
 SELECT w.central_business_id INTO central
 FROM public.vmv_ai_businesses w
 JOIN public.vmv_marketing_businesses b ON b.id=w.central_business_id AND b.owner_id=w.owner_id
 WHERE w.id=NEW.business_id AND w.owner_id=NEW.owner_id;
 IF central IS NULL THEN RETURN NEW; END IF;
 IF kind='product' THEN
  usable:=NEW.approved AND NEW.active AND NEW.currency='usd' AND NEW.price_cents>0
   AND (NEW.stock_mode<>'tracked' OR COALESCE(NEW.available_qty,0)>0);
  unit:='unidad';
 ELSE
  usable:=NEW.approved AND NEW.active AND NEW.currency='usd' AND COALESCE(NEW.price_cents,0)>0;
  unit:='servicio';
 END IF;
 IF NOT usable THEN
  UPDATE public.vmv_smart_quote_catalog SET active=false,updated_at=now()
   WHERE business_id=central AND owner_id=NEW.owner_id AND source_kind=kind AND source_id=NEW.id;
  RETURN NEW;
 END IF;
 price:=NEW.price_cents;
 item_name:=left(btrim(NEW.name),120);
 item_description:=left(coalesce(NEW.description,''),500);
 INSERT INTO public.vmv_smart_quote_catalog
  (owner_id,business_id,name,description,unit_name,unit_price_cents,active,source_kind,source_id)
 VALUES (NEW.owner_id,central,item_name,item_description,unit,price,true,kind,NEW.id)
 ON CONFLICT (owner_id,business_id,source_kind,source_id)
 DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
  unit_name=EXCLUDED.unit_name,unit_price_cents=EXCLUDED.unit_price_cents,
  active=true,updated_at=now();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.vmv_quote_sync_from_ai_catalog() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.vmv_quote_reject_linked_edits() FROM PUBLIC,anon;
DROP TRIGGER IF EXISTS vmv_quote_ai_products_sync ON public.vmv_ai_catalog_items;
CREATE TRIGGER vmv_quote_ai_products_sync
 AFTER INSERT OR UPDATE OR DELETE ON public.vmv_ai_catalog_items
 FOR EACH ROW EXECUTE FUNCTION public.vmv_quote_sync_from_ai_catalog();
DROP TRIGGER IF EXISTS vmv_quote_ai_services_sync ON public.vmv_ai_booking_services;
CREATE TRIGGER vmv_quote_ai_services_sync
 AFTER INSERT OR UPDATE OR DELETE ON public.vmv_ai_booking_services
 FOR EACH ROW EXECUTE FUNCTION public.vmv_quote_sync_from_ai_catalog();

-- Backfill eligible records already present in the agent, scoped to the same owner and linked business.
INSERT INTO public.vmv_smart_quote_catalog
 (owner_id,business_id,name,description,unit_name,unit_price_cents,active,source_kind,source_id)
SELECT p.owner_id,b.id,p.name,left(coalesce(p.description,''),500),'unidad',p.price_cents,
 true,'product',p.id
FROM public.vmv_ai_catalog_items p
JOIN public.vmv_ai_businesses w ON w.id=p.business_id AND w.owner_id=p.owner_id
JOIN public.vmv_marketing_businesses b ON b.id=w.central_business_id AND b.owner_id=p.owner_id
WHERE p.active AND p.approved AND p.currency='usd' AND p.price_cents>0
 AND (p.stock_mode<>'tracked' OR coalesce(p.available_qty,0)>0)
ON CONFLICT (owner_id,business_id,source_kind,source_id)
DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
 unit_name=EXCLUDED.unit_name,unit_price_cents=EXCLUDED.unit_price_cents,
 active=true,updated_at=now();
INSERT INTO public.vmv_smart_quote_catalog
 (owner_id,business_id,name,description,unit_name,unit_price_cents,active,source_kind,source_id)
SELECT p.owner_id,b.id,p.name,left(coalesce(p.description,''),500),'servicio',p.price_cents,
 true,'service',p.id
FROM public.vmv_ai_booking_services p
JOIN public.vmv_ai_businesses w ON w.id=p.business_id AND w.owner_id=p.owner_id
JOIN public.vmv_marketing_businesses b ON b.id=w.central_business_id AND b.owner_id=p.owner_id
WHERE p.active AND p.approved AND p.currency='usd' AND p.price_cents>0
ON CONFLICT (owner_id,business_id,source_kind,source_id)
DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
 unit_name=EXCLUDED.unit_name,unit_price_cents=EXCLUDED.unit_price_cents,
 active=true,updated_at=now();
COMMIT;

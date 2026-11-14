-- VMV visual builder end-to-end regression.
-- Creates a temporary site, publishes an image hero and a five-item catalogue,
-- submits an anonymous inquiry for item five, then rolls the transaction back.
BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $qa$
DECLARE
 v_site uuid;
 v_page uuid;
 v_data jsonb;
 v_slug text:='vmv-visual-test-'||left(replace(gen_random_uuid()::text,'-',''),10);
 v_doc jsonb:='{"root":{"props":{"palette":"forest","font":"geometric","style":"dark","width":"wide","motion":"off","accentColor":"#367457","logo":""}},"content":[{"type":"HeroVisual","props":{"id":"photo-hero","layout":"split","title":"Visual","image":"https://example.com/hero.webp","imageAlt":"Foto de prueba"}},{"type":"OfferingGrid","props":{"id":"products-grid","title":"Productos","layout":"grid","items":[{"title":"Producto 1","description":"","image":"","alt":"","price":""},{"title":"Producto 2","description":"","image":"","alt":"","price":""},{"title":"Producto 3","description":"","image":"","alt":"","price":""},{"title":"Producto 4","description":"","image":"","alt":"","price":""},{"title":"Producto 5","description":"","image":"","alt":"","price":""}]}},{"type":"Contact","props":{"id":"contact-now","title":"Contacto","email":""}}]}'::jsonb;
BEGIN
 v_data=public.smartjob_builder_create_site('Demo visual QA',v_slug,'bakery',v_doc,'',NULL);
 v_site=(v_data->>'siteId')::uuid;v_page=(v_data->>'pageId')::uuid;
 IF (SELECT inquiries_enabled FROM public.smartjob_builder_sites WHERE id=v_site) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'New site lacks functional contact form'; END IF;
 PERFORM public.smartjob_builder_publish_page(v_page);
 IF (SELECT document->'content'->1->'props'->'items'->4->>'title'
  FROM public.smartjob_builder_public_pages WHERE page_id=v_page)<>'Producto 5' THEN
  RAISE EXCEPTION 'Fifth product did not persist'; END IF;
 IF (SELECT document->'root'->'props'->>'palette'
  FROM public.smartjob_builder_public_pages WHERE page_id=v_page)<>'forest' THEN
  RAISE EXCEPTION 'Design tokens were discarded'; END IF;
 PERFORM set_config('app.vmv_visual_qa_slug',v_slug,true);
END $qa$;
SET LOCAL ROLE anon;
SELECT set_config('app.vmv_visual_qa_inquiry',public.smartjob_builder_submit_inquiry(
 current_setting('app.vmv_visual_qa_slug'),
 '{"name":"Test Visitor","email":"qa@example.invalid","service":"Producto 5","message":"Test only; transaction rollback","details":{},"website":""}'::jsonb
)::text,true);
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $qa$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.smartjob_web_inquiries
 WHERE id=current_setting('app.vmv_visual_qa_inquiry')::uuid AND visitor_name='Test Visitor') THEN
  RAISE EXCEPTION 'Submission not visible to site owner'; END IF;
END $qa$;
RESET ROLE;
SELECT 'PASS: visual root, 5-item catalogue, published preview, anonymous inquiry' AS result;
ROLLBACK;

-- VMV Web Studio 2.0 regression: run in a controlled Supabase test project.
-- Rolls back every inserted website, public page, revision and request.
-- Requires at least one existing auth.users record; does not read or modify their existing content.
BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users LIMIT 1),true);
SELECT set_config('app.vmv_other_user',COALESCE((
 SELECT id::text FROM auth.users WHERE id<>(SELECT auth.uid()) LIMIT 1
),''),true);
SET LOCAL ROLE authenticated;
DO $qa$
DECLARE
 owner_id uuid:=auth.uid();
 other_id uuid:=nullif(current_setting('app.vmv_other_user'),'')::uuid;
 website text:='vmv-qa-'||left(replace(gen_random_uuid()::text,'-',''),12);
 site_id uuid;
 home_id uuid;
 secondary_id uuid;
 v1_id uuid;
 initial jsonb:='{"root":{"props":{"palette":"violet"}},"content":[{"type":"Hero","props":{"id":"qa-hero","title":"Primera versión"}}]}'::jsonb;
 changed jsonb:='{"root":{"props":{"palette":"mint"}},"content":[{"type":"Hero","props":{"id":"qa-hero","title":"Segunda versión"}}]}'::jsonb;
 created jsonb;
BEGIN
 IF owner_id IS NULL THEN RAISE EXCEPTION 'QA requires an existing authenticated user'; END IF;
 PERFORM set_config('app.vmv_qa_site_slug',website,true);
 created:=public.smartjob_builder_create_site('VMV QA only',website,'bakery',initial,'Demo',NULL);
 site_id:=(created->>'siteId')::uuid;
 home_id:=(created->>'pageId')::uuid;
 IF (SELECT count(*) FROM public.smartjob_builder_pages WHERE site_id=site_id)<>1 THEN
  RAISE EXCEPTION 'Creating a site did not create its homepage'; END IF;
 INSERT INTO public.smartjob_builder_pages(site_id,owner_id,slug,title,draft)
 VALUES(site_id,owner_id,'servicios','Servicios',initial) RETURNING id INTO secondary_id;
 PERFORM public.smartjob_builder_publish_page(home_id);
 PERFORM public.smartjob_builder_publish_page(secondary_id);
 IF (SELECT count(*) FROM public.smartjob_builder_public_pages WHERE site_slug=website)<>2 THEN
  RAISE EXCEPTION 'Multiple public routes were not persisted'; END IF;
 UPDATE public.smartjob_builder_pages SET draft=changed,revision=revision+1
 WHERE id=home_id AND owner_id=owner_id;
 IF (SELECT document FROM public.smartjob_builder_public_pages WHERE page_id=home_id)<>initial THEN
  RAISE EXCEPTION 'Autosaved draft leaked into publication'; END IF;
 PERFORM public.smartjob_builder_publish_page(home_id);
 IF (SELECT document FROM public.smartjob_builder_public_pages WHERE page_id=home_id)<>changed THEN
  RAISE EXCEPTION 'Republish did not change public content'; END IF;
 SELECT id INTO v1_id FROM public.smartjob_builder_revisions
 WHERE page_id=home_id AND version=1;
 PERFORM public.smartjob_builder_restore_revision(home_id,v1_id,2);
 IF (SELECT document FROM public.smartjob_builder_public_pages WHERE page_id=home_id)<>changed THEN
  RAISE EXCEPTION 'Restoring draft unexpectedly changed live site'; END IF;
 IF (SELECT draft FROM public.smartjob_builder_pages WHERE id=home_id)<>initial THEN
  RAISE EXCEPTION 'Restore did not recover previous content'; END IF;
 PERFORM public.smartjob_builder_publish_page(home_id);
 IF (SELECT document FROM public.smartjob_builder_public_pages WHERE page_id=home_id)<>initial THEN
  RAISE EXCEPTION 'Restored version cannot be republished'; END IF;
 IF (SELECT count(*) FROM public.smartjob_builder_revisions WHERE page_id=home_id)<>3 THEN
  RAISE EXCEPTION 'Immutable publication history missing'; END IF;
 IF other_id IS NOT NULL THEN
  PERFORM set_config('request.jwt.claim.sub',other_id::text,true);
  IF EXISTS(SELECT 1 FROM public.smartjob_builder_pages WHERE site_id=site_id) THEN
   RAISE EXCEPTION 'Other account can read private drafts'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 END IF;
END $qa$;
SET LOCAL ROLE anon;
DO $qa$
BEGIN
 IF (SELECT count(*) FROM public.smartjob_builder_public_pages
 WHERE site_slug=current_setting('app.vmv_qa_site_slug'))<>2 THEN
  RAISE EXCEPTION 'Anonymous visitors cannot load both published page URLs'; END IF;
 IF has_table_privilege('anon','public.smartjob_builder_pages','SELECT') THEN
  RAISE EXCEPTION 'Anonymous role can read drafts'; END IF;
 IF has_function_privilege('anon','public.smartjob_builder_publish_page(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Anonymous visitors can publish'; END IF;
END $qa$;
RESET ROLE;
DO $qa$
BEGIN
 IF has_table_privilege('authenticated','public.smartjob_builder_public_pages','UPDATE') OR
    has_table_privilege('authenticated','public.smartjob_builder_revisions','INSERT') THEN
  RAISE EXCEPTION 'Publications or history can be modified outside the publish RPC'; END IF;
END $qa$;
SELECT 'PASS: atomic create, two public pages, draft isolation, republish, restore and RLS' AS result;
ROLLBACK;

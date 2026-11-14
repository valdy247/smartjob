-- Web Services nested composition: verifies draft/live isolation and slot data fidelity.
-- Creates temporary QA records in a transaction and rolls everything back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
set local role authenticated;
do $qa$
declare
 v_owner uuid:=auth.uid();
 v_slug text:='vmv-compose-qa-'||left(replace(gen_random_uuid()::text,'-',''),12);
 v_first jsonb:='{"root":{"props":{"palette":"forest","font":"editorial"}},"content":[{"type":"SectionLayout","props":{"id":"compose-layout","surface":"soft","paddingDesktop":"airy","paddingMobile":"compact","content":[{"type":"ColumnsLayout","props":{"id":"compose-cols","columns":"2","mobileOrder":"reverse","mobileColumns":"stack","left":[{"type":"ComposeHeading","props":{"id":"compose-title","title":"Primera versión","sizeDesktop":"huge","sizeMobile":"medium"}},{"type":"ComposeText","props":{"id":"compose-copy","text":"Texto en la izquierda"}}],"right":[{"type":"ComposeImage","props":{"id":"compose-photo","image":"","ratio":"portrait"}}],"third":[]}}]}}]}'::jsonb;
 v_second jsonb;
 v_site uuid;
 v_page uuid;
 v_revision uuid;
 v_result jsonb;
begin
 if v_owner is null then raise exception 'No QA owner'; end if;
 perform set_config('app.vmv_compose_test_slug',v_slug,true);
 v_result:=public.smartjob_builder_create_site('VMV Compose QA',v_slug,'bakery',v_first,'',null);
 v_site=(v_result->>'siteId')::uuid;
 v_page=(v_result->>'pageId')::uuid;
 perform public.smartjob_builder_publish_page(v_page);
 if (select document#>>'{content,0,props,content,0,props,left,0,props,title}'
 from public.smartjob_builder_public_pages where page_id=v_page)<>'Primera versión' then
  raise exception 'Nested Puck slot missing after publish'; end if;
 v_second:=jsonb_set(v_first,'{content,0,props,content,0,props,left,0,props,title}','"Segunda versión"'::jsonb);
 v_second:=jsonb_set(v_second,'{content,0,props,content,0,props,mobileColumns}','"two"'::jsonb);
 update public.smartjob_builder_pages set draft=v_second,revision=revision+1 where id=v_page and owner_id=v_owner;
 if (select document#>>'{content,0,props,content,0,props,left,0,props,title}'
 from public.smartjob_builder_public_pages where page_id=v_page)<>'Primera versión' then
  raise exception 'Autosaved nested draft changed the live page'; end if;
 perform public.smartjob_builder_publish_page(v_page);
 if (select document#>>'{content,0,props,content,0,props,mobileColumns}'
 from public.smartjob_builder_public_pages where page_id=v_page)<>'two' then
  raise exception 'Responsive mobile setting missing after republish'; end if;
 select id into v_revision from public.smartjob_builder_revisions
 where page_id=v_page and version=1;
 perform public.smartjob_builder_restore_revision(v_page,v_revision,2);
 if (select draft#>>'{content,0,props,content,0,props,left,0,props,title}'
 from public.smartjob_builder_pages where id=v_page)<>'Primera versión' then
  raise exception 'Nested first version could not be restored'; end if;
 if (select document#>>'{content,0,props,content,0,props,left,0,props,title}'
 from public.smartjob_builder_public_pages where page_id=v_page)<>'Segunda versión' then
  raise exception 'Restoring nested draft changed live without publish'; end if;
 if (select count(*) from public.smartjob_builder_revisions where page_id=v_page)<>2 then
  raise exception 'Publication history mismatch'; end if;
end $qa$;
set local role anon;
do $qa$
begin
 if (select document#>>'{content,0,props,content,0,props,left,0,props,title}'
 from public.smartjob_builder_public_pages where site_slug=current_setting('app.vmv_compose_test_slug'))<>'Segunda versión' then
  raise exception 'Anonymous visitors cannot read updated nested page'; end if;
 if has_table_privilege('anon','public.smartjob_builder_pages','SELECT') then
  raise exception 'Anonymous visitors can read draft'; end if;
end $qa$;
reset role;
select 'PASS: nested columns, responsive props, draft/live, restore and anonymous publication' as result;
rollback;

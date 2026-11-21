-- Web Studio launch QA: two fictitious businesses, all writes in one rollback transaction.
-- Verifies image removal from exactly one item, shared media reuse, publication
-- isolation, rearranged sections, style tokens, multiple pages and site ownership.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
select set_config('app.qa_other_user',coalesce((select id::text from auth.users
 where id<>(select auth.uid()) limit 1),''),true);
set local role authenticated;
do $qa$
declare
 v_owner uuid:=auth.uid();
 v_other uuid:=nullif(current_setting('app.qa_other_user'),'')::uuid;
 v_products_slug text:='vmv-products-qa-'||substr(replace(gen_random_uuid()::text,'-',''),1,12);
 v_services_slug text:='vmv-services-qa-'||substr(replace(gen_random_uuid()::text,'-',''),1,12);
 v_products_id uuid; v_services_id uuid; v_products_home uuid; v_services_home uuid; v_about uuid;
 v_photo text:='https://example.invalid/qa-shared-photo.webp';
 v_products jsonb;
 v_services jsonb;
 v_result jsonb;
 v_removed jsonb;
 v_reordered jsonb;
 v_rev uuid;
begin
 if v_owner is null then raise exception 'Test owner missing'; end if;
 v_products=jsonb_build_object(
  'root','{"props":{"palette":"rose","font":"rounded","style":"warm","family":"bakery"}}'::jsonb,
  'content',jsonb_build_array(
   jsonb_build_object('type','HeroVisual','props',jsonb_build_object(
    'id','products-hero','title','QA Repostería','image',v_photo,'layout','split')),
   jsonb_build_object('type','OfferingGrid','props',jsonb_build_object(
    'id','products-grid','title','Productos',
    'items',jsonb_build_array(
     jsonb_build_object('title','Producto QA 1','image',v_photo,'price',''),
     jsonb_build_object('title','Producto QA 2','image','','price','')))),
   jsonb_build_object('type','PhotoGallery','props',jsonb_build_object(
    'id','products-gallery','title','Galería','items',
    jsonb_build_array(jsonb_build_object('image',v_photo,'alt','Foto compartida')))),
   jsonb_build_object('type','Contact','props',jsonb_build_object(
    'id','products-contact','title','Contactar','email','qa@example.invalid'))
  ));
 v_services='{"root":{"props":{"palette":"forest","font":"modern","style":"light","family":"construction"}},"content":[{"type":"HeroVisual","props":{"id":"service-hero","title":"Servicios de prueba","image":"","layout":"cover"}},{"type":"OfferingGrid","props":{"id":"service-grid","title":"Servicios","items":[{"title":"Servicio QA A","image":""},{"title":"Servicio QA B","image":""}]}},{"type":"ProcessSteps","props":{"id":"service-process","title":"Proceso","items":[]}},{"type":"Contact","props":{"id":"service-contact","title":"Solicita información","phone":""}}]}'::jsonb;
 v_result:=public.smartjob_builder_create_site('QA NEGOCIO PRODUCTOS',v_products_slug,
  'bakery',v_products,'Productos ficticios',null);
 v_products_id=(v_result->>'siteId')::uuid;v_products_home=(v_result->>'pageId')::uuid;
 v_result:=public.smartjob_builder_create_site('QA NEGOCIO SERVICIOS',v_services_slug,
  'home-builder',v_services,'Servicios ficticios',null);
 v_services_id=(v_result->>'siteId')::uuid;v_services_home=(v_result->>'pageId')::uuid;
 insert into public.smartjob_builder_pages(site_id,owner_id,slug,title,description,draft)
 values(v_services_id,v_owner,'nosotros','Nosotros','Página adicional',v_services)
 returning id into v_about;
 perform public.smartjob_builder_publish_page(v_products_home);
 perform public.smartjob_builder_publish_page(v_services_home);
 perform public.smartjob_builder_publish_page(v_about);
 if (select count(*) from public.smartjob_builder_public_pages
  where site_slug=v_services_slug)<>2 then raise exception 'Two pages not published'; end if;
 -- Remove from the first catalog card ONLY, never from the hero or gallery
 v_removed=jsonb_set(v_products,'{content,1,props,items,0,image}','""'::jsonb);
 if v_removed#>>'{content,0,props,image}'<>v_photo
  or v_removed#>>'{content,2,props,items,0,image}'<>v_photo
  or v_removed#>>'{content,1,props,items,0,image}'<>'' then
  raise exception 'Shared image removal touched an unrelated use'; end if;
 update public.smartjob_builder_pages
 set draft=v_removed,revision=revision+1,updated_at=now()
 where id=v_products_home and owner_id=v_owner;
 if (select document#>>'{content,1,props,items,0,image}' from
  public.smartjob_builder_public_pages where page_id=v_products_home)<>v_photo
 then raise exception 'Unsaved publication changed after photo removal'; end if;
 perform public.smartjob_builder_publish_page(v_products_home);
 if (select document#>>'{content,1,props,items,0,image}' from
  public.smartjob_builder_public_pages where page_id=v_products_home)<>'' then
  raise exception 'Photo came back after republish'; end if;
 if (select document#>>'{content,2,props,items,0,image}' from
  public.smartjob_builder_public_pages where page_id=v_products_home)<>v_photo then
  raise exception 'Photo disappeared from reused gallery'; end if;
 -- Reorder sections and change global style and text without deleting their contents
 v_reordered=jsonb_set(v_removed,'{content}',jsonb_build_array(
  v_removed->'content'->0,v_removed->'content'->2,
  v_removed->'content'->1,v_removed->'content'->3));
 v_reordered=jsonb_set(v_reordered,'{root,props,palette}','"forest"'::jsonb);
 v_reordered=jsonb_set(v_reordered,'{content,0,props,title}','"Nuevo título QA"'::jsonb);
 update public.smartjob_builder_pages
 set draft=v_reordered,revision=revision+1,updated_at=now()
 where id=v_products_home and owner_id=v_owner;
 perform public.smartjob_builder_publish_page(v_products_home);
 if (select document#>>'{root,props,palette}' from public.smartjob_builder_public_pages
  where page_id=v_products_home)<>'forest' then raise exception 'Color not saved'; end if;
 if (select document#>>'{content,1,type}' from public.smartjob_builder_public_pages
  where page_id=v_products_home)<>'PhotoGallery' then raise exception 'Section ordering lost'; end if;
 if (select document#>>'{content,2,props,items,0,image}' from
  public.smartjob_builder_public_pages where page_id=v_products_home)<>'' then
  raise exception 'Removed photo reappeared after section reorder'; end if;
 if (select document#>>'{content,1,props,items,0,image}' from
  public.smartjob_builder_public_pages where page_id=v_products_home)<>v_photo then
  raise exception 'Other use of photo was broken by section reorder'; end if;
 select id into v_rev from public.smartjob_builder_revisions
 where page_id=v_products_home and version=1;
 perform public.smartjob_builder_restore_revision(v_products_home,v_rev,3);
 if (select draft#>>'{content,1,props,items,0,image}' from
  public.smartjob_builder_pages where id=v_products_home)<>v_photo
 then raise exception 'Previous draft was not recoverable'; end if;
 if (select document#>>'{content,0,props,title}' from
  public.smartjob_builder_public_pages where page_id=v_products_home)<>'Nuevo título QA'
 then raise exception 'Recovery silently republished original'; end if;
 if v_other is not null then
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  if exists(select 1 from public.smartjob_builder_pages where site_id in
    (v_products_id,v_services_id)) then raise exception 'Other account read drafts'; end if;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
 end if;
 perform set_config('app.qa_products_slug',v_products_slug,true);
 perform set_config('app.qa_services_slug',v_services_slug,true);
end $qa$;
set local role anon;
do $anon$
begin
 if (select count(*) from public.smartjob_builder_public_pages
 where site_slug=current_setting('app.qa_services_slug'))<>2
 then raise exception 'Anonymous service pages do not reload'; end if;
 if (select count(*) from public.smartjob_builder_public_pages
 where site_slug=current_setting('app.qa_products_slug'))<>1
 then raise exception 'Anonymous product homepage does not reload'; end if;
end $anon$;
reset role;
select 'PASS: two businesses, photo removed from only one use, reuse retained, sections/styles, draft/public, 2 pages, restore, RLS' as result;
rollback;
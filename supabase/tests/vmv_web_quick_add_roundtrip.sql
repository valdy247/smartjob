-- VMV Web Studio quick-add and social links regression. All changes rolled back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
set local role authenticated;
do $qa$
declare
 v_owner uuid:=auth.uid();
 v_slug text:='vmv-quickadd-qa-'||left(replace(gen_random_uuid()::text,'-',''),12);
 v_document jsonb;
 v_site uuid;
 v_page uuid;
 v_created jsonb;
 v_updated jsonb;
 v_public jsonb;
begin
 if v_owner is null then raise exception 'QA owner not available'; end if;
 v_document='{"root":{"props":{"palette":"violet","socialLinks":{"instagram":"https://www.instagram.com/qa-example","facebook":"","tiktok":"","youtube":""}}},"content":[{"type":"ComposeHeading","props":{"id":"qa-heading","title":"Negocio de prueba"}}]}'::jsonb;
 v_created:=public.smartjob_builder_create_site('DEMO QA insertar elementos',v_slug,'bakery',
  v_document,'Publicación ficticia',null);
 v_site:=(v_created->>'siteId')::uuid;
 v_page:=(v_created->>'pageId')::uuid;
 -- Equivalent to pressing + (photo, product catalog and CTA), followed by saving.
 v_updated:=jsonb_set(v_document,'{content}',(v_document->'content')||
  '[{"type":"ComposeImage","props":{"id":"qa-image","image":"","alt":"","imageWidth":100}},{"type":"OfferingGrid","props":{"id":"qa-products","title":"Productos","items":[{"title":"Producto de prueba","image":"","price":""}],"showPrices":"no"}},{"type":"CTA","props":{"id":"qa-contact","title":"Solicitar información","buttonText":"Contactar","buttonUrl":"#contacto"}}]'::jsonb);
 update public.smartjob_builder_pages set draft=v_updated,revision=revision+1,updated_at=now()
 where id=v_page and owner_id=v_owner;
 if (select jsonb_array_length(draft->'content') from public.smartjob_builder_pages
  where id=v_page)<>4 then raise exception 'New elements were not saved'; end if;
 perform public.smartjob_builder_publish_page(v_page);
 select document into v_public from public.smartjob_builder_public_pages where page_id=v_page;
 if jsonb_array_length(v_public->'content')<>4
 or v_public#>>'{content,2,props,items,0,title}'<>'Producto de prueba'
 or v_public#>>'{root,props,socialLinks,instagram}'<>'https://www.instagram.com/qa-example'
 then raise exception 'Photo, product catalog or social links lost after publication'; end if;
 -- Owner controls onboarding links; deleting one stores blank and never resurrects it.
 insert into public.smartjob_web_intake_socials(owner_id,links)
 values(v_owner,'{"instagram":"https://www.instagram.com/qa-example"}'::jsonb)
 on conflict(owner_id) do update set links=excluded.links;
 update public.smartjob_web_intake_socials set links='{}'::jsonb where owner_id=v_owner;
 if (select links from public.smartjob_web_intake_socials where owner_id=v_owner)<>'{}'::jsonb
 then raise exception 'Removed social link reappeared'; end if;
end $qa$;
reset role;
select has_table_privilege('anon','public.smartjob_web_intake_socials','SELECT') as anon_can_read_private_socials;
rollback;
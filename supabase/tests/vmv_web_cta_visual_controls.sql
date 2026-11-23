-- Contextual call-to-action: changing section, heading and button persists safely.
-- Reversible fake site; no emails or payments.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
set local role authenticated;
do $qa$
declare
 v_owner uuid:=auth.uid();
 v_slug text:='vmv-cta-qa-'||substr(replace(gen_random_uuid()::text,'-',''),1,12);
 v_doc jsonb:='{"root":{"props":{"palette":"violet"}},"content":[{"type":"CTA","props":{"id":"qa-callout","title":"¿Tienes una idea?","description":"Cuéntanos los detalles.","buttonText":"Solicitar presupuesto","buttonUrl":"#contacto","sectionSurface":"dark","sectionBackground":"#30243F","sectionTextColor":"#FFFFFF","sectionAlign":"center","sectionPadding":"spacious","sectionRadius":24,"titleFont":"editorial","titleColor":"#FFFFFF","titleShadow":"soft","buttonStyle":"outline","buttonShape":"rounded","buttonRadius":12,"buttonColor":"#8E5DE4","buttonTextColor":"#FFFFFF","buttonBorderColor":"#8E5DE4","buttonBorderWidth":2,"buttonFontSize":17}}]}'::jsonb;
 v_created jsonb;v_page uuid;v_next jsonb;
begin
 if v_owner is null then raise exception 'Missing test owner';end if;
 v_created:=public.smartjob_builder_create_site('QA CTA',v_slug,'professional',v_doc,'',null);
 v_page:=(v_created->>'pageId')::uuid;
 perform public.smartjob_builder_publish_page(v_page);
 if (select document#>>'{content,0,props,buttonShape}' from public.smartjob_builder_public_pages where page_id=v_page)<>'rounded'
 then raise exception 'Button shape not saved in published snapshot';end if;
 v_next:=jsonb_set(v_doc,'{content,0,props,title}','"Nuevo título QA"'::jsonb);
 v_next:=jsonb_set(v_next,'{content,0,props,buttonBorderWidth}','5'::jsonb);
 v_next:=jsonb_set(v_next,'{content,0,props,sectionSurface}','"soft"'::jsonb);
 update public.smartjob_builder_pages set draft=v_next,revision=revision+1,updated_at=now()
 where id=v_page and owner_id=v_owner;
 if (select document#>>'{content,0,props,title}' from public.smartjob_builder_public_pages where page_id=v_page)<>'¿Tienes una idea?'
 then raise exception 'Draft changes leaked to publication';end if;
 perform public.smartjob_builder_publish_page(v_page);
 if (select document#>>'{content,0,props,title}' from public.smartjob_builder_public_pages where page_id=v_page)<>'Nuevo título QA'
 or (select document#>>'{content,0,props,buttonBorderWidth}' from public.smartjob_builder_public_pages where page_id=v_page)<>'5'
 or (select document#>>'{content,0,props,sectionSurface}' from public.smartjob_builder_public_pages where page_id=v_page)<>'soft'
 then raise exception 'CTA styling not persisted on second publish';end if;
end $qa$;
reset role;
select 'PASS: CTA title, section background, button shape and border draft/publish isolation' as result;
rollback;
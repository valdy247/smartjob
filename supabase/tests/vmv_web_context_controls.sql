-- Reversible end-to-end persistence of selection inspector props.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
set local role authenticated;
do $qa$
declare
 v_owner uuid:=auth.uid();
 v_slug text:='vmv-selection-qa-'||left(replace(gen_random_uuid()::text,'-',''),10);
 v_first jsonb:='{"root":{"props":{"palette":"rose","font":"rounded","style":"warm"}},"content":[{"type":"HeroVisual","props":{"id":"qa-cover","layout":"split","title":"QA de portada","titleFont":"editorial","titleFontSize":62,"titleColor":"#30243F","titleShadow":"strong","titleLink":"#solicitud","image":"","imageWidth":72,"imageRadius":33,"imageOpacity":35,"imageBorder":3,"borderColor":"#30243F","imageMoveX":24,"imageMoveY":-12}},{"type":"SectionLayout","props":{"id":"qa-section","content":[{"type":"ColumnsLayout","props":{"id":"qa-columns","left":[{"type":"ComposeHeading","props":{"id":"qa-title","title":"Texto de prueba","font":"rounded","fontSize":43,"textColor":"#168A6F","textShadow":"soft","moveX":12,"moveY":-9,"linkUrl":"#solicitud"}}],"right":[{"type":"ComposeImage","props":{"id":"qa-picture","image":"","imageWidth":65,"imageRadius":45,"imageOpacity":22,"imageBorder":2,"borderColor":"#8E5DE4","imageMoveX":-25,"imageMoveY":30}},{"type":"ComposeImage","props":{"id":"qa-other","image":"","imageWidth":100,"imageRadius":16}}],"third":[]}}]}}]}'::jsonb;
 v_result jsonb;v_page uuid;v_edited jsonb;
begin
 if v_owner is null then raise exception 'QA owner missing';end if;
 v_result:=public.smartjob_builder_create_site('QA contextual inspector',v_slug,'bakery',v_first,'QA visual',null);
 v_page:=(v_result->>'pageId')::uuid;
 if (select draft#>>'{content,1,props,content,0,props,right,0,props,imageWidth}'
 from public.smartjob_builder_pages where id=v_page)<>'65'
 then raise exception 'Image slider not saved';end if;
 perform public.smartjob_builder_publish_page(v_page);
 if (select document#>>'{content,0,props,titleShadow}' from
 public.smartjob_builder_public_pages where page_id=v_page)<>'strong'
 then raise exception 'Hero title shadow absent on publication';end if;
 if (select document#>>'{content,1,props,content,0,props,left,0,props,linkUrl}'
 from public.smartjob_builder_public_pages where page_id=v_page)<>'#solicitud'
 then raise exception 'Linked text missing';end if;
 v_edited:=jsonb_set(v_first,'{content,1,props,content,0,props,right,0,props,image}','""'::jsonb);
 v_edited:=jsonb_set(v_edited,'{content,1,props,content,0,props,right,0,props,imageOpacity}','75'::jsonb);
 update public.smartjob_builder_pages set draft=v_edited,revision=revision+1,updated_at=now()
 where id=v_page and owner_id=v_owner;
 if (select document#>>'{content,1,props,content,0,props,right,0,props,imageOpacity}'
 from public.smartjob_builder_public_pages where page_id=v_page)<>'22'
 then raise exception 'Draft edit changed live page';end if;
 perform public.smartjob_builder_publish_page(v_page);
 if (select document#>>'{content,1,props,content,0,props,right,0,props,imageOpacity}'
 from public.smartjob_builder_public_pages where page_id=v_page)<>'75'
 then raise exception 'Image transparency lost after republish';end if;
 if (select document#>>'{content,1,props,content,0,props,right,1,props,imageRadius}'
 from public.smartjob_builder_public_pages where page_id=v_page)<>'16'
 then raise exception 'Neighbor image changed by inspector';end if;
end $qa$;
reset role;
select 'PASS: nested photo controls, typography/link, isolation and republish' as result;
rollback;
-- Regression: deleting an image from the library should not break any draft,
-- published website or immutable revision still using its Storage URL.
-- Test only: all records created here are rolled back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
set local role service_role;
do $qa$
declare
 v_owner uuid:=auth.uid();
 v_file text:='e741a1c2-3d4e-45a6-b7c8-000000000001.webp';
 v_path text:=v_owner||'/'||v_file;
 v_site uuid;
 v_slug text:='vmv-media-qa-'||substr(replace(gen_random_uuid()::text,'-',''),1,10);
begin
 if v_owner is null then raise exception 'Missing test owner'; end if;
 if public.smartjob_web_media_in_use(v_path) then raise exception 'Unused image incorrectly marked in use'; end if;
 insert into public.smartjob_builder_sites(owner_id,slug,name)
 values(v_owner,v_slug,'Media archive QA') returning id into v_site;
 insert into public.smartjob_builder_pages(site_id,owner_id,slug,title,draft)
 values(v_site,v_owner,'home','Media QA',jsonb_build_object(
 'root','{"props":{}}'::jsonb,
 'content',jsonb_build_array(jsonb_build_object('type','Image','props',
  jsonb_build_object('id','qa-image','url','https://qa.invalid/'||v_path)
 ))));
 if not public.smartjob_web_media_in_use(v_path) then raise exception 'Stored image was not protected'; end if;
 insert into public.smartjob_web_media_hidden(owner_id,filename) values(v_owner,v_file);
 if not exists(select 1 from public.smartjob_web_media_hidden where owner_id=v_owner and filename=v_file)
 then raise exception 'Image archive record missing'; end if;
 if not exists(select 1 from public.smartjob_builder_pages
 where site_id=v_site and position(v_file in draft::text)>0)
 then raise exception 'Archiving changed the website instead of preserving references'; end if;
end $qa$;
reset role;
do $qa$
begin
 if has_table_privilege('anon','public.smartjob_web_media_hidden','SELECT')
  or has_table_privilege('authenticated','public.smartjob_web_media_hidden','SELECT')
  or has_table_privilege('authenticated','public.smartjob_web_media_hidden','DELETE')
 then raise exception 'Client can access server-only archive table'; end if;
 if not has_table_privilege('service_role','public.smartjob_web_media_hidden','INSERT')
 then raise exception 'Server cannot archive media'; end if;
end $qa$;
select 'PASS: image archive preserves in-use drafts and denies client archive access' as result;
rollback;

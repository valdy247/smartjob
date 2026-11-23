-- Web Services: protect uploaded images referenced by any retained website content.
-- Used by POST /api/web-services/media/delete. The server always derives owner_id
-- from a validated Supabase access token, and removes files only through Storage API.
-- UUID-only paths are matched literally (no LIKE wildcard injection).
create or replace function public.smartjob_web_media_in_use(p_asset text)
returns boolean
language sql
security invoker
set search_path=''
stable
as $$
 select case
  when p_asset is null or p_asset !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png|jpg)$' then true
  else (
   exists(select 1 from public.smartjob_builder_pages where pg_catalog.strpos(draft::text,p_asset)>0)
   or exists(select 1 from public.smartjob_builder_public_pages where pg_catalog.strpos(document::text,p_asset)>0)
   or exists(select 1 from public.smartjob_builder_revisions where pg_catalog.strpos(document::text,p_asset)>0)
   or exists(select 1 from public.smartjob_web_sites where pg_catalog.strpos(draft::text,p_asset)>0)
  )
 end
$$;
revoke all on function public.smartjob_web_media_in_use(text) from public,anon,authenticated;
grant execute on function public.smartjob_web_media_in_use(text) to service_role;

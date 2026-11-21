-- Web Studio onboarding media regression. All changes roll back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
set local role authenticated;
do $test$
declare
 user_id uuid:=auth.uid();
 saved_logo text;
 saved_cover text;
 saved_work text;
 fake_photo text;
begin
 if user_id is null then raise exception 'A QA owner is required'; end if;
 fake_photo:='https://example.invalid/storage/v1/object/public/smartjob-web-images/'||
  user_id::text||'/11223344-5566-7788-99aa-bbccddeeff00.webp';
 -- Create/upsert all three slots; the transaction guarantees no lasting mutations.
 insert into public.smartjob_web_intake_media(owner_id,logo_url,cover_url,work_url)
 values(user_id,fake_photo,fake_photo,fake_photo)
 on conflict(owner_id) do update set
  logo_url=excluded.logo_url,cover_url=excluded.cover_url,work_url=excluded.work_url;
 -- Deleting one selected location must retain all other locations.
 update public.smartjob_web_intake_media set cover_url='' where owner_id=user_id
 returning logo_url,cover_url,work_url into saved_logo,saved_cover,saved_work;
 if saved_cover<>'' or saved_logo<>fake_photo or saved_work<>fake_photo then
  raise exception 'Clearing cover also changed logo or work photo';end if;
 -- A fresh SELECT (equivalent to rehydration) must return explicit empty.
 select logo_url,cover_url,work_url into saved_logo,saved_cover,saved_work
 from public.smartjob_web_intake_media where owner_id=user_id;
 if saved_cover<>'' or saved_logo<>fake_photo or saved_work<>fake_photo then
  raise exception 'Deleted photo reappeared on fetch';end if;
 -- Replacing & clearing everything must never fall back to legacy drafts.
 update public.smartjob_web_intake_media
 set logo_url='',cover_url='',work_url='' where owner_id=user_id;
 if (select logo_url||cover_url||work_url
  from public.smartjob_web_intake_media where owner_id=user_id)<>'' then
  raise exception 'Empty selections not persisted';end if;
end $test$;
reset role;
select
 has_table_privilege('authenticated','public.smartjob_web_intake_media','SELECT') as can_read,
 has_table_privilege('authenticated','public.smartjob_web_intake_media','UPDATE') as can_update,
 has_table_privilege('authenticated','public.smartjob_web_intake_media','DELETE') as can_delete,
 has_table_privilege('anon','public.smartjob_web_intake_media','SELECT') as anonymous_can_read,
 (select count(*) from pg_policies where schemaname='public' and tablename='smartjob_web_intake_media') as policies;
rollback;
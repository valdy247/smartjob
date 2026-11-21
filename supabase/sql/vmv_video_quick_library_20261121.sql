-- VMV Video Generator: persist explicitly saved Stickman / AI-still videos privately per account.
create table if not exists public.vmv_video_quick_projects(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null default '',
 topic text not null,
 kind text not null check(kind in ('promo','facts')),
 visual text not null check(visual in ('sticks','stills')),
 seconds integer not null check(seconds in (15,30)),
 ratio text not null check(ratio in ('portrait','landscape')),
 narration boolean not null default true,
 scenes jsonb not null default '[]'::jsonb check(jsonb_typeof(scenes)='array' and jsonb_array_length(scenes) between 4 and 12),
 media_path text not null,
 output_mime text not null check(output_mime in ('video/mp4','video/webm')),
 created_at timestamptz not null default now(),
 constraint vmv_quick_topic_length check(length(topic) between 3 and 220),
 constraint vmv_quick_title_length check(length(title)<=140),
 constraint vmv_quick_owner_media_path check(
  media_path = owner_id::text||'/'||id::text||
   case output_mime when 'video/mp4' then '.mp4' else '.webm' end
 )
);
create index if not exists vmv_video_quick_projects_owner_date
 on public.vmv_video_quick_projects(owner_id,created_at desc);
alter table public.vmv_video_quick_projects enable row level security;
revoke all on public.vmv_video_quick_projects from anon;
grant select,insert,delete on public.vmv_video_quick_projects to authenticated;
drop policy if exists vmv_video_quick_owner_select on public.vmv_video_quick_projects;
drop policy if exists vmv_video_quick_owner_insert on public.vmv_video_quick_projects;
drop policy if exists vmv_video_quick_owner_delete on public.vmv_video_quick_projects;
create policy vmv_video_quick_owner_select on public.vmv_video_quick_projects for select to authenticated
 using(owner_id=(select auth.uid()));
create policy vmv_video_quick_owner_insert on public.vmv_video_quick_projects for insert to authenticated
 with check(owner_id=(select auth.uid()));
create policy vmv_video_quick_owner_delete on public.vmv_video_quick_projects for delete to authenticated
 using(owner_id=(select auth.uid()));
create or replace function public.vmv_video_quick_limit_guard() returns trigger
 language plpgsql security invoker set search_path=public,pg_temp as $$
 begin
  if (select count(*) from public.vmv_video_quick_projects where owner_id=new.owner_id)>=30 then
   raise exception 'vmv_quick_library_limit_reached';
  end if;
  return new;
 end $$;
drop trigger if exists vmv_video_quick_project_quota on public.vmv_video_quick_projects;
create trigger vmv_video_quick_project_quota before insert on public.vmv_video_quick_projects
 for each row execute function public.vmv_video_quick_limit_guard();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('vmv-video-quick','vmv-video-quick',false,26214400,array['video/mp4','video/webm'])
 on conflict(id) do update set public=false,file_size_limit=26214400,
 allowed_mime_types=array['video/mp4','video/webm'];
drop policy if exists vmv_quick_storage_select on storage.objects;
drop policy if exists vmv_quick_storage_insert on storage.objects;
drop policy if exists vmv_quick_storage_delete on storage.objects;
create policy vmv_quick_storage_select on storage.objects for select to authenticated
 using(bucket_id='vmv-video-quick' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy vmv_quick_storage_insert on storage.objects for insert to authenticated
 with check(bucket_id='vmv-video-quick' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (storage.extension(name) in ('mp4','webm')) and name ~
 '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(mp4|webm)$');
create policy vmv_quick_storage_delete on storage.objects for delete to authenticated
 using(bucket_id='vmv-video-quick' and (storage.foldername(name))[1]=(select auth.uid())::text);
comment on table public.vmv_video_quick_projects is
 'Private, owner-scoped finished videos explicitly saved from the Stickman/AI-stills browser renderer. Do not infer that unsaved drafts are cloud synchronized.';

-- VMV Admin private case attachments: public storage access is never enabled.
create table if not exists public.vmv_admin_attachments (
 id uuid primary key default gen_random_uuid(),
 source text not null check(source in ('marketing','support','provisioning','domain')),
 source_id uuid not null,
 uploader_id uuid not null references auth.users(id),
 object_path text not null unique check(char_length(object_path) between 20 and 400),
 filename text not null check(char_length(filename) between 1 and 150),
 content_type text not null check(content_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 bytes integer not null check(bytes between 1 and 3145728),
 created_at timestamptz not null default now()
);
create index if not exists vmv_admin_attachments_case_idx
 on public.vmv_admin_attachments(source,source_id,created_at);
alter table public.vmv_admin_attachments enable row level security;
revoke all on public.vmv_admin_attachments from anon,authenticated;
grant select on public.vmv_admin_attachments to authenticated;
create policy "vmv_admin_attachments_staff_or_owner_read" on public.vmv_admin_attachments
 for select to authenticated using(
 exists(select 1 from public.vmv_marketing_staff s where s.user_id=(select auth.uid()))
 or
 (source='support' and exists(select 1 from public.vmv_admin_tickets t
  where t.id=source_id and t.owner_id=(select auth.uid())))
 or
 (source='marketing' and exists(select 1 from public.vmv_marketing_requests r
  where r.id=source_id and r.owner_id=(select auth.uid())))
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vmv-admin-files','vmv-admin-files',false,3145728,
 array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict(id) do nothing;
comment on table public.vmv_admin_attachments is
 'Private support-case files. Upload and signed URL generation require verified server-side ownership.';
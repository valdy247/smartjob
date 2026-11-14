-- Indexes for authenticated Admin Web case-file and audit access.
create index if not exists vmv_admin_attachments_uploader_idx
 on public.vmv_admin_attachments(uploader_id,created_at desc);
create index if not exists vmv_admin_audit_actor_idx
 on public.vmv_admin_audit(actor_id,created_at desc);
create index if not exists vmv_admin_settings_actor_idx
 on public.vmv_admin_settings(updated_by);

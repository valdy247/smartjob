-- Persistent, revocable public links for completed Video Studio projects.
-- The video bucket remains PRIVATE. Only the server-side service role can
-- read/write these 256-bit bearer tokens. Neither anon nor authenticated clients
-- may query the share table through PostgREST.
create table if not exists public.vmv_studio_video_shares (
  job_id uuid primary key references public.vmv_studio_jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index if not exists vmv_studio_video_shares_owner_idx
 on public.vmv_studio_video_shares(owner_id);
alter table public.vmv_studio_video_shares enable row level security;
revoke all on table public.vmv_studio_video_shares from public, anon, authenticated;
grant select, insert, delete on table public.vmv_studio_video_shares to service_role;
comment on table public.vmv_studio_video_shares is
 'Private mapping of revocable public MP4 share URLs; never expose through public Data API.';

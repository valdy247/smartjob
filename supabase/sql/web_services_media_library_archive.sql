-- Photos removed from a library but referenced by an existing website are archived,
-- not physically deleted. This preserves existing published pages and immutable revisions.
create table if not exists public.smartjob_web_media_hidden(
 owner_id uuid not null references auth.users(id) on delete cascade,
 filename text not null check(filename ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$'),
 hidden_at timestamptz not null default now(),
 primary key(owner_id,filename)
);
alter table public.smartjob_web_media_hidden enable row level security;
revoke all on public.smartjob_web_media_hidden from public,anon,authenticated;
grant select,insert,delete on public.smartjob_web_media_hidden to service_role;
-- The delete route authenticates a real session, scopes filenames to auth.user.id,
-- and checks existing saved/public/history references before removing Storage objects.

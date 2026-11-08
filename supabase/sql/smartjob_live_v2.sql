-- Smart Job v2: run in the Supabase SQL Editor of the existing Smart Job project.
-- Idempotent schema; tenant-owned data is SELECT-only from browser clients.
-- Only server-side service credentials may provision routes, change destinations,
-- activate numbers, or write call sessions. No speech is stored.

create table if not exists public.smartjob_phone_routes(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 twilio_number text not null unique check(twilio_number ~ '^\+[1-9][0-9]{7,14}$'),
 destination_phone text not null check(destination_phone ~ '^\+[1-9][0-9]{7,14}$'),
 customer_language text not null default 'en-US',
 owner_language text not null default 'es-ES',
 assistant_name text not null default 'Smart Job' check(char_length(assistant_name) between 1 and 40),
 enabled boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint smartjob_routes_languages check(
   customer_language in ('en-US','es-ES') and owner_language in ('en-US','es-ES') and
   customer_language <> owner_language)
);
create index if not exists smartjob_phone_routes_owner_idx on public.smartjob_phone_routes(user_id);
alter table public.smartjob_phone_routes enable row level security;
revoke all on public.smartjob_phone_routes from anon,authenticated;
grant select on public.smartjob_phone_routes to authenticated;
drop policy if exists "smartjob_route_owner_read" on public.smartjob_phone_routes;
create policy "smartjob_route_owner_read" on public.smartjob_phone_routes
for select to authenticated using(user_id=(select auth.uid()));

create table if not exists public.smartjob_call_sessions(
 bridge_sid text primary key check(bridge_sid ~ '^CA[0-9a-fA-F]{32}$'),
 owner_id uuid not null references auth.users(id) on delete cascade,
 route_id uuid references public.smartjob_phone_routes(id) on delete set null,
 outbound_sid text check(outbound_sid is null or outbound_sid ~ '^CA[0-9a-fA-F]{32}$'),
 status text not null default 'initiated'
   check(status in ('initiated','ringing','in-progress','completed','busy','failed','no-answer','canceled')),
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 duration_seconds integer check(duration_seconds is null or duration_seconds>=0),
 error_code text check(error_code is null or char_length(error_code)<=32)
);
create index if not exists smartjob_call_sessions_owner_date_idx on public.smartjob_call_sessions(owner_id,started_at desc);
create index if not exists smartjob_call_sessions_route_idx on public.smartjob_call_sessions(route_id);
create unique index if not exists smartjob_one_active_call_per_owner on public.smartjob_call_sessions(owner_id)
 where status in ('initiated','ringing','in-progress');
alter table public.smartjob_call_sessions enable row level security;
revoke all on public.smartjob_call_sessions from anon,authenticated;
grant select on public.smartjob_call_sessions to authenticated;
drop policy if exists "smartjob_call_owner_read" on public.smartjob_call_sessions;
create policy "smartjob_call_owner_read" on public.smartjob_call_sessions
for select to authenticated using(owner_id=(select auth.uid()));


-- Customer signup requests: user can submit ONE pending request without buying a
-- phone number or initiating calls. Only the verified operator may change status.
create table if not exists public.smartjob_provisioning_requests(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 destination_phone text not null check(destination_phone ~ '^\+[1-9][0-9]{7,14}$'),
 customer_language text not null check(customer_language in ('en-US','es-ES')),
 owner_language text not null check(owner_language in ('en-US','es-ES') and owner_language<>customer_language),
 assistant_name text not null check(char_length(assistant_name) between 1 and 40),
 status text not null default 'pending' check(status in ('pending','contacted','approved','rejected','activated')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists smartjob_one_pending_request_per_user on public.smartjob_provisioning_requests(user_id) where status='pending';
create index if not exists smartjob_provisioning_user_date on public.smartjob_provisioning_requests(user_id,created_at desc);
alter table public.smartjob_provisioning_requests enable row level security;
revoke all on public.smartjob_provisioning_requests from anon,authenticated;
grant select,insert on public.smartjob_provisioning_requests to authenticated;
drop policy if exists "smartjob_provisioning_owner_read" on public.smartjob_provisioning_requests;
create policy "smartjob_provisioning_owner_read" on public.smartjob_provisioning_requests
 for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "smartjob_provisioning_user_create" on public.smartjob_provisioning_requests;
create policy "smartjob_provisioning_user_create" on public.smartjob_provisioning_requests
 for insert to authenticated with check(user_id=(select auth.uid()) and status='pending');

-- Verified provider events are deduplicated before mutating delivery status.
create table if not exists public.vmv_admin_tester_webhook_events(
 provider text not null check(provider in ('resend','twilio')),
 event_id text not null check(char_length(event_id) between 3 and 200),
 created_at timestamptz not null default now(),
 primary key(provider,event_id)
);
alter table public.vmv_admin_tester_webhook_events enable row level security;
revoke all on public.vmv_admin_tester_webhook_events from PUBLIC,anon,authenticated;
grant select,insert on public.vmv_admin_tester_webhook_events to service_role;
create index if not exists vmv_admin_tester_webhook_events_recent on public.vmv_admin_tester_webhook_events(created_at desc);

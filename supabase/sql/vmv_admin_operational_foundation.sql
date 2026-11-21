-- VMV Admin Web — additive operational foundation.
-- Canonical Marketing, provisioning, domain and AI commerce records are not moved or altered.
-- Ticket/message writes use authenticated, validated server routes; direct client INSERT is intentionally denied.
create table if not exists public.vmv_admin_tickets (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.smartjob_profiles(id) on delete cascade,
 subject text not null check (char_length(btrim(subject)) between 5 and 140),
 description text not null check (char_length(btrim(description)) between 10 and 4000),
 service_code text not null default 'general' check (service_code in ('general','marketing','web_services','smart_call','ai_agents','billing','company_formation','other')),
 status text not null default 'new' check (status in ('new','in_progress','needs_customer','resolved','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 closed_at timestamptz
);
create index if not exists vmv_admin_tickets_owner_idx on public.vmv_admin_tickets(owner_id,created_at desc);
create index if not exists vmv_admin_tickets_state_idx on public.vmv_admin_tickets(status,updated_at desc);
alter table public.vmv_admin_tickets enable row level security;
revoke all on public.vmv_admin_tickets from anon, authenticated;
grant select on public.vmv_admin_tickets to authenticated;
create policy "vmv_admin_tickets_owner_or_staff_read" on public.vmv_admin_tickets
 for select to authenticated using (
 owner_id=(select auth.uid()) or
 exists (select 1 from public.vmv_marketing_staff s where s.user_id=(select auth.uid()))
);
create table if not exists public.vmv_admin_case_meta (
 source text not null check (source in ('marketing','support','provisioning','domain')),
 source_id uuid not null,
 assigned_to uuid references public.vmv_marketing_staff(user_id) on delete set null,
 priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
 due_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(source,source_id)
);
create index if not exists vmv_admin_case_meta_assignee_idx on public.vmv_admin_case_meta(assigned_to,priority,due_at);
alter table public.vmv_admin_case_meta enable row level security;
revoke all on public.vmv_admin_case_meta from anon,authenticated;
grant select on public.vmv_admin_case_meta to authenticated;
create policy "vmv_admin_case_meta_staff_read" on public.vmv_admin_case_meta
 for select to authenticated using (
 exists(select 1 from public.vmv_marketing_staff s where s.user_id=(select auth.uid()))
);

create table if not exists public.vmv_admin_messages (
 id uuid primary key default gen_random_uuid(),
 source text not null check (source in ('marketing','support','provisioning','domain')),
 source_id uuid not null,
 author_id uuid not null references auth.users(id),
 kind text not null default 'message' check (kind in ('message','internal_note')),
 body text not null check (char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists vmv_admin_messages_case_idx on public.vmv_admin_messages(source,source_id,created_at,id);
create index if not exists vmv_admin_messages_author_idx on public.vmv_admin_messages(author_id,created_at desc);
alter table public.vmv_admin_messages enable row level security;
revoke all on public.vmv_admin_messages from anon,authenticated;
grant select on public.vmv_admin_messages to authenticated;
create policy "vmv_admin_messages_case_read" on public.vmv_admin_messages
 for select to authenticated using (
 exists (select 1 from public.vmv_marketing_staff s where s.user_id=(select auth.uid()))
 or (kind='message' and (
  (source='support' and exists(
    select 1 from public.vmv_admin_tickets t
    where t.id=source_id and t.owner_id=(select auth.uid())
  ))
  or (source='marketing' and exists(
    select 1 from public.vmv_marketing_requests r
    where r.id=source_id and r.owner_id=(select auth.uid())
  ))
 ))
);
-- Only a server using its verified service credential writes audit and settings.
create table if not exists public.vmv_admin_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id),
 action text not null check (char_length(action) between 3 and 100),
 source text not null,
 source_id uuid,
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists vmv_admin_audit_recent_idx on public.vmv_admin_audit(created_at desc);
alter table public.vmv_admin_audit enable row level security;
revoke all on public.vmv_admin_audit from anon,authenticated;

create table if not exists public.vmv_admin_settings (
 key text primary key check(key in ('support_defaults','team_preferences')),
 value jsonb not null default '{}'::jsonb,
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.vmv_admin_settings enable row level security;
revoke all on public.vmv_admin_settings from anon,authenticated;

comment on table public.vmv_admin_tickets is 'VMV platform support tickets, not inquiries owned by customer sites.';
comment on table public.vmv_admin_case_meta is 'Operator assignment/priority overlay; source tables retain original ownership and status.';
comment on table public.vmv_admin_messages is 'Append-only customer/staff communication; internal notes staff-only by RLS.';
comment on table public.vmv_admin_audit is 'Service-authenticated admin action history, no exposed client grants.';
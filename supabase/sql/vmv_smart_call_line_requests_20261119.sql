-- Safe owner-authorized requests only; never provisions or buys a Twilio number.
create table if not exists public.vmv_smart_call_line_requests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid not null references public.vmv_marketing_businesses(id) on delete cascade,
 kind text not null check (kind in ('existing','new')),
 existing_phone text,
 country text not null default 'US' check (country = 'US'),
 area_code text not null default '' check (length(area_code)<=3),
 candidate_number text,
 status text not null default 'pending' check (status in ('pending','verified','cancelled')),
 created_at timestamptz not null default now(),
 constraint vmv_line_request_input check (
   (kind='existing' and existing_phone ~ '^\\+[1-9][0-9]{7,14}$' and candidate_number is null)
   or (kind='new' and existing_phone is null and area_code ~ '^[0-9]{3}$')
 ),
 constraint vmv_line_candidate_format check (candidate_number is null or candidate_number ~ '^\\+[1-9][0-9]{7,14}$')
);
alter table public.vmv_smart_call_line_requests enable row level security;
revoke all on public.vmv_smart_call_line_requests from anon, public;
grant select,insert on public.vmv_smart_call_line_requests to authenticated;
create policy "smart_call_owner_reads_requests" on public.vmv_smart_call_line_requests
 for select to authenticated using (owner_id=(select auth.uid()));
create policy "smart_call_owner_submits_requests" on public.vmv_smart_call_line_requests
 for insert to authenticated with check (
  owner_id=(select auth.uid()) and status='pending' and
  exists(select 1 from public.vmv_marketing_businesses b where b.id=business_id and b.owner_id=(select auth.uid()))
 );
comment on table public.vmv_smart_call_line_requests is 'Wizard requests only. No Twilio purchase, ownership verification or call routing occurs on insertion.';
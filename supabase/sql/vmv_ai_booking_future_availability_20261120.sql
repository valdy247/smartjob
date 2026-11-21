-- VMV AI Agents: future business availability and transaction-safe web bookings.
-- Additive migration. Services remain the single authority for duration, prices and approval.
-- The owner chooses an available date/time window; the AI may only book inside it.
create table if not exists public.vmv_ai_booking_availability(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid not null references public.vmv_ai_businesses(id) on delete cascade,
 day date not null,
 start_local time without time zone not null,
 end_local time without time zone not null,
 time_zone text not null check(time_zone in ('America/New_York','America/Chicago','America/Denver',
  'America/Los_Angeles','America/Phoenix','America/Anchorage','Pacific/Honolulu','America/Puerto_Rico')),
 created_at timestamptz not null default now(),
 constraint vmv_ai_availability_window_order check(end_local>start_local),
 constraint vmv_ai_availability_window_duration check(end_local-start_local>=interval '30 minutes' and end_local-start_local<=interval '12 hours')
);
create index if not exists vmv_ai_availability_owner_day on public.vmv_ai_booking_availability(owner_id,business_id,day);
alter table public.vmv_ai_booking_availability enable row level security;
revoke all on public.vmv_ai_booking_availability from public,anon,authenticated;
grant select,insert,delete on public.vmv_ai_booking_availability to authenticated;
drop policy if exists vmv_ai_availability_owner_read on public.vmv_ai_booking_availability;
create policy vmv_ai_availability_owner_read on public.vmv_ai_booking_availability for select to authenticated
 using(owner_id=(select auth.uid()) and exists(
  select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
drop policy if exists vmv_ai_availability_owner_add on public.vmv_ai_booking_availability;
create policy vmv_ai_availability_owner_add on public.vmv_ai_booking_availability for insert to authenticated
 with check(owner_id=(select auth.uid()) and exists(
  select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
drop policy if exists vmv_ai_availability_owner_delete on public.vmv_ai_booking_availability;
create policy vmv_ai_availability_owner_delete on public.vmv_ai_booking_availability for delete to authenticated
 using(owner_id=(select auth.uid()) and exists(
  select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));

-- The booking remembers its verified owner-approved window. Existing phone bookings are unchanged.
alter table public.vmv_ai_bookings
 add column if not exists availability_id uuid references public.vmv_ai_booking_availability(id) on delete set null;
alter table public.vmv_ai_bookings
 add column if not exists request_key text;
create unique index if not exists vmv_ai_booking_once_per_web_intent
 on public.vmv_ai_bookings(owner_id,request_key) where request_key is not null;
alter table public.vmv_ai_bookings drop constraint if exists vmv_ai_bookings_source_check;
alter table public.vmv_ai_bookings add constraint vmv_ai_bookings_source_check
 check(source in ('ai_phone_test','web_chat'));

-- Validate dates and times on the database, never trust client clocks or time zones.
create or replace function public.vmv_ai_owner_add_availability(
 p_business uuid,p_date text,p_start text,p_end text,p_zone text
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_day date;v_start time;v_end time;v_id uuid;v_absolute timestamptz;
begin
 if auth.uid() is null or
  p_date !~ '^20[0-9]{2}-[01][0-9]-[0-3][0-9]$' or
  p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
  p_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
  p_zone not in ('America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
   'America/Phoenix','America/Anchorage','Pacific/Honolulu','America/Puerto_Rico') then
   return null;
 end if;
 begin
  v_day:=p_date::date; v_start:=p_start::time;v_end:=p_end::time;
  if to_char(v_day,'YYYY-MM-DD')<>p_date then return null;end if;
 exception when others then return null;end;
 if v_end-v_start<interval '30 minutes' or v_end-v_start>interval '12 hours' then return null;end if;
 if not exists(select 1 from public.vmv_ai_businesses b where b.id=p_business and b.owner_id=auth.uid()) then return null;end if;
 v_absolute:=(v_day+v_start) at time zone p_zone;
 if (v_absolute at time zone p_zone)<>(v_day+v_start) or
  v_absolute<=now()+interval '5 minutes' or
  v_absolute>=now()+interval '90 days' then return null;end if;
 perform pg_advisory_xact_lock(hashtext('vmv_availability:'||p_business::text));
 if exists(select 1 from public.vmv_ai_booking_availability w
   where w.owner_id=auth.uid() and w.business_id=p_business and w.day=v_day
    and w.start_local<v_end and w.end_local>v_start) then return null;end if;
 insert into public.vmv_ai_booking_availability(owner_id,business_id,day,start_local,end_local,time_zone)
 values(auth.uid(),p_business,v_day,v_start,v_end,p_zone) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.vmv_ai_owner_add_availability(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_owner_add_availability(uuid,text,text,text,text) to authenticated;

create or replace function public.vmv_ai_owner_remove_availability(p_window uuid)
 returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare w public.vmv_ai_booking_availability%rowtype;
begin
 if auth.uid() is null then return false;end if;
 select * into w from public.vmv_ai_booking_availability
 where id=p_window and owner_id=auth.uid() for update;
 if not found then return false;end if;
 perform pg_advisory_xact_lock(hashtext('vmv_agent_booking:'||w.business_id::text));
 if exists(select 1 from public.vmv_ai_bookings b
  join public.vmv_ai_booking_slots s on s.id=b.slot_id
  where b.business_id=w.business_id and b.owner_id=w.owner_id
   and b.status in ('requested','confirmed')
   and (s.start_at at time zone w.time_zone)::date=w.day
   and (s.start_at at time zone w.time_zone)::time<w.end_local
   and (s.end_at at time zone w.time_zone)::time>w.start_local) then return false;end if;
 delete from public.vmv_ai_booking_availability where id=w.id and owner_id=auth.uid();
 return found;
end $$;
revoke all on function public.vmv_ai_owner_remove_availability(uuid) from public,anon,authenticated;
grant execute on function public.vmv_ai_owner_remove_availability(uuid) to authenticated;

-- Called ONLY by a verified VMV server using the service-role key; not exposed to visitors.
-- Atomic owner/business locking prevents two concurrent chat messages booking the same minutes.
create or replace function public.vmv_ai_book_available_window(
 p_owner uuid,p_business uuid,p_agent uuid,p_service uuid,
 p_date text,p_time text,p_name text,p_key text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 a public.vmv_ai_agents%rowtype; svc public.vmv_ai_booking_services%rowtype;
 w public.vmv_ai_booking_availability%rowtype;
 v_day date;v_clock time;v_local timestamp;v_start timestamptz;v_end timestamptz;
 v_slot public.vmv_ai_booking_slots%rowtype;v_existing public.vmv_ai_bookings%rowtype;
 v_id uuid;v_status text;
begin
 if p_owner is null or p_business is null or p_agent is null or p_service is null or
  p_date !~ '^20[0-9]{2}-[01][0-9]-[0-3][0-9]$' or
  p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
  length(btrim(coalesce(p_name,''))) not between 2 and 80 or
  p_key !~ '^web-[a-f0-9]{48}$' then return null;end if;
 begin
  v_day:=p_date::date; v_clock:=p_time::time;
  if to_char(v_day,'YYYY-MM-DD')<>p_date then return null;end if;
 exception when others then return null;end;
 -- The same lock serializes booking and availability deletion for this business.
 perform pg_advisory_xact_lock(hashtext('vmv_agent_booking:'||p_business::text));
 select * into v_existing from public.vmv_ai_bookings
 where owner_id=p_owner and request_key=p_key limit 1;
 if found then
  if v_existing.business_id<>p_business or v_existing.service_id<>p_service then return null;end if;
  select s.start_at,s.end_at into v_start,v_end from public.vmv_ai_booking_slots s where s.id=v_existing.slot_id;
  return jsonb_build_object('id',v_existing.id,'status',v_existing.status,
    'start_at',v_start,'end_at',v_end,'already_created',true);
 end if;
 select * into a from public.vmv_ai_agents
 where id=p_agent and owner_id=p_owner and business_id=p_business and status='active';
 if not found or a.configuration->>'cap_bookings'<>'Sí' then return null;end if;
 if not exists(select 1 from public.vmv_ai_businesses b
  where b.id=p_business and b.owner_id=p_owner and b.primary_agent_id=p_agent) then return null;end if;
 select * into svc from public.vmv_ai_booking_services
 where id=p_service and owner_id=p_owner and business_id=p_business and active and approved;
 if not found then return null;end if;
 v_local:=v_day+v_clock;
 v_start:=v_local at time zone svc.time_zone;
 if (v_start at time zone svc.time_zone)<>v_local or
  v_start<=now()+interval '5 minutes' or v_start>now()+interval '90 days' then return null;end if;
 v_end:=v_start+make_interval(mins=>svc.duration_minutes);
 -- Reject nonexistent or ambiguous end times that would cross a DST transition.
 if (v_end at time zone svc.time_zone)::date<>v_day then return null;end if;
 select * into w from public.vmv_ai_booking_availability
 where owner_id=p_owner and business_id=p_business and day=v_day
   and time_zone=svc.time_zone and start_local<=v_clock
   and (v_end at time zone svc.time_zone)::time<=end_local
 order by start_local limit 1;
 if not found then return null;end if;
 -- Existing manual slots and reservations of ANY service block these same minutes.
 if exists(select 1 from public.vmv_ai_bookings b
   join public.vmv_ai_booking_slots s on s.id=b.slot_id
   where b.owner_id=p_owner and b.business_id=p_business
    and b.status in ('requested','confirmed') and
    tstzrange(s.start_at,s.end_at,'[)') && tstzrange(v_start,v_end,'[)')) then return null;end if;
 select * into v_slot from public.vmv_ai_booking_slots
 where owner_id=p_owner and business_id=p_business and service_id=svc.id
 and active and start_at=v_start and end_at=v_end for update;
 if not found then
  insert into public.vmv_ai_booking_slots(owner_id,business_id,service_id,start_at,end_at,capacity,active)
  values(p_owner,p_business,p_service,v_start,v_end,1,true) returning * into v_slot;
 end if;
 -- Owner must explicitly allow automatic confirmation, otherwise this is a pending request
 -- that still occupies the selected time until reviewed.
 v_status:=case when svc.auto_confirm and a.configuration->>'perm_book_service'='Sí'
   then 'confirmed' else 'requested' end;
 insert into public.vmv_ai_bookings(
  owner_id,business_id,agent_id,service_id,slot_id,customer_name,status,source,
  request_key,availability_id
 ) values(p_owner,p_business,p_agent,p_service,v_slot.id,btrim(p_name),v_status,'web_chat',p_key,w.id)
 returning id into v_id;
 return jsonb_build_object('id',v_id,'status',v_status,'start_at',v_start,
  'end_at',v_end,'service_name',svc.name,'duration_minutes',svc.duration_minutes,
  'already_created',false);
end $$;
revoke all on function public.vmv_ai_book_available_window(uuid,uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_book_available_window(uuid,uuid,uuid,uuid,text,text,text,text) to service_role;
comment on function public.vmv_ai_book_available_window(uuid,uuid,uuid,uuid,text,text,text,text) is
 'Service-role only: checks verified agent, owner-approved availability, duration, permissions, exact time and existing reservations atomically; never collects payment or sends messages.';

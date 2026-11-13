-- VMV AI Agents internal agenda, isolated from other projects / calendars.
-- Merchant-created slots are the sole source of bookable availability.
create table if not exists public.vmv_ai_booking_services(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid not null references public.vmv_ai_businesses(id) on delete cascade,
 name text not null check(length(trim(name)) between 2 and 120),
 description text not null default '' check(length(description)<=700),
 duration_minutes integer not null check(duration_minutes between 15 and 240),
 price_cents integer check(price_cents is null or price_cents between 0 and 10000000),
 currency text not null default 'usd' check(currency='usd'),
 approved boolean not null default false,
 active boolean not null default true,
 auto_confirm boolean not null default false,
 updated_at timestamptz not null default now()
);
create index if not exists vmv_ai_booking_service_owner
 on public.vmv_ai_booking_services(owner_id,business_id);
create table if not exists public.vmv_ai_booking_slots(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid not null references public.vmv_ai_businesses(id) on delete cascade,
 service_id uuid not null references public.vmv_ai_booking_services(id) on delete cascade,
 start_at timestamptz not null,
 end_at timestamptz not null,
 capacity integer not null default 1 check(capacity between 1 and 20),
 active boolean not null default true,
 check(end_at>start_at and end_at<=start_at+interval '4 hours'),
 unique(service_id,start_at)
);
create index if not exists vmv_ai_booking_slots_service
 on public.vmv_ai_booking_slots(service_id,start_at);
create or replace function public.vmv_ai_booking_slot_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare svc record;
begin
 select owner_id,business_id,duration_minutes into svc
 from public.vmv_ai_booking_services where id=new.service_id;
 if not found or svc.owner_id<>new.owner_id or svc.business_id<>new.business_id then
  raise exception 'Booking service owner mismatch';
 end if;
 if extract(epoch from(new.end_at-new.start_at))/60<>svc.duration_minutes then
  raise exception 'Slot duration must match approved service';
 end if;
 perform pg_advisory_xact_lock(hashtext('vmv_ai_slot:'||new.service_id::text));
 if exists(select 1 from public.vmv_ai_booking_slots other
    where other.service_id=new.service_id and other.active and other.id<>new.id
      and tstzrange(other.start_at,other.end_at,'[)') &&
          tstzrange(new.start_at,new.end_at,'[)')) then
   raise exception 'Overlapping appointment slot';
 end if;
 return new;
end $$;
create trigger vmv_ai_booking_slots_validate before insert or update
 on public.vmv_ai_booking_slots for each row
 execute function public.vmv_ai_booking_slot_guard();

create table if not exists public.vmv_ai_bookings(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid not null references public.vmv_ai_businesses(id) on delete cascade,
 agent_id uuid not null references public.vmv_ai_agents(id) on delete cascade,
 service_id uuid not null references public.vmv_ai_booking_services(id) on delete cascade,
 slot_id uuid not null references public.vmv_ai_booking_slots(id) on delete cascade,
 call_sid text unique check(call_sid ~ '^CA[a-fA-F0-9]{32}$'),
 customer_name text not null check(length(trim(customer_name)) between 2 and 80),
 status text not null check(status in('requested','confirmed','canceled')),
 source text not null default 'ai_phone_test' check(source='ai_phone_test'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists vmv_ai_bookings_slot_active
 on public.vmv_ai_bookings(slot_id,status);
create index if not exists vmv_ai_bookings_owner
 on public.vmv_ai_bookings(owner_id,created_at desc);
create table if not exists public.vmv_ai_booking_quotes(
 call_sid text primary key references public.vmv_ai_voice_calls(call_sid) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 agent_id uuid not null references public.vmv_ai_agents(id) on delete cascade,
 service_id uuid not null references public.vmv_ai_booking_services(id) on delete cascade,
 slot_id uuid not null references public.vmv_ai_booking_slots(id) on delete cascade,
 customer_name text not null default '',
 expires_at timestamptz not null,
 updated_at timestamptz not null default now()
);

alter table public.vmv_ai_booking_services enable row level security;
alter table public.vmv_ai_booking_slots enable row level security;
alter table public.vmv_ai_bookings enable row level security;
alter table public.vmv_ai_booking_quotes enable row level security;
create policy vmv_ai_booking_services_read on public.vmv_ai_booking_services
 for select to authenticated using(owner_id=(select auth.uid()));
create policy vmv_ai_booking_services_add on public.vmv_ai_booking_services
 for insert to authenticated with check(owner_id=(select auth.uid()) and exists(
  select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
create policy vmv_ai_booking_services_edit on public.vmv_ai_booking_services
 for update to authenticated using(owner_id=(select auth.uid()))
 with check(owner_id=(select auth.uid()) and exists(
  select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
create policy vmv_ai_booking_slots_read on public.vmv_ai_booking_slots for select to authenticated
 using(owner_id=(select auth.uid()));
create policy vmv_ai_booking_slots_add on public.vmv_ai_booking_slots for insert to authenticated
 with check(owner_id=(select auth.uid()) and exists(
  select 1 from public.vmv_ai_booking_services s
  where s.id=service_id and s.owner_id=(select auth.uid()) and s.business_id=business_id));
create policy vmv_ai_booking_slots_edit on public.vmv_ai_booking_slots for update to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and exists(
  select 1 from public.vmv_ai_booking_services s
  where s.id=service_id and s.owner_id=(select auth.uid()) and s.business_id=business_id));
create policy vmv_ai_bookings_owner_read on public.vmv_ai_bookings for select to authenticated
 using(owner_id=(select auth.uid()));
revoke all on public.vmv_ai_booking_services,public.vmv_ai_booking_slots,
 public.vmv_ai_bookings,public.vmv_ai_booking_quotes from anon,authenticated;
grant select,insert,update on public.vmv_ai_booking_services to authenticated;
grant select,insert,update on public.vmv_ai_booking_slots to authenticated;
grant select on public.vmv_ai_bookings to authenticated;

create or replace function public.vmv_ai_phone_booking_quote(
 p_call_sid text,p_service uuid,p_slot uuid,p_customer_name text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare c record; svc record; sl record; reserved integer;
begin
 if p_customer_name is null or length(trim(p_customer_name))>80 then return false;end if;
 select owner_id,agent_id,expires_at,agent_snapshot into c
 from public.vmv_ai_voice_calls where call_sid=p_call_sid and expires_at>now();
 if not found or c.agent_snapshot->'configuration'->>'cap_bookings'<>'Sí' then return false;end if;
 select * into svc from public.vmv_ai_booking_services
 where id=p_service and owner_id=c.owner_id and approved and active;
 if not found then return false;end if;
 select * into sl from public.vmv_ai_booking_slots
 where id=p_slot and service_id=p_service and owner_id=c.owner_id
  and business_id=svc.business_id and active and start_at>now()+interval '5 minutes'
  and start_at<now()+interval '90 days' for update;
 if not found then return false;end if;
 select count(*) into reserved from public.vmv_ai_bookings
 where slot_id=p_slot and status in('requested','confirmed');
 if reserved>=sl.capacity then return false; end if;
 insert into public.vmv_ai_booking_quotes(call_sid,owner_id,agent_id,service_id,slot_id,customer_name,expires_at)
 values(p_call_sid,c.owner_id,c.agent_id,p_service,p_slot,trim(p_customer_name),least(c.expires_at,now()+interval '8 minutes'))
 on conflict(call_sid) do update set service_id=excluded.service_id,slot_id=excluded.slot_id,
  customer_name=excluded.customer_name,expires_at=excluded.expires_at,updated_at=now()
 where public.vmv_ai_booking_quotes.owner_id=excluded.owner_id
  and public.vmv_ai_booking_quotes.agent_id=excluded.agent_id;
 return true;
end $$;
revoke all on function public.vmv_ai_phone_booking_quote(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_phone_booking_quote(text,uuid,uuid,text) to service_role;

create or replace function public.vmv_ai_phone_booking_accept(p_call_sid text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare q record; slot record; svc record; old_id uuid; total integer; answer uuid;
begin
 select id into old_id from public.vmv_ai_bookings where call_sid=p_call_sid;
 if old_id is not null then return old_id;end if;
 select * into q from public.vmv_ai_booking_quotes
 where call_sid=p_call_sid and expires_at>now() for update;
 if not found or length(trim(q.customer_name))<2 then return null;end if;
 select * into svc from public.vmv_ai_booking_services
 where id=q.service_id and owner_id=q.owner_id and active and approved;
 if not found then return null;end if;
 select * into slot from public.vmv_ai_booking_slots
 where id=q.slot_id and service_id=q.service_id and owner_id=q.owner_id
 and active and start_at>now()+interval '5 minutes' for update;
 if not found then return null;end if;
 select count(*) into total from public.vmv_ai_bookings
 where slot_id=q.slot_id and status in('requested','confirmed');
 if total>=slot.capacity then return null;end if;
 insert into public.vmv_ai_bookings(owner_id,business_id,agent_id,service_id,slot_id,
  customer_name,call_sid,status)
 values(q.owner_id,svc.business_id,q.agent_id,q.service_id,q.slot_id,q.customer_name,p_call_sid,
  case when svc.auto_confirm and exists(
   select 1 from public.vmv_ai_voice_calls v where v.call_sid=p_call_sid
    and v.agent_snapshot->'configuration'->>'perm_book_service'='Sí')
   then 'confirmed' else 'requested' end)
 on conflict(call_sid) do nothing returning id into answer;
 return coalesce(answer,(select id from public.vmv_ai_bookings where call_sid=p_call_sid));
end $$;
revoke all on function public.vmv_ai_phone_booking_accept(text) from public,anon,authenticated;
grant execute on function public.vmv_ai_phone_booking_accept(text) to service_role;

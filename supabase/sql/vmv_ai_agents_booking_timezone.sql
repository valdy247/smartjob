-- Authoritative business-local slot creation; no client timezone assumptions.
alter table public.vmv_ai_booking_services
 add column if not exists time_zone text not null default 'America/New_York';
alter table public.vmv_ai_booking_services add constraint vmv_ai_booking_timezone_allowed
 check(time_zone in ('America/New_York','America/Chicago','America/Denver',
  'America/Los_Angeles','America/Phoenix','America/Anchorage',
  'Pacific/Honolulu','America/Puerto_Rico'));

create or replace function public.vmv_ai_owner_add_booking_slot(
 p_service_id uuid,p_date text,p_time text,p_capacity integer)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare svc record; local_clock timestamp; absolute timestamptz; slot_id uuid;
begin
 if (select auth.uid()) is null or p_date !~ '^20[0-9]{2}-[01][0-9]-[0-3][0-9]$'
  or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or p_capacity not between 1 and 20 then return null;end if;
 select * into svc from public.vmv_ai_booking_services
 where id=p_service_id and owner_id=(select auth.uid());
 if not found then return null;end if;
 begin
  local_clock:=(p_date||' '||p_time)::timestamp;
  absolute:=local_clock at time zone svc.time_zone;
 exception when others then return null;end;
 -- Reject nonexistent civil times during daylight-saving transitions.
 if (absolute at time zone svc.time_zone)<>local_clock then return null;end if;
 if absolute<=now()+interval '5 minutes' or
    absolute>now()+interval '90 days' then return null;end if;
 insert into public.vmv_ai_booking_slots(
  owner_id,business_id,service_id,start_at,end_at,capacity)
 values(svc.owner_id,svc.business_id,svc.id,absolute,
  absolute+make_interval(mins=>svc.duration_minutes),p_capacity)
 returning id into slot_id;
 return slot_id;
end $$;
revoke all on function public.vmv_ai_owner_add_booking_slot(uuid,text,text,integer)
 from public,anon,authenticated;
grant execute on function public.vmv_ai_owner_add_booking_slot(uuid,text,text,integer)
 to authenticated;

create or replace function public.vmv_ai_booking_slot_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare svc record; occupied integer;
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
 if tg_op='UPDATE' then
  select count(*) into occupied from public.vmv_ai_bookings
   where slot_id=old.id and status in('requested','confirmed');
  if occupied>0 and
    (new.start_at<>old.start_at or new.end_at<>old.end_at or
      new.capacity<occupied or not new.active) then
    raise exception 'Cannot alter a slot with active reservations';
  end if;
 end if;
 if new.active and exists(select 1 from public.vmv_ai_booking_slots other
    where other.service_id=new.service_id and other.active and other.id<>new.id
      and tstzrange(other.start_at,other.end_at,'[)') &&
          tstzrange(new.start_at,new.end_at,'[)')) then
   raise exception 'Overlapping appointment slot';
 end if;
 return new;
end $$;

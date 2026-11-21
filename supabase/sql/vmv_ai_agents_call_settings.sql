-- AI Agents call-routing settings only. Existing Smart Call tables/logic untouched.
-- A route is owner-scoped and the original Twilio webhook remains the rollback.
create table if not exists public.vmv_ai_call_settings(
 route_id uuid primary key references public.smartjob_phone_routes(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 agent_enabled boolean not null default false,
 translation_enabled boolean not null default true,
 agent_mode text not null default 'always' check(agent_mode in('always','schedule','after_no_answer')),
 translation_mode text not null default 'always' check(translation_mode in('always','schedule')),
 coexistence text not null default 'menu' check(coexistence in('menu','agent_first','translation_first')),
 outside_action text not null default 'translation' check(outside_action in('translation','message')),
 ring_seconds smallint not null default 18 check(ring_seconds between 10 and 30),
 time_zone text not null default 'America/New_York' check(time_zone in(
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'America/Phoenix','America/Anchorage','Pacific/Honolulu','America/Puerto_Rico')),
 use_business_hours boolean not null default false,
 schedule jsonb not null default '{"mon":{"enabled":true,"start":"09:00","end":"17:00"},"tue":{"enabled":true,"start":"09:00","end":"17:00"},"wed":{"enabled":true,"start":"09:00","end":"17:00"},"thu":{"enabled":true,"start":"09:00","end":"17:00"},"fri":{"enabled":true,"start":"09:00","end":"17:00"},"sat":{"enabled":false,"start":"09:00","end":"17:00"},"sun":{"enabled":false,"start":"09:00","end":"17:00"}}'::jsonb,
 closed_message text not null default 'Gracias por llamar. Nuestro negocio no está disponible en este momento.',
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 constraint vmv_ai_call_schedule_object check(jsonb_typeof(schedule)='object'),
 constraint vmv_ai_call_message_len check(length(closed_message) between 5 and 220),
 constraint vmv_ai_call_both_disabled check(agent_enabled or translation_enabled)
);
create index if not exists vmv_ai_call_settings_owner on public.vmv_ai_call_settings(owner_id);
alter table public.vmv_ai_call_settings enable row level security;
-- Policies validate both the user's identity and ownership of the exact number.
create policy vmv_ai_call_owner_read on public.vmv_ai_call_settings for select to authenticated
 using(owner_id=(select auth.uid()) and exists(
  select 1 from public.smartjob_phone_routes r
  where r.id=route_id and r.user_id=(select auth.uid()) and r.enabled));
create policy vmv_ai_call_owner_insert on public.vmv_ai_call_settings for insert to authenticated
 with check(owner_id=(select auth.uid()) and exists(
  select 1 from public.smartjob_phone_routes r
  where r.id=route_id and r.user_id=(select auth.uid()) and r.enabled));
create policy vmv_ai_call_owner_update on public.vmv_ai_call_settings for update to authenticated
 using(owner_id=(select auth.uid()) and exists(
  select 1 from public.smartjob_phone_routes r
  where r.id=route_id and r.user_id=(select auth.uid()) and r.enabled))
 with check(owner_id=(select auth.uid()) and exists(
  select 1 from public.smartjob_phone_routes r
  where r.id=route_id and r.user_id=(select auth.uid()) and r.enabled));
-- Server validators are additionally enforced in a trigger to protect direct API calls.
create or replace function public.vmv_ai_call_settings_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare d text; entry jsonb; tm text;
begin
 if tg_op='UPDATE' then
  if new.route_id<>old.route_id or new.owner_id<>old.owner_id then
    raise exception 'Call settings ownership is immutable';
  end if;
  new.version=old.version+1;
 end if;
 foreach d in array array['mon','tue','wed','thu','fri','sat','sun'] loop
  entry:=new.schedule->d;
  if jsonb_typeof(entry)<>'object' or jsonb_typeof(entry->'enabled')<>'boolean' then
   raise exception 'Invalid weekly schedule day: %',d;
  end if;
  foreach tm in array array[entry->>'start',entry->>'end'] loop
   if tm is null or tm!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Invalid weekly hours for %',d;
   end if;
  end loop;
  if entry->>'start'=entry->>'end' then
   raise exception 'Schedule opening and closing hours cannot match';
  end if;
 end loop;
 new.updated_at=now();
 return new;
end $$;
create trigger vmv_ai_call_settings_validate
 before insert or update on public.vmv_ai_call_settings
 for each row execute function public.vmv_ai_call_settings_guard();
revoke all on public.vmv_ai_call_settings from anon,authenticated;
grant select,insert,update on public.vmv_ai_call_settings to authenticated;

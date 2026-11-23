-- Independent agent/translation schedules for the existing owner-scoped call policy.
-- Backfill existing settings with the old shared schedule (no silent change).
alter table public.vmv_ai_call_settings add column if not exists translation_schedule jsonb
 not null default '{"mon":{"enabled":true,"start":"09:00","end":"17:00"},"tue":{"enabled":true,"start":"09:00","end":"17:00"},"wed":{"enabled":true,"start":"09:00","end":"17:00"},"thu":{"enabled":true,"start":"09:00","end":"17:00"},"fri":{"enabled":true,"start":"09:00","end":"17:00"},"sat":{"enabled":false,"start":"09:00","end":"17:00"},"sun":{"enabled":false,"start":"09:00","end":"17:00"}}'::jsonb;
-- Preserve prior schedule for those who configured calls before this update.
update public.vmv_ai_call_settings set translation_schedule=schedule
 where version>0;
create or replace function public.vmv_ai_call_settings_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare d text;entry jsonb;tm text;week jsonb;
begin
 if tg_op='UPDATE' then
  if new.route_id<>old.route_id or new.owner_id<>old.owner_id then
   raise exception 'Call settings ownership is immutable';
  end if;
  new.version=old.version+1;
 end if;
 foreach week in array array[new.schedule,new.translation_schedule] loop
  if jsonb_typeof(week)<>'object' then
   raise exception 'Call schedule must be an object';
  end if;
  foreach d in array array['mon','tue','wed','thu','fri','sat','sun'] loop
   entry:=week->d;
   if jsonb_typeof(entry)<>'object' or jsonb_typeof(entry->'enabled')<>'boolean' then
    raise exception 'Invalid weekly schedule day: %',d;
   end if;
   foreach tm in array array[entry->>'start',entry->>'end'] loop
    if tm is null or tm!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then
     raise exception 'Invalid weekly hours for %',d;
    end if;
   end loop;
   if entry->>'start'=entry->>'end' then
    raise exception 'Opening and closing hours cannot match';
   end if;
  end loop;
 end loop;
 new.updated_at=now();
 return new;
end $$;

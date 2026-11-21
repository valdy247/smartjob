-- VMV Signup: explicitly opt-in to future bookable weekly hours.
-- Security invoker, owner-only, using the central business profile as the single schedule authority.
-- The selected window remains editable in Mi disponibilidad; no appointments are booked by signup.
create or replace function public.vmv_ai_owner_seed_signup_availability(
 p_workspace uuid,p_zone text,p_days integer default 60
) returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_hours jsonb; v_enabled boolean; v_day date; v_entry jsonb;
 v_count integer:=0; v_slot uuid; v_start text; v_end text;
 v_index integer; v_today date;
begin
 if auth.uid() is null or p_workspace is null or p_days not between 1 and 60 or
 p_zone not in ('America/New_York','America/Chicago','America/Denver',
 'America/Los_Angeles','America/Phoenix','America/Anchorage',
 'Pacific/Honolulu','America/Puerto_Rico') then return 0;end if;
 select m.hours,m.hours_enabled into v_hours,v_enabled
 from public.vmv_ai_businesses w join public.vmv_marketing_businesses m
 on w.central_business_id=m.id and w.owner_id=m.owner_id
 where w.id=p_workspace and w.owner_id=auth.uid() and m.owner_id=auth.uid();
 if not found or not v_enabled or jsonb_typeof(v_hours)<>'array' or jsonb_array_length(v_hours)<>7 then return 0;end if;
 v_today:=(now() at time zone p_zone)::date;
 for v_index in 0..p_days-1 loop
  v_day:=v_today+v_index;
  v_entry:=v_hours->(extract(isodow from v_day)::integer-1);
  if coalesce(v_entry->>'closed','true')<>'false' then continue;end if;
  v_start:=v_entry->>'start';v_end:=v_entry->>'end';
  if v_start is null or v_end is null or
   v_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
   v_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
   v_start>=v_end then continue;end if;
  v_slot:=public.vmv_ai_owner_add_availability(
   p_workspace,to_char(v_day,'YYYY-MM-DD'),v_start,v_end,p_zone
  );
  if v_slot is not null then v_count:=v_count+1;end if;
 end loop;
 return v_count;
end $$;
revoke all on function public.vmv_ai_owner_seed_signup_availability(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.vmv_ai_owner_seed_signup_availability(uuid,text,integer) to authenticated;
comment on function public.vmv_ai_owner_seed_signup_availability(uuid,text,integer) is
 'Owner-only opt-in: publishes up to 60 days of central business hours as bookable availability. Existing bookings and other owners are never modified.';

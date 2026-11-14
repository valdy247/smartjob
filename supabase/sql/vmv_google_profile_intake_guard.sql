-- Additive guard: browser validation is helpful, but direct REST inserts must obey
-- the same intake contract. Existing requests remain readable and actionable.
create or replace function public.vmv_google_profile_intake_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare g jsonb; h jsonb; m jsonb; field text; maxlen int; seen text[] := '{}'; path text;
begin
 if new.service_code <> 'google_profile' then return new; end if;
 if tg_op='UPDATE' then
  if new.status='verified' and old.status is distinct from new.status and
   coalesce(new.evidence_url,'') !~ '^https://(www[.])?(google[.]com/maps([/?]|$)|maps[.]google[.]com/|maps[.]app[.]goo[.]gl/|goo[.]gl/maps/)'
  then raise exception using errcode='23514',message='A public Google Maps profile is required as completion evidence'; end if;
  return new;
 end if;
 g:=new.google_profile_data;
 if g is null or jsonb_typeof(g)<>'object' or
  coalesce(g->>'action','') not in ('create','claim','improve') or
  coalesce(g->>'kind','') not in ('storefront','service_area','hybrid') or
  coalesce(g->>'country','') !~ '^[A-Z]{2}$' or
  length(btrim(coalesce(g->>'googleCategory',''))) not between 1 and 100
 then raise exception using errcode='23514',message='Invalid Google profile intake'; end if;
 for field,maxlen in select * from (values
  ('otherCategories',250),('street',250),('unit',250),('city',250),('region',250),('postal',250),
  ('serviceAreas',400),('phone',32),('secondaryPhone',32),('description',750),('services',900),('products',900),
  ('bookingUrl',250),('existingProfileUrl',500),('openingDate',10)
 ) as limits(field,maxlen) loop
  if g ? field and (jsonb_typeof(g->field)<>'string' or length(g->>field)>maxlen) then
   raise exception using errcode='23514',message='Invalid Google profile field'; end if;
 end loop;
 if g->>'kind'<>'service_area' and (
  btrim(coalesce(g->>'street',''))='' or btrim(coalesce(g->>'city',''))='' or
  btrim(coalesce(g->>'region',''))='' or btrim(coalesce(g->>'postal',''))='')
 then raise exception using errcode='23514',message='A customer-facing address is required'; end if;
 if g->>'kind'<>'storefront' and btrim(coalesce(g->>'serviceAreas',''))=''
 then raise exception using errcode='23514',message='Service areas are required'; end if;
 -- Never retain a private residential address for a service-area intake.
 if g->>'kind'='service_area' then
  g:=g||jsonb_build_object('street','','unit','','city','','region','','postal','');
 end if;
 if g->>'action'<>'create' then g:=g||jsonb_build_object('openingDate','');
 elsif coalesce(g->>'openingDate','')<>'' then
  if g->>'openingDate' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((g->>'openingDate')::date,'YYYY-MM-DD')<>g->>'openingDate'
  then raise exception using errcode='23514',message='Invalid opening date'; end if;
 end if;
 foreach field in array array['phone','secondaryPhone'] loop
  if coalesce(g->>field,'')<>'' and (g->>field !~ '^\+[1-9][0-9]{7,14}$' or
   (g->>field like '+1%' and length(g->>field)<>12))
  then raise exception using errcode='23514',message='Use an international telephone number'; end if;
 end loop;
 foreach field in array array['bookingUrl','existingProfileUrl'] loop
  if coalesce(g->>field,'')<>'' and g->>field !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'
  then raise exception using errcode='23514',message='Invalid Google profile link'; end if;
 end loop;
 if coalesce(g->>'description','') ~* '(https?://|www[.])'
 then raise exception using errcode='23514',message='Business description cannot contain links'; end if;
 if jsonb_typeof(g->'hoursEnabled') is distinct from 'boolean' or jsonb_typeof(g->'hours') is distinct from 'array'
 then raise exception using errcode='23514',message='Invalid business hours'; end if;
 if jsonb_array_length(g->'hours')<>7
 then raise exception using errcode='23514',message='Seven days are required'; end if;
 if g->>'hoursEnabled'='true' then
  if not exists(select 1 from jsonb_array_elements(g->'hours') x where x->>'closed'='false')
  then raise exception using errcode='23514',message='Select at least one open day'; end if;
  for h in select value from jsonb_array_elements(g->'hours') loop
   if jsonb_typeof(h->'closed') is distinct from 'boolean' or (h->>'closed'='false' and (
    coalesce(h->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
    coalesce(h->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or h->>'start'=h->>'end'))
   then raise exception using errcode='23514',message='Invalid opening or closing time'; end if;
  end loop;
 end if;
 if new.business_id is not null and not exists(select 1 from public.vmv_marketing_businesses b where b.id=new.business_id and b.owner_id=new.owner_id)
 then raise exception using errcode='23514',message='Business belongs to another account'; end if;
 if jsonb_typeof(g->'media') is distinct from 'array'
 then raise exception using errcode='23514',message='Invalid media list'; end if;
 if jsonb_array_length(g->'media')>10
 then raise exception using errcode='23514',message='Too many images'; end if;
 for m in select value from jsonb_array_elements(g->'media') loop
  path:=m->>'path';
  if coalesce(m->>'kind','') !~ '^(logo|cover|photo-[1-8])$' or m->>'kind'=any(seen) or
   path is null or path not like new.owner_id::text||'/'||new.id::text||'/%' or path ~ '(^|/)\.\.(/|$)' or
   not exists(select 1 from storage.objects o where o.bucket_id='vmv-google-media' and o.name=path
    and (o.metadata->>'mimetype') in ('image/jpeg','image/png') and
    (o.metadata->>'size')::bigint between 10240 and 5242880)
  then raise exception using errcode='23514',message='An image is missing or does not belong to this request'; end if;
  seen:=array_append(seen,m->>'kind');
 end loop;
 new.google_profile_data:=g;
 return new;
end $$;
revoke all on function public.vmv_google_profile_intake_guard() from public,anon,authenticated;
drop trigger if exists vmv_google_profile_intake_guard_trg on public.vmv_marketing_requests;
create trigger vmv_google_profile_intake_guard_trg before insert or update on public.vmv_marketing_requests
 for each row execute function public.vmv_google_profile_intake_guard();

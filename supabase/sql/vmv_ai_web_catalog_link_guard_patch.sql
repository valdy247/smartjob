-- Keep an imported canonical product editable if a Web Studio card is later deleted.
-- Only validate origin at first link creation; do not reassign the link on UPDATE.
create or replace function public.vmv_ai_catalog_web_link_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
  if new.web_source_id is distinct from old.web_source_id then
   raise exception 'Web Studio source linkage cannot be reassigned';
  end if;
  return new;
 end if;
 if new.web_source_id is not null and
  not exists(select 1 from public.smartjob_web_intake_products w
    where w.owner_id=new.owner_id and exists(
      select 1 from jsonb_array_elements(w.items) card
      where card->>'id'=new.web_source_id::text)) then
  raise exception 'Source Web Studio card does not belong to owner';
 end if;
 return new;
end $$;

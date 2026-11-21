-- Server-side abuse control for the customer request queue.
create schema if not exists vmv_private;
revoke all on schema vmv_private from public, anon, authenticated;
create or replace function vmv_private.marketing_request_rate_guard()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,pg_temp
as $$
declare recent_count integer;
begin
 if auth.uid() is distinct from new.owner_id then
  raise exception 'Unauthorized marketing request owner';
 end if;
 -- Serialize concurrent inserts from the same account.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text,0));
 select count(*) into recent_count
 from public.vmv_marketing_requests r
 where r.owner_id=new.owner_id and r.created_at >= now()-interval '24 hours';
 if recent_count>=8 then
  raise exception 'Maximum of 8 marketing requests per 24 hours reached';
 end if;
 return new;
end;
$$;
revoke all on function vmv_private.marketing_request_rate_guard() from public,anon,authenticated;
drop trigger if exists vmv_marketing_request_rate_guard_trg on public.vmv_marketing_requests;
create trigger vmv_marketing_request_rate_guard_trg
before insert on public.vmv_marketing_requests
for each row execute function vmv_private.marketing_request_rate_guard();

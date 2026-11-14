-- VMV AI Agents: refer to Marketing's canonical business instead of copying a profile.
-- Existing AI workspace IDs, calls, catalog, bookings, and phone selection stay intact.
alter table public.vmv_ai_businesses
 add column if not exists central_business_id uuid;
alter table public.vmv_ai_businesses
 drop constraint if exists vmv_ai_businesses_owner_id_key;
create unique index if not exists vmv_ai_businesses_central_owner_unique
 on public.vmv_ai_businesses(owner_id,central_business_id)
 where central_business_id is not null;
create index if not exists vmv_ai_businesses_owner_idx
 on public.vmv_ai_businesses(owner_id);
alter table public.vmv_ai_businesses
 add constraint vmv_ai_businesses_central_owner_fk
 foreign key (owner_id,central_business_id)
 references public.vmv_marketing_businesses(owner_id,id)
 deferrable initially deferred;

-- This server-side operation never merges agents or phone lines.
-- Only the authenticated owner may create a technical AI workspace for
-- an existing canonical Marketing business.
create or replace function public.vmv_ai_workspace_for_central_business(
 p_central_business_id uuid)
returns uuid language plpgsql security invoker
set search_path=public,pg_temp as $$
declare u uuid;workspace uuid;business_name text;
begin
 u:=(select auth.uid());
 if u is null or p_central_business_id is null then
  raise exception 'Authentication and canonical business required';
 end if;
 select name into business_name from public.vmv_marketing_businesses
  where id=p_central_business_id and owner_id=u;
 if not found then raise exception 'Canonical business not owned by user';end if;
 perform pg_advisory_xact_lock(hashtext(u::text||':'||p_central_business_id::text));
 select id into workspace from public.vmv_ai_businesses
  where owner_id=u and central_business_id=p_central_business_id;
 if workspace is not null then return workspace;end if;
 insert into public.vmv_ai_businesses(owner_id,name,central_business_id)
 values(u,left(business_name,100),p_central_business_id)
 returning id into workspace;
 return workspace;
end $$;
revoke all on function public.vmv_ai_workspace_for_central_business(uuid) from public,anon;
grant execute on function public.vmv_ai_workspace_for_central_business(uuid) to authenticated;

-- An existing standalone AI pilot can be linked only by a deliberate owner action.
-- The legacy workspace ID remains unchanged, so historic calls/orders stay attached.
create or replace function public.vmv_ai_link_existing_workspace(
 p_workspace_id uuid,p_central_business_id uuid)
returns boolean language plpgsql security invoker
set search_path=public,pg_temp as $$
declare u uuid;existing uuid;
begin
 u:=(select auth.uid());
 if u is null then return false;end if;
 if not exists(select 1 from public.vmv_marketing_businesses
   where id=p_central_business_id and owner_id=u) then return false;end if;
 perform pg_advisory_xact_lock(hashtext(u::text||':'||p_central_business_id::text));
 select id into existing from public.vmv_ai_businesses
  where owner_id=u and central_business_id=p_central_business_id;
 if existing is not null and existing<>p_workspace_id then return false;end if;
 update public.vmv_ai_businesses
 set central_business_id=p_central_business_id
 where id=p_workspace_id and owner_id=u
   and (central_business_id is null or central_business_id=p_central_business_id);
 return found;
end $$;
revoke all on function public.vmv_ai_link_existing_workspace(uuid,uuid) from public,anon;
grant execute on function public.vmv_ai_link_existing_workspace(uuid,uuid) to authenticated;

-- Prevent mapping changes that could silently move an AI workspace across businesses.
create or replace function public.vmv_ai_workspace_link_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and old.central_business_id is not null and
    new.central_business_id is distinct from old.central_business_id then
  raise exception 'Canonical business link is immutable';
 end if;
 return new;
end $$;
drop trigger if exists vmv_ai_workspace_link_guard on public.vmv_ai_businesses;
create trigger vmv_ai_workspace_link_guard before update on public.vmv_ai_businesses
 for each row execute function public.vmv_ai_workspace_link_guard();

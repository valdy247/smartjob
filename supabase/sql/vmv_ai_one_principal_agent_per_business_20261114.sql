-- VMV Business: one explicitly selected principal AI identity per workspace.
-- Additive: existing agents, telephone selections and conversations are unchanged.
alter table public.vmv_ai_businesses
  add column if not exists primary_agent_id uuid null;

alter table public.vmv_ai_businesses
  add constraint vmv_ai_business_primary_agent_fk
  foreign key (primary_agent_id) references public.vmv_ai_agents(id) on delete set null;

-- RLS alone ensures same owner but not same business. Validate the whole relation,
-- including direct REST writes (not just the selector RPC).
create or replace function public.vmv_ai_primary_agent_guard()
returns trigger language plpgsql security invoker
set search_path = '' as $$
begin
  if new.primary_agent_id is not null and not exists (
    select 1 from public.vmv_ai_agents a
    where a.id=new.primary_agent_id and a.owner_id=new.owner_id
      and a.business_id=new.id
  ) then
    raise exception 'primary_agent_must_belong_to_business'
      using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists vmv_ai_primary_agent_guard_trigger on public.vmv_ai_businesses;
create trigger vmv_ai_primary_agent_guard_trigger
  before insert or update of primary_agent_id,owner_id on public.vmv_ai_businesses
  for each row execute function public.vmv_ai_primary_agent_guard();

-- Authenticated owner explicitly chooses a single identity. Compare-and-swap
-- prevents silently overriding the choice made by another signed-in device.
create or replace function public.vmv_ai_select_primary_agent(
  p_workspace_id uuid, p_agent_id uuid, p_expected_id uuid default null
) returns boolean language plpgsql security invoker
set search_path = '' as $$
declare v_existing uuid; v_central uuid;
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt())->>'is_anonymous','false')='true' then
    return false;
  end if;
  select b.primary_agent_id,b.central_business_id
    into v_existing,v_central
    from public.vmv_ai_businesses b
    where b.id=p_workspace_id and b.owner_id=(select auth.uid())
    for update;
  if not found or v_central is null or
     v_existing is distinct from p_expected_id then
    return false;
  end if;
  if p_agent_id is not null and not exists (
    select 1 from public.vmv_ai_agents a
    where a.id=p_agent_id and a.owner_id=(select auth.uid())
      and a.business_id=p_workspace_id
  ) then
    return false;
  end if;
  update public.vmv_ai_businesses
    set primary_agent_id=p_agent_id
    where id=p_workspace_id and owner_id=(select auth.uid());
  return found;
end;
$$;
revoke all on function public.vmv_ai_select_primary_agent(uuid,uuid,uuid) from public,anon;
grant execute on function public.vmv_ai_select_primary_agent(uuid,uuid,uuid) to authenticated;

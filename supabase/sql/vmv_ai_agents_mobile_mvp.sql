-- VMV Business · AI Agents Studio · mobile-first foundation
-- REVIEW ONLY: do not apply to production until approved and tested.
-- Each business is owned by one authenticated VMV user in MVP; staff roles come later.
create extension if not exists pgcrypto;

create table if not exists public.vmv_ai_businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  unique(owner_id)
);

create table if not exists public.vmv_ai_agents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.vmv_ai_businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 80),
  kind text not null check(kind in ('calls','support','sales','bookings','inventory','operations','custom')),
  purpose text not null default '' check(char_length(purpose)<=240),
  personality text not null default 'amable' check(char_length(personality)<=60),
  language text not null default 'es' check(language in ('es','en','both')),
  instructions text not null default '' check(char_length(instructions)<=2500),
  knowledge text not null default '' check(char_length(knowledge)<=8000),
  status text not null default 'draft' check(status in ('draft','active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vmv_ai_agents_business_idx on public.vmv_ai_agents(business_id,updated_at desc);

create table if not exists public.vmv_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.vmv_ai_agents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Simulación' check(char_length(title)<=120),
  created_at timestamptz not null default now()
);
create index if not exists vmv_ai_conversations_agent_idx on public.vmv_ai_conversations(agent_id,created_at desc);

create table if not exists public.vmv_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.vmv_ai_conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('user','assistant')),
  content text not null check(char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists vmv_ai_messages_conversation_idx on public.vmv_ai_messages(conversation_id,created_at,id);

create table if not exists public.vmv_ai_daily_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null default (now() at time zone 'utc')::date,
  requests integer not null default 0 check(requests between 0 and 25),
  primary key(owner_id,usage_day)
);

alter table public.vmv_ai_businesses enable row level security;
alter table public.vmv_ai_agents enable row level security;
alter table public.vmv_ai_conversations enable row level security;
alter table public.vmv_ai_messages enable row level security;
alter table public.vmv_ai_daily_usage enable row level security;

create policy vmv_ai_business_owner_select on public.vmv_ai_businesses for select to authenticated
  using(owner_id=(select auth.uid()));
create policy vmv_ai_business_owner_insert on public.vmv_ai_businesses for insert to authenticated
  with check(owner_id=(select auth.uid()));
create policy vmv_ai_business_owner_update on public.vmv_ai_businesses for update to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

create policy vmv_ai_agent_owner_select on public.vmv_ai_agents for select to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
create policy vmv_ai_agent_owner_insert on public.vmv_ai_agents for insert to authenticated
  with check(owner_id=(select auth.uid()) and exists(select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
create policy vmv_ai_agent_owner_update on public.vmv_ai_agents for update to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())))
  with check(owner_id=(select auth.uid()) and exists(select 1 from public.vmv_ai_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));

create policy vmv_ai_conversation_owner_select on public.vmv_ai_conversations for select to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.vmv_ai_agents a where a.id=agent_id and a.owner_id=(select auth.uid())));
create policy vmv_ai_conversation_owner_insert on public.vmv_ai_conversations for insert to authenticated
  with check(owner_id=(select auth.uid()) and exists(select 1 from public.vmv_ai_agents a where a.id=agent_id and a.owner_id=(select auth.uid())));

create policy vmv_ai_message_owner_select on public.vmv_ai_messages for select to authenticated
  using(owner_id=(select auth.uid()) and exists(select 1 from public.vmv_ai_conversations c where c.id=conversation_id and c.owner_id=(select auth.uid())));
-- The authenticated owner may only append to conversations they own. Server-side
-- simulation is the only supported UI writer; no admin actions are offered.
create policy vmv_ai_message_owner_insert on public.vmv_ai_messages for insert to authenticated
  with check(owner_id=(select auth.uid()) and exists(select 1 from public.vmv_ai_conversations c where c.id=conversation_id and c.owner_id=(select auth.uid())));

create policy vmv_ai_usage_owner_read on public.vmv_ai_daily_usage for select to authenticated
  using(owner_id=(select auth.uid()));

-- Atomic per-owner daily cap, with explicit identity + Smart Job profile checks.
-- SECURITY DEFINER is limited to one audited mutation; no service keys on clients.
create or replace function public.vmv_ai_reserve_simulation(p_agent_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
  caller uuid := auth.uid();
  reserved boolean := false;
begin
  if caller is null
     or not exists(select 1 from public.smartjob_profiles p where p.id=caller)
     or not exists(select 1 from public.vmv_ai_agents a join public.vmv_ai_businesses b on b.id=a.business_id
       where a.id=p_agent_id and a.owner_id=caller and b.owner_id=caller) then
    return false;
  end if;
  insert into public.vmv_ai_daily_usage(owner_id,usage_day,requests)
    values(caller,(now() at time zone 'utc')::date,1)
    on conflict (owner_id,usage_day) do update
      set requests=public.vmv_ai_daily_usage.requests+1
      where public.vmv_ai_daily_usage.requests<25
    returning true into reserved;
  return coalesce(reserved,false);
end $$;
revoke all on function public.vmv_ai_reserve_simulation(uuid) from public,anon;
grant execute on function public.vmv_ai_reserve_simulation(uuid) to authenticated;

-- Only publishable-key clients with real sessions and RLS may query these tables.
revoke all on public.vmv_ai_businesses,public.vmv_ai_agents,public.vmv_ai_conversations,public.vmv_ai_messages,public.vmv_ai_daily_usage from anon;
grant select,insert,update on public.vmv_ai_businesses,public.vmv_ai_agents to authenticated;
grant select,insert on public.vmv_ai_conversations,public.vmv_ai_messages to authenticated;
grant select on public.vmv_ai_daily_usage to authenticated;

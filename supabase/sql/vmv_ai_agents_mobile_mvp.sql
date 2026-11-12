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
  -- Structured answers from the guided wizard, owned by the same business.
  configuration jsonb not null default '{}'::jsonb,
  constraint vmv_ai_agent_configuration_object check (jsonb_typeof(configuration)='object'),
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

-- OPTIONAL / NOT APPLIED: isolated inbound AI voice pilot on a SEPARATE number.
-- Do not use a Smart Call translation number for this without the Director's approval.
create table if not exists public.vmv_ai_voice_routes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 agent_id uuid not null references public.vmv_ai_agents(id) on delete cascade,
 twilio_number text not null unique check (twilio_number ~ '^\+[1-9][0-9]{7,14}),
 twilio_account_sid text not null check (twilio_account_sid ~ '^AC[a-fA-F0-9]{32}$'),
 enabled boolean not null default false,
 verified_ownership boolean not null default false,
 disclosure_approved boolean not null default false,
 approved_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.vmv_ai_voice_routes enable row level security;
create policy vmv_ai_voice_route_read on public.vmv_ai_voice_routes for select to authenticated
 using (owner_id=(select auth.uid()) and exists
 (select 1 from public.vmv_ai_agents a where a.id=agent_id and a.owner_id=(select auth.uid())));
-- No authenticated INSERT/UPDATE/DELETE: only an audited server-side enrollment
-- may attach a verified dedicated phone number after explicit owner approval.
revoke all on public.vmv_ai_voice_routes from anon,authenticated;
grant select on public.vmv_ai_voice_routes to authenticated;

create table if not exists public.vmv_ai_voice_calls (
 call_sid text primary key check (call_sid ~ '^CA[a-fA-F0-9]{32}$'),
 route_id uuid not null references public.vmv_ai_voice_routes(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 agent_id uuid not null references public.vmv_ai_agents(id) on delete cascade,
 started_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '4 minutes'),
 turn_count integer not null default 0 check (turn_count between 0 and 8)
);
create index if not exists vmv_ai_voice_daily on public.vmv_ai_voice_calls(route_id,started_at desc);
alter table public.vmv_ai_voice_calls enable row level security;
create policy vmv_ai_voice_calls_owner_read on public.vmv_ai_voice_calls for select to authenticated
 using (owner_id=(select auth.uid()));
revoke all on public.vmv_ai_voice_calls from anon,authenticated;
grant select on public.vmv_ai_voice_calls to authenticated;

-- Strictly server-only quota methods, absent from the public client grants.
-- The webhook must additionally verify Twilio HMAC signature and billing.
create or replace function public.vmv_ai_open_voice_call(p_route_id uuid,p_call_sid text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r record;
begin
 if p_call_sid !~ '^CA[a-fA-F0-9]{32}$' then return false; end if;
 perform pg_advisory_xact_lock(hashtext('vmv_ai_voice:'||p_route_id::text));
 select v.id,v.owner_id,v.agent_id into r
 from public.vmv_ai_voice_routes v
 join public.vmv_ai_agents a on a.id=v.agent_id and a.owner_id=v.owner_id
 join public.vmv_ai_businesses b on b.id=a.business_id and b.owner_id=v.owner_id
 where v.id=p_route_id and v.enabled=true and v.verified_ownership=true
  and v.disclosure_approved=true and v.approved_at is not null
  and a.status='active';
 if not found then return false; end if;
 if exists(select 1 from public.vmv_ai_voice_calls c where c.call_sid=p_call_sid)
 then return exists(select 1 from public.vmv_ai_voice_calls c where c.call_sid=p_call_sid and c.route_id=p_route_id); end if;
 if (select count(*) from public.vmv_ai_voice_calls
     where route_id=p_route_id and started_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=5 then return false; end if;
 insert into public.vmv_ai_voice_calls(call_sid,route_id,owner_id,agent_id)
 values (p_call_sid,p_route_id,r.owner_id,r.agent_id);
 return true;
exception when unique_violation then return false;
end $$;
revoke all on function public.vmv_ai_open_voice_call(uuid,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_open_voice_call(uuid,text) to service_role;

create or replace function public.vmv_ai_reserve_voice_turn(p_call_sid text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 update public.vmv_ai_voice_calls set turn_count=turn_count+1
 where call_sid=p_call_sid and expires_at>now() and turn_count<8
 returning turn_count into n;
 return coalesce(n,0);
end $$;
revoke all on function public.vmv_ai_reserve_voice_turn(text) from public,anon,authenticated;
grant execute on function public.vmv_ai_reserve_voice_turn(text) to service_role;

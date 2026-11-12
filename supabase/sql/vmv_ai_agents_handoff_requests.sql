-- AI Agents handoff requests: owner-scoped, idempotent, no raw audio and no auto-dial.
create table if not exists public.vmv_ai_human_requests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 agent_id uuid not null references public.vmv_ai_agents(id) on delete cascade,
 call_sid text not null unique check(call_sid ~ '^CA[a-fA-F0-9]{32}$'),
 status text not null default 'new' check(status in ('new','reviewed','closed')),
 summary text not null default 'Caller requested a person' check(length(summary)<=300),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists vmv_ai_human_owner_time
 on public.vmv_ai_human_requests(owner_id,created_at desc);
alter table public.vmv_ai_human_requests enable row level security;
create policy vmv_ai_human_owner_read on public.vmv_ai_human_requests for select to authenticated
 using(owner_id=(select auth.uid()));
create policy vmv_ai_human_owner_update on public.vmv_ai_human_requests for update to authenticated
 using(owner_id=(select auth.uid())) with check
 (owner_id=(select auth.uid()) and status in ('new','reviewed','closed'));
revoke all on public.vmv_ai_human_requests from anon,authenticated;
grant select,update(status,updated_at) on public.vmv_ai_human_requests to authenticated;
create or replace function public.vmv_ai_phone_request_human(p_call_sid text,p_summary text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare c record; found_req uuid;
begin
 if length(p_summary)>300 or p_call_sid !~ '^CA[a-fA-F0-9]{32}$' then return false; end if;
 select owner_id,agent_id into c from public.vmv_ai_voice_calls
  where call_sid=p_call_sid and expires_at>now();
 if not found then return false; end if;
 insert into public.vmv_ai_human_requests(owner_id,agent_id,call_sid,summary)
 values(c.owner_id,c.agent_id,p_call_sid,coalesce(nullif(trim(p_summary),''),'Caller requested a person'))
 on conflict(call_sid) do update set updated_at=now()
 returning id into found_req;
 return found_req is not null;
end $$;
revoke all on function public.vmv_ai_phone_request_human(text,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_phone_request_human(text,text) to service_role;

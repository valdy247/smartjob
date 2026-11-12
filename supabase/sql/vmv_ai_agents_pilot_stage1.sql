-- AI Agents only: additive revisioned agent configs and explicitly owner-selected telephone agent.
alter table public.vmv_ai_agents add column if not exists revision integer not null default 1 check(revision>0);

create or replace function public.vmv_ai_revision_bump() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.id <> old.id or new.owner_id <> old.owner_id or new.business_id <> old.business_id then
  raise exception 'Immutable agent owner and business';
 end if;
 new.revision=old.revision+1; new.updated_at=now(); return new;
end $$;
drop trigger if exists vmv_ai_agents_revision on public.vmv_ai_agents;
create trigger vmv_ai_agents_revision before update on public.vmv_ai_agents
for each row execute function public.vmv_ai_revision_bump();

create table if not exists public.vmv_ai_phone_selections (
 route_id uuid primary key references public.smartjob_phone_routes(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 agent_id uuid not null references public.vmv_ai_agents(id) on delete cascade,
 selected_at timestamptz not null default now()
);
alter table public.vmv_ai_phone_selections enable row level security;
create policy vmv_ai_selection_read on public.vmv_ai_phone_selections for select to authenticated
 using (owner_id=(select auth.uid()) and exists
  (select 1 from public.smartjob_phone_routes r where r.id=route_id and r.user_id=(select auth.uid()) and r.enabled));
create policy vmv_ai_selection_add on public.vmv_ai_phone_selections for insert to authenticated
 with check (owner_id=(select auth.uid()) and exists
  (select 1 from public.smartjob_phone_routes r where r.id=route_id and r.user_id=(select auth.uid()) and r.enabled)
  and exists (select 1 from public.vmv_ai_agents a where a.id=agent_id and a.owner_id=(select auth.uid())));
create policy vmv_ai_selection_edit on public.vmv_ai_phone_selections for update to authenticated
 using (owner_id=(select auth.uid())) with check
 (owner_id=(select auth.uid()) and exists
  (select 1 from public.smartjob_phone_routes r where r.id=route_id and r.user_id=(select auth.uid()) and r.enabled)
  and exists (select 1 from public.vmv_ai_agents a where a.id=agent_id and a.owner_id=(select auth.uid())));
create policy vmv_ai_selection_delete on public.vmv_ai_phone_selections for delete to authenticated
 using (owner_id=(select auth.uid()));
revoke all on public.vmv_ai_phone_selections from anon,authenticated;
grant select,insert,update,delete on public.vmv_ai_phone_selections to authenticated;

-- Voice call snapshots prevent another device's edits changing an in-progress conversation.
alter table public.vmv_ai_voice_calls
 add column if not exists agent_revision integer not null default 1,
 add column if not exists agent_snapshot jsonb not null default '{}'::jsonb,
 add column if not exists turns jsonb not null default '[]'::jsonb,
 add column if not exists preferred_language text not null default 'es',
 add column if not exists last_reply text not null default '',
 add column if not exists last_request_turn integer not null default 0;
alter table public.vmv_ai_voice_calls
 add constraint vmv_ai_calls_snapshot_object check(jsonb_typeof(agent_snapshot)='object'),
 add constraint vmv_ai_calls_turns_array check(jsonb_typeof(turns)='array');

create or replace function public.vmv_ai_open_voice_call(p_route_id uuid,p_call_sid text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare a record;
begin
 if p_call_sid !~ '^CA[a-fA-F0-9]{32}$' then return false; end if;
 perform pg_advisory_xact_lock(hashtext('vmv_ai_voice:'||p_route_id::text));
 select v.id,v.owner_id,v.agent_id,ag.revision,ag.name,ag.kind,ag.purpose,
        ag.personality,ag.language,ag.instructions,ag.knowledge,ag.configuration,
        b.name as business_name
 into a from public.vmv_ai_voice_routes v
 join public.vmv_ai_agents ag on ag.id=v.agent_id and ag.owner_id=v.owner_id
 join public.vmv_ai_businesses b on b.id=ag.business_id and b.owner_id=v.owner_id
 join public.smartjob_phone_routes sr on sr.twilio_number=v.twilio_number
     and sr.user_id=v.owner_id and sr.enabled
 join public.vmv_ai_phone_selections sel on sel.route_id=sr.id and sel.agent_id=ag.id and sel.owner_id=v.owner_id
 where v.id=p_route_id and v.enabled and v.verified_ownership
   and v.disclosure_approved and v.approved_at is not null and ag.status='active';
 if not found then return false; end if;
 if exists(select 1 from public.vmv_ai_voice_calls where call_sid=p_call_sid) then
  return exists(select 1 from public.vmv_ai_voice_calls where call_sid=p_call_sid and route_id=p_route_id);
 end if;
 if (select count(*) from public.vmv_ai_voice_calls
   where route_id=p_route_id and started_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=5 then return false; end if;
 insert into public.vmv_ai_voice_calls(call_sid,route_id,owner_id,agent_id,agent_revision,agent_snapshot,preferred_language)
 values(p_call_sid,p_route_id,a.owner_id,a.agent_id,a.revision,
  jsonb_build_object('name',a.name,'kind',a.kind,'purpose',a.purpose,'personality',a.personality,
    'language',a.language,'instructions',a.instructions,'knowledge',a.knowledge,
    'configuration',a.configuration,'business_name',a.business_name),
  case when a.language='en' then 'en' else 'es' end);
 return true;
exception when unique_violation then return false;
end $$;
revoke all on function public.vmv_ai_open_voice_call(uuid,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_open_voice_call(uuid,text) to service_role;

create or replace function public.vmv_ai_voice_save_turn(p_sid text,p_turn integer,p_user text,p_reply text,p_lang text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare found_sid text;
begin
 if p_turn not between 1 and 8 or length(p_user)>1000 or length(p_reply)>1200 or
    p_lang not in ('es','en') then return false; end if;
 update public.vmv_ai_voice_calls
 set turns=turns||jsonb_build_array(jsonb_build_object('role','user','content',p_user),
             jsonb_build_object('role','assistant','content',p_reply)),
     last_reply=p_reply,preferred_language=p_lang,last_request_turn=p_turn
 where call_sid=p_sid and expires_at>now() and turn_count=p_turn and last_request_turn<p_turn
 returning call_sid into found_sid;
 return found_sid is not null;
end $$;
revoke all on function public.vmv_ai_voice_save_turn(text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_voice_save_turn(text,integer,text,text,text) to service_role;

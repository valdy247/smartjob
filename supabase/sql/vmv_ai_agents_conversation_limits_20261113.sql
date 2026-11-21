-- VMV AI Agents pilot: let a commercial conversation finish before the hard turn cap.
-- Pilot stays limited to one owner, five new calls per UTC day, and finite wall time.
-- Existing paid Smart Call translation balances and routes are untouched.
alter table public.vmv_ai_voice_calls drop constraint if exists vmv_ai_voice_calls_turn_count_check;
alter table public.vmv_ai_voice_calls add constraint vmv_ai_voice_calls_turn_count_check
 check (turn_count>=0 and turn_count<=24);
alter table public.vmv_ai_voice_calls
 alter column expires_at set default (now()+interval '8 minutes');

create or replace function public.vmv_ai_claim_turn(p_call_sid text,p_expected integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if p_call_sid !~ '^CA[a-fA-F0-9]{32}$' or p_expected not between 1 and 24 then return false; end if;
 update public.vmv_ai_voice_calls
 set turn_count=turn_count+1,silence_count=0
 where call_sid=p_call_sid and turn_count=p_expected-1
   and last_request_turn<p_expected and expires_at>now()
 returning turn_count into n;
 return n=p_expected;
end $$;

create or replace function public.vmv_ai_voice_save_turn(
 p_sid text,p_turn integer,p_user text,p_reply text,p_lang text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare found_sid text;
begin
 if p_sid !~ '^CA[a-fA-F0-9]{32}$' or p_turn not between 1 and 24
   or length(p_user)>1000 or length(p_reply)>1200
   or p_lang not in('es','en') then return false; end if;
 update public.vmv_ai_voice_calls
 set turns=turns||jsonb_build_array(
   jsonb_build_object('role','user','content',p_user),
   jsonb_build_object('role','assistant','content',p_reply)),
   last_reply=p_reply,preferred_language=p_lang,last_request_turn=p_turn
 where call_sid=p_sid and expires_at>now() and turn_count=p_turn
   and last_request_turn<p_turn
 returning call_sid into found_sid;
 return found_sid is not null;
end $$;

-- Deprecated reserve RPC is retained but shares exactly the same ceiling.
create or replace function public.vmv_ai_reserve_voice_turn(p_call_sid text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if p_call_sid !~ '^CA[a-fA-F0-9]{32}$' then return 0;end if;
 update public.vmv_ai_voice_calls set turn_count=turn_count+1
 where call_sid=p_call_sid and expires_at>now() and turn_count<24
 returning turn_count into n;
 return coalesce(n,0);
end $$;

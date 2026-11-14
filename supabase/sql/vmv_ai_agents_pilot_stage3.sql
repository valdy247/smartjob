-- AI Agents voice memory, safe idempotent turns and explicit speech silence state.
-- No Smart Call tables, routing, credit balances or telephony settings touched.
alter table public.vmv_ai_voice_calls
 add column if not exists silence_count smallint not null default 0
  check(silence_count between 0 and 3);
-- The informational pilot remains short until a hard telephony call timeout is tested.
-- Do not claim a hard time cutoff: expires_at is checked at every Twilio webhook.

create or replace function public.vmv_ai_claim_turn(p_call_sid text,p_expected integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if p_expected not between 1 and 8 then return false; end if;
 update public.vmv_ai_voice_calls
 set turn_count=turn_count+1,silence_count=0
 where call_sid=p_call_sid and turn_count=p_expected-1
   and last_request_turn<p_expected and expires_at>now()
 returning turn_count into n;
 return n=p_expected;
end $$;
revoke all on function public.vmv_ai_claim_turn(text,integer) from public,anon,authenticated;
grant execute on function public.vmv_ai_claim_turn(text,integer) to service_role;

create or replace function public.vmv_ai_note_silence(p_call_sid text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 update public.vmv_ai_voice_calls set silence_count=least(silence_count+1,3)
 where call_sid=p_call_sid and expires_at>now()
 returning silence_count into n;
 return coalesce(n,3);
end $$;
revoke all on function public.vmv_ai_note_silence(text) from public,anon,authenticated;
grant execute on function public.vmv_ai_note_silence(text) to service_role;

create or replace function public.vmv_ai_set_voice_lang(p_call_sid text,p_lang text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare found_sid text;
begin
 if p_lang not in ('es','en') then return false; end if;
 update public.vmv_ai_voice_calls set preferred_language=p_lang
 where call_sid=p_call_sid and expires_at>now()
 returning call_sid into found_sid;
 return found_sid is not null;
end $$;
revoke all on function public.vmv_ai_set_voice_lang(text,text) from public,anon,authenticated;
grant execute on function public.vmv_ai_set_voice_lang(text,text) to service_role;

create or replace function public.vmv_ai_expire_call(p_call_sid text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare found_sid text;
begin
 update public.vmv_ai_voice_calls set expires_at=least(expires_at,now())
 where call_sid=p_call_sid
 returning call_sid into found_sid;
 return found_sid is not null;
end $$;
revoke all on function public.vmv_ai_expire_call(text) from public,anon,authenticated;
grant execute on function public.vmv_ai_expire_call(text) to service_role;

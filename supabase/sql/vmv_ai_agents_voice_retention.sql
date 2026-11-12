-- AI Agents only. Text conversation retention 7 days, call metadata 30 days.
-- No raw audio is recorded by AI Agents. External processors have separate policies.
create or replace function public.vmv_ai_retire_voice_content()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.vmv_ai_voice_calls
 set turns='[]'::jsonb,
     agent_snapshot='{}'::jsonb,
     last_reply=''
 where started_at<now()-interval '7 days'
  and (turns<>'[]'::jsonb or agent_snapshot<>'{}'::jsonb or last_reply<>'');
 delete from public.vmv_ai_voice_calls where started_at<now()-interval '30 days';
end $$;
revoke all on function public.vmv_ai_retire_voice_content() from public,anon,authenticated;
grant execute on function public.vmv_ai_retire_voice_content() to service_role;
-- Job name is unique to AI Agents; checked for collisions before migration.
select cron.schedule('vmv_ai_call_retention_daily','13 3 * * *',
 'select public.vmv_ai_retire_voice_content();');

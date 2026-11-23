-- Permit a verified direct-human-only service while retaining the server's
-- validation that the owner explicitly enables its direct menu.
alter table public.vmv_ai_call_settings drop constraint if exists vmv_ai_call_both_disabled;
comment on column public.vmv_ai_call_settings.agent_enabled is
 'False can mean human-only calls when both agent and translation are disabled and owner menu is enabled.';
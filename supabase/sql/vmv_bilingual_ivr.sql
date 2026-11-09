-- VMV Call: backwards-compatible bilingual IVR and carrier options.
-- Existing sessions are translated by default. Spanish direct calls are tagged
-- explicitly and NEVER enter the AI minute-reservation flow.
alter table public.smartjob_call_sessions
  add column if not exists call_mode text not null default 'translated';
alter table public.smartjob_call_sessions
  drop constraint if exists smartjob_call_sessions_mode_check;
alter table public.smartjob_call_sessions
  add constraint smartjob_call_sessions_mode_check check(call_mode in ('direct','translated'));

-- Add operator choices without changing provisioning permission rules.
alter table public.smartjob_provisioning_requests
  drop constraint if exists smartjob_provision_carrier;
alter table public.smartjob_provisioning_requests
  add constraint smartjob_provision_carrier check(carrier in (
    'verizon','att','tmobile','xfinity','spectrum','cricket','metro','boost',
    'uscellular','googlefi','visible','mint','straighttalk','consumer','usmobile','other'
  ));

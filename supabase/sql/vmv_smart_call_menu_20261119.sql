-- Smart Call menu is opt-in and never changes provider webhooks by itself.
-- Existing rows use a well-defined default so previous clients remain compatible.
alter table public.vmv_ai_call_settings
  add column if not exists menu_config jsonb not null default '{
    "enabled": true,
    "spanish_digit": "1",
    "english_digit": "2",
    "agent_digit": "3",
    "greeting_es": "Gracias por llamar. Para atención en español, marque uno.",
    "greeting_en": "For service in English, press two. To speak with our AI assistant, press three.",
    "human_es": "Le comunicaremos con nuestro equipo. Un momento, por favor.",
    "human_en": "We will connect you with our team using translation. Please hold.",
    "agent_message": "Le comunicaremos con nuestro asistente inteligente."
  }'::jsonb;
-- Only authenticated owners can mutate their own call settings; keep existing RLS policies intact.
comment on column public.vmv_ai_call_settings.menu_config is 'Owner-controlled IVR prompt and digit map; does not change the Twilio number route until enabled by the telephone runtime.';

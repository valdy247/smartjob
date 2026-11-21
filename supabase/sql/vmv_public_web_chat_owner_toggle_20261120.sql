-- Chat web: owners may pause or activate ONLY their own prepared site bindings.
-- Existing RLS and the BEFORE UPDATE trigger enforce agent, business and publication ownership.
GRANT UPDATE(public_chat_enabled) ON public.vmv_web_chat_site_links TO authenticated;
COMMENT ON COLUMN public.vmv_web_chat_site_links.public_chat_enabled IS
 'Owner opted-in public AI website chat; enabled only with active principal agent and saved settings.';

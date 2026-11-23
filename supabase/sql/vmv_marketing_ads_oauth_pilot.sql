-- VMV Marketing Ads OAuth pilot. Additive; auth tokens are never exposed to browser roles.
CREATE TABLE IF NOT EXISTS public.vmv_marketing_ads_oauth_states (
  state_hash text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta')),
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vmv_marketing_ads_oauth_states_expires_idx
 ON public.vmv_marketing_ads_oauth_states(expires_at);
ALTER TABLE public.vmv_marketing_ads_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_marketing_ads_oauth_states FROM anon,authenticated;

CREATE TABLE IF NOT EXISTS public.vmv_marketing_ads_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('meta')),
 provider_user_id text NOT NULL,
 provider_name text NOT NULL DEFAULT '',
 selected_ad_account_id text,
 selected_ad_account_name text,
 connected_at timestamptz NOT NULL DEFAULT now(),
 disconnected_at timestamptz,
 token_expires_at timestamptz,
 UNIQUE(owner_id,provider)
);
CREATE INDEX IF NOT EXISTS vmv_marketing_ads_connections_owner_idx
 ON public.vmv_marketing_ads_connections(owner_id);
ALTER TABLE public.vmv_marketing_ads_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_marketing_ads_connections FROM anon,authenticated;
GRANT SELECT(id,owner_id,provider,provider_user_id,provider_name,selected_ad_account_id,
 selected_ad_account_name,connected_at,disconnected_at,token_expires_at)
 ON public.vmv_marketing_ads_connections TO authenticated;
DROP POLICY IF EXISTS vmv_marketing_ads_connections_owner_read
 ON public.vmv_marketing_ads_connections;
CREATE POLICY vmv_marketing_ads_connections_owner_read
 ON public.vmv_marketing_ads_connections FOR SELECT TO authenticated
 USING(owner_id=(SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.vmv_marketing_ads_credentials (
 connection_id uuid PRIMARY KEY REFERENCES public.vmv_marketing_ads_connections(id) ON DELETE CASCADE,
 encrypted_access_token text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vmv_marketing_ads_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_marketing_ads_credentials FROM anon,authenticated;

CREATE TABLE IF NOT EXISTS public.vmv_marketing_ads_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.smartjob_profiles(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL REFERENCES public.vmv_marketing_ads_connections(id) ON DELETE RESTRICT,
 provider text NOT NULL DEFAULT 'meta' CHECK(provider='meta'),
 ad_account_id text NOT NULL,
 client_key uuid NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN
  ('draft','provisioning','paused','failed','activation_pending','active','customer_paused')),
 draft jsonb NOT NULL,
 approved_at timestamptz,
 approved_snapshot jsonb,
 provider_campaign_id text,
 provider_adset_id text,
 provider_creative_id text,
 provider_ad_id text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,client_key)
);
CREATE INDEX IF NOT EXISTS vmv_marketing_ads_campaigns_owner_idx ON
 public.vmv_marketing_ads_campaigns(owner_id,created_at DESC);
ALTER TABLE public.vmv_marketing_ads_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vmv_marketing_ads_campaigns FROM anon,authenticated;
GRANT SELECT ON public.vmv_marketing_ads_campaigns TO authenticated;
DROP POLICY IF EXISTS vmv_marketing_ads_campaigns_owner_read ON public.vmv_marketing_ads_campaigns;
CREATE POLICY vmv_marketing_ads_campaigns_owner_read ON public.vmv_marketing_ads_campaigns
 FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
COMMENT ON TABLE public.vmv_marketing_ads_campaigns IS
 'Customer-owned Meta Ads drafts. Provider objects created only PAUSED after explicit approval; no publishing or ad spend from pilot.';

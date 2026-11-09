-- Separate customer/subscription TEST objects from verified LIVE payments.
-- Historical accounts default to TEST, never to live.
alter table public.smartjob_billing_accounts
 add column if not exists stripe_mode text not null default 'test';
alter table public.smartjob_billing_accounts drop constraint if exists vmv_stripe_mode_valid;
alter table public.smartjob_billing_accounts add constraint vmv_stripe_mode_valid
 check(stripe_mode in ('test','live'));
comment on column public.smartjob_billing_accounts.stripe_mode is
 'Server-managed payment environment. Test subscription records must never unlock paid telecom or AI features.';

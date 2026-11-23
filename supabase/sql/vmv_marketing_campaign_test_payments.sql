-- VMV Marketing automatic-campaign pilot: TEST payment receipt, isolated from VMV Call.
-- Additive migration only; no live charges, provider tokens, or published ads.
create table if not exists public.vmv_marketing_campaign_test_payments (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.vmv_marketing_requests(id) on delete restrict,
 owner_id uuid not null references public.smartjob_profiles(id) on delete restrict,
 quote_revision integer not null check (quote_revision >= 1),
 amount_cents integer not null check (amount_cents between 50 and 500000),
 stripe_checkout_session_id text not null unique check (stripe_checkout_session_id ~ '^cs_test_[A-Za-z0-9_]+$'),
 stripe_payment_intent_id text,
 stripe_event_id text not null unique check (stripe_event_id ~ '^evt_[A-Za-z0-9_]+$'),
 status text not null default 'paid_test' check (status = 'paid_test'),
 paid_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique (request_id,quote_revision)
);
create index if not exists vmv_marketing_campaign_test_payments_owner_idx
 on public.vmv_marketing_campaign_test_payments(owner_id,paid_at desc);
alter table public.vmv_marketing_campaign_test_payments enable row level security;
revoke all on public.vmv_marketing_campaign_test_payments from anon,authenticated;
grant select on public.vmv_marketing_campaign_test_payments to authenticated;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public'
    and tablename='vmv_marketing_campaign_test_payments'
    and policyname='vmv_marketing_campaign_test_payments_owner_read') then
   create policy vmv_marketing_campaign_test_payments_owner_read
   on public.vmv_marketing_campaign_test_payments for select to authenticated
   using (owner_id=(select auth.uid()));
 end if;
end $$;
comment on table public.vmv_marketing_campaign_test_payments is
 'Stripe TEST-only paid receipts for a specific accepted Marketing campaign service quote. Never ad budget and never proof of ad publication.';

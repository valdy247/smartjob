-- Allow non-purchase promotional or operator-authorized credit grants.
-- The credit ledger continues to record every change with a unique external reference.
ALTER TABLE public.vmv_studio_credit_ledger
  DROP CONSTRAINT IF EXISTS vmv_studio_credit_ledger_kind_check;
ALTER TABLE public.vmv_studio_credit_ledger
  ADD CONSTRAINT vmv_studio_credit_ledger_kind_check
  CHECK (kind IN ('purchase', 'grant', 'reserve', 'capture', 'release', 'regenerate', 'refund'));

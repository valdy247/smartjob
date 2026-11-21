-- Video Generator · visual autopilot setup metadata only.
-- This migration does not enable a worker, bill any provider, or publish content.
ALTER TABLE public.vmv_video_pilots
 ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'gen4.5'
  CHECK(model IN ('gen4.5','kling')),
 ADD COLUMN IF NOT EXISTS monthly_budget_cents integer NOT NULL DEFAULT 0
  CHECK(monthly_budget_cents IN (0,1500,3000,6000)),
 ADD COLUMN IF NOT EXISTS delivery text NOT NULL DEFAULT 'download'
  CHECK(delivery IN ('download','social_draft'));
COMMENT ON COLUMN public.vmv_video_pilots.monthly_budget_cents IS
 'Owner planning ceiling only; NOT a charge authorization or executable spending budget.';
COMMENT ON COLUMN public.vmv_video_pilots.delivery IS
 'Preparation preference only; does not connect or authorize social posting.';

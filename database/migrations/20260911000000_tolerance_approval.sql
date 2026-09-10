-- Approval with comments: a lot that misses a limit inside tolerance is approved
-- with a record of what was issued to the buyer and what the seller must fix.
--
-- Deliberately NOT a new sample_status value: `status = 'approved'` gates the
-- certificate-minting trigger and qc_billing_feed, so a third enum value would
-- leave these samples with no certificate number and no invoice.

ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS approved_with_comments boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN samples.approved_with_comments IS
  'True when this approval carried tolerance comments. Status stays approved; buyer-side audiences see plain Approved.';

CREATE TABLE IF NOT EXISTS sample_tolerance_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The LAB-SOURCE sample: a lot spanning N contracts is N samples rows sharing
  -- one graded lab unit, so the decision is stored once for the whole group.
  -- ON DELETE CASCADE follows the repo-wide convention for samples children; this
  -- audit table would be deleted if its sample is hard-deleted, trading persistence
  -- for consistency across the schema.
  sample_id uuid NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  decided_by uuid NOT NULL REFERENCES auth.users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  -- Per metric: key, label, actual, limit, gap, tolerance applied.
  metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- { screen_percentages: {...}, defects: { counts, primary, secondary, total } }
  issued_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The seller comment lines exactly as confirmed by the lab user.
  comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_additional_sample boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sample_tolerance_approvals IS
  'Append-only audit of tolerance approvals. Raw measured values are never overwritten; issued values live here only.';

CREATE INDEX IF NOT EXISTS idx_sample_tolerance_approvals_sample
  ON sample_tolerance_approvals (sample_id, decided_at DESC);

ALTER TABLE sample_tolerance_approvals ENABLE ROW LEVEL SECURITY;

-- RLS enabled with no read policy: access is service-role only. Every legitimate
-- reader is a server-side, staff-gated route. This table holds seller-facing
-- comments and out-of-spec values that buyer-side audiences must never see;
-- a permissive USING (true) would expose them to all authenticated users.
-- Clean up any old policy that might exist from a prior version.
DROP POLICY IF EXISTS "tolerance_approvals_read" ON sample_tolerance_approvals;

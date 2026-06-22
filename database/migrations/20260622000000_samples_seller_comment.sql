-- Approval comment for the seller (origin/exporter).
--
-- Entered optionally at cupping finalize when a sample is APPROVED. It is shown
-- ONLY in the seller quality-summary email (never to buyers) and is written to
-- the shared sys shipment_samples.approval_comments at approval time.
ALTER TABLE samples ADD COLUMN IF NOT EXISTS seller_comment text;

COMMENT ON COLUMN samples.seller_comment IS
  'Optional approval note entered at cupping finalize. Shown ONLY in the seller quality-summary email and written to sys shipment_samples.approval_comments. Never shown to buyers.';

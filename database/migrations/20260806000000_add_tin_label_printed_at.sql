-- Track when a sample's tin sleeve label was last printed.
--
-- Stamped when the operator presses Print in the label modal, not when the PDF
-- is generated, so previewing a batch does not consume it. Nullable with no
-- default: every existing sample reads as never printed, which is correct --
-- no new-format label has been printed yet.
--
-- Mirrors samples.cards_printed_at (20251127000000_add_sample_scan_tracking).

ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS tin_label_printed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_samples_tin_label_printed_at
  ON samples(tin_label_printed_at)
  WHERE tin_label_printed_at IS NOT NULL;

COMMENT ON COLUMN samples.tin_label_printed_at IS
  'When the tin sleeve label was last printed. NULL = never printed. Reprinting overwrites it; there is no print history.';

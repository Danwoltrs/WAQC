-- Persist what a specialty lot was judged against, at the moment it was judged.
--
-- The mark is copied rather than read live from quality_templates so that editing
-- a template later cannot retroactively change what an already-issued certificate
-- asserts. The four cva_override_* columns are written as a unit or not at all.

ALTER TABLE quality_assessments
  ADD COLUMN IF NOT EXISTS cva_score             numeric,
  ADD COLUMN IF NOT EXISTS cva_min_score         numeric,
  ADD COLUMN IF NOT EXISTS cva_passed            boolean,
  ADD COLUMN IF NOT EXISTS cva_override_decision text,
  ADD COLUMN IF NOT EXISTS cva_override_comment  text,
  ADD COLUMN IF NOT EXISTS cva_override_by       uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS cva_override_at       timestamptz;

ALTER TABLE quality_assessments
  DROP CONSTRAINT IF EXISTS quality_assessments_cva_override_decision_check;
ALTER TABLE quality_assessments
  ADD CONSTRAINT quality_assessments_cva_override_decision_check
  CHECK (cva_override_decision IS NULL OR cva_override_decision IN ('approved', 'rejected'));

COMMENT ON COLUMN quality_assessments.cva_min_score IS
  'The pass mark that applied when this lot was certified. Persisted rather than
   read live from quality_templates, so a later template edit cannot change what
   an issued certificate asserts.';

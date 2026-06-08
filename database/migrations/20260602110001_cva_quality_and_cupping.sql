-- CVA cupping: quality methodology + per-quality pass mark + descriptive requirement,
-- and CVA score columns on cupping_scores.

-- 1) Quality template: methodology routing + per-quality pass mark + requires-notes
ALTER TABLE quality_templates
  ADD COLUMN IF NOT EXISTS methodology text NOT NULL DEFAULT 'commodity',
  ADD COLUMN IF NOT EXISTS cva_min_score numeric(5,2) DEFAULT 84,
  ADD COLUMN IF NOT EXISTS requires_descriptors boolean NOT NULL DEFAULT false;

ALTER TABLE quality_templates
  DROP CONSTRAINT IF EXISTS quality_templates_methodology_check;
ALTER TABLE quality_templates
  ADD CONSTRAINT quality_templates_methodology_check
  CHECK (methodology IN ('commodity', 'cva'));

COMMENT ON COLUMN quality_templates.methodology IS
  'Grading methodology: commodity (legacy spreadsheet cupping) or cva (SCA 2024 Coffee Value Assessment). Routes the Cup action to the matching screen.';
COMMENT ON COLUMN quality_templates.cva_min_score IS
  'Per-quality minimum CVA 0-100 score to pass (e.g. 82, 84). Used by the CVA pass/fail check (Phase 4). NULL falls back to 84 in app code.';
COMMENT ON COLUMN quality_templates.requires_descriptors IS
  'If true, the CVA descriptive (Describe the cup) step is required for this quality before finalize. Phase 2/4 enforcement.';

-- 2) CVA score columns on cupping_scores (payload lives in the existing scores JSONB)
ALTER TABLE cupping_scores
  ADD COLUMN IF NOT EXISTS protocol text,
  ADD COLUMN IF NOT EXISTS cva_score numeric(5,2);

COMMENT ON COLUMN cupping_scores.protocol IS
  'Scoring protocol for this row: NULL/commodity for legacy, ''cva'' for SCA Coffee Value Assessment.';
COMMENT ON COLUMN cupping_scores.cva_score IS
  'Server-verified SCA CVA 0-100 cupping score (S = 0.65625*Σh + 52.75 − 2u − 4d, rounded 0.25).';

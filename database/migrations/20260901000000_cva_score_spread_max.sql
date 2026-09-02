-- How far apart a specialty panel's cuppers may be, per quality template.
-- NULL = use the application default (3 points, DEFAULT_SPREAD_MAX in
-- src/lib/cupping/cva-panel.ts). Additive and nullable: existing rows and
-- currently deployed code are unaffected.
ALTER TABLE quality_templates
  ADD COLUMN IF NOT EXISTS cva_score_spread_max NUMERIC NULL;

COMMENT ON COLUMN quality_templates.cva_score_spread_max IS
  'Max acceptable max-min spread of CVA scores across a panel before the Panel step flags it. NULL = application default.';

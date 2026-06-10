-- Migration: private per-client template variants
-- Date: 2026-06-10
-- Purpose:
--   Support duplicating a client quality spec into an INDEPENDENT copy whose
--   quality parameters (screen size, defect limits, cupping scale, …) can be
--   changed for that one client without affecting the original template or any
--   other client. Such a duplicate gets its own private clone of the template;
--   this flag marks those clones so they are hidden from the global template
--   pickers and the Quality Templates list (keeping the clone isolated to its
--   owning client). Distinct from template_parent_id, which the templates page's
--   "Clone" button also sets on standalone templates that SHOULD stay visible.
--
-- Safe to apply before the code that reads it deploys: existing rows default to
-- false (visible), so current behaviour is unchanged until the new code ships.

ALTER TABLE quality_templates
  ADD COLUMN IF NOT EXISTS is_client_variant boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN quality_templates.is_client_variant IS
  'True for private per-client template clones created by duplicating a client quality spec (with isolated parameters). Hidden from the global template pickers/list so the clone stays scoped to its owning client.';

-- Verification
SELECT
  'is_client_variant column added' AS status,
  (SELECT COUNT(*) FROM quality_templates WHERE is_client_variant = false) AS visible_templates,
  (SELECT COUNT(*) FROM quality_templates WHERE is_client_variant = true)  AS client_variants;

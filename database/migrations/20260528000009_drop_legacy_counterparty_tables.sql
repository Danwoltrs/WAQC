-- Migration 20260528000009
-- Phase 8b: drop the legacy counterparty tables now that all FKs targeting them
-- have been repointed to companies.
--
-- After migrations #4, #5, and #8a, no FK in the database should still target
-- clients/exporters/importers/roasters. This migration verifies that, then drops
-- the tables and the supporting client_type enum.
--
-- Safety: if any FK still points to these tables (e.g. a feature branch added
-- one), this migration aborts with the offending constraint name so we can
-- triage instead of cascading and losing data.

BEGIN;

DO $$
DECLARE
  v_stragglers text;
BEGIN
  -- Only flag FKs whose SOURCE table is outside the drop-set. FKs internal to
  -- the legacy tables themselves (e.g. exporters.client_id → clients) are
  -- handled by the CASCADE below and don't need a separate cleanup.
  SELECT string_agg(
    format('%I.%I → %I (constraint %I)',
      nsp.nspname, cls.relname, ref.relname, con.conname),
    E'\n')
  INTO v_stragglers
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  JOIN pg_class ref ON ref.oid = con.confrelid
  WHERE con.contype = 'f'
    AND ref.relname IN ('clients', 'exporters', 'importers', 'roasters')
    AND cls.relname NOT IN ('clients', 'exporters', 'importers', 'roasters')
    AND nsp.nspname NOT IN ('pg_catalog', 'information_schema');

  IF v_stragglers IS NOT NULL THEN
    RAISE EXCEPTION E'Cannot drop legacy tables — external FKs still point at them:\n%', v_stragglers;
  END IF;
END $$;

-- Drop in dependency order. CASCADE catches RLS policies, indexes, triggers,
-- and the bridge columns (companies-side columns are unaffected — those live
-- on the legacy tables, e.g. exporters.company_id).
DROP TABLE IF EXISTS roasters CASCADE;
DROP TABLE IF EXISTS importers CASCADE;
DROP TABLE IF EXISTS exporters CASCADE;
DROP TABLE IF EXISTS clients CASCADE;

-- Drop the enum that backed clients.client_types — replaced by
-- companies.company_types (text[]) + companies.trading_roles (jsonb).
DROP TYPE IF EXISTS client_type;

COMMIT;

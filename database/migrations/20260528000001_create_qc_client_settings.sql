-- Migration: Create qc_client_settings side table
-- Date: 2026-05-28
-- Part 1 of 7 in the counterparty consolidation (clients/exporters/buyers/roasters → companies).
-- See docs/superpowers/plans/2026-05-28-counterparty-consolidation.md
--
-- This table holds WAQC-only configuration keyed on companies(id).
-- After consolidation, anywhere code used to read clients.certificate_pattern etc.
-- it reads from qc_client_settings instead.

BEGIN;

-- ========================================
-- 1. Side table
-- ========================================

CREATE TABLE IF NOT EXISTS qc_client_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,

  -- Cert generation
  certificate_pattern JSONB DEFAULT jsonb_build_object(
    'has_quality_code', false,
    'quality_position', 'prefix',
    'has_origin_code', false,
    'origin_position', 'prefix',
    'sequence_padding', 6,
    'starting_sequence', 1,
    'year_format', 'YY',
    'separator', '-'
  ),
  certificate_config JSONB DEFAULT '{}'::jsonb,

  -- QC operational settings
  default_quality_specs UUID[] DEFAULT '{}',
  pricing_model pricing_model DEFAULT 'per_sample',
  billing_basis billing_basis DEFAULT 'approved_only',
  notification_emails TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE qc_client_settings IS
  'WAQC-only configuration for companies that are QC clients. Keyed on companies(id); existence of a row does NOT imply QC enrollment (that is companies.is_qc_client).';

COMMENT ON COLUMN qc_client_settings.certificate_pattern IS
  'Cert number generation pattern (sequence padding, separators, quality/origin codes, year format).';
COMMENT ON COLUMN qc_client_settings.default_quality_specs IS
  'Default quality template IDs offered when intaking a sample for this company.';
COMMENT ON COLUMN qc_client_settings.notification_emails IS
  'Additional recipients for cert delivery / lab notifications beyond the company contacts.';

-- ========================================
-- 2. Update trigger
-- ========================================

CREATE OR REPLACE FUNCTION update_qc_client_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_qc_client_settings_updated_at ON qc_client_settings;
CREATE TRIGGER trg_qc_client_settings_updated_at
  BEFORE UPDATE ON qc_client_settings
  FOR EACH ROW EXECUTE FUNCTION update_qc_client_settings_updated_at();

-- ========================================
-- 3. RLS
-- ========================================

ALTER TABLE qc_client_settings ENABLE ROW LEVEL SECURITY;

-- WAQC staff (any user with a QC role) can do anything.
-- Reuses get_user_qc_role() from existing WAQC schema.
DROP POLICY IF EXISTS "QC staff full access" ON qc_client_settings;
CREATE POLICY "QC staff full access" ON qc_client_settings
  FOR ALL
  USING (get_user_qc_role(auth.uid()) IS NOT NULL)
  WITH CHECK (get_user_qc_role(auth.uid()) IS NOT NULL);

-- Authenticated read for everyone else (clients read their own settings via the join chain).
DROP POLICY IF EXISTS "Authenticated read" ON qc_client_settings;
CREATE POLICY "Authenticated read" ON qc_client_settings
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ========================================
-- 4. Verification
-- ========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'qc_client_settings'
  ) THEN
    RAISE EXCEPTION 'qc_client_settings table was not created';
  END IF;

  RAISE NOTICE 'qc_client_settings ready (empty — backfill happens in 20260528000002).';
END $$;

COMMIT;

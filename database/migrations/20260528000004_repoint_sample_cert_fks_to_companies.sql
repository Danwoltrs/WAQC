-- Migration: Repoint sample + certificate_sequences FKs to companies
-- Date: 2026-05-28
-- Part 4 of 7 in counterparty consolidation.
--
-- The samples table was truncated (along with all dependents — certificates,
-- cupping_sessions, cupping_scores, quality_assessments, etc.). The FK columns
-- still exist but every row is gone, so we can freely repoint constraints from
-- clients/exporters/importers/roasters → companies without any data migration.
--
-- certificate_sequences was also truncated; its client_id column gets repointed
-- the same way.
--
-- Constraint names are preserved exactly (the codebase + Supabase joins rely on
-- them — e.g. `samples_seller_id_fkey`, `samples_exporter_id_fkey`).

BEGIN;

-- ========================================
-- 0. Safety check: confirm tables are empty
-- ========================================

DO $$
DECLARE
  v_samples INT;
  v_cert_seq INT;
BEGIN
  SELECT COUNT(*) INTO v_samples FROM samples;
  SELECT COUNT(*) INTO v_cert_seq FROM certificate_sequences;

  IF v_samples > 0 THEN
    RAISE EXCEPTION 'samples has % rows — expected 0. Aborting to avoid orphaning FK data. Re-run the nuke or migrate data first.', v_samples;
  END IF;

  IF v_cert_seq > 0 THEN
    RAISE EXCEPTION 'certificate_sequences has % rows — expected 0. Aborting.', v_cert_seq;
  END IF;

  RAISE NOTICE 'Both tables empty — safe to repoint FKs.';
END $$;

-- ========================================
-- 1. samples FK repointing
-- ========================================
-- Each column: drop old constraint, add new pointing to companies(id).
-- ON DELETE behavior preserved from the original constraints.

-- client_id (was clients ON DELETE SET NULL — keep same)
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_client_id_fkey;
ALTER TABLE samples
  ADD CONSTRAINT samples_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES companies(id) ON DELETE SET NULL;

-- end_client_id (was clients)
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_end_client_id_fkey;
ALTER TABLE samples
  ADD CONSTRAINT samples_end_client_id_fkey
  FOREIGN KEY (end_client_id) REFERENCES companies(id) ON DELETE SET NULL;

-- seller_id (was exporters)
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_seller_id_fkey;
ALTER TABLE samples
  ADD CONSTRAINT samples_seller_id_fkey
  FOREIGN KEY (seller_id) REFERENCES companies(id) ON DELETE SET NULL;

-- exporter_id (was exporters)
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_exporter_id_fkey;
ALTER TABLE samples
  ADD CONSTRAINT samples_exporter_id_fkey
  FOREIGN KEY (exporter_id) REFERENCES companies(id) ON DELETE SET NULL;

-- importer_id (was importers)
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_importer_id_fkey;
ALTER TABLE samples
  ADD CONSTRAINT samples_importer_id_fkey
  FOREIGN KEY (importer_id) REFERENCES companies(id) ON DELETE SET NULL;

-- roaster_id (was roasters)
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_roaster_id_fkey;
ALTER TABLE samples
  ADD CONSTRAINT samples_roaster_id_fkey
  FOREIGN KEY (roaster_id) REFERENCES companies(id) ON DELETE SET NULL;

-- ========================================
-- 2. certificate_sequences FK repointing
-- ========================================
-- client_id was clients ON DELETE CASCADE; same behavior on companies
-- (when a company is deleted, drop its sequence counters too).

ALTER TABLE certificate_sequences DROP CONSTRAINT IF EXISTS certificate_sequences_client_id_fkey;
ALTER TABLE certificate_sequences
  ADD CONSTRAINT certificate_sequences_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES companies(id) ON DELETE CASCADE;

-- ========================================
-- 3. Update column comments
-- ========================================

COMMENT ON COLUMN samples.client_id IS
  'QC client (the entity sending samples for testing). FK to companies(id) where is_qc_client = true.';
COMMENT ON COLUMN samples.end_client_id IS
  'Ultimate consumer of the coffee (e.g. final buyer like Dunkin). FK to companies(id).';
COMMENT ON COLUMN samples.seller_id IS
  'Counterparty selling the coffee. FK to companies(id) where trading_roles contains seller.';
COMMENT ON COLUMN samples.exporter_id IS
  'Exporter on this trade. FK to companies(id) where company_types contains exporter.';
COMMENT ON COLUMN samples.importer_id IS
  'Importer on this trade. FK to companies(id) where trading_roles contains buyer.';
COMMENT ON COLUMN samples.roaster_id IS
  'Roaster on this trade. FK to companies(id) where company_types contains roaster.';
COMMENT ON COLUMN certificate_sequences.client_id IS
  'QC client. FK to companies(id) where is_qc_client = true.';

-- ========================================
-- 4. Verification — show new FK targets
-- ========================================

DO $$
DECLARE
  v_record RECORD;
  v_count INT := 0;
BEGIN
  RAISE NOTICE '=== Migration #4 — repointed FKs ===';
  FOR v_record IN
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND (
        (tc.table_name = 'samples' AND kcu.column_name IN ('client_id','end_client_id','seller_id','exporter_id','importer_id','roaster_id'))
        OR (tc.table_name = 'certificate_sequences' AND kcu.column_name = 'client_id')
      )
    ORDER BY tc.table_name, kcu.column_name
  LOOP
    RAISE NOTICE '  %.% -> %.%', v_record.table_name, v_record.column_name, v_record.target_table, v_record.target_column;
    v_count := v_count + 1;

    IF v_record.target_table != 'companies' THEN
      RAISE WARNING '!! %.% still points to %, expected companies', v_record.table_name, v_record.column_name, v_record.target_table;
    END IF;
  END LOOP;

  RAISE NOTICE 'Total FKs verified: %', v_count;

  IF v_count < 7 THEN
    RAISE WARNING 'Expected 7 FK rows (6 on samples + 1 on certificate_sequences), got %', v_count;
  END IF;
END $$;

COMMIT;

-- Migration 20260528000008
-- Phase 8a: repoint sample_contracts.importer_id and sample_contracts.roaster_id
-- from the legacy importers/roasters tables to companies(id).
--
-- Migrations #4 and #5 swept every other FK targeting clients/exporters/importers/
-- roasters; these two were deliberately deferred because the bridge columns
-- exporters.company_id / importers.company_id / roasters.company_id (added in #3)
-- are what we use to translate the values.
--
-- After this migration the legacy importers/roasters/exporters/clients tables
-- still exist but no longer have any FKs pointing at them. Migration #8b drops them.

BEGIN;

-- Translate existing sample_contracts.importer_id values from importers.id to
-- the corresponding companies.id via importers.company_id.
-- If an importers row has company_id IS NULL it means migration #3 didn't find or
-- create a matching company — flag those before continuing.
DO $$
DECLARE
  v_orphan_importers integer;
  v_orphan_roasters integer;
BEGIN
  SELECT count(*) INTO v_orphan_importers
  FROM sample_contracts sc
  JOIN importers i ON i.id = sc.importer_id
  WHERE sc.importer_id IS NOT NULL
    AND i.company_id IS NULL;

  SELECT count(*) INTO v_orphan_roasters
  FROM sample_contracts sc
  JOIN roasters r ON r.id = sc.roaster_id
  WHERE sc.roaster_id IS NOT NULL
    AND r.company_id IS NULL;

  IF v_orphan_importers > 0 OR v_orphan_roasters > 0 THEN
    RAISE EXCEPTION
      'Cannot repoint sample_contracts FKs: % importer rows and % roaster rows have no companies.id mapping (importers/roasters with NULL company_id). Backfill missing companies first.',
      v_orphan_importers, v_orphan_roasters;
  END IF;
END $$;

UPDATE sample_contracts sc
SET importer_id = i.company_id
FROM importers i
WHERE sc.importer_id = i.id;

UPDATE sample_contracts sc
SET roaster_id = r.company_id
FROM roasters r
WHERE sc.roaster_id = r.id;

-- Swap the FK constraints. Constraint names are preserved so PostgREST embeds
-- (importer:companies!sample_contracts_importer_id_fkey(...)) keep resolving.
ALTER TABLE sample_contracts
  DROP CONSTRAINT IF EXISTS sample_contracts_importer_id_fkey;
ALTER TABLE sample_contracts
  ADD CONSTRAINT sample_contracts_importer_id_fkey
  FOREIGN KEY (importer_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE sample_contracts
  DROP CONSTRAINT IF EXISTS sample_contracts_roaster_id_fkey;
ALTER TABLE sample_contracts
  ADD CONSTRAINT sample_contracts_roaster_id_fkey
  FOREIGN KEY (roaster_id) REFERENCES companies(id) ON DELETE SET NULL;

COMMIT;

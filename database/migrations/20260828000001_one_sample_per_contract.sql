-- Migration 20260828000001: one sample per contract
--
-- Each sample_contracts row becomes a sibling `samples` row pointing at its
-- mother through samples.lab_source_sample_id. The sibling's certificate is
-- repointed at the sibling; certificate numbers and rendered content are
-- verified identical inside this transaction, which ABORTS on any mismatch.
-- sample_contracts is left untouched (archive / rollback). The two legacy
-- columns (certificates.sample_contract_id, samples.linked_pss_sample_contract_id)
-- are nulled, not dropped, so the previous build keeps working until the code
-- is deployed. Spec: docs/superpowers/specs/2026-08-26-sample-per-contract-design.md
-- and the 2026-08-28 addendum.
--
-- Apply BEFORE pushing the code; nothing in the app reads the new columns
-- until then. The schema part is idempotent; the data part refuses to run
-- twice (it checks sample_contract_migrations).

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '10min';

-- 1. Schema ------------------------------------------------------------------
ALTER TABLE samples ADD COLUMN IF NOT EXISTS lab_source_sample_id uuid NULL
  REFERENCES samples(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_samples_lab_source_sample_id
  ON samples (lab_source_sample_id) WHERE lab_source_sample_id IS NOT NULL;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS contract_ordinal integer NULL;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS container_count integer NULL;
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_container_count_positive;
ALTER TABLE samples ADD CONSTRAINT samples_container_count_positive
  CHECK (container_count IS NULL OR container_count > 0);
COMMENT ON COLUMN samples.lab_source_sample_id IS
  'NULL = lab unit (cupped/graded). Set = contract sibling whose lab data lives on the row it points at.';
COMMENT ON COLUMN samples.contract_ordinal IS '1 = lab unit, 2..N = siblings, in contract order.';
COMMENT ON COLUMN samples.container_count IS 'Bulk: number of containers entered by the lab. Optional otherwise.';

CREATE TABLE IF NOT EXISTS sample_contract_migrations (
  sample_contract_id uuid PRIMARY KEY,
  sibling_sample_id  uuid NOT NULL REFERENCES samples(id),
  certificate_id     uuid NULL,
  migrated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sample_contract_migrations ENABLE ROW LEVEL SECURITY;
-- Any signed-in user may resolve a legacy ?contract_id= link through the map
-- (the routes read it with whichever client they hold); it holds ids only.
DROP POLICY IF EXISTS sample_contract_migrations_read ON sample_contract_migrations;
CREATE POLICY sample_contract_migrations_read ON sample_contract_migrations
  FOR SELECT TO authenticated USING (true);
COMMENT ON TABLE sample_contract_migrations IS
  'sample_contracts row -> the samples row it became (2026-08-28). Legacy ?contract_id= links resolve through it; rollback map.';

-- 2. Guard: never run the data move twice -------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sample_contract_migrations) THEN
    RAISE EXCEPTION 'sample_contract_migrations is not empty: the data move already ran';
  END IF;
END $$;

-- 3. Snapshot what every sub-contract certificate prints TODAY ----------------
-- (the COALESCE rules mirror certificate-data.ts's contractOverride branch)
CREATE TEMP TABLE cert_before ON COMMIT DROP AS
SELECT c.id AS certificate_id, c.certificate_number, c.client_id AS cert_client_id,
       sc.id AS sample_contract_id, s.id AS mother_id,
       COALESCE(NULLIF(sc.supplier_contract_nr, ''), NULLIF(sc.seller_contract_nr, ''), s.seller_contract_nr) AS seller_ref,
       COALESCE(NULLIF(sc.shipper_contract_nr, ''), s.shipper_contract_nr)                    AS shipper_ref,
       sc.buyer_contract_nr, sc.wolthers_contract_nr, sc.roaster_contract_nr,
       sc.qc_client_contract_nr, sc.end_client_contract_nr,
       COALESCE(NULLIF(sc.exporter_sample_number, ''), s.exporter_sample_number) AS exporter_sample_number,
       COALESCE(NULLIF(sc.ico_number, ''), s.ico_number)                         AS ico_number,
       COALESCE(NULLIF(sc.container_nr, ''), s.container_nr)                     AS container_nr,
       COALESCE(sc.bag_count, s.bag_count, s.bags)                               AS bag_count,
       COALESCE(sc.bag_weight_kg, s.bag_weight_kg)                               AS bag_weight_kg,
       COALESCE(NULLIF(sc.bag_type, ''), s.bag_type::text)                       AS bag_type,
       COALESCE(sc.bags_quantity_mt, s.bags_quantity_mt)                         AS bags_quantity_mt,
       COALESCE(sc.equivalent_60kg_bags, s.equivalent_60kg_bags)                 AS equivalent_60kg_bags,
       sc.importer_id, sc.roaster_id, sc.end_client_id, sc.importer_is_qc_client,
       COALESCE(sc.client_id, s.client_id)                                       AS client_id,
       s.shipment_month AS mother_shipment_month, sc.shipment_month AS sub_shipment_month
FROM certificates c
JOIN sample_contracts sc ON sc.id = c.sample_contract_id
JOIN samples s ON s.id = sc.sample_id;

CREATE TEMP TABLE cert_numbers_before ON COMMIT DROP AS
SELECT id, certificate_number FROM certificates;

CREATE TEMP TABLE counts_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM samples) AS samples, (SELECT count(*) FROM sample_contracts) AS subs;

-- 4. Copy: one sibling per sub-contract ---------------------------------------
-- Quantity is copied verbatim: the derivation trigger would re-derive MT for
-- non-bulk rows and the 60kg equivalent for bulk rows, and the spec forbids
-- rewriting a stored quantity the arithmetic has not proven wrong.
ALTER TABLE samples DISABLE TRIGGER trigger_update_equivalent_60kg_bags;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_auto_generate_certificate'
             AND tgrelid = 'samples'::regclass AND NOT tgisinternal) THEN
    EXECUTE 'ALTER TABLE samples DISABLE TRIGGER trigger_auto_generate_certificate';
  END IF;
END $$;

DO $$
DECLARE
  sc      RECORD;
  m       samples%ROWTYPE;
  v_id    uuid;
  v_track text;
BEGIN
  FOR sc IN
    SELECT * FROM sample_contracts ORDER BY sample_id, sort_order, created_at
  LOOP
    SELECT * INTO m FROM samples WHERE id = sc.sample_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sample_contract % has no mother sample %', sc.id, sc.sample_id;
    END IF;

    -- Internal lab number: minted per sibling (unique per client). A mother
    -- without a laboratory cannot mint; fall back to the sub's own number.
    IF m.laboratory_id IS NOT NULL THEN
      v_track := generate_sample_number(m.laboratory_id);
    ELSE
      v_track := COALESCE(sc.tracking_number, m.tracking_number || '-' || (sc.sort_order + 2)::text);
    END IF;

    INSERT INTO samples (
      -- inherited from the lab unit (MOTHER_SHARED_FIELDS in src/lib/sample-group.ts)
      assigned_to, awb_number, cards_printed_at, certificate_generated_at, certifications,
      container, contract_number, courier_name, crop_year, deleted_at, deleted_by, destination,
      exporter_contract_nr, exporter_id, exporter_legacy, hide_exporter_on_label, ico_marks,
      importer_legacy, is_quick_look, laboratory_id, locked, micro_origin, origin,
      processing_method, quality_name, quality_spec_id, roaster_legacy, same_seller_shipper,
      sample_category, sample_type, scanned_at, seller_comment, seller_id, status, supplier,
      supplier_type, tin_label_printed_at, workflow_stage,
      -- contract's own, blank falls back (SIBLING_COALESCE_FIELDS)
      client_id, supplier_contract_nr, shipper_contract_nr, exporter_sample_number, ico_number,
      container_nr, shipment_month, bag_count, bag_weight_kg, bag_type, bags_quantity_mt,
      equivalent_60kg_bags,
      -- contract's own, no fallback (SIBLING_OWN_FIELDS)
      importer_id, roaster_id, end_client_id, importer_is_qc_client, wolthers_contract_nr,
      buyer_contract_nr, roaster_contract_nr, qc_client_contract_nr, end_client_contract_nr,
      contract_id, manual_ref_fields,
      -- special
      seller_contract_nr, bags, storage_position, linked_pss_sample_id, linked_pss_sample_contract_id,
      tracking_number, split_numbering, lab_source_sample_id, contract_ordinal, created_at, updated_at
    ) VALUES (
      m.assigned_to, m.awb_number, m.cards_printed_at, m.certificate_generated_at, m.certifications,
      m.container, m.contract_number, m.courier_name, m.crop_year, m.deleted_at, m.deleted_by, m.destination,
      m.exporter_contract_nr, m.exporter_id, m.exporter_legacy, m.hide_exporter_on_label, m.ico_marks,
      m.importer_legacy, m.is_quick_look, m.laboratory_id, m.locked, m.micro_origin, m.origin,
      m.processing_method, m.quality_name, m.quality_spec_id, m.roaster_legacy, m.same_seller_shipper,
      m.sample_category, m.sample_type, m.scanned_at, m.seller_comment, m.seller_id, m.status, m.supplier,
      m.supplier_type, m.tin_label_printed_at, m.workflow_stage,
      COALESCE(sc.client_id, m.client_id),
      COALESCE(NULLIF(sc.supplier_contract_nr, ''), m.supplier_contract_nr),
      COALESCE(NULLIF(sc.shipper_contract_nr, ''), m.shipper_contract_nr),
      COALESCE(NULLIF(sc.exporter_sample_number, ''), m.exporter_sample_number),
      COALESCE(NULLIF(sc.ico_number, ''), m.ico_number),
      COALESCE(NULLIF(sc.container_nr, ''), m.container_nr),
      COALESCE(NULLIF(sc.shipment_month, ''), m.shipment_month),
      COALESCE(sc.bag_count, m.bag_count, m.bags),
      COALESCE(sc.bag_weight_kg, m.bag_weight_kg),
      COALESCE(NULLIF(sc.bag_type, '')::bag_type_enum, m.bag_type),
      COALESCE(sc.bags_quantity_mt, m.bags_quantity_mt),
      COALESCE(sc.equivalent_60kg_bags, m.equivalent_60kg_bags),
      sc.importer_id, sc.roaster_id, sc.end_client_id, COALESCE(sc.importer_is_qc_client, true),
      sc.wolthers_contract_nr, sc.buyer_contract_nr, sc.roaster_contract_nr, sc.qc_client_contract_nr,
      sc.end_client_contract_nr, sc.contract_id, COALESCE(sc.manual_ref_fields, '{}'::text[]),
      COALESCE(NULLIF(sc.supplier_contract_nr, ''), NULLIF(sc.seller_contract_nr, ''), m.seller_contract_nr),
      COALESCE(sc.bag_count, m.bags),
      NULL, NULL, NULL,
      v_track, (m.laboratory_id IS NOT NULL), m.id, sc.sort_order + 2, sc.created_at, now()
    )
    RETURNING id INTO v_id;

    INSERT INTO sample_contract_migrations (sample_contract_id, sibling_sample_id)
    VALUES (sc.id, v_id);
  END LOOP;
END $$;

ALTER TABLE samples ENABLE TRIGGER trigger_update_equivalent_60kg_bags;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_auto_generate_certificate'
             AND tgrelid = 'samples'::regclass AND NOT tgisinternal) THEN
    EXECUTE 'ALTER TABLE samples ENABLE TRIGGER trigger_auto_generate_certificate';
  END IF;
END $$;

-- Mothers that now have siblings are contract #1.
UPDATE samples s SET contract_ordinal = 1
WHERE contract_ordinal IS NULL
  AND EXISTS (SELECT 1 FROM samples x WHERE x.lab_source_sample_id = s.id);

-- 5. Repoint certificates ------------------------------------------------------
UPDATE certificates c
SET sample_id = m.sibling_sample_id, sample_contract_id = NULL
FROM sample_contract_migrations m
WHERE c.sample_contract_id = m.sample_contract_id;

UPDATE sample_contract_migrations m
SET certificate_id = c.id
FROM certificates c
WHERE c.sample_id = m.sibling_sample_id;

-- 6. SS -> PSS leaf links now point at the sibling sample -------------------------
UPDATE samples s
SET linked_pss_sample_id = m.sibling_sample_id, linked_pss_sample_contract_id = NULL
FROM sample_contract_migrations m
WHERE s.linked_pss_sample_contract_id = m.sample_contract_id;

-- 7. Sent-email history keyed by sub-contract now keys by the sibling ------------
UPDATE email_messages e
SET metadata = e.metadata
             || jsonb_build_object('sample_id', m.sibling_sample_id::text,
                                   'migrated_from_sample_id', e.metadata->>'sample_id')
FROM sample_contract_migrations m
WHERE e.metadata IS NOT NULL
  AND e.metadata->>'sample_contract_id' = m.sample_contract_id::text;

-- 8. Verification — any failure aborts the whole transaction -------------------
DO $$
DECLARE
  v_subs  bigint; v_mig bigint; v_before bigint; v_after bigint;
  v_bad   bigint; v_row RECORD;
BEGIN
  SELECT subs, samples INTO v_subs, v_before FROM counts_before;
  SELECT count(*) INTO v_mig FROM sample_contract_migrations;
  IF v_mig <> v_subs THEN
    RAISE EXCEPTION 'migrated % siblings for % sub-contracts', v_mig, v_subs;
  END IF;

  SELECT count(*) INTO v_after FROM samples;
  IF v_after <> v_before + v_subs THEN
    RAISE EXCEPTION 'samples went from % to %, expected %', v_before, v_after, v_before + v_subs;
  END IF;

  IF EXISTS (SELECT 1 FROM certificates WHERE sample_contract_id IS NOT NULL) THEN
    RAISE EXCEPTION 'certificates still point at sample_contracts';
  END IF;
  IF EXISTS (SELECT 1 FROM samples WHERE linked_pss_sample_contract_id IS NOT NULL) THEN
    RAISE EXCEPTION 'samples still link a sample_contracts leaf';
  END IF;

  -- Every certificate number unchanged.
  SELECT count(*) INTO v_bad
  FROM cert_numbers_before b JOIN certificates c ON c.id = b.id
  WHERE c.certificate_number IS DISTINCT FROM b.certificate_number;
  IF v_bad > 0 THEN RAISE EXCEPTION '% certificate numbers changed', v_bad; END IF;

  -- Every migrated certificate resolves to exactly one sample, its sibling.
  SELECT count(*) INTO v_bad
  FROM cert_before b JOIN certificates c ON c.id = b.certificate_id
  JOIN sample_contract_migrations m ON m.sample_contract_id = b.sample_contract_id
  WHERE c.sample_id IS DISTINCT FROM m.sibling_sample_id;
  IF v_bad > 0 THEN RAISE EXCEPTION '% certificates not repointed at their sibling', v_bad; END IF;

  -- Rendered references and quantity identical to what the sub-contract printed.
  SELECT count(*) INTO v_bad
  FROM cert_before b
  JOIN sample_contract_migrations m ON m.sample_contract_id = b.sample_contract_id
  JOIN samples s ON s.id = m.sibling_sample_id
  WHERE s.seller_contract_nr        IS DISTINCT FROM b.seller_ref
     OR s.shipper_contract_nr       IS DISTINCT FROM b.shipper_ref
     OR s.buyer_contract_nr         IS DISTINCT FROM b.buyer_contract_nr
     OR s.wolthers_contract_nr      IS DISTINCT FROM b.wolthers_contract_nr
     OR s.roaster_contract_nr       IS DISTINCT FROM b.roaster_contract_nr
     OR s.qc_client_contract_nr     IS DISTINCT FROM b.qc_client_contract_nr
     OR s.end_client_contract_nr    IS DISTINCT FROM b.end_client_contract_nr
     OR s.exporter_sample_number    IS DISTINCT FROM b.exporter_sample_number
     OR s.ico_number                IS DISTINCT FROM b.ico_number
     OR s.container_nr              IS DISTINCT FROM b.container_nr
     OR s.bag_count                 IS DISTINCT FROM b.bag_count
     OR s.bag_weight_kg             IS DISTINCT FROM b.bag_weight_kg
     OR s.bag_type::text            IS DISTINCT FROM b.bag_type
     OR s.bags_quantity_mt          IS DISTINCT FROM b.bags_quantity_mt
     OR s.equivalent_60kg_bags      IS DISTINCT FROM b.equivalent_60kg_bags
     OR s.importer_id               IS DISTINCT FROM b.importer_id
     OR s.roaster_id                IS DISTINCT FROM b.roaster_id
     OR s.end_client_id             IS DISTINCT FROM b.end_client_id
     OR s.importer_is_qc_client     IS DISTINCT FROM COALESCE(b.importer_is_qc_client, true)
     OR s.client_id                 IS DISTINCT FROM b.client_id;
  IF v_bad > 0 THEN
    FOR v_row IN
      SELECT b.certificate_number FROM cert_before b
      JOIN sample_contract_migrations m ON m.sample_contract_id = b.sample_contract_id
      JOIN samples s ON s.id = m.sibling_sample_id
      WHERE s.bag_count IS DISTINCT FROM b.bag_count OR s.seller_contract_nr IS DISTINCT FROM b.seller_ref
         OR s.buyer_contract_nr IS DISTINCT FROM b.buyer_contract_nr LIMIT 10
    LOOP RAISE NOTICE 'mismatch: %', v_row.certificate_number; END LOOP;
    RAISE EXCEPTION '% migrated certificates would render differently', v_bad;
  END IF;

  -- The certificate's denormalised client matches its new sample.
  SELECT count(*) INTO v_bad
  FROM certificates c JOIN samples s ON s.id = c.sample_id
  JOIN sample_contract_migrations m ON m.sibling_sample_id = s.id
  WHERE c.client_id IS NOT NULL AND c.client_id IS DISTINCT FROM s.client_id;
  IF v_bad > 0 THEN RAISE EXCEPTION '% certificates carry a client that differs from their sibling', v_bad; END IF;

  -- No sibling is in a cupping session and none owns lab data.
  IF EXISTS (SELECT 1 FROM cupping_sessions cs, samples s
             WHERE s.lab_source_sample_id IS NOT NULL AND s.id = ANY(cs.sample_ids)) THEN
    RAISE EXCEPTION 'a sibling is enrolled in a cupping session';
  END IF;
  IF EXISTS (SELECT 1 FROM quality_assessments qa JOIN samples s ON s.id = qa.sample_id
             WHERE s.lab_source_sample_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a sibling owns a quality assessment';
  END IF;

  RAISE NOTICE 'OK: % sub-contracts -> siblings, samples % -> %, certificates repointed', v_subs, v_before, v_after;
END $$;

-- 9. Report (NOTICE only) ---------------------------------------------------------
DO $$
DECLARE r RECORD; n int := 0;
BEGIN
  -- Groups whose siblings all repeat the lab unit's quantity: probably copies,
  -- not the contract's own figures (the billing feed will bill each of them).
  FOR r IN
    SELECT m.tracking_number, count(*) AS siblings
    FROM samples m JOIN samples s ON s.lab_source_sample_id = m.id
    WHERE s.bag_count IS NOT DISTINCT FROM m.bag_count
      AND s.bags_quantity_mt IS NOT DISTINCT FROM m.bags_quantity_mt
    GROUP BY m.id, m.tracking_number
    HAVING count(*) = (SELECT count(*) FROM samples x WHERE x.lab_source_sample_id = m.id)
    ORDER BY siblings DESC
  LOOP
    n := n + 1;
    RAISE NOTICE 'REVIEW quantities: % — % sibling(s) carry the lab unit''s exact quantity', r.tracking_number, r.siblings;
  END LOOP;
  RAISE NOTICE '% group(s) flagged for quantity review', n;

  FOR r IN
    SELECT b.certificate_number, b.mother_shipment_month, b.sub_shipment_month FROM cert_before b
    WHERE b.sub_shipment_month IS NOT NULL AND b.sub_shipment_month IS DISTINCT FROM b.mother_shipment_month
  LOOP
    RAISE NOTICE 'NOTE shipment month: % now prints % (was %)', r.certificate_number, r.sub_shipment_month, r.mother_shipment_month;
  END LOOP;
END $$;

COMMIT;

-- Migration: Other Samples (PSS / Stocklot / Type Sample / Shipment Sample sent to clients for approval)
-- Date: 2026-05-25
--
-- Splits the samples flow into two categories:
--   - 'qc'    = Wolthers approves (existing flow, default for back-compat)
--   - 'other' = sample arrives in the lab and is forwarded to one or more
--               client buyers/roasters for their approval; may carry an AWB.
--
-- Adds: sample_category column, stocklot enum value, sent_to_clients status,
--       AWB / courier fields, is_quick_look flag, and the sample_recipients
--       many-to-many tracking table (one row per (sample, client) with its
--       own approval status).
--
-- NOTE on enum ALTERs: Postgres forbids using a freshly-added enum value
-- inside the same transaction it was added in. This migration only DEFINES
-- the new values — no INSERT/SELECT references them — so it's safe to apply
-- as one batch.


-- 1. sample_category discriminator -------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sample_category') THEN
        CREATE TYPE sample_category AS ENUM ('qc', 'other');
    END IF;
END $$;

ALTER TABLE samples
    ADD COLUMN IF NOT EXISTS sample_category sample_category NOT NULL DEFAULT 'qc';

CREATE INDEX IF NOT EXISTS idx_samples_category
    ON samples (sample_category)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN samples.sample_category IS
    'Discriminator between QC samples (Wolthers approves) and Other samples (forwarded to clients for their approval).';


-- 2. Extend sample_type_enum with 'stocklot' ---------------------------------
ALTER TYPE sample_type_enum ADD VALUE IF NOT EXISTS 'stocklot';

COMMENT ON COLUMN samples.sample_type IS
    'Type of sample: pss (Pre-Shipment Sample), ss (Shipment Sample), type (Type Sample for client approval), specialty (manual roast), or stocklot (offered to multiple clients).';


-- 3. AWB / courier / quick-look fields on samples ----------------------------
ALTER TABLE samples
    ADD COLUMN IF NOT EXISTS awb_number TEXT,
    ADD COLUMN IF NOT EXISTS courier_name TEXT,
    ADD COLUMN IF NOT EXISTS is_quick_look BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN samples.awb_number IS
    'Air waybill / courier tracking number for samples that arrived by air freight (mainly Other Samples).';
COMMENT ON COLUMN samples.courier_name IS
    'Courier provider name (DHL, FedEx, etc.). Optional companion to awb_number.';
COMMENT ON COLUMN samples.is_quick_look IS
    'When TRUE, lab performs a lighter preliminary cupping rather than the full SCA workup. Only meaningful for Other Samples.';


-- 4. Extend sample_status with 'sent_to_clients' -----------------------------
ALTER TYPE sample_status ADD VALUE IF NOT EXISTS 'sent_to_clients';


-- 5. sample_recipients many-to-many -----------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sample_recipient_status') THEN
        CREATE TYPE sample_recipient_status AS ENUM ('pending', 'approved', 'rejected', 'no_response');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS sample_recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_id UUID NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    contact_emails TEXT[] NOT NULL DEFAULT '{}',
    status sample_recipient_status NOT NULL DEFAULT 'pending',
    comments TEXT,
    sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    responded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sample_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_sample_recipients_sample
    ON sample_recipients (sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_recipients_client
    ON sample_recipients (client_id);
CREATE INDEX IF NOT EXISTS idx_sample_recipients_status
    ON sample_recipients (status);

COMMENT ON TABLE sample_recipients IS
    'For Other Samples: one row per (sample, recipient client). Each recipient tracks its own approval status independently. Sample-level status stays at sent_to_clients regardless of individual responses.';


-- updated_at trigger
CREATE OR REPLACE FUNCTION sample_recipients_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sample_recipients_updated_at ON sample_recipients;
CREATE TRIGGER trg_sample_recipients_updated_at
    BEFORE UPDATE ON sample_recipients
    FOR EACH ROW
    EXECUTE FUNCTION sample_recipients_set_updated_at();


-- RLS: mirror report_recipients — any authenticated user can read/write.
ALTER TABLE sample_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read sample recipients" ON sample_recipients;
CREATE POLICY "Authenticated users can read sample recipients"
    ON sample_recipients FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert sample recipients" ON sample_recipients;
CREATE POLICY "Authenticated users can insert sample recipients"
    ON sample_recipients FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update sample recipients" ON sample_recipients;
CREATE POLICY "Authenticated users can update sample recipients"
    ON sample_recipients FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete sample recipients" ON sample_recipients;
CREATE POLICY "Authenticated users can delete sample recipients"
    ON sample_recipients FOR DELETE
    USING (auth.role() = 'authenticated');


-- 6. Verification ------------------------------------------------------------
DO $$
DECLARE
    v_type_values TEXT;
    v_status_values TEXT;
    v_cat_exists BOOLEAN;
    v_recip_table_exists BOOLEAN;
BEGIN
    SELECT string_agg(enumlabel, ', ' ORDER BY enumlabel) INTO v_type_values
    FROM pg_enum WHERE enumtypid = 'sample_type_enum'::regtype;

    SELECT string_agg(enumlabel, ', ' ORDER BY enumlabel) INTO v_status_values
    FROM pg_enum WHERE enumtypid = 'sample_status'::regtype;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'samples' AND column_name = 'sample_category'
    ) INTO v_cat_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'sample_recipients'
    ) INTO v_recip_table_exists;

    RAISE NOTICE 'sample_type_enum values: %', v_type_values;
    RAISE NOTICE 'sample_status values: %', v_status_values;
    RAISE NOTICE 'samples.sample_category exists: %', v_cat_exists;
    RAISE NOTICE 'sample_recipients table exists: %', v_recip_table_exists;

    IF v_type_values NOT LIKE '%stocklot%' THEN
        RAISE WARNING 'stocklot value missing from sample_type_enum';
    END IF;
    IF v_status_values NOT LIKE '%sent_to_clients%' THEN
        RAISE WARNING 'sent_to_clients value missing from sample_status';
    END IF;
    IF NOT v_cat_exists THEN
        RAISE WARNING 'samples.sample_category column missing';
    END IF;
    IF NOT v_recip_table_exists THEN
        RAISE WARNING 'sample_recipients table missing';
    END IF;
END $$;

SELECT 'Migration 20260525000000_add_other_samples.sql completed successfully!' as status;

-- Phase 2 Migration: Update Existing Tables with Phase 2 Fields
-- This migration extends samples, clients, quality_assessments, and laboratories tables
-- Run after 003_phase2_schema.sql

-- ============================================================================
-- EXTEND SAMPLES TABLE
-- ============================================================================

-- Add contract numbers and sample metadata
ALTER TABLE samples
    ADD COLUMN IF NOT EXISTS wolthers_contract_nr TEXT,
    ADD COLUMN IF NOT EXISTS exporter_contract_nr TEXT,
    ADD COLUMN IF NOT EXISTS buyer_contract_nr TEXT,
    ADD COLUMN IF NOT EXISTS roaster_contract_nr TEXT,
    ADD COLUMN IF NOT EXISTS ico_number TEXT,
    ADD COLUMN IF NOT EXISTS container_nr TEXT,
    ADD COLUMN IF NOT EXISTS sample_type sample_type_enum,
    ADD COLUMN IF NOT EXISTS bags_quantity_mt DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS bag_count INTEGER,
    ADD COLUMN IF NOT EXISTS processing_method TEXT,
    ADD COLUMN IF NOT EXISTS workflow_stage TEXT DEFAULT 'received',
    ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id);

-- Add comment for workflow_stage
COMMENT ON COLUMN samples.workflow_stage IS 'Current stage in sample workflow: received, green_analysis, roasting, cupping, review, certified';

-- ============================================================================
-- EXTEND CLIENTS TABLE
-- ============================================================================

-- Add notification and tracking settings
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS notification_emails TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS certificate_delivery_timing TEXT DEFAULT 'upon_approval',
    ADD COLUMN IF NOT EXISTS tracking_number_format TEXT DEFAULT 'WAQC-{lab}-{year}-{seq:05d}';

-- Add comment for certificate_delivery_timing
COMMENT ON COLUMN clients.certificate_delivery_timing IS 'When to send certificates: upon_approval, manual_request, scheduled';

-- Add comment for tracking_number_format
COMMENT ON COLUMN clients.tracking_number_format IS 'Template for sample tracking numbers. Supports: {lab}, {year}, {seq:05d}, {client_code}, {origin}';

-- ============================================================================
-- EXTEND QUALITY_ASSESSMENTS TABLE
-- ============================================================================

-- Add Phase 2 quality assessment fields
ALTER TABLE quality_assessments
    ADD COLUMN IF NOT EXISTS sample_size_grams INTEGER DEFAULT 350,
    ADD COLUMN IF NOT EXISTS moisture_standard moisture_standard DEFAULT 'coffee_industry',
    ADD COLUMN IF NOT EXISTS defect_photos TEXT[] DEFAULT '{}';

-- Add comment for defect_photos
COMMENT ON COLUMN quality_assessments.defect_photos IS 'Array of Supabase storage URLs for defect photos';

-- ============================================================================
-- EXTEND LABORATORIES TABLE
-- ============================================================================

-- Add storage layout and tax region
ALTER TABLE laboratories
    ADD COLUMN IF NOT EXISTS storage_layout JSONB,
    ADD COLUMN IF NOT EXISTS tax_region TEXT;

-- Add comment for storage_layout
COMMENT ON COLUMN laboratories.storage_layout IS 'Detailed shelf configuration including columns, rows, and samples per position for each shelf';

-- Example storage_layout structure:
-- {
--   "shelves": [
--     {
--       "shelf_number": 1,
--       "columns": 10,
--       "rows": 9,
--       "samples_per_position": 42,
--       "naming_pattern": "SH-01-{col:02d}-{row:02d}"
--     },
--     {
--       "shelf_number": 2,
--       "columns": 10,
--       "rows": 10,
--       "samples_per_position": 42,
--       "naming_pattern": "SH-02-{col:02d}-{row:02d}"
--     }
--   ]
-- }

-- Update Santos HQ laboratory with Phase 2 storage layout
UPDATE laboratories
SET storage_layout = '{
  "shelves": [
    {
      "shelf_number": 1,
      "columns": 10,
      "rows": 9,
      "samples_per_position": 42,
      "naming_pattern": "SH-01-{col:02d}-{row:02d}",
      "total_positions": 90
    },
    {
      "shelf_number": 2,
      "columns": 10,
      "rows": 10,
      "samples_per_position": 42,
      "naming_pattern": "SH-02-{col:02d}-{row:02d}",
      "total_positions": 100
    },
    {
      "shelf_number": 3,
      "columns": 8,
      "rows": 9,
      "samples_per_position": 42,
      "naming_pattern": "SH-03-{col:02d}-{row:02d}",
      "total_positions": 72
    },
    {
      "shelf_number": 4,
      "columns": 9,
      "rows": 9,
      "samples_per_position": 42,
      "naming_pattern": "SH-04-{col:02d}-{row:02d}",
      "total_positions": 81
    }
  ],
  "total_positions": 343,
  "total_capacity": 14406
}'::jsonb,
tax_region = 'BR-SP'
WHERE id = '550e8400-e29b-41d4-a716-446655440001';

-- ============================================================================
-- CREATE INDEXES FOR NEW FIELDS
-- ============================================================================

-- Samples indexes
CREATE INDEX IF NOT EXISTS idx_samples_wolthers_contract ON samples(wolthers_contract_nr);
CREATE INDEX IF NOT EXISTS idx_samples_exporter_contract ON samples(exporter_contract_nr);
CREATE INDEX IF NOT EXISTS idx_samples_buyer_contract ON samples(buyer_contract_nr);
CREATE INDEX IF NOT EXISTS idx_samples_roaster_contract ON samples(roaster_contract_nr);
CREATE INDEX IF NOT EXISTS idx_samples_ico_number ON samples(ico_number);
CREATE INDEX IF NOT EXISTS idx_samples_container_nr ON samples(container_nr);
CREATE INDEX IF NOT EXISTS idx_samples_sample_type ON samples(sample_type);
CREATE INDEX IF NOT EXISTS idx_samples_workflow_stage ON samples(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_samples_assigned_to ON samples(assigned_to);
CREATE INDEX IF NOT EXISTS idx_samples_processing_method ON samples(processing_method);

-- Quality assessments indexes
CREATE INDEX IF NOT EXISTS idx_quality_assessments_sample_size ON quality_assessments(sample_size_grams);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_moisture_standard ON quality_assessments(moisture_standard);

-- Laboratories indexes
CREATE INDEX IF NOT EXISTS idx_laboratories_tax_region ON laboratories(tax_region);

-- GIN index for storage_layout JSONB queries
CREATE INDEX IF NOT EXISTS idx_laboratories_storage_layout ON laboratories USING GIN(storage_layout);

-- ============================================================================
-- ADD CONSTRAINTS
-- ============================================================================

-- Samples constraints
ALTER TABLE samples
    ADD CONSTRAINT chk_bags_quantity_positive
    CHECK (bags_quantity_mt IS NULL OR bags_quantity_mt > 0);

ALTER TABLE samples
    ADD CONSTRAINT chk_bag_count_positive
    CHECK (bag_count IS NULL OR bag_count > 0);

-- Quality assessments constraints
ALTER TABLE quality_assessments
    ADD CONSTRAINT chk_sample_size_valid
    CHECK (sample_size_grams >= 100 AND sample_size_grams <= 1000);

-- ============================================================================
-- UPDATE RLS POLICIES FOR NEW FIELDS
-- ============================================================================

-- Note: Existing RLS policies on samples, clients, quality_assessments, and laboratories
-- already cover the new fields. No additional policies needed.

-- ============================================================================
-- HELPER FUNCTION FOR TRACKING NUMBER GENERATION
-- ============================================================================

-- Function to generate tracking numbers based on client format
CREATE OR REPLACE FUNCTION generate_tracking_number(
    p_client_id UUID,
    p_laboratory_id UUID,
    p_origin TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_format TEXT;
    v_lab_code TEXT;
    v_year TEXT;
    v_seq INTEGER;
    v_client_code TEXT;
    v_result TEXT;
BEGIN
    -- Get client tracking format
    SELECT tracking_number_format INTO v_format
    FROM clients WHERE id = p_client_id;

    -- Use default format if client doesn't have one
    IF v_format IS NULL THEN
        v_format := 'WAQC-{lab}-{year}-{seq:05d}';
    END IF;

    -- Get lab code (first 3 letters of lab name)
    SELECT UPPER(LEFT(REPLACE(name, ' ', ''), 3)) INTO v_lab_code
    FROM laboratories WHERE id = p_laboratory_id;

    -- Get current year
    v_year := EXTRACT(YEAR FROM NOW())::TEXT;

    -- Get next sequence number for this lab and year
    SELECT COALESCE(MAX(
        CASE
            WHEN tracking_number ~ '\d{5}$' THEN
                SUBSTRING(tracking_number FROM '\d{5}$')::INTEGER
            ELSE 0
        END
    ), 0) + 1 INTO v_seq
    FROM samples
    WHERE laboratory_id = p_laboratory_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

    -- Get client code (first 3 letters of company name)
    SELECT UPPER(LEFT(REPLACE(company, ' ', ''), 3)) INTO v_client_code
    FROM clients WHERE id = p_client_id;

    -- Replace placeholders
    v_result := v_format;
    v_result := REPLACE(v_result, '{lab}', v_lab_code);
    v_result := REPLACE(v_result, '{year}', v_year);
    v_result := REPLACE(v_result, '{seq:05d}', LPAD(v_seq::TEXT, 5, '0'));
    v_result := REPLACE(v_result, '{client_code}', COALESCE(v_client_code, 'XXX'));
    v_result := REPLACE(v_result, '{origin}', COALESCE(UPPER(LEFT(p_origin, 2)), 'XX'));

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTION FOR WORKFLOW STAGE VALIDATION
-- ============================================================================

-- Function to validate workflow stage transitions
CREATE OR REPLACE FUNCTION validate_workflow_stage_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_valid_transitions TEXT[][];
BEGIN
    -- Define valid stage transitions
    v_valid_transitions := ARRAY[
        ARRAY['received', 'green_analysis'],
        ARRAY['green_analysis', 'roasting'],
        ARRAY['roasting', 'cupping'],
        ARRAY['cupping', 'review'],
        ARRAY['review', 'certified'],
        ARRAY['review', 'rejected'],
        -- Allow manual corrections
        ARRAY['certified', 'review'],
        ARRAY['rejected', 'review']
    ];

    -- Skip validation for new records
    IF OLD.workflow_stage IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if transition is valid
    IF NOT (ARRAY[OLD.workflow_stage, NEW.workflow_stage] = ANY(v_valid_transitions)) THEN
        RAISE EXCEPTION 'Invalid workflow stage transition from % to %',
            OLD.workflow_stage, NEW.workflow_stage;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for workflow stage validation
DROP TRIGGER IF EXISTS validate_sample_workflow_stage ON samples;
CREATE TRIGGER validate_sample_workflow_stage
    BEFORE UPDATE OF workflow_stage ON samples
    FOR EACH ROW
    EXECUTE FUNCTION validate_workflow_stage_transition();

-- ============================================================================
-- DATA MIGRATION / DEFAULTS
-- ============================================================================

-- Update existing samples with default workflow stage based on status
UPDATE samples
SET workflow_stage = CASE
    WHEN status = 'received' THEN 'received'
    WHEN status = 'in_progress' THEN 'green_analysis'
    WHEN status = 'under_review' THEN 'review'
    WHEN status = 'approved' THEN 'certified'
    WHEN status = 'rejected' THEN 'rejected'
    ELSE 'received'
END
WHERE workflow_stage IS NULL;

-- Update existing quality_assessments with default sample size
UPDATE quality_assessments
SET sample_size_grams = 350
WHERE sample_size_grams IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify samples table extensions
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'samples' AND column_name = 'wolthers_contract_nr') = 1,
           'samples.wolthers_contract_nr column not created';

    ASSERT (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'samples' AND column_name = 'workflow_stage') = 1,
           'samples.workflow_stage column not created';

    RAISE NOTICE 'Samples table verification: PASSED';
END $$;

-- Verify clients table extensions
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'clients' AND column_name = 'notification_emails') = 1,
           'clients.notification_emails column not created';

    ASSERT (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'clients' AND column_name = 'tracking_number_format') = 1,
           'clients.tracking_number_format column not created';

    RAISE NOTICE 'Clients table verification: PASSED';
END $$;

-- Verify quality_assessments table extensions
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'quality_assessments' AND column_name = 'sample_size_grams') = 1,
           'quality_assessments.sample_size_grams column not created';

    ASSERT (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'quality_assessments' AND column_name = 'moisture_standard') = 1,
           'quality_assessments.moisture_standard column not created';

    RAISE NOTICE 'Quality assessments table verification: PASSED';
END $$;

-- Verify laboratories table extensions
DO $$
BEGIN
    ASSERT (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'laboratories' AND column_name = 'storage_layout') = 1,
           'laboratories.storage_layout column not created';

    ASSERT (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'laboratories' AND column_name = 'tax_region') = 1,
           'laboratories.tax_region column not created';

    RAISE NOTICE 'Laboratories table verification: PASSED';
END $$;

-- ========================================
-- RLS POLICY FOR ROAST PROFILES
-- (Moved from migration 003 because it requires samples.laboratory_id)
-- ========================================

CREATE POLICY "Users can view roast profiles for their lab"
    ON roast_profiles FOR SELECT
    USING (
        is_global_admin() OR
        EXISTS (
            SELECT 1 FROM samples s
            WHERE s.id = roast_profiles.sample_id
            AND s.laboratory_id = get_user_laboratory()
        )
    );

-- Final success message
SELECT 'Migration 004_update_existing_tables.sql completed successfully!' as status;

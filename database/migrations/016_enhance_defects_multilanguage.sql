-- Enhancement Migration: Add Multi-Language Support to Defect Definitions
-- This migration enhances the defect_definitions table with:
-- 1. Multi-language name and description fields (EN, PT, ES)
-- 2. Improved sample size handling with 300g default
-- 3. Helper functions for translation retrieval
-- 4. Updated indexes for performance

-- ========================================
-- ADD MULTI-LANGUAGE COLUMNS
-- ========================================

-- Add multi-language name fields
ALTER TABLE defect_definitions
ADD COLUMN IF NOT EXISTS name_en TEXT,
ADD COLUMN IF NOT EXISTS name_pt TEXT,
ADD COLUMN IF NOT EXISTS name_es TEXT;

-- Add multi-language description fields
ALTER TABLE defect_definitions
ADD COLUMN IF NOT EXISTS description_en TEXT,
ADD COLUMN IF NOT EXISTS description_pt TEXT,
ADD COLUMN IF NOT EXISTS description_es TEXT;

-- ========================================
-- MIGRATE EXISTING DATA
-- ========================================

-- Copy existing defect_name to name_en (English as default)
UPDATE defect_definitions
SET name_en = defect_name
WHERE name_en IS NULL AND defect_name IS NOT NULL;

-- Set Portuguese and Spanish to same as English initially
-- (Users can customize these later via the UI)
UPDATE defect_definitions
SET name_pt = name_en,
    name_es = name_en
WHERE name_en IS NOT NULL AND (name_pt IS NULL OR name_es IS NULL);

-- ========================================
-- UPDATE CONSTRAINTS
-- ========================================

-- Make name_en required (English is the base language)
ALTER TABLE defect_definitions
ALTER COLUMN name_en SET NOT NULL;

-- Update sample_size_grams to have 300 as default
ALTER TABLE defect_definitions
ALTER COLUMN sample_size_grams SET DEFAULT 300;

-- Update any NULL sample_size_grams to 300
UPDATE defect_definitions
SET sample_size_grams = 300
WHERE sample_size_grams IS NULL;

-- ========================================
-- UPDATE UNIQUE CONSTRAINT
-- ========================================

-- Drop old unique constraint that uses defect_name
ALTER TABLE defect_definitions
DROP CONSTRAINT IF EXISTS defect_definitions_client_id_origin_defect_name_key;

-- Add new unique constraint using name_en
ALTER TABLE defect_definitions
ADD CONSTRAINT defect_definitions_client_id_origin_name_en_key
UNIQUE(client_id, origin, name_en);

-- ========================================
-- UPDATE INDEXES
-- ========================================

-- Add indexes for multi-language search
CREATE INDEX IF NOT EXISTS idx_defect_definitions_name_en ON defect_definitions(name_en);
CREATE INDEX IF NOT EXISTS idx_defect_definitions_name_pt ON defect_definitions(name_pt) WHERE name_pt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_defect_definitions_name_es ON defect_definitions(name_es) WHERE name_es IS NOT NULL;

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to get defect name in preferred language with fallback
CREATE OR REPLACE FUNCTION get_defect_name(
    p_defect_id UUID,
    p_language TEXT DEFAULT 'EN'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_name TEXT;
BEGIN
    -- Try to get name in requested language
    CASE UPPER(p_language)
        WHEN 'PT' THEN
            SELECT name_pt INTO v_name FROM defect_definitions WHERE id = p_defect_id;
        WHEN 'ES' THEN
            SELECT name_es INTO v_name FROM defect_definitions WHERE id = p_defect_id;
        ELSE
            SELECT name_en INTO v_name FROM defect_definitions WHERE id = p_defect_id;
    END CASE;

    -- Fallback to English if translation is missing
    IF v_name IS NULL THEN
        SELECT name_en INTO v_name FROM defect_definitions WHERE id = p_defect_id;
    END IF;

    RETURN v_name;
END;
$$;

-- Function to get defect description in preferred language with fallback
CREATE OR REPLACE FUNCTION get_defect_description(
    p_defect_id UUID,
    p_language TEXT DEFAULT 'EN'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_description TEXT;
BEGIN
    -- Try to get description in requested language
    CASE UPPER(p_language)
        WHEN 'PT' THEN
            SELECT description_pt INTO v_description FROM defect_definitions WHERE id = p_defect_id;
        WHEN 'ES' THEN
            SELECT description_es INTO v_description FROM defect_definitions WHERE id = p_defect_id;
        ELSE
            SELECT description_en INTO v_description FROM defect_definitions WHERE id = p_defect_id;
    END CASE;

    -- Fallback to English if translation is missing
    IF v_description IS NULL THEN
        SELECT description_en INTO v_description FROM defect_definitions WHERE id = p_defect_id;
    END IF;

    RETURN v_description;
END;
$$;

-- Function to calculate defect points scaled by sample size
CREATE OR REPLACE FUNCTION calculate_scaled_defect_points(
    p_base_points DECIMAL,
    p_sample_size_grams INTEGER,
    p_base_size_grams INTEGER DEFAULT 300
)
RETURNS DECIMAL
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Scale points based on sample size
    -- Formula: new_points = (base_points * sample_size_grams) / base_size_grams
    RETURN ROUND((p_base_points * p_sample_size_grams / p_base_size_grams)::NUMERIC, 2);
END;
$$;

-- Function to get category name in preferred language
CREATE OR REPLACE FUNCTION get_defect_category_name(
    p_category defect_category,
    p_language TEXT DEFAULT 'EN'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_category = 'primary' THEN
        CASE UPPER(p_language)
            WHEN 'PT' THEN RETURN 'Primária';
            WHEN 'ES' THEN RETURN 'Primario';
            ELSE RETURN 'Primary';
        END CASE;
    ELSIF p_category = 'secondary' THEN
        CASE UPPER(p_language)
            WHEN 'PT' THEN RETURN 'Secundária';
            WHEN 'ES' THEN RETURN 'Secundario';
            ELSE RETURN 'Secondary';
        END CASE;
    ELSE
        RETURN p_category::TEXT;
    END IF;
END;
$$;

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON COLUMN defect_definitions.name_en IS 'Defect name in English (required, base language)';
COMMENT ON COLUMN defect_definitions.name_pt IS 'Defect name in Portuguese';
COMMENT ON COLUMN defect_definitions.name_es IS 'Defect name in Spanish';
COMMENT ON COLUMN defect_definitions.description_en IS 'Defect description in English';
COMMENT ON COLUMN defect_definitions.description_pt IS 'Defect description in Portuguese';
COMMENT ON COLUMN defect_definitions.description_es IS 'Defect description in Spanish';
COMMENT ON COLUMN defect_definitions.sample_size_grams IS 'Sample size in grams (default 300g, can be customized per client)';
COMMENT ON FUNCTION get_defect_name IS 'Get defect name in preferred language with fallback to English';
COMMENT ON FUNCTION get_defect_description IS 'Get defect description in preferred language with fallback to English';
COMMENT ON FUNCTION calculate_scaled_defect_points IS 'Calculate defect points scaled from base size (300g) to actual sample size';
COMMENT ON FUNCTION get_defect_category_name IS 'Get defect category name translated to preferred language';

-- ========================================
-- DEPRECATION NOTICE
-- ========================================

-- Mark defect_name column as deprecated (keep for backward compatibility)
COMMENT ON COLUMN defect_definitions.defect_name IS 'DEPRECATED: Use name_en, name_pt, name_es instead. Kept for backward compatibility.';

-- ========================================
-- VERIFICATION
-- ========================================

-- Verify migration
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check that all rows have name_en
    SELECT COUNT(*) INTO v_count FROM defect_definitions WHERE name_en IS NULL;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Migration verification failed: % rows missing name_en', v_count;
    END IF;

    -- Check that helper functions exist
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_defect_name') THEN
        RAISE EXCEPTION 'Migration verification failed: get_defect_name function not created';
    END IF;

    RAISE NOTICE 'Migration 016 completed successfully: Multi-language defect definitions enabled';
END;
$$;

SELECT 'Migration 016: Multi-language defect definitions enhancement completed' as status;

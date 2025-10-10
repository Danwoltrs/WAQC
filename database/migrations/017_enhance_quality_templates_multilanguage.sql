-- Enhancement Migration: Add Multi-Language Support and Template Inheritance to Quality System
-- This migration enhances the quality_templates and cupping_attribute_definitions tables with:
-- 1. Multi-language name and description fields (EN, PT, ES)
-- 2. Sample size handling with 300g default
-- 3. Template inheritance and cloning support
-- 4. Enhanced cupping attribute configuration with scales and increments
-- 5. Comprehensive quality control thresholds
-- 6. Template sharing controls (private/lab/global)
-- 7. Helper functions for translation retrieval

-- ========================================
-- ENHANCE QUALITY_TEMPLATES TABLE
-- ========================================

-- Add multi-language name fields
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS name_en TEXT,
ADD COLUMN IF NOT EXISTS name_pt TEXT,
ADD COLUMN IF NOT EXISTS name_es TEXT;

-- Add multi-language description fields
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS description_en TEXT,
ADD COLUMN IF NOT EXISTS description_pt TEXT,
ADD COLUMN IF NOT EXISTS description_es TEXT;

-- Add sample size field
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS sample_size_grams INTEGER DEFAULT 300;

-- Add template inheritance support
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS template_parent_id UUID REFERENCES quality_templates(id) ON DELETE SET NULL;

-- Add laboratory association for lab-specific templates
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS laboratory_id UUID REFERENCES laboratories(id) ON DELETE CASCADE;

-- Add sharing control flag
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;

-- Add explicit quality control threshold fields
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS defect_thresholds_primary DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS defect_thresholds_secondary DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS moisture_standard moisture_standard DEFAULT 'coffee_industry';

-- Add cupping scale configuration fields
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS cupping_scale_type TEXT DEFAULT '1-10',
ADD COLUMN IF NOT EXISTS cupping_scale_min DECIMAL(4,2) DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS cupping_scale_max DECIMAL(4,2) DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS cupping_scale_increment DECIMAL(3,2) DEFAULT 0.25;

-- Add taint/fault threshold fields
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS max_taints_allowed INTEGER,
ADD COLUMN IF NOT EXISTS max_faults_allowed INTEGER,
ADD COLUMN IF NOT EXISTS taint_fault_rule_type TEXT DEFAULT 'AND' CHECK (taint_fault_rule_type IN ('AND', 'OR'));

-- Add screen size requirements (using JSONB for flexibility)
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS screen_size_requirements JSONB DEFAULT '{}';

-- ========================================
-- MIGRATE EXISTING DATA
-- ========================================

-- Copy existing name to name_en (English as default)
UPDATE quality_templates
SET name_en = name
WHERE name_en IS NULL AND name IS NOT NULL;

-- Copy existing description to description_en
UPDATE quality_templates
SET description_en = description
WHERE description_en IS NULL AND description IS NOT NULL;

-- Set Portuguese and Spanish to same as English initially
UPDATE quality_templates
SET name_pt = name_en,
    name_es = name_en
WHERE name_en IS NOT NULL AND (name_pt IS NULL OR name_es IS NULL);

UPDATE quality_templates
SET description_pt = description_en,
    description_es = description_en
WHERE description_en IS NOT NULL AND (description_pt IS NULL OR description_es IS NULL);

-- Extract screen_size data from parameters JSONB if it exists
UPDATE quality_templates
SET screen_size_requirements = parameters->'screen_sizes'
WHERE parameters ? 'screen_sizes' AND screen_size_requirements = '{}';

-- ========================================
-- UPDATE CONSTRAINTS
-- ========================================

-- Make name_en required (English is the base language)
ALTER TABLE quality_templates
ALTER COLUMN name_en SET NOT NULL;

-- Ensure sample_size_grams has default
UPDATE quality_templates
SET sample_size_grams = 300
WHERE sample_size_grams IS NULL;

ALTER TABLE quality_templates
ALTER COLUMN sample_size_grams SET NOT NULL;

-- ========================================
-- ENHANCE CUPPING_ATTRIBUTE_DEFINITIONS
-- ========================================

-- Add multi-language name fields to cupping attributes
ALTER TABLE cupping_attribute_definitions
ADD COLUMN IF NOT EXISTS attribute_name_en TEXT,
ADD COLUMN IF NOT EXISTS attribute_name_pt TEXT,
ADD COLUMN IF NOT EXISTS attribute_name_es TEXT;

-- Add scale configuration fields
ALTER TABLE cupping_attribute_definitions
ADD COLUMN IF NOT EXISTS scale_type TEXT DEFAULT '1-10',
ADD COLUMN IF NOT EXISTS scale_min DECIMAL(4,2) DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS scale_max DECIMAL(4,2) DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS scale_increment DECIMAL(3,2) DEFAULT 0.25;

-- Migrate existing attribute_name to attribute_name_en
UPDATE cupping_attribute_definitions
SET attribute_name_en = attribute_name
WHERE attribute_name_en IS NULL AND attribute_name IS NOT NULL;

-- Set Portuguese and Spanish to same as English initially
UPDATE cupping_attribute_definitions
SET attribute_name_pt = attribute_name_en,
    attribute_name_es = attribute_name_en
WHERE attribute_name_en IS NOT NULL AND (attribute_name_pt IS NULL OR attribute_name_es IS NULL);

-- Make attribute_name_en required
ALTER TABLE cupping_attribute_definitions
ALTER COLUMN attribute_name_en SET NOT NULL;

-- ========================================
-- UPDATE INDEXES
-- ========================================

-- Add index for template inheritance lookup
CREATE INDEX IF NOT EXISTS idx_quality_templates_parent ON quality_templates(template_parent_id) WHERE template_parent_id IS NOT NULL;

-- Add index for laboratory-specific templates
CREATE INDEX IF NOT EXISTS idx_quality_templates_laboratory ON quality_templates(laboratory_id) WHERE laboratory_id IS NOT NULL;

-- Add indexes for multi-language search
CREATE INDEX IF NOT EXISTS idx_quality_templates_name_en ON quality_templates(name_en);
CREATE INDEX IF NOT EXISTS idx_quality_templates_name_pt ON quality_templates(name_pt) WHERE name_pt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_templates_name_es ON quality_templates(name_es) WHERE name_es IS NOT NULL;

-- Add indexes for cupping attributes multi-language search
CREATE INDEX IF NOT EXISTS idx_cupping_attributes_name_en ON cupping_attribute_definitions(attribute_name_en);
CREATE INDEX IF NOT EXISTS idx_cupping_attributes_name_pt ON cupping_attribute_definitions(attribute_name_pt) WHERE attribute_name_pt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cupping_attributes_name_es ON cupping_attribute_definitions(attribute_name_es) WHERE attribute_name_es IS NOT NULL;

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to get quality template name in preferred language with fallback
CREATE OR REPLACE FUNCTION get_quality_template_name(
    p_template_id UUID,
    p_language TEXT DEFAULT 'EN'
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_name TEXT;
BEGIN
    -- Try to get name in requested language
    CASE UPPER(p_language)
        WHEN 'PT' THEN
            SELECT name_pt INTO v_name FROM quality_templates WHERE id = p_template_id;
        WHEN 'ES' THEN
            SELECT name_es INTO v_name FROM quality_templates WHERE id = p_template_id;
        ELSE
            SELECT name_en INTO v_name FROM quality_templates WHERE id = p_template_id;
    END CASE;

    -- Fallback to English if translation is missing
    IF v_name IS NULL THEN
        SELECT name_en INTO v_name FROM quality_templates WHERE id = p_template_id;
    END IF;

    RETURN v_name;
END;
$$;

-- Function to get quality template description in preferred language with fallback
CREATE OR REPLACE FUNCTION get_quality_template_description(
    p_template_id UUID,
    p_language TEXT DEFAULT 'EN'
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_description TEXT;
BEGIN
    -- Try to get description in requested language
    CASE UPPER(p_language)
        WHEN 'PT' THEN
            SELECT description_pt INTO v_description FROM quality_templates WHERE id = p_template_id;
        WHEN 'ES' THEN
            SELECT description_es INTO v_description FROM quality_templates WHERE id = p_template_id;
        ELSE
            SELECT description_en INTO v_description FROM quality_templates WHERE id = p_template_id;
    END CASE;

    -- Fallback to English if translation is missing
    IF v_description IS NULL THEN
        SELECT description_en INTO v_description FROM quality_templates WHERE id = p_template_id;
    END IF;

    RETURN v_description;
END;
$$;

-- Function to get cupping attribute name in preferred language with fallback
CREATE OR REPLACE FUNCTION get_cupping_attribute_name(
    p_attribute_id UUID,
    p_language TEXT DEFAULT 'EN'
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_name TEXT;
BEGIN
    -- Try to get name in requested language
    CASE UPPER(p_language)
        WHEN 'PT' THEN
            SELECT attribute_name_pt INTO v_name FROM cupping_attribute_definitions WHERE id = p_attribute_id;
        WHEN 'ES' THEN
            SELECT attribute_name_es INTO v_name FROM cupping_attribute_definitions WHERE id = p_attribute_id;
        ELSE
            SELECT attribute_name_en INTO v_name FROM cupping_attribute_definitions WHERE id = p_attribute_id;
    END CASE;

    -- Fallback to English if translation is missing
    IF v_name IS NULL THEN
        SELECT attribute_name_en INTO v_name FROM cupping_attribute_definitions WHERE id = p_attribute_id;
    END IF;

    RETURN v_name;
END;
$$;

-- Function to clone a quality template with all its attributes
CREATE OR REPLACE FUNCTION clone_quality_template(
    p_source_template_id UUID,
    p_new_name_en TEXT,
    p_new_name_pt TEXT DEFAULT NULL,
    p_new_name_es TEXT DEFAULT NULL,
    p_laboratory_id UUID DEFAULT NULL,
    p_is_global BOOLEAN DEFAULT false,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_template_id UUID;
    v_source_template RECORD;
    v_attribute RECORD;
BEGIN
    -- Get source template data
    SELECT * INTO v_source_template FROM quality_templates WHERE id = p_source_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source template not found: %', p_source_template_id;
    END IF;

    -- Create new template as a copy
    INSERT INTO quality_templates (
        name_en, name_pt, name_es,
        description_en, description_pt, description_es,
        sample_size_grams,
        template_parent_id,
        laboratory_id,
        is_global,
        defect_thresholds_primary,
        defect_thresholds_secondary,
        moisture_standard,
        cupping_scale_type,
        cupping_scale_min,
        cupping_scale_max,
        cupping_scale_increment,
        max_taints_allowed,
        max_faults_allowed,
        taint_fault_rule_type,
        screen_size_requirements,
        parameters,
        version,
        created_by,
        is_active
    ) VALUES (
        p_new_name_en,
        COALESCE(p_new_name_pt, p_new_name_en),
        COALESCE(p_new_name_es, p_new_name_en),
        v_source_template.description_en,
        v_source_template.description_pt,
        v_source_template.description_es,
        v_source_template.sample_size_grams,
        p_source_template_id, -- Set parent reference
        p_laboratory_id,
        p_is_global,
        v_source_template.defect_thresholds_primary,
        v_source_template.defect_thresholds_secondary,
        v_source_template.moisture_standard,
        v_source_template.cupping_scale_type,
        v_source_template.cupping_scale_min,
        v_source_template.cupping_scale_max,
        v_source_template.cupping_scale_increment,
        v_source_template.max_taints_allowed,
        v_source_template.max_faults_allowed,
        v_source_template.taint_fault_rule_type,
        v_source_template.screen_size_requirements,
        v_source_template.parameters,
        1, -- New version starts at 1
        p_created_by,
        true
    )
    RETURNING id INTO v_new_template_id;

    -- Clone all associated cupping attributes
    FOR v_attribute IN
        SELECT * FROM cupping_attribute_definitions
        WHERE quality_id = (SELECT id FROM client_qualities WHERE template_id = p_source_template_id LIMIT 1)
    LOOP
        INSERT INTO cupping_attribute_definitions (
            client_id,
            quality_id,
            attribute_name_en,
            attribute_name_pt,
            attribute_name_es,
            scale_type,
            scale_min,
            scale_max,
            scale_increment,
            display_order,
            is_required,
            only_for_q_grading,
            is_active
        ) VALUES (
            v_attribute.client_id,
            NULL, -- Will be set when quality is created
            v_attribute.attribute_name_en,
            v_attribute.attribute_name_pt,
            v_attribute.attribute_name_es,
            v_attribute.scale_type,
            v_attribute.scale_min,
            v_attribute.scale_max,
            v_attribute.scale_increment,
            v_attribute.display_order,
            v_attribute.is_required,
            v_attribute.only_for_q_grading,
            true
        );
    END LOOP;

    RETURN v_new_template_id;
END;
$$;

-- Function to get available scale types with translations
CREATE OR REPLACE FUNCTION get_scale_type_name(
    p_scale_type TEXT,
    p_language TEXT DEFAULT 'EN'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Scale types are typically numeric and don't need translation,
    -- but this function provides a consistent interface
    RETURN p_scale_type;
END;
$$;

-- Function to validate scale configuration
CREATE OR REPLACE FUNCTION validate_scale_config(
    p_scale_type TEXT,
    p_scale_min DECIMAL,
    p_scale_max DECIMAL,
    p_scale_increment DECIMAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Check that min < max
    IF p_scale_min >= p_scale_max THEN
        RETURN false;
    END IF;

    -- Check that increment is positive and less than range
    IF p_scale_increment <= 0 OR p_scale_increment >= (p_scale_max - p_scale_min) THEN
        RETURN false;
    END IF;

    -- Check that the range is divisible by increment (allowing for small floating point errors)
    IF MOD((p_scale_max - p_scale_min)::NUMERIC, p_scale_increment::NUMERIC) > 0.01 THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

-- ========================================
-- ENHANCED RLS POLICIES
-- ========================================

-- Drop existing basic policies to replace with more granular ones
DROP POLICY IF EXISTS "QC users can view quality templates" ON quality_templates;
DROP POLICY IF EXISTS "Quality managers can create templates" ON quality_templates;

-- Global templates: viewable by all QC users
CREATE POLICY "Anyone can view global templates" ON quality_templates
    FOR SELECT USING (
        is_global = true
    );

-- Lab templates: viewable by users in the same lab
CREATE POLICY "Lab users can view lab templates" ON quality_templates
    FOR SELECT USING (
        is_global = false AND
        laboratory_id IN (
            SELECT laboratory_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Private templates: viewable only by creator
CREATE POLICY "Users can view their own templates" ON quality_templates
    FOR SELECT USING (
        is_global = false AND
        laboratory_id IS NULL AND
        created_by = auth.uid()
    );

-- Template creation: Quality managers and admins
CREATE POLICY "Quality managers can create templates" ON quality_templates
    FOR INSERT WITH CHECK (
        get_user_qc_role(auth.uid()) IN ('lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Template updates: Only creator or managers from same lab
CREATE POLICY "Quality managers can update templates" ON quality_templates
    FOR UPDATE USING (
        created_by = auth.uid() OR
        (get_user_qc_role(auth.uid()) IN ('lab_quality_manager', 'global_quality_admin', 'global_admin') AND
         (laboratory_id IS NULL OR laboratory_id IN (SELECT laboratory_id FROM profiles WHERE id = auth.uid())))
    );

-- Template deletion: Only creator or admins
CREATE POLICY "Admins can delete templates" ON quality_templates
    FOR DELETE USING (
        created_by = auth.uid() OR
        get_user_qc_role(auth.uid()) IN ('global_quality_admin', 'global_admin')
    );

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON COLUMN quality_templates.name_en IS 'Template name in English (required, base language)';
COMMENT ON COLUMN quality_templates.name_pt IS 'Template name in Portuguese';
COMMENT ON COLUMN quality_templates.name_es IS 'Template name in Spanish';
COMMENT ON COLUMN quality_templates.description_en IS 'Template description in English';
COMMENT ON COLUMN quality_templates.description_pt IS 'Template description in Portuguese';
COMMENT ON COLUMN quality_templates.description_es IS 'Template description in Spanish';
COMMENT ON COLUMN quality_templates.sample_size_grams IS 'Default sample size in grams (default 300g, can be customized)';
COMMENT ON COLUMN quality_templates.template_parent_id IS 'Reference to parent template if this was cloned/inherited';
COMMENT ON COLUMN quality_templates.laboratory_id IS 'Laboratory this template belongs to (NULL for private or global templates)';
COMMENT ON COLUMN quality_templates.is_global IS 'Whether this template is globally accessible to all labs';
COMMENT ON COLUMN quality_templates.taint_fault_rule_type IS 'How to evaluate taint/fault thresholds: AND (both must pass) or OR (either must pass)';
COMMENT ON COLUMN quality_templates.screen_size_requirements IS 'JSONB object with screen size percentages, e.g., {"17": 30, "18": 25}';

COMMENT ON COLUMN cupping_attribute_definitions.attribute_name_en IS 'Attribute name in English (required, base language)';
COMMENT ON COLUMN cupping_attribute_definitions.attribute_name_pt IS 'Attribute name in Portuguese';
COMMENT ON COLUMN cupping_attribute_definitions.attribute_name_es IS 'Attribute name in Spanish';
COMMENT ON COLUMN cupping_attribute_definitions.scale_type IS 'Scale type identifier (e.g., "1-5", "1-7", "1-10")';
COMMENT ON COLUMN cupping_attribute_definitions.scale_min IS 'Minimum value for this attribute scale';
COMMENT ON COLUMN cupping_attribute_definitions.scale_max IS 'Maximum value for this attribute scale';
COMMENT ON COLUMN cupping_attribute_definitions.scale_increment IS 'Increment step for this attribute scale (e.g., 0.25, 0.5, 1.0)';

COMMENT ON FUNCTION get_quality_template_name IS 'Get quality template name in preferred language with fallback to English';
COMMENT ON FUNCTION get_quality_template_description IS 'Get quality template description in preferred language with fallback to English';
COMMENT ON FUNCTION get_cupping_attribute_name IS 'Get cupping attribute name in preferred language with fallback to English';
COMMENT ON FUNCTION clone_quality_template IS 'Clone a quality template with all its attributes, creating a new template with parent reference';
COMMENT ON FUNCTION validate_scale_config IS 'Validate that scale configuration is logically consistent';

-- ========================================
-- DEPRECATION NOTICE
-- ========================================

-- Mark old columns as deprecated (keep for backward compatibility)
COMMENT ON COLUMN quality_templates.name IS 'DEPRECATED: Use name_en, name_pt, name_es instead. Kept for backward compatibility.';
COMMENT ON COLUMN quality_templates.description IS 'DEPRECATED: Use description_en, description_pt, description_es instead. Kept for backward compatibility.';
COMMENT ON COLUMN cupping_attribute_definitions.attribute_name IS 'DEPRECATED: Use attribute_name_en, attribute_name_pt, attribute_name_es instead. Kept for backward compatibility.';

-- ========================================
-- VERIFICATION
-- ========================================

-- Verify migration
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check that all rows have name_en
    SELECT COUNT(*) INTO v_count FROM quality_templates WHERE name_en IS NULL;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Migration verification failed: % templates missing name_en', v_count;
    END IF;

    -- Check that all rows have sample_size_grams
    SELECT COUNT(*) INTO v_count FROM quality_templates WHERE sample_size_grams IS NULL;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Migration verification failed: % templates missing sample_size_grams', v_count;
    END IF;

    -- Check that all cupping attributes have attribute_name_en
    SELECT COUNT(*) INTO v_count FROM cupping_attribute_definitions WHERE attribute_name_en IS NULL;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Migration verification failed: % cupping attributes missing attribute_name_en', v_count;
    END IF;

    -- Check that helper functions exist
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_quality_template_name') THEN
        RAISE EXCEPTION 'Migration verification failed: get_quality_template_name function not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'clone_quality_template') THEN
        RAISE EXCEPTION 'Migration verification failed: clone_quality_template function not created';
    END IF;

    RAISE NOTICE 'Migration 017 completed successfully: Multi-language quality templates and inheritance enabled';
END;
$$;

SELECT 'Migration 017: Multi-language quality templates with template inheritance completed' as status;

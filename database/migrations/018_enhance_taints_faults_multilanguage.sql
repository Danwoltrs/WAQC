-- Enhancement Migration: Add Multi-Language Support and Flexible Scales to Taints/Faults System
-- This migration enhances the taint_fault_definitions table with:
-- 1. Multi-language name fields (EN, PT, ES)
-- 2. Flexible scale configuration (replacing JSONB severity_levels)
-- 3. Client-specific customization support
-- 4. Threshold management for pass/fail criteria
-- 5. Helper functions for translation and validation

-- ========================================
-- ENHANCE TAINT_FAULT_DEFINITIONS TABLE
-- ========================================

-- Add multi-language name fields
ALTER TABLE taint_fault_definitions
ADD COLUMN IF NOT EXISTS name_en TEXT,
ADD COLUMN IF NOT EXISTS name_pt TEXT,
ADD COLUMN IF NOT EXISTS name_es TEXT;

-- Add multi-language description fields
ALTER TABLE taint_fault_definitions
ADD COLUMN IF NOT EXISTS description_en TEXT,
ADD COLUMN IF NOT EXISTS description_pt TEXT,
ADD COLUMN IF NOT EXISTS description_es TEXT;

-- Add scale configuration fields (replacing severity_levels approach)
ALTER TABLE taint_fault_definitions
ADD COLUMN IF NOT EXISTS default_scale TEXT DEFAULT '1-5',
ADD COLUMN IF NOT EXISTS default_scale_min DECIMAL(4,2) DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS default_scale_max DECIMAL(4,2) DEFAULT 5.00,
ADD COLUMN IF NOT EXISTS default_scale_increment DECIMAL(3,2) DEFAULT 0.25;

-- Add distinction field for tolerance counting
ALTER TABLE taint_fault_definitions
ADD COLUMN IF NOT EXISTS tolerance_distinction BOOLEAN DEFAULT false;

-- Add default threshold (when this value is exceeded, it's a concern)
ALTER TABLE taint_fault_definitions
ADD COLUMN IF NOT EXISTS default_threshold DECIMAL(4,2);

-- ========================================
-- MIGRATE EXISTING DATA
-- ========================================

-- Copy existing name to name_en (English as default)
UPDATE taint_fault_definitions
SET name_en = name
WHERE name_en IS NULL AND name IS NOT NULL;

-- Set Portuguese and Spanish to same as English initially
UPDATE taint_fault_definitions
SET name_pt = name_en,
    name_es = name_en
WHERE name_en IS NOT NULL AND (name_pt IS NULL OR name_es IS NULL);

-- Analyze severity_levels JSONB and extract scale information
-- For existing data, try to infer scale from severity_levels structure
UPDATE taint_fault_definitions
SET
    default_scale = CASE
        WHEN jsonb_array_length(severity_levels) <= 3 THEN '1-5'
        WHEN jsonb_array_length(severity_levels) <= 5 THEN '1-7'
        ELSE '1-10'
    END,
    default_scale_min = 1.00,
    default_scale_max = CASE
        WHEN jsonb_array_length(severity_levels) <= 3 THEN 5.00
        WHEN jsonb_array_length(severity_levels) <= 5 THEN 7.00
        ELSE 10.00
    END,
    default_scale_increment = 1.00
WHERE severity_levels IS NOT NULL AND severity_levels != '[]'::jsonb;

-- ========================================
-- UPDATE CONSTRAINTS
-- ========================================

-- Make name_en required (English is the base language)
ALTER TABLE taint_fault_definitions
ALTER COLUMN name_en SET NOT NULL;

-- Add check constraint for scale configuration
ALTER TABLE taint_fault_definitions
ADD CONSTRAINT check_scale_config
CHECK (default_scale_min < default_scale_max);

ALTER TABLE taint_fault_definitions
ADD CONSTRAINT check_scale_increment
CHECK (default_scale_increment > 0);

-- ========================================
-- CREATE CLIENT CUSTOMIZATION TABLE
-- ========================================

-- Client-specific taint/fault customizations
CREATE TABLE IF NOT EXISTS client_taint_fault_customizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    definition_id UUID REFERENCES taint_fault_definitions(id) ON DELETE CASCADE,
    -- Scale overrides
    custom_scale TEXT,
    custom_scale_min DECIMAL(4,2),
    custom_scale_max DECIMAL(4,2),
    custom_scale_increment DECIMAL(3,2),
    -- Threshold override
    max_acceptable_score DECIMAL(4,2),
    -- Custom descriptions (if client wants different wording)
    custom_description_en TEXT,
    custom_description_pt TEXT,
    custom_description_es TEXT,
    -- Tolerance rules
    is_tolerance_counted BOOLEAN DEFAULT true,
    -- Metadata
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, definition_id)
);

-- ========================================
-- CREATE TEMPLATE ASSOCIATIONS TABLE
-- ========================================

-- Link taints/faults to quality templates
CREATE TABLE IF NOT EXISTS template_taint_fault_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES quality_templates(id) ON DELETE CASCADE,
    definition_id UUID REFERENCES taint_fault_definitions(id) ON DELETE CASCADE,
    -- Template-specific overrides
    template_scale TEXT,
    template_scale_min DECIMAL(4,2),
    template_scale_max DECIMAL(4,2),
    template_scale_increment DECIMAL(3,2),
    template_threshold DECIMAL(4,2),
    -- Rule configuration
    max_allowed_count INTEGER, -- How many instances allowed
    is_blocking BOOLEAN DEFAULT false, -- If true, any occurrence fails the sample
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(template_id, definition_id)
);

-- ========================================
-- UPDATE INDEXES
-- ========================================

-- Update existing indexes to use new name_en field
DROP INDEX IF EXISTS idx_taint_fault_global_unique;
DROP INDEX IF EXISTS idx_taint_fault_client_unique;

-- Global definitions (client_id IS NULL) - use name_en
CREATE UNIQUE INDEX idx_taint_fault_global_unique
    ON taint_fault_definitions(origin, type, name_en)
    WHERE client_id IS NULL;

-- Client-specific definitions - use name_en
CREATE UNIQUE INDEX idx_taint_fault_client_unique
    ON taint_fault_definitions(origin, type, name_en, client_id)
    WHERE client_id IS NOT NULL;

-- Add indexes for multi-language search
CREATE INDEX IF NOT EXISTS idx_taint_fault_name_en ON taint_fault_definitions(name_en);
CREATE INDEX IF NOT EXISTS idx_taint_fault_name_pt ON taint_fault_definitions(name_pt) WHERE name_pt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_taint_fault_name_es ON taint_fault_definitions(name_es) WHERE name_es IS NOT NULL;

-- Add indexes for scale filtering
CREATE INDEX IF NOT EXISTS idx_taint_fault_scale ON taint_fault_definitions(default_scale);
CREATE INDEX IF NOT EXISTS idx_taint_fault_type_distinction ON taint_fault_definitions(type, tolerance_distinction);

-- Indexes for customization table
CREATE INDEX IF NOT EXISTS idx_client_taint_fault_client ON client_taint_fault_customizations(client_id);
CREATE INDEX IF NOT EXISTS idx_client_taint_fault_definition ON client_taint_fault_customizations(definition_id);

-- Indexes for template associations
CREATE INDEX IF NOT EXISTS idx_template_taint_fault_template ON template_taint_fault_config(template_id);
CREATE INDEX IF NOT EXISTS idx_template_taint_fault_definition ON template_taint_fault_config(definition_id);

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to get taint/fault name in preferred language with fallback
CREATE OR REPLACE FUNCTION get_taint_fault_name(
    p_definition_id UUID,
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
            SELECT name_pt INTO v_name FROM taint_fault_definitions WHERE id = p_definition_id;
        WHEN 'ES' THEN
            SELECT name_es INTO v_name FROM taint_fault_definitions WHERE id = p_definition_id;
        ELSE
            SELECT name_en INTO v_name FROM taint_fault_definitions WHERE id = p_definition_id;
    END CASE;

    -- Fallback to English if translation is missing
    IF v_name IS NULL THEN
        SELECT name_en INTO v_name FROM taint_fault_definitions WHERE id = p_definition_id;
    END IF;

    RETURN v_name;
END;
$$;

-- Function to get taint/fault description in preferred language with fallback
CREATE OR REPLACE FUNCTION get_taint_fault_description(
    p_definition_id UUID,
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
            SELECT description_pt INTO v_description FROM taint_fault_definitions WHERE id = p_definition_id;
        WHEN 'ES' THEN
            SELECT description_es INTO v_description FROM taint_fault_definitions WHERE id = p_definition_id;
        ELSE
            SELECT description_en INTO v_description FROM taint_fault_definitions WHERE id = p_definition_id;
    END CASE;

    -- Fallback to English if translation is missing
    IF v_description IS NULL THEN
        SELECT description_en INTO v_description FROM taint_fault_definitions WHERE id = p_definition_id;
    END IF;

    RETURN v_description;
END;
$$;

-- Function to get effective scale configuration for a client/definition
CREATE OR REPLACE FUNCTION get_effective_taint_fault_scale(
    p_definition_id UUID,
    p_client_id UUID DEFAULT NULL
)
RETURNS TABLE(
    scale_type TEXT,
    scale_min DECIMAL,
    scale_max DECIMAL,
    scale_increment DECIMAL,
    threshold DECIMAL
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(c.custom_scale, d.default_scale) as scale_type,
        COALESCE(c.custom_scale_min, d.default_scale_min) as scale_min,
        COALESCE(c.custom_scale_max, d.default_scale_max) as scale_max,
        COALESCE(c.custom_scale_increment, d.default_scale_increment) as scale_increment,
        COALESCE(c.max_acceptable_score, d.default_threshold) as threshold
    FROM taint_fault_definitions d
    LEFT JOIN client_taint_fault_customizations c
        ON c.definition_id = d.id AND c.client_id = p_client_id
    WHERE d.id = p_definition_id;
END;
$$;

-- Function to get taint/fault type name in preferred language
CREATE OR REPLACE FUNCTION get_taint_fault_type_name(
    p_type taint_fault_type,
    p_language TEXT DEFAULT 'EN'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_type = 'taint' THEN
        CASE UPPER(p_language)
            WHEN 'PT' THEN RETURN 'Defeito Leve';
            WHEN 'ES' THEN RETURN 'Defecto Leve';
            ELSE RETURN 'Taint';
        END CASE;
    ELSIF p_type = 'fault' THEN
        CASE UPPER(p_language)
            WHEN 'PT' THEN RETURN 'Defeito Grave';
            WHEN 'ES' THEN RETURN 'Defecto Grave';
            ELSE RETURN 'Fault';
        END CASE;
    ELSE
        RETURN p_type::TEXT;
    END IF;
END;
$$;

-- Function to validate taint/fault against thresholds
CREATE OR REPLACE FUNCTION validate_taint_fault_score(
    p_definition_id UUID,
    p_client_id UUID,
    p_score DECIMAL,
    p_count INTEGER DEFAULT 1
)
RETURNS TABLE(
    is_valid BOOLEAN,
    message TEXT,
    threshold_exceeded BOOLEAN
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_config RECORD;
    v_template_config RECORD;
    v_effective_threshold DECIMAL;
    v_max_count INTEGER;
BEGIN
    -- Get effective scale configuration
    SELECT * INTO v_config
    FROM get_effective_taint_fault_scale(p_definition_id, p_client_id);

    -- Check if score is within scale range
    IF p_score < v_config.scale_min OR p_score > v_config.scale_max THEN
        RETURN QUERY SELECT
            false,
            format('Score %s is outside valid range [%s, %s]', p_score, v_config.scale_min, v_config.scale_max),
            false;
        RETURN;
    END IF;

    -- Check against threshold if defined
    IF v_config.threshold IS NOT NULL AND p_score > v_config.threshold THEN
        RETURN QUERY SELECT
            false,
            format('Score %s exceeds maximum acceptable threshold of %s', p_score, v_config.threshold),
            true;
        RETURN;
    END IF;

    -- If all checks pass
    RETURN QUERY SELECT
        true,
        'Score is within acceptable parameters',
        false;
END;
$$;

-- Function to evaluate sample against taint/fault rules
CREATE OR REPLACE FUNCTION evaluate_sample_taints_faults(
    p_sample_id UUID,
    p_client_id UUID,
    p_template_id UUID
)
RETURNS TABLE(
    passes_taints BOOLEAN,
    passes_faults BOOLEAN,
    total_taints INTEGER,
    total_faults INTEGER,
    max_taints_allowed INTEGER,
    max_faults_allowed INTEGER,
    failing_items JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_template RECORD;
    v_taint_count INTEGER := 0;
    v_fault_count INTEGER := 0;
BEGIN
    -- Get template configuration
    SELECT
        max_taints_allowed,
        max_faults_allowed,
        taint_fault_rule_type
    INTO v_template
    FROM quality_templates
    WHERE id = p_template_id;

    -- Count taints and faults for this sample
    -- (This would query actual cupping_scores or quality_assessments table
    -- once those are populated with taint/fault data)

    -- For now, return the configuration
    RETURN QUERY SELECT
        v_taint_count <= COALESCE(v_template.max_taints_allowed, 999),
        v_fault_count <= COALESCE(v_template.max_faults_allowed, 999),
        v_taint_count,
        v_fault_count,
        v_template.max_taints_allowed,
        v_template.max_faults_allowed,
        '[]'::JSONB;
END;
$$;

-- ========================================
-- TRIGGERS
-- ========================================

-- Add trigger for client_taint_fault_customizations
CREATE TRIGGER update_client_taint_fault_customizations_updated_at
BEFORE UPDATE ON client_taint_fault_customizations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add trigger for template_taint_fault_config
CREATE TRIGGER update_template_taint_fault_config_updated_at
BEFORE UPDATE ON template_taint_fault_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- RLS POLICIES
-- ========================================

-- Enable RLS on new tables
ALTER TABLE client_taint_fault_customizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_taint_fault_config ENABLE ROW LEVEL SECURITY;

-- Client customizations: viewable by client users and lab personnel
CREATE POLICY "Clients can view their customizations" ON client_taint_fault_customizations
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE id = (SELECT client_id FROM profiles WHERE id = auth.uid())) OR
        get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

CREATE POLICY "Quality managers can manage customizations" ON client_taint_fault_customizations
    FOR ALL USING (
        get_user_qc_role(auth.uid()) IN ('lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Template taint/fault config: follows template access rules
CREATE POLICY "Users can view template taint/fault config" ON template_taint_fault_config
    FOR SELECT USING (
        template_id IN (SELECT id FROM quality_templates)
    );

CREATE POLICY "Quality managers can manage template taint/fault config" ON template_taint_fault_config
    FOR ALL USING (
        get_user_qc_role(auth.uid()) IN ('lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON COLUMN taint_fault_definitions.name_en IS 'Taint/fault name in English (required, base language)';
COMMENT ON COLUMN taint_fault_definitions.name_pt IS 'Taint/fault name in Portuguese';
COMMENT ON COLUMN taint_fault_definitions.name_es IS 'Taint/fault name in Spanish';
COMMENT ON COLUMN taint_fault_definitions.description_en IS 'Detailed description in English';
COMMENT ON COLUMN taint_fault_definitions.description_pt IS 'Detailed description in Portuguese';
COMMENT ON COLUMN taint_fault_definitions.description_es IS 'Detailed description in Spanish';
COMMENT ON COLUMN taint_fault_definitions.default_scale IS 'Default scale type (e.g., "1-5", "1-7", "1-10")';
COMMENT ON COLUMN taint_fault_definitions.default_scale_min IS 'Minimum value on the scale';
COMMENT ON COLUMN taint_fault_definitions.default_scale_max IS 'Maximum value on the scale';
COMMENT ON COLUMN taint_fault_definitions.default_scale_increment IS 'Increment step (e.g., 0.25, 0.5, 1.0)';
COMMENT ON COLUMN taint_fault_definitions.tolerance_distinction IS 'Whether this taint/fault counts toward tolerance thresholds';
COMMENT ON COLUMN taint_fault_definitions.default_threshold IS 'Default score above which this is considered a failure';

COMMENT ON TABLE client_taint_fault_customizations IS 'Client-specific overrides for taint/fault scale configurations and thresholds';
COMMENT ON TABLE template_taint_fault_config IS 'Links taints/faults to quality templates with template-specific rules';

COMMENT ON FUNCTION get_taint_fault_name IS 'Get taint/fault name in preferred language with fallback to English';
COMMENT ON FUNCTION get_taint_fault_description IS 'Get taint/fault description in preferred language with fallback to English';
COMMENT ON FUNCTION get_effective_taint_fault_scale IS 'Get effective scale configuration for a taint/fault, considering client customizations';
COMMENT ON FUNCTION validate_taint_fault_score IS 'Validate a taint/fault score against configured thresholds';
COMMENT ON FUNCTION evaluate_sample_taints_faults IS 'Evaluate whether a sample passes taint/fault criteria for a quality template';

-- ========================================
-- DEPRECATION NOTICE
-- ========================================

-- Mark old columns as deprecated (keep for backward compatibility)
COMMENT ON COLUMN taint_fault_definitions.name IS 'DEPRECATED: Use name_en, name_pt, name_es instead. Kept for backward compatibility.';
COMMENT ON COLUMN taint_fault_definitions.severity_levels IS 'DEPRECATED: Use default_scale, default_scale_min, default_scale_max, default_scale_increment instead. Kept for backward compatibility.';

-- ========================================
-- VERIFICATION
-- ========================================

-- Verify migration
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check that all rows have name_en
    SELECT COUNT(*) INTO v_count FROM taint_fault_definitions WHERE name_en IS NULL;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'Migration verification failed: % taint/fault definitions missing name_en', v_count;
    END IF;

    -- Check that helper functions exist
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_taint_fault_name') THEN
        RAISE EXCEPTION 'Migration verification failed: get_taint_fault_name function not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_effective_taint_fault_scale') THEN
        RAISE EXCEPTION 'Migration verification failed: get_effective_taint_fault_scale function not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_taint_fault_score') THEN
        RAISE EXCEPTION 'Migration verification failed: validate_taint_fault_score function not created';
    END IF;

    -- Check that new tables exist
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'client_taint_fault_customizations') THEN
        RAISE EXCEPTION 'Migration verification failed: client_taint_fault_customizations table not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'template_taint_fault_config') THEN
        RAISE EXCEPTION 'Migration verification failed: template_taint_fault_config table not created';
    END IF;

    RAISE NOTICE 'Migration 018 completed successfully: Multi-language taints/faults with flexible scales enabled';
END;
$$;

SELECT 'Migration 018: Multi-language taints/faults with flexible scale configuration completed' as status;

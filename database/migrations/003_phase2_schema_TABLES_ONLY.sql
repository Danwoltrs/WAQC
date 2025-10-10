-- Wolthers Coffee QC System - Phase 2 Database Migration
-- This migration adds all Phase 2 required tables for:
-- - Client-specific defect configurations
-- - Origin-specific taints and faults
-- - Flexible cupping scales and attributes
-- - Storage management
-- - Certificate configurations
-- - Additional Phase 2 functionality

-- ========================================
-- ENUMS AND TYPES
-- ========================================

-- Sample type enum
DO $$ BEGIN
    CREATE TYPE sample_type_enum AS ENUM ('pss', 'ss', 'type');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Defect category enum
DO $$ BEGIN
    CREATE TYPE defect_category AS ENUM ('primary', 'secondary');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Taint/Fault type enum
DO $$ BEGIN
    CREATE TYPE taint_fault_type AS ENUM ('taint', 'fault');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Moisture standard enum
DO $$ BEGIN
    CREATE TYPE moisture_standard AS ENUM ('coffee_industry', 'iso_6673');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Client type enum
DO $$ BEGIN
    CREATE TYPE client_type_enum AS ENUM (
        'exporter_coop_producer',
        'buyer_importer_dealer',
        'importer_roaster'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ========================================
-- CLIENT-SPECIFIC DEFECT CONFIGURATION
-- ========================================

-- Defect definitions table (per-client customization)
CREATE TABLE IF NOT EXISTS defect_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    origin TEXT NOT NULL, -- e.g., 'Brazil', 'Colombia', 'Peru'
    defect_name TEXT NOT NULL, -- e.g., 'Full black', 'Partial Black', 'Severe Broca'
    point_value DECIMAL(4,2) NOT NULL, -- e.g., 1.00, 0.50, 0.20
    category defect_category NOT NULL, -- 'primary' or 'secondary'
    sample_size_grams INTEGER DEFAULT 350, -- Client-specific sample size
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, origin, defect_name)
);

-- ========================================
-- ORIGIN-SPECIFIC TAINTS AND FAULTS
-- ========================================

-- Taints and faults definitions table
CREATE TABLE IF NOT EXISTS taint_fault_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    origin TEXT NOT NULL, -- e.g., 'Brazil', 'Colombia'
    type taint_fault_type NOT NULL, -- 'taint' or 'fault'
    name TEXT NOT NULL, -- e.g., 'Harsh', 'Hard (riado)', 'Phenol (rio)'
    severity_levels JSONB NOT NULL DEFAULT '[]', -- Array of severity levels with point deductions
    client_id UUID REFERENCES clients(id), -- NULL for global, or specific client override
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique indexes for taint_fault_definitions
-- Global definitions (client_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_taint_fault_global_unique
    ON taint_fault_definitions(origin, type, name)
    WHERE client_id IS NULL;

-- Client-specific definitions
CREATE UNIQUE INDEX IF NOT EXISTS idx_taint_fault_client_unique
    ON taint_fault_definitions(origin, type, name, client_id)
    WHERE client_id IS NOT NULL;

COMMENT ON COLUMN taint_fault_definitions.severity_levels IS 'JSONB array of {level: string, points: number}, e.g., [{"level": "light", "points": 2}, {"level": "severe", "points": 4}]';

-- ========================================
-- CUPPING SCALE AND ATTRIBUTE CONFIGURATION
-- ========================================

-- Cupping scale configurations (per-client/quality)
CREATE TABLE IF NOT EXISTS cupping_scale_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    quality_id UUID REFERENCES client_qualities(id), -- Specific quality spec
    scale_type TEXT NOT NULL, -- e.g., '1-5', '1-7', '1-10'
    min_value DECIMAL(3,2) NOT NULL, -- e.g., 1.00
    max_value DECIMAL(3,2) NOT NULL, -- e.g., 10.00
    increment DECIMAL(3,2) NOT NULL, -- e.g., 0.25, 0.50, 1.00
    min_total_score DECIMAL(5,2), -- Minimum acceptable total score
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, quality_id)
);

-- Cupping attribute definitions (per-client/quality custom attributes)
CREATE TABLE IF NOT EXISTS cupping_attribute_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    quality_id UUID REFERENCES client_qualities(id), -- Specific quality spec
    attribute_name TEXT NOT NULL, -- e.g., 'Fragrance/Aroma', 'Flavor', 'Body', 'Dunkin Character'
    display_order INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN DEFAULT false,
    only_for_q_grading BOOLEAN DEFAULT false, -- e.g., Uniformity, Clean Cup
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cupping_attributes_client_quality ON cupping_attribute_definitions(client_id, quality_id);

-- ========================================
-- STORAGE MANAGEMENT
-- ========================================

-- Lab shelves configuration (flexible storage layout)
CREATE TABLE IF NOT EXISTS lab_shelves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    laboratory_id UUID REFERENCES laboratories(id) ON DELETE CASCADE,
    shelf_number INTEGER NOT NULL,
    columns INTEGER NOT NULL,
    rows INTEGER NOT NULL,
    position_layout TEXT NOT NULL, -- e.g., 'front_left', 'front_right', 'back_left', 'back_right'
    samples_per_position INTEGER NOT NULL DEFAULT 1, -- e.g., 42 for Santos HQ (3 stacks × 7 tins × front/back)
    naming_convention TEXT, -- e.g., 'S{shelf}C{column}R{row}'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(laboratory_id, shelf_number)
);

COMMENT ON TABLE lab_shelves IS 'Flexible shelf configuration per laboratory (e.g., Santos HQ: Shelf 1 6×3, Shelf 2 6×3, Shelf 3 4×3, Shelf 4 8×3)';

-- Storage positions table
CREATE TABLE IF NOT EXISTS storage_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    laboratory_id UUID REFERENCES laboratories(id) ON DELETE CASCADE,
    shelf_id UUID REFERENCES lab_shelves(id) ON DELETE CASCADE,
    position_code TEXT NOT NULL, -- e.g., 'S1C3R2' (Shelf 1, Column 3, Row 2)
    column_number INTEGER NOT NULL,
    row_number INTEGER NOT NULL,
    capacity_per_position INTEGER NOT NULL, -- From lab_shelves.samples_per_position
    current_samples UUID[] DEFAULT '{}', -- Array of sample IDs currently stored
    current_count INTEGER DEFAULT 0,
    is_available BOOLEAN GENERATED ALWAYS AS (current_count < capacity_per_position) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(laboratory_id, position_code)
);

-- Storage history table (audit trail)
CREATE TABLE IF NOT EXISTS storage_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_id UUID REFERENCES samples(id) ON DELETE CASCADE,
    position_id UUID REFERENCES storage_positions(id),
    action TEXT NOT NULL, -- 'assigned', 'removed', 'transferred'
    performed_by UUID REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storage_history_sample ON storage_history(sample_id);
CREATE INDEX IF NOT EXISTS idx_storage_positions_lab ON storage_positions(laboratory_id);

-- ========================================
-- CERTIFICATE CONFIGURATION
-- ========================================

-- Certificate number format configurations (per-client)
CREATE TABLE IF NOT EXISTS certificate_number_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    quality_id UUID REFERENCES client_qualities(id), -- Optional: specific to quality spec
    format_pattern TEXT NOT NULL, -- e.g., 'CERT-{LAB}-{YYYY}-{NNNN}', 'CA-{YY}-{NNN}'
    current_sequence INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique indexes for certificate_number_configs
-- Client-level configs (quality_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_config_client_unique
    ON certificate_number_configs(client_id)
    WHERE quality_id IS NULL;

-- Quality-specific configs
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_config_quality_unique
    ON certificate_number_configs(client_id, quality_id)
    WHERE quality_id IS NOT NULL;

COMMENT ON COLUMN certificate_number_configs.format_pattern IS 'Pattern using placeholders: {LAB}, {YYYY}, {YY}, {NNNN}, {NNN}, etc.';

-- Certificate signatures table
CREATE TABLE IF NOT EXISTS certificate_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_id UUID REFERENCES certificates(id) ON DELETE CASCADE,
    signer_id UUID REFERENCES profiles(id),
    signature_hash TEXT NOT NULL,
    signature_type TEXT NOT NULL, -- e.g., 'q_grader', 'lab_manager', 'digital'
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Certificate versions table (regeneration tracking)
CREATE TABLE IF NOT EXISTS certificate_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_id UUID REFERENCES certificates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    pdf_url TEXT,
    changes_description TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Certificate deliveries table (email tracking)
CREATE TABLE IF NOT EXISTS certificate_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_id UUID REFERENCES certificates(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    delivery_status TEXT NOT NULL, -- 'pending', 'sent', 'delivered', 'opened', 'bounced', 'failed'
    delivery_method TEXT NOT NULL DEFAULT 'email', -- 'email', 'download', 'api'
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificate_deliveries_cert ON certificate_deliveries(certificate_id);
CREATE INDEX IF NOT EXISTS idx_certificate_deliveries_status ON certificate_deliveries(delivery_status);

-- Client certificate settings table (delivery timing preferences)
CREATE TABLE IF NOT EXISTS client_certificate_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
    delivery_timing TEXT NOT NULL DEFAULT 'end_of_day', -- 'end_of_day', 'batch_by_batch', 'immediate'
    notification_emails TEXT[] DEFAULT '{}',
    include_photos BOOLEAN DEFAULT false,
    language TEXT DEFAULT 'EN', -- 'EN', 'PT', 'ES'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- QUALITY PARAMETERS (FLEXIBLE DEFINITIONS)
-- ========================================

-- Quality parameters table (flexible parameter definitions)
CREATE TABLE IF NOT EXISTS quality_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES quality_templates(id) ON DELETE CASCADE,
    parameter_name TEXT NOT NULL, -- e.g., 'screen_size_17_18_min', 'max_broca_percentage'
    parameter_type TEXT NOT NULL, -- e.g., 'percentage', 'count', 'range', 'boolean'
    parameter_value JSONB NOT NULL, -- Flexible value storage
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Template versions table
CREATE TABLE IF NOT EXISTS template_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES quality_templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    parameters JSONB NOT NULL,
    changes_description TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quality overrides table (sample-specific overrides)
CREATE TABLE IF NOT EXISTS quality_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_id UUID REFERENCES samples(id) ON DELETE CASCADE,
    parameter_name TEXT NOT NULL,
    original_value JSONB,
    override_value JSONB NOT NULL,
    justification TEXT NOT NULL,
    approved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- ROAST PROFILES
-- ========================================

-- Roast profiles table (could alternatively extend quality_assessments)
CREATE TABLE IF NOT EXISTS roast_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_id UUID REFERENCES samples(id) ON DELETE CASCADE UNIQUE,
    assessor_id UUID REFERENCES profiles(id),
    roast_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), -- Auto-captured
    batch_size_grams INTEGER,
    target_roast_level TEXT, -- 'Colorimeter' or descriptive like 'Light', 'Medium'
    actual_roast_level TEXT,
    roast_time_seconds INTEGER, -- Optional
    first_crack_time_seconds INTEGER, -- Optional
    agtron_score INTEGER,
    quaker_count INTEGER,
    quaker_threshold INTEGER, -- e.g., 3 for specialty, 8 for Dunkin
    cups_prepared INTEGER NOT NULL,
    cooling_time_minutes INTEGER,
    rest_time_hours INTEGER,
    grind_setting TEXT,
    cupping_scheduled_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Roast photos table
CREATE TABLE IF NOT EXISTS roast_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    roast_profile_id UUID REFERENCES roast_profiles(id) ON DELETE CASCADE,
    photo_type TEXT NOT NULL, -- 'quakers', 'roast_level', 'defects'
    photo_url TEXT NOT NULL,
    description TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- CUPPING DESCRIPTORS
-- ========================================

-- Cupping descriptors table (flavor tags library)
CREATE TABLE IF NOT EXISTS cupping_descriptors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    descriptor_name TEXT NOT NULL UNIQUE, -- e.g., 'Dunkin', 'Alfenas Dulce', 'Euro Dulce', 'Chocolate', 'Fruity'
    category TEXT, -- e.g., 'flavor_profile', 'regional', 'processing'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- SAMPLE TRANSFERS (CROSS-LAB)
-- ========================================

-- Sample transfers table
CREATE TABLE IF NOT EXISTS sample_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_id UUID REFERENCES samples(id) ON DELETE CASCADE,
    from_laboratory_id UUID REFERENCES laboratories(id),
    to_laboratory_id UUID REFERENCES laboratories(id),
    requested_by UUID REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    transfer_reason TEXT NOT NULL, -- 'specialized_equipment', 'capacity', 'client_preference'
    estimated_arrival TIMESTAMP WITH TIME ZONE,
    special_instructions TEXT,
    tracking_number TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'in_transit', 'completed'
    shipped_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transfer history table
CREATE TABLE IF NOT EXISTS transfer_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID REFERENCES sample_transfers(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- 'requested', 'approved', 'rejected', 'shipped', 'received'
    performed_by UUID REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sample_transfers_sample ON sample_transfers(sample_id);
CREATE INDEX IF NOT EXISTS idx_transfer_history_transfer ON transfer_history(transfer_id);

-- ========================================
-- NOTIFICATIONS AND ACTIVITIES
-- ========================================

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL, -- 'sample_assigned', 'cupping_invitation', 'out_of_spec', etc.
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_entity_type TEXT, -- 'sample', 'cupping_session', 'certificate'
    related_entity_id UUID,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- Notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
    email_enabled BOOLEAN DEFAULT true,
    email_frequency TEXT DEFAULT 'realtime', -- 'realtime', 'daily', 'disabled'
    browser_push_enabled BOOLEAN DEFAULT false,
    notification_types JSONB DEFAULT '{}', -- Per-type preferences
    do_not_disturb_start TIME,
    do_not_disturb_end TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- QC Activities table (activity feed for QC operations)
CREATE TABLE IF NOT EXISTS qc_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    laboratory_id UUID REFERENCES laboratories(id),
    user_id UUID REFERENCES profiles(id),
    activity_type TEXT NOT NULL, -- 'sample_intake', 'assessment_completed', 'cupping_session', etc.
    description TEXT NOT NULL,
    related_entity_type TEXT,
    related_entity_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_activities_lab ON qc_activities(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_qc_activities_type ON qc_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_qc_activities_created ON qc_activities(created_at DESC);

-- ========================================
-- LABORATORY CAPABILITIES AND PRICING
-- ========================================

-- Lab capabilities table
CREATE TABLE IF NOT EXISTS lab_capabilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    laboratory_id UUID REFERENCES laboratories(id) ON DELETE CASCADE UNIQUE,
    services_offered TEXT[] DEFAULT '{}', -- ['green_analysis', 'roasting', 'cupping', 'q_grading']
    equipment JSONB DEFAULT '{}',
    staff_count INTEGER,
    max_daily_capacity INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lab pricing table (per-client pricing)
CREATE TABLE IF NOT EXISTS lab_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    laboratory_id UUID REFERENCES laboratories(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    pricing_type TEXT NOT NULL, -- 'per_pound', 'per_sample'
    price_amount DECIMAL(10,2) NOT NULL, -- e.g., 0.35 to 1.00 USD
    currency TEXT DEFAULT 'USD',
    approved_pricing DECIMAL(10,2), -- Different pricing for approved samples
    rejected_pricing DECIMAL(10,2), -- Different pricing for rejected samples
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(laboratory_id, client_id)
);

-- Third party lab fees table
CREATE TABLE IF NOT EXISTS third_party_lab_fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    third_party_lab_name TEXT NOT NULL,
    fee_per_sample DECIMAL(10,2) NOT NULL, -- e.g., 20 USD per sample
    currency TEXT DEFAULT 'USD',
    our_charge_approved DECIMAL(10,2), -- What we charge the final buyer for approved
    our_charge_rejected DECIMAL(10,2), -- What we charge for rejected
    contract_start_date DATE,
    contract_end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- API KEYS (EXTERNAL INTEGRATIONS)
-- ========================================

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    key_name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    api_secret TEXT NOT NULL,
    permissions TEXT[] DEFAULT '{}', -- e.g., ['read_certificates', 'download_pdf', 'verify']
    rate_limit INTEGER DEFAULT 100, -- Requests per minute
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_client ON api_keys(client_id);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

CREATE INDEX IF NOT EXISTS idx_defect_definitions_client ON defect_definitions(client_id);
CREATE INDEX IF NOT EXISTS idx_defect_definitions_origin ON defect_definitions(origin);
CREATE INDEX IF NOT EXISTS idx_taint_fault_definitions_origin ON taint_fault_definitions(origin);
CREATE INDEX IF NOT EXISTS idx_cupping_scale_configs_client ON cupping_scale_configs(client_id);
CREATE INDEX IF NOT EXISTS idx_certificate_number_configs_client ON certificate_number_configs(client_id);
CREATE INDEX IF NOT EXISTS idx_roast_profiles_sample ON roast_profiles(sample_id);
CREATE INDEX IF NOT EXISTS idx_quality_parameters_template ON quality_parameters(template_id);
CREATE INDEX IF NOT EXISTS idx_quality_overrides_sample ON quality_overrides(sample_id);

-- ========================================
-- UPDATED_AT TRIGGERS
-- ========================================

CREATE TRIGGER update_defect_definitions_updated_at BEFORE UPDATE ON defect_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_taint_fault_definitions_updated_at BEFORE UPDATE ON taint_fault_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cupping_scale_configs_updated_at BEFORE UPDATE ON cupping_scale_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cupping_attribute_definitions_updated_at BEFORE UPDATE ON cupping_attribute_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lab_shelves_updated_at BEFORE UPDATE ON lab_shelves FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_storage_positions_updated_at BEFORE UPDATE ON storage_positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_certificate_number_configs_updated_at BEFORE UPDATE ON certificate_number_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_certificate_settings_updated_at BEFORE UPDATE ON client_certificate_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quality_parameters_updated_at BEFORE UPDATE ON quality_parameters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_roast_profiles_updated_at BEFORE UPDATE ON roast_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sample_transfers_updated_at BEFORE UPDATE ON sample_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lab_capabilities_updated_at BEFORE UPDATE ON lab_capabilities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lab_pricing_updated_at BEFORE UPDATE ON lab_pricing FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_third_party_lab_fees_updated_at BEFORE UPDATE ON third_party_lab_fees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ========================================

-- Enable RLS on all new tables

SELECT 'Phase 2 tables created successfully (no RLS policies)' as status;

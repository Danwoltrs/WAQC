-- Migration 057: Restructure bag information for proper bag tracking
-- Add bag_type enum and improve bag weight/quantity tracking
-- Bag types: jute_bag, pp_bag, big_bag, bulk
-- Standard bag weights: 30, 59, 60, 70 kg (jute/PP), 1000 kg (big bag), 21600 kg (bulk - 1 container)

-- ========================================
-- STEP 1: Create bag_type enum
-- ========================================

DO $$ BEGIN
    CREATE TYPE bag_type_enum AS ENUM (
        'jute_bag',      -- Traditional jute/burlap bags
        'pp_bag',        -- Polypropylene bags
        'big_bag',       -- 1 M/T bags (1000 kg)
        'bulk'           -- Bulk container (typically 21.6 M/T)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE bag_type_enum IS 'Types of coffee bags: jute_bag, pp_bag, big_bag (1 M/T), bulk (21.6 M/T container)';

-- ========================================
-- STEP 2: Create bag_weight_standards table
-- ========================================

CREATE TABLE IF NOT EXISTS bag_weight_standards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    weight_kg DECIMAL(10,2) NOT NULL UNIQUE,
    bag_type bag_type_enum NOT NULL,
    equivalent_60kg_bags DECIMAL(10,2) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bag_weight_standards_weight ON bag_weight_standards(weight_kg);
CREATE INDEX IF NOT EXISTS idx_bag_weight_standards_type ON bag_weight_standards(bag_type);
CREATE INDEX IF NOT EXISTS idx_bag_weight_standards_active ON bag_weight_standards(is_active);

COMMENT ON TABLE bag_weight_standards IS 'Standard bag weights and their equivalents to 60kg bags for calculation consistency';
COMMENT ON COLUMN bag_weight_standards.weight_kg IS 'Standard weight in kilograms';
COMMENT ON COLUMN bag_weight_standards.equivalent_60kg_bags IS 'How many 60kg bags this represents (e.g., 70kg = 1.167, 30kg = 0.5)';

-- Insert standard bag weights
INSERT INTO bag_weight_standards (weight_kg, bag_type, equivalent_60kg_bags, description) VALUES
(30, 'jute_bag', 0.5, '30 kg jute bag (half of 60kg standard)'),
(59, 'jute_bag', 0.983, '59 kg jute bag'),
(60, 'jute_bag', 1.0, '60 kg jute bag (standard reference)'),
(70, 'jute_bag', 1.167, '70 kg jute bag'),
(30, 'pp_bag', 0.5, '30 kg PP bag (half of 60kg standard)'),
(59, 'pp_bag', 0.983, '59 kg PP bag'),
(60, 'pp_bag', 1.0, '60 kg PP bag (standard reference)'),
(70, 'pp_bag', 1.167, '70 kg PP bag'),
(1000, 'big_bag', 16.667, 'Big Bag (1 M/T = 1000 kg)'),
(21600, 'bulk', 360.0, 'Bulk container (21.6 M/T typical container)')
ON CONFLICT (weight_kg) DO NOTHING;

-- ========================================
-- STEP 3: Add new columns to samples table
-- ========================================

-- Add bag_type column
ALTER TABLE samples ADD COLUMN IF NOT EXISTS bag_type bag_type_enum;

-- Add equivalent_60kg_bags for easy calculation (auto-calculated)
ALTER TABLE samples ADD COLUMN IF NOT EXISTS equivalent_60kg_bags DECIMAL(10,2);

COMMENT ON COLUMN samples.bag_type IS 'Type of bag: jute_bag, pp_bag, big_bag (1 M/T), or bulk (21.6 M/T)';
COMMENT ON COLUMN samples.bag_count IS 'Number of bags/units in the lot';
COMMENT ON COLUMN samples.bag_weight_kg IS 'Weight per bag in kg (30, 59, 60, 70 for standard, 1000 for big bag, 21600 for bulk)';
COMMENT ON COLUMN samples.equivalent_60kg_bags IS 'Total equivalent in 60kg bags for standardized comparison';

-- Create index for bag_type
CREATE INDEX IF NOT EXISTS idx_samples_bag_type ON samples(bag_type);
CREATE INDEX IF NOT EXISTS idx_samples_equivalent_60kg ON samples(equivalent_60kg_bags);

-- ========================================
-- STEP 4: Create function to calculate equivalent 60kg bags
-- ========================================

CREATE OR REPLACE FUNCTION calculate_equivalent_60kg_bags(
    p_bag_count INTEGER,
    p_bag_weight_kg DECIMAL,
    p_bag_type bag_type_enum
) RETURNS DECIMAL AS $$
DECLARE
    v_equivalent DECIMAL;
BEGIN
    -- If no bag data, return NULL
    IF p_bag_count IS NULL OR p_bag_weight_kg IS NULL THEN
        RETURN NULL;
    END IF;

    -- Look up standard equivalent
    SELECT equivalent_60kg_bags INTO v_equivalent
    FROM bag_weight_standards
    WHERE weight_kg = p_bag_weight_kg
      AND bag_type = p_bag_type
      AND is_active = true
    LIMIT 1;

    -- If found in standards, use it
    IF v_equivalent IS NOT NULL THEN
        RETURN ROUND((p_bag_count * v_equivalent)::numeric, 2);
    END IF;

    -- Otherwise, calculate manually (weight_kg / 60)
    RETURN ROUND((p_bag_count * (p_bag_weight_kg / 60.0))::numeric, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_equivalent_60kg_bags(INTEGER, DECIMAL, bag_type_enum) IS
'Calculate equivalent number of 60kg bags based on bag count, weight, and type';

-- ========================================
-- STEP 5: Create trigger to auto-calculate equivalent_60kg_bags
-- ========================================

CREATE OR REPLACE FUNCTION update_equivalent_60kg_bags()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate equivalent 60kg bags
    NEW.equivalent_60kg_bags := calculate_equivalent_60kg_bags(
        NEW.bag_count,
        NEW.bag_weight_kg,
        NEW.bag_type
    );

    -- Also ensure bags_quantity_mt is consistent
    IF NEW.bag_count IS NOT NULL AND NEW.bag_weight_kg IS NOT NULL THEN
        NEW.bags_quantity_mt := ROUND(((NEW.bag_count * NEW.bag_weight_kg) / 1000.0)::numeric, 3);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_equivalent_60kg_bags ON samples;

CREATE TRIGGER trigger_update_equivalent_60kg_bags
    BEFORE INSERT OR UPDATE OF bag_count, bag_weight_kg, bag_type
    ON samples
    FOR EACH ROW
    EXECUTE FUNCTION update_equivalent_60kg_bags();

COMMENT ON TRIGGER trigger_update_equivalent_60kg_bags ON samples IS
'Automatically calculate equivalent_60kg_bags and bags_quantity_mt when bag data changes';

-- ========================================
-- STEP 6: Backfill existing data with best guess
-- ========================================

-- For existing samples without bag_type, set based on bag_weight_kg
UPDATE samples
SET bag_type = CASE
    WHEN bag_weight_kg >= 21000 THEN 'bulk'::bag_type_enum
    WHEN bag_weight_kg >= 900 THEN 'big_bag'::bag_type_enum
    WHEN bag_weight_kg IS NOT NULL THEN 'jute_bag'::bag_type_enum
    ELSE NULL
END
WHERE bag_type IS NULL AND bag_weight_kg IS NOT NULL;

-- Trigger the equivalent calculation for all existing samples
UPDATE samples
SET updated_at = updated_at
WHERE bag_count IS NOT NULL AND bag_weight_kg IS NOT NULL;

-- ========================================
-- STEP 7: Add RLS policies for bag_weight_standards
-- ========================================

ALTER TABLE bag_weight_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bag weight standards"
    ON bag_weight_standards FOR SELECT TO authenticated USING (true);

CREATE POLICY "Lab personnel can manage bag weight standards"
    ON bag_weight_standards FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND qc_role IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
        )
    );

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
DECLARE
    v_total_samples INTEGER;
    v_samples_with_bags INTEGER;
    v_samples_with_equivalent INTEGER;
    v_bag_standards_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total_samples FROM samples;
    SELECT COUNT(*) INTO v_samples_with_bags FROM samples WHERE bag_count IS NOT NULL AND bag_weight_kg IS NOT NULL;
    SELECT COUNT(*) INTO v_samples_with_equivalent FROM samples WHERE equivalent_60kg_bags IS NOT NULL;
    SELECT COUNT(*) INTO v_bag_standards_count FROM bag_weight_standards WHERE is_active = true;

    RAISE NOTICE 'Migration 057 completed successfully';
    RAISE NOTICE 'Bag information restructured with proper types and standards';
    RAISE NOTICE 'Total samples: %', v_total_samples;
    RAISE NOTICE 'Samples with bag data: % (%.1f%%)', v_samples_with_bags,
        CASE WHEN v_total_samples > 0 THEN (v_samples_with_bags::FLOAT / v_total_samples * 100) ELSE 0 END;
    RAISE NOTICE 'Samples with equivalent 60kg calculation: % (%.1f%%)', v_samples_with_equivalent,
        CASE WHEN v_total_samples > 0 THEN (v_samples_with_equivalent::FLOAT / v_total_samples * 100) ELSE 0 END;
    RAISE NOTICE 'Active bag weight standards: %', v_bag_standards_count;
    RAISE NOTICE 'Bag types: jute_bag, pp_bag, big_bag (1 M/T), bulk (21.6 M/T)';
END;
$$;

SELECT 'Migration 057: Restructured bag information with types and standards' as status;

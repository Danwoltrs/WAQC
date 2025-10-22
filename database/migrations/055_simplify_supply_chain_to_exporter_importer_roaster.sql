-- Migration 055: Simplify supply chain to exporter > importer > roaster
-- Remove supplier and buyer tables, rename buyers to importers
-- Supply chain: Exporter → Importer → Roaster (roasters can also be importers)

-- ========================================
-- STEP 1: Create importers table (rename from buyers)
-- ========================================

-- First, create the new importers table with all data from buyers
CREATE TABLE IF NOT EXISTS importers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    notes TEXT,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_importers_name ON importers(name);
CREATE INDEX IF NOT EXISTS idx_importers_country ON importers(country);
CREATE INDEX IF NOT EXISTS idx_importers_client_id ON importers(client_id);

COMMENT ON TABLE importers IS 'Coffee importing companies (buyers/traders who import coffee)';
COMMENT ON COLUMN importers.name IS 'Importer company name';
COMMENT ON COLUMN importers.client_id IS 'Link to clients table if this importer is also a QC client';

-- Migrate data from buyers to importers
INSERT INTO importers (id, name, country, contact_email, contact_phone, notes, created_at, updated_at)
SELECT id, name, country, contact_email, contact_phone, notes, created_at, updated_at
FROM buyers
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- STEP 2: Update exporters and roasters to include client_id
-- ========================================

ALTER TABLE exporters ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE roasters ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exporters_client_id ON exporters(client_id);
CREATE INDEX IF NOT EXISTS idx_roasters_client_id ON roasters(client_id);

COMMENT ON COLUMN exporters.client_id IS 'Link to clients table if this exporter is also a QC client';
COMMENT ON COLUMN roasters.client_id IS 'Link to clients table if this roaster is also a QC client';

-- ========================================
-- STEP 3: Update samples table foreign keys
-- ========================================

-- Add importer_id if it doesn't exist (it should from migration 054)
ALTER TABLE samples ADD COLUMN IF NOT EXISTS importer_id UUID;

-- Drop the old supplier_id and buyer_id columns (we don't need them)
ALTER TABLE samples DROP COLUMN IF EXISTS supplier_id CASCADE;
ALTER TABLE samples DROP COLUMN IF EXISTS buyer_id CASCADE;

-- Update the foreign key constraint for importer_id to point to importers table
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_importer_id_fkey;
ALTER TABLE samples ADD CONSTRAINT samples_importer_id_fkey
    FOREIGN KEY (importer_id) REFERENCES importers(id) ON DELETE SET NULL;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_samples_exporter_id ON samples(exporter_id);
CREATE INDEX IF NOT EXISTS idx_samples_importer_id ON samples(importer_id);
CREATE INDEX IF NOT EXISTS idx_samples_roaster_id ON samples(roaster_id);

-- Update comments
COMMENT ON COLUMN samples.exporter_id IS 'Foreign key to exporters table - REQUIRED for sample tracking';
COMMENT ON COLUMN samples.importer_id IS 'Foreign key to importers table (buyer/importer of the coffee)';
COMMENT ON COLUMN samples.roaster_id IS 'Foreign key to roasters table (can be same as importer)';

-- ========================================
-- STEP 4: Drop old supplier_legacy and buyer_legacy columns
-- ========================================

ALTER TABLE samples DROP COLUMN IF EXISTS supplier_legacy CASCADE;
ALTER TABLE samples DROP COLUMN IF EXISTS buyer_legacy CASCADE;

-- ========================================
-- STEP 5: Add RLS policies for importers
-- ========================================

ALTER TABLE importers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all importers
CREATE POLICY "Authenticated users can view importers" ON importers FOR SELECT TO authenticated USING (true);

-- Allow lab personnel to insert/update importers
CREATE POLICY "Lab personnel can insert importers" ON importers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND qc_role IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
  )
);

CREATE POLICY "Lab personnel can update importers" ON importers FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND qc_role IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
  )
);

-- ========================================
-- STEP 6: Update client_types enum to reflect new structure
-- ========================================

-- Drop the old enum values we don't need
-- Note: We keep the enum as-is for backward compatibility but document the mapping
COMMENT ON TYPE client_type IS 'Client type categories: exporter → exporters table, importer_buyer → importers table, roaster/roaster_final_buyer/final_buyer → roasters table';

-- ========================================
-- STEP 7: Drop suppliers and buyers tables
-- ========================================

DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS buyers CASCADE;

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
DECLARE
    v_exporters INTEGER;
    v_importers INTEGER;
    v_roasters INTEGER;
    v_total_samples INTEGER;
    v_linked_exporters INTEGER;
    v_linked_importers INTEGER;
    v_linked_roasters INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_exporters FROM exporters;
    SELECT COUNT(*) INTO v_importers FROM importers;
    SELECT COUNT(*) INTO v_roasters FROM roasters;
    SELECT COUNT(*) INTO v_total_samples FROM samples;
    SELECT COUNT(*) INTO v_linked_exporters FROM samples WHERE exporter_id IS NOT NULL;
    SELECT COUNT(*) INTO v_linked_importers FROM samples WHERE importer_id IS NOT NULL;
    SELECT COUNT(*) INTO v_linked_roasters FROM samples WHERE roaster_id IS NOT NULL;

    RAISE NOTICE 'Migration 055 completed successfully';
    RAISE NOTICE 'Supply chain simplified to: Exporter → Importer → Roaster';
    RAISE NOTICE 'Created % exporters, % importers, % roasters',
        v_exporters, v_importers, v_roasters;
    RAISE NOTICE 'Total samples: %', v_total_samples;
    RAISE NOTICE 'Samples linked to exporters: % (%.1f%%)', v_linked_exporters,
        CASE WHEN v_total_samples > 0 THEN (v_linked_exporters::FLOAT / v_total_samples * 100) ELSE 0 END;
    RAISE NOTICE 'Samples linked to importers: % (%.1f%%)', v_linked_importers,
        CASE WHEN v_total_samples > 0 THEN (v_linked_importers::FLOAT / v_total_samples * 100) ELSE 0 END;
    RAISE NOTICE 'Samples linked to roasters: % (%.1f%%)', v_linked_roasters,
        CASE WHEN v_total_samples > 0 THEN (v_linked_roasters::FLOAT / v_total_samples * 100) ELSE 0 END;
    RAISE NOTICE 'Removed suppliers and buyers tables';
    RAISE NOTICE 'Renamed buyers to importers';
END;
$$;

SELECT 'Migration 055: Simplified supply chain to exporter → importer → roaster' as status;

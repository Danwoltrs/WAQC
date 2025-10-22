-- Migration 054: Create supply chain entity tables (suppliers, exporters, buyers, roasters)
-- Refactor samples table to use foreign keys instead of text fields

-- ========================================
-- STEP 1: Create supply chain entity tables
-- ========================================

-- Suppliers table (coffee producers/farms)
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT,
    region TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_country ON suppliers(country);

COMMENT ON TABLE suppliers IS 'Coffee suppliers/producers/farms';
COMMENT ON COLUMN suppliers.name IS 'Supplier/producer name';
COMMENT ON COLUMN suppliers.country IS 'Country of origin';
COMMENT ON COLUMN suppliers.region IS 'Specific region/state';

-- Exporters table
CREATE TABLE IF NOT EXISTS exporters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exporters_name ON exporters(name);
CREATE INDEX IF NOT EXISTS idx_exporters_country ON exporters(country);

COMMENT ON TABLE exporters IS 'Coffee exporting companies';
COMMENT ON COLUMN exporters.name IS 'Exporter company name';

-- Buyers table (importers/traders)
CREATE TABLE IF NOT EXISTS buyers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buyers_name ON buyers(name);
CREATE INDEX IF NOT EXISTS idx_buyers_country ON buyers(country);

COMMENT ON TABLE buyers IS 'Coffee buyers/importers/traders';
COMMENT ON COLUMN buyers.name IS 'Buyer company name';

-- Roasters table
CREATE TABLE IF NOT EXISTS roasters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roasters_name ON roasters(name);
CREATE INDEX IF NOT EXISTS idx_roasters_country ON roasters(country);

COMMENT ON TABLE roasters IS 'Coffee roasting companies';
COMMENT ON COLUMN roasters.name IS 'Roaster company name';

-- ========================================
-- STEP 2: Add new foreign key columns to samples
-- ========================================

ALTER TABLE samples ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS exporter_id UUID REFERENCES exporters(id) ON DELETE SET NULL;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES buyers(id) ON DELETE SET NULL;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS roaster_id UUID REFERENCES roasters(id) ON DELETE SET NULL;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS importer_id UUID REFERENCES buyers(id) ON DELETE SET NULL;

COMMENT ON COLUMN samples.supplier_id IS 'Foreign key to suppliers table';
COMMENT ON COLUMN samples.exporter_id IS 'Foreign key to exporters table - REQUIRED for sample tracking';
COMMENT ON COLUMN samples.buyer_id IS 'Foreign key to buyers table';
COMMENT ON COLUMN samples.roaster_id IS 'Foreign key to roasters table';
COMMENT ON COLUMN samples.importer_id IS 'Foreign key to buyers table (importers are a type of buyer)';

-- ========================================
-- STEP 3: Create indexes for performance
-- ========================================

CREATE INDEX IF NOT EXISTS idx_samples_supplier_id ON samples(supplier_id);
CREATE INDEX IF NOT EXISTS idx_samples_exporter_id ON samples(exporter_id);
CREATE INDEX IF NOT EXISTS idx_samples_buyer_id ON samples(buyer_id);
CREATE INDEX IF NOT EXISTS idx_samples_roaster_id ON samples(roaster_id);
CREATE INDEX IF NOT EXISTS idx_samples_importer_id ON samples(importer_id);

-- ========================================
-- STEP 4: Migrate existing data
-- ========================================

-- Migrate unique suppliers
INSERT INTO suppliers (name, created_at)
SELECT DISTINCT supplier, NOW()
FROM samples
WHERE supplier IS NOT NULL
  AND supplier != ''
  AND NOT EXISTS (SELECT 1 FROM suppliers WHERE LOWER(name) = LOWER(samples.supplier))
ON CONFLICT DO NOTHING;

-- Migrate unique exporters
INSERT INTO exporters (name, created_at)
SELECT DISTINCT exporter, NOW()
FROM samples
WHERE exporter IS NOT NULL
  AND exporter != ''
  AND NOT EXISTS (SELECT 1 FROM exporters WHERE LOWER(name) = LOWER(samples.exporter))
ON CONFLICT DO NOTHING;

-- Migrate unique buyers
INSERT INTO buyers (name, created_at)
SELECT DISTINCT buyer, NOW()
FROM samples
WHERE buyer IS NOT NULL
  AND buyer != ''
  AND NOT EXISTS (SELECT 1 FROM buyers WHERE LOWER(name) = LOWER(samples.buyer))
ON CONFLICT DO NOTHING;

-- Migrate unique roasters
INSERT INTO roasters (name, created_at)
SELECT DISTINCT roaster, NOW()
FROM samples
WHERE roaster IS NOT NULL
  AND roaster != ''
  AND NOT EXISTS (SELECT 1 FROM roasters WHERE LOWER(name) = LOWER(samples.roaster))
ON CONFLICT DO NOTHING;

-- Migrate unique importers to buyers table
INSERT INTO buyers (name, created_at)
SELECT DISTINCT importer, NOW()
FROM samples
WHERE importer IS NOT NULL
  AND importer != ''
  AND NOT EXISTS (SELECT 1 FROM buyers WHERE LOWER(name) = LOWER(samples.importer))
ON CONFLICT DO NOTHING;

-- Update sample foreign keys
UPDATE samples s
SET supplier_id = sup.id
FROM suppliers sup
WHERE s.supplier IS NOT NULL
  AND LOWER(sup.name) = LOWER(s.supplier);

UPDATE samples s
SET exporter_id = exp.id
FROM exporters exp
WHERE s.exporter IS NOT NULL
  AND LOWER(exp.name) = LOWER(s.exporter);

UPDATE samples s
SET buyer_id = b.id
FROM buyers b
WHERE s.buyer IS NOT NULL
  AND LOWER(b.name) = LOWER(s.buyer);

UPDATE samples s
SET roaster_id = r.id
FROM roasters r
WHERE s.roaster IS NOT NULL
  AND LOWER(r.name) = LOWER(s.roaster);

UPDATE samples s
SET importer_id = b.id
FROM buyers b
WHERE s.importer IS NOT NULL
  AND LOWER(b.name) = LOWER(s.importer);

-- ========================================
-- STEP 5: Rename old columns for backward compatibility
-- ========================================

ALTER TABLE samples RENAME COLUMN supplier TO supplier_legacy;
ALTER TABLE samples RENAME COLUMN exporter TO exporter_legacy;
ALTER TABLE samples RENAME COLUMN buyer TO buyer_legacy;
ALTER TABLE samples RENAME COLUMN roaster TO roaster_legacy;
ALTER TABLE samples RENAME COLUMN importer TO importer_legacy;

COMMENT ON COLUMN samples.supplier_legacy IS 'DEPRECATED: Use supplier_id instead';
COMMENT ON COLUMN samples.exporter_legacy IS 'DEPRECATED: Use exporter_id instead';
COMMENT ON COLUMN samples.buyer_legacy IS 'DEPRECATED: Use buyer_id instead';
COMMENT ON COLUMN samples.roaster_legacy IS 'DEPRECATED: Use roaster_id instead';
COMMENT ON COLUMN samples.importer_legacy IS 'DEPRECATED: Use importer_id instead';

-- ========================================
-- STEP 6: Add RLS policies for new tables
-- ========================================

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE roasters ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all supply chain entities
CREATE POLICY "Authenticated users can view suppliers" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view exporters" ON exporters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view buyers" ON buyers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view roasters" ON roasters FOR SELECT TO authenticated USING (true);

-- Allow lab personnel to insert/update supply chain entities
CREATE POLICY "Lab personnel can insert suppliers" ON suppliers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND qc_role IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
  )
);

CREATE POLICY "Lab personnel can insert exporters" ON exporters FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND qc_role IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
  )
);

CREATE POLICY "Lab personnel can insert buyers" ON buyers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND qc_role IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
  )
);

CREATE POLICY "Lab personnel can insert roasters" ON roasters FOR INSERT TO authenticated
WITH CHECK (
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
    v_suppliers INTEGER;
    v_exporters INTEGER;
    v_buyers INTEGER;
    v_roasters INTEGER;
    v_total_samples INTEGER;
    v_linked_suppliers INTEGER;
    v_linked_exporters INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_suppliers FROM suppliers;
    SELECT COUNT(*) INTO v_exporters FROM exporters;
    SELECT COUNT(*) INTO v_buyers FROM buyers;
    SELECT COUNT(*) INTO v_roasters FROM roasters;
    SELECT COUNT(*) INTO v_total_samples FROM samples;
    SELECT COUNT(*) INTO v_linked_suppliers FROM samples WHERE supplier_id IS NOT NULL;
    SELECT COUNT(*) INTO v_linked_exporters FROM samples WHERE exporter_id IS NOT NULL;

    RAISE NOTICE 'Migration 054 completed successfully';
    RAISE NOTICE 'Created % suppliers, % exporters, % buyers, % roasters',
        v_suppliers, v_exporters, v_buyers, v_roasters;
    RAISE NOTICE 'Total samples: %', v_total_samples;
    RAISE NOTICE 'Samples linked to suppliers: % (%.1f%%)', v_linked_suppliers,
        CASE WHEN v_total_samples > 0 THEN (v_linked_suppliers::FLOAT / v_total_samples * 100) ELSE 0 END;
    RAISE NOTICE 'Samples linked to exporters: % (%.1f%%)', v_linked_exporters,
        CASE WHEN v_total_samples > 0 THEN (v_linked_exporters::FLOAT / v_total_samples * 100) ELSE 0 END;
    RAISE NOTICE 'Old text columns renamed to *_legacy';
END;
$$;

SELECT 'Migration 054: Created supply chain entity tables' as status;

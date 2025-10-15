-- Migration 033: Add Micro-Region Support for Quality Templates
-- Date: 2025-10-14
-- Purpose: Allow quality templates to specify micro-region requirements per origin

-- ========================================
-- CREATE MICRO-REGIONS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS micro_regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin VARCHAR(100) NOT NULL, -- Country (e.g., 'Brazil', 'Colombia', 'Ethiopia')
    region_name_en VARCHAR(255) NOT NULL, -- English name
    region_name_pt VARCHAR(255), -- Portuguese name
    region_name_es VARCHAR(255), -- Spanish name
    parent_region VARCHAR(255), -- Parent region if applicable (e.g., 'Minas Gerais' for 'Sul de Minas')
    altitude_min INTEGER, -- Minimum altitude in meters
    altitude_max INTEGER, -- Maximum altitude in meters
    description_en TEXT, -- Description in English
    description_pt TEXT, -- Description in Portuguese
    description_es TEXT, -- Description in Spanish
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0, -- For sorting in dropdowns
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_micro_regions_origin ON micro_regions(origin) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_micro_regions_region_name_en ON micro_regions(region_name_en);
CREATE INDEX IF NOT EXISTS idx_micro_regions_active ON micro_regions(is_active);

-- ========================================
-- SEED DATA - BRAZIL
-- ========================================

INSERT INTO micro_regions (origin, region_name_en, region_name_pt, region_name_es, parent_region, altitude_min, altitude_max, description_en, display_order) VALUES
('Brazil', 'Mogiana', 'Mogiana', 'Mogiana', 'São Paulo', 900, 1400, 'Includes Alta Mogiana, around São Paulo', 1),
('Brazil', 'Cerrado Mineiro', 'Cerrado Mineiro', 'Cerrado Mineiro', 'Minas Gerais', 800, 1300, 'First Brazilian Denomination of Origin, known for consistent quality', 2),
('Brazil', 'Sul de Minas', 'Sul de Minas', 'Sur de Minas', 'Minas Gerais', 900, 1400, 'Southern Minas Gerais region', 3),
('Brazil', 'Matas de Minas', 'Matas de Minas', 'Matas de Minas', 'Minas Gerais', 700, 1200, 'Eastern Minas Gerais region', 4),
('Brazil', 'Chapada Diamantina', 'Chapada Diamantina', 'Chapada Diamantina', 'Bahia', 1000, 1700, 'Bahia region with vibrant coffees', 5),
('Brazil', 'Montanhas do Espírito Santo', 'Montanhas do Espírito Santo', 'Montañas de Espírito Santo', 'Espírito Santo', 600, 1200, 'Espírito Santo mountain region', 6),
('Brazil', 'Vale da Grama', 'Vale da Grama', 'Valle da Grama', 'São Paulo', 900, 1300, 'São Paulo valley region', 7),
('Brazil', 'Campo das Vertentes', 'Campo das Vertentes', 'Campo das Vertentes', 'Minas Gerais', 800, 1200, 'Minas Gerais highlands', 8),
('Brazil', 'Norte Pioneiro do Paraná', 'Norte Pioneiro do Paraná', 'Norte Pioneiro do Paraná', 'Paraná', 600, 1000, 'Northern Paraná region', 9);

-- ========================================
-- SEED DATA - PERU
-- ========================================

INSERT INTO micro_regions (origin, region_name_en, region_name_pt, region_name_es, description_en, display_order) VALUES
('Peru', 'Cajamarca', 'Cajamarca', 'Cajamarca', 'Northern highlands region', 1),
('Peru', 'Amazonas', 'Amazonas', 'Amazonas', 'Northern region with diverse microclimates', 2),
('Peru', 'San Martín', 'San Martín', 'San Martín', 'Northern coffee-growing region', 3),
('Peru', 'Piura', 'Piura', 'Piura', 'Northern coastal region', 4),
('Peru', 'Junín', 'Junín', 'Junín', 'Central highlands region', 5),
('Peru', 'Pasco', 'Pasco', 'Pasco', 'Central mountainous region', 6),
('Peru', 'Huánuco', 'Huánuco', 'Huánuco', 'Central region known for quality coffee', 7),
('Peru', 'Puno', 'Puno', 'Puno', 'Southern highlands near Lake Titicaca', 8),
('Peru', 'Cusco', 'Cusco', 'Cusco', 'Southern region with high altitude coffees', 9),
('Peru', 'Ayacucho', 'Ayacucho', 'Ayacucho', 'Southern highlands region', 10);

-- ========================================
-- SEED DATA - COLOMBIA
-- ========================================

INSERT INTO micro_regions (origin, region_name_en, region_name_pt, region_name_es, description_en, display_order) VALUES
('Colombia', 'Antioquia', 'Antioquia', 'Antioquia', 'Major coffee-producing department', 1),
('Colombia', 'Huila', 'Huila', 'Huila', 'Denomination of Origin region, competition-winning coffees', 2),
('Colombia', 'Tolima', 'Tolima', 'Tolima', 'High-altitude specialty coffee region', 3),
('Colombia', 'Nariño', 'Nariño', 'Nariño', 'Near equator, higher acidity and intense aromas', 4),
('Colombia', 'Cauca', 'Cauca', 'Cauca', 'Rich volcanic soil, fruity and sweet notes', 5),
('Colombia', 'Cundinamarca', 'Cundinamarca', 'Cundinamarca', 'Central region near Bogotá', 6),
('Colombia', 'Magdalena', 'Magdalena', 'Magdalena', 'Caribbean Coast region', 7),
('Colombia', 'Sierra Nevada de Santa Marta', 'Sierra Nevada de Santa Marta', 'Sierra Nevada de Santa Marta', 'Caribbean Coast, indigenous organic methods', 8);

-- ========================================
-- SEED DATA - GUATEMALA
-- ========================================

INSERT INTO micro_regions (origin, region_name_en, region_name_pt, region_name_es, description_en, display_order) VALUES
('Guatemala', 'Huehuetenango', 'Huehuetenango', 'Huehuetenango', 'Highest region, Cup of Excellence winner', 1),
('Guatemala', 'Antigua', 'Antigua', 'Antigua', 'Grown between three volcanoes, full velvety body', 2),
('Guatemala', 'Atitlán', 'Atitlán', 'Atitlán', 'Lake region with unique microclimate', 3),
('Guatemala', 'Cobán', 'Cobán', 'Cobán', 'Rainforest region, cloudy and rainy climate', 4),
('Guatemala', 'Fraijanes Plateau', 'Planalto Fraijanes', 'Meseta de Fraijanes', 'Active volcanoes, mineral-rich soil', 5),
('Guatemala', 'San Marcos', 'San Marcos', 'San Marcos', 'Warmest and rainiest region, early harvest', 6),
('Guatemala', 'Acatenango Valley', 'Vale de Acatenango', 'Valle de Acatenango', 'Volcanic soil, distinct acidity', 7),
('Guatemala', 'Nuevo Oriente', 'Nuevo Oriente', 'Nuevo Oriente', 'Varied landscape, balanced coffees', 8);

-- ========================================
-- SEED DATA - MEXICO
-- ========================================

INSERT INTO micro_regions (origin, region_name_en, region_name_pt, region_name_es, description_en, display_order) VALUES
('Mexico', 'Chiapas', 'Chiapas', 'Chiapas', 'Largest coffee-producing state in Mexico', 1),
('Mexico', 'Veracruz', 'Veracruz', 'Veracruz', 'Historic coffee region on Gulf Coast', 2),
('Mexico', 'Oaxaca', 'Oaxaca', 'Oaxaca', 'Southern region known for organic coffee', 3),
('Mexico', 'Puebla', 'Puebla', 'Puebla', 'Central region with quality coffee production', 4);

-- ========================================
-- SEED DATA - EL SALVADOR
-- ========================================

INSERT INTO micro_regions (origin, region_name_en, region_name_pt, region_name_es, description_en, display_order) VALUES
('El Salvador', 'Apaneca-Ilamatepec', 'Apaneca-Ilamatepec', 'Apaneca-Ilamatepec', 'Western region, high altitude specialty coffee', 1),
('El Salvador', 'Santa Ana', 'Santa Ana', 'Santa Ana', 'Volcanic region with rich soil', 2),
('El Salvador', 'El Bálsamo-Quetzaltepeque', 'El Bálsamo-Quetzaltepeque', 'El Bálsamo-Quetzaltepeque', 'Central region near capital', 3),
('El Salvador', 'Alotepec-Metapán', 'Alotepec-Metapán', 'Alotepec-Metapán', 'Northern border region', 4),
('El Salvador', 'Tecapa-Chinameca', 'Tecapa-Chinameca', 'Tecapa-Chinameca', 'Eastern volcanic region', 5),
('El Salvador', 'Cacahuatique', 'Cacahuatique', 'Cacahuatique', 'Eastern mountain region', 6);

-- ========================================
-- SEED DATA - NICARAGUA
-- ========================================

INSERT INTO micro_regions (origin, region_name_en, region_name_pt, region_name_es, description_en, display_order) VALUES
('Nicaragua', 'Jinotega', 'Jinotega', 'Jinotega', 'Premier coffee region, high altitude', 1),
('Nicaragua', 'Matagalpa', 'Matagalpa', 'Matagalpa', 'Central highlands, quality coffee production', 2),
('Nicaragua', 'Nueva Segovia', 'Nueva Segovia', 'Nueva Segovia', 'Northern region near Honduras border', 3),
('Nicaragua', 'Estelí', 'Estelí', 'Estelí', 'Northern highlands region', 4),
('Nicaragua', 'Madriz', 'Madriz', 'Madriz', 'Northern region with specialty coffee', 5);

-- ========================================
-- SEED DATA - HONDURAS
-- ========================================

INSERT INTO micro_regions (origin, region_name_en, region_name_pt, region_name_es, description_en, display_order) VALUES
('Honduras', 'Copán', 'Copán', 'Copán', 'Western region near Guatemala border', 1),
('Honduras', 'Montecillos', 'Montecillos', 'Montecillos', 'Central highlands region', 2),
('Honduras', 'Comayagua', 'Comayagua', 'Comayagua', 'Central valley region', 3),
('Honduras', 'Opalaca', 'Opalaca', 'Opalaca', 'Western highlands region', 4),
('Honduras', 'El Paraíso', 'El Paraíso', 'El Paraíso', 'Eastern region near Nicaragua', 5),
('Honduras', 'Agalta', 'Agalta', 'Agalta', 'Eastern tropical forest region', 6);

-- ========================================
-- ALTER QUALITY_TEMPLATES TABLE
-- ========================================

-- Add micro-region requirements as JSONB array
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS micro_region_requirements JSONB DEFAULT '[]';

-- Structure: [{ origin: 'Brazil', required_micro_regions: ['Sul de Minas', 'Cerrado Mineiro'], percentage_per_region: { 'Sul de Minas': { min: 60, max: 100 } }, allow_mix: true }]

COMMENT ON COLUMN quality_templates.micro_region_requirements IS 'Array of micro-region requirements per origin. Each entry specifies required micro-regions, optional percentage constraints, and whether mixing is allowed.';

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON TABLE micro_regions IS 'Micro-regions for coffee origins, used in quality templates to specify regional requirements';
COMMENT ON COLUMN micro_regions.origin IS 'Country of origin (e.g., Brazil, Colombia, Ethiopia)';
COMMENT ON COLUMN micro_regions.region_name_en IS 'Micro-region name in English';
COMMENT ON COLUMN micro_regions.parent_region IS 'Parent region if applicable (e.g., Minas Gerais for Sul de Minas)';
COMMENT ON COLUMN micro_regions.altitude_min IS 'Minimum altitude in meters above sea level';
COMMENT ON COLUMN micro_regions.altitude_max IS 'Maximum altitude in meters above sea level';

-- ========================================
-- RLS POLICIES
-- ========================================

-- Enable RLS
ALTER TABLE micro_regions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read micro-regions
CREATE POLICY "All users can view micro-regions" ON micro_regions
    FOR SELECT USING (is_active = true);

-- Only admins can insert/update/delete micro-regions
CREATE POLICY "Admins can manage micro-regions" ON micro_regions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND qc_role IN ('global_admin', 'global_quality_admin')
        )
    );

-- Grant permissions
GRANT SELECT ON micro_regions TO authenticated;

-- ========================================
-- RPC FUNCTION FOR API
-- ========================================

-- Create function to get active micro-regions with optional origin filter
CREATE OR REPLACE FUNCTION get_active_micro_regions(p_origin TEXT DEFAULT NULL)
RETURNS SETOF micro_regions
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM micro_regions
  WHERE is_active = true
    AND (p_origin IS NULL OR origin = p_origin)
  ORDER BY origin, display_order;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_active_micro_regions(TEXT) TO authenticated;

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check that seed data was inserted
    SELECT COUNT(*) INTO v_count FROM micro_regions;
    IF v_count < 60 THEN
        RAISE WARNING 'Migration 033: Only % micro-regions inserted, expected at least 60', v_count;
    ELSE
        RAISE NOTICE 'Migration 033: Successfully inserted % micro-regions', v_count;
    END IF;

    -- Check that column was added
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quality_templates'
        AND column_name = 'micro_region_requirements'
    ) THEN
        RAISE EXCEPTION 'Migration 033 verification failed: micro_region_requirements column not created';
    END IF;

    RAISE NOTICE 'Migration 033 completed successfully: Micro-region support enabled';
END;
$$;

SELECT 'Migration 033: Add micro-region support for quality templates completed' as status;

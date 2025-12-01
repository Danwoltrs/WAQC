-- Migration: Add seller_id to samples and density to quality_assessments
--
-- Seller = The trading company that sold the coffee (e.g., Louis Dreyfus)
-- Shipper = The actual exporter that shipped the coffee (already exists as exporter_id, e.g., COOXUPE)
--
-- Example: Louis Dreyfus (Seller) sold coffee to Ahold (Client),
--          but COOXUPE (Shipper/Exporter) actually exported it

-- Add seller_id column to samples table
-- References exporters table (sellers and shippers come from same pool)
ALTER TABLE samples
ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES exporters(id);

-- Add same_seller_shipper flag (default true = seller is same as shipper)
ALTER TABLE samples
ADD COLUMN IF NOT EXISTS same_seller_shipper BOOLEAN DEFAULT true;

-- Add density field to quality_assessments (in green_bean_data JSONB)
-- Density is stored as numeric value in G/L (e.g., 0.700)
-- This is typically added alongside moisture during green bean analysis
COMMENT ON COLUMN quality_assessments.green_bean_data IS
'JSON object containing green bean analysis data including:
- moisture: numeric (percentage)
- density: numeric (G/L, e.g., 0.700)
- screen_sizes: object with size distribution
- defects: array of defect entries
- color: string
- odor: string';

-- Create index for seller lookups
CREATE INDEX IF NOT EXISTS idx_samples_seller_id ON samples(seller_id);

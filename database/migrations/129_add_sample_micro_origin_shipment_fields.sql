-- Migration: Add micro_origin and shipment_month fields to samples table
-- These fields are used for detailed origin tracking and shipment information on certificates

-- Add micro_origin field for specific region within origin country (e.g., "Sul de Minas", "Cerrado Mineiro")
ALTER TABLE samples ADD COLUMN IF NOT EXISTS micro_origin TEXT;

-- Add shipment_month field for tracking expected shipment month (format: "2025-01" or display as "Jan 2025")
ALTER TABLE samples ADD COLUMN IF NOT EXISTS shipment_month TEXT;

-- Add comment for documentation
COMMENT ON COLUMN samples.micro_origin IS 'Specific region within the origin country (e.g., Sul de Minas, Cerrado Mineiro)';
COMMENT ON COLUMN samples.shipment_month IS 'Expected shipment month in YYYY-MM format';

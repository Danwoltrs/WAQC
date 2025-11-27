-- Migration: Add Sample Workflow Tracking Fields for Cupping Card Scanning
-- Description: Adds fields to track cupping card printing, scanning, and locking workflow
-- Date: 2025-11-27

-- ============================================================================
-- Add tracking fields to samples table
-- ============================================================================

-- Add cards_printed_at timestamp to track when cupping cards were printed
ALTER TABLE samples
ADD COLUMN IF NOT EXISTS cards_printed_at TIMESTAMP WITH TIME ZONE;

-- Add scanned_at timestamp to track when OCR scan was completed and validated
ALTER TABLE samples
ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMP WITH TIME ZONE;

-- Add certificate_generated_at timestamp for 24h edit lock calculation
ALTER TABLE samples
ADD COLUMN IF NOT EXISTS certificate_generated_at TIMESTAMP WITH TIME ZONE;

-- Add locked boolean to prevent editing after scan or 24h from certificate
ALTER TABLE samples
ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- Add entry method tracking to cupping_scores table
-- ============================================================================

-- Add entry_method to distinguish between manual and OCR-scanned scores
ALTER TABLE cupping_scores
ADD COLUMN IF NOT EXISTS entry_method VARCHAR(10) CHECK (entry_method IN ('manual', 'ocr')) DEFAULT 'manual';

-- ============================================================================
-- Create indexes for performance optimization
-- ============================================================================

-- Index for queries checking if any cards have been printed
CREATE INDEX IF NOT EXISTS idx_samples_cards_printed_at
ON samples(cards_printed_at)
WHERE cards_printed_at IS NOT NULL;

-- Index for certificate generation timestamp queries (24h lock check)
CREATE INDEX IF NOT EXISTS idx_samples_certificate_generated_at
ON samples(certificate_generated_at);

-- Index for locked samples queries
CREATE INDEX IF NOT EXISTS idx_samples_locked
ON samples(locked)
WHERE locked = TRUE;

-- Index for entry method queries on cupping scores
CREATE INDEX IF NOT EXISTS idx_cupping_scores_entry_method
ON cupping_scores(entry_method);

-- ============================================================================
-- Add column comments for documentation
-- ============================================================================

COMMENT ON COLUMN samples.cards_printed_at IS
'Timestamp when cupping cards were printed for this sample. Used to enable the scan button on dashboard.';

COMMENT ON COLUMN samples.scanned_at IS
'Timestamp when OCR scan was completed and validated. Once set, card cannot be re-scanned.';

COMMENT ON COLUMN samples.certificate_generated_at IS
'Timestamp when certificate was generated. Used to enforce 24-hour edit lock after certificate generation.';

COMMENT ON COLUMN samples.locked IS
'Whether sample is locked for editing. Set to TRUE after OCR scan validation or 24h after certificate generation.';

COMMENT ON COLUMN cupping_scores.entry_method IS
'How the score was entered: "manual" for manual entry on cupping page, "ocr" for OCR-scanned cards.';

-- ============================================================================
-- End of migration
-- ============================================================================

-- Migration: Add certifications array to samples
--
-- The intake form already collects certifications (RA, Fair Trade, Organic,
-- EUDR, FLO) via a multi-select on the quality step, and the cert PDF already
-- has a CertificateQualityDescription component that renders them. The only
-- missing piece is the DB column — submitting the form silently dropped the
-- value because /api/samples didn't accept it and there was nowhere to store
-- it. Cert PDFs hardcoded `certifications: null` because of this.
--
-- Stored as TEXT[] so the existing array shape from the UI ([{cert names}])
-- maps directly. NULL allowed for samples with no certifications.

ALTER TABLE samples
ADD COLUMN IF NOT EXISTS certifications TEXT[];

CREATE INDEX IF NOT EXISTS idx_samples_certifications
ON samples USING GIN (certifications)
WHERE certifications IS NOT NULL;

COMMENT ON COLUMN samples.certifications IS
  'Array of certification names attached to this sample (e.g. {Rainforest Alliance, Fair Trade, Organic, EUDR, FLO Fair Trade}). Custom certifications can be added by users — not constrained to a fixed enum. Rendered on the certificate PDF by CertificateQualityDescription.';

-- Clear cached cert PDFs so they regenerate with the certifications row.
UPDATE certificates SET pdf_url = NULL WHERE pdf_url IS NOT NULL;

-- Per-client certificate validity window.
--
-- The "Certificate validity period" toggle in the QC Services Configuration
-- dialog was never persisted (its value was dropped by splitClientPayload).
-- Store the window, in months, on qc_client_settings. NULL = no expiry window
-- printed on issued certificates (toggle off).
ALTER TABLE qc_client_settings
  ADD COLUMN IF NOT EXISTS certificate_validity_months integer;

COMMENT ON COLUMN qc_client_settings.certificate_validity_months IS
  'Per-client certificate expiry window in months. NULL = no expiry printed.';

-- Migration 105 set certificates.valid_from / valid_until NOT NULL (it assumed
-- a global 6-month window). With per-client validity, a certificate may have no
-- expiry, so these must be nullable. Existing certificates keep their values.
ALTER TABLE certificates ALTER COLUMN valid_until DROP NOT NULL;
ALTER TABLE certificates ALTER COLUMN valid_from DROP NOT NULL;

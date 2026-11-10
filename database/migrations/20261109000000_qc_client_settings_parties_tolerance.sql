ALTER TABLE qc_client_settings
  ADD COLUMN IF NOT EXISTS tolerance_auto_approve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificates_to_all_parties boolean NOT NULL DEFAULT false;

ALTER TABLE qc_client_settings
  ADD COLUMN IF NOT EXISTS tolerance_auto_approve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificates_to_all_parties boolean NOT NULL DEFAULT false;

-- The automatic 5% approval releases the numbers of certificates it had to
-- remove (src/lib/tolerance/auto-approve.ts). Server-side only.
GRANT EXECUTE ON FUNCTION void_certificate(UUID) TO service_role;

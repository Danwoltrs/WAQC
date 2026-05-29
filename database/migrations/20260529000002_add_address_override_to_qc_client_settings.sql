-- Address override layer for QC clients.
--
-- companies (shared with sys.wolthers.com) is the source of truth for address.
-- When a QC user clicks "Edit manually" on the client edit screen, we store the
-- diverged values in qc_client_settings.address_override as a JSON object:
--   { street, city, state, country, zip_code }
-- When NULL, the address fields shown in WAQC mirror companies directly.
--
-- Sync semantics:
--   - address_override IS NULL   → synced from sys (read-only in WAQC edit form)
--   - address_override IS NOT NULL → manual override (amber banner in WAQC,
--                                    sys values untouched)
-- "Re-pull" / "Re-link & sync" both clear address_override back to NULL.

ALTER TABLE qc_client_settings
  ADD COLUMN IF NOT EXISTS address_override jsonb;

COMMENT ON COLUMN qc_client_settings.address_override IS
  'QC-only address override. NULL = synced from companies. Non-null = '
  '{street, city, state, country, zip_code} kept locally so WAQC can diverge '
  'from sys without writing back to the shared companies row.';

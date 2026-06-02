-- Adds a contract-scoped document type for WAQC quality certificates annexed
-- onto sys.wolthers.com contracts (Docs tab). Idempotent.
INSERT INTO document_types (name, scope, sort_order, is_active)
SELECT 'Quality Certificate', 'contract', 415, true
WHERE NOT EXISTS (
  SELECT 1 FROM document_types WHERE name = 'Quality Certificate' AND scope = 'contract'
);

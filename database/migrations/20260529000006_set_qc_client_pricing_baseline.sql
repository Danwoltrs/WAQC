-- Migration 20260529000006: QC client fee baseline.
-- Directive: every QC client billed zero EXCEPT Dunkin (1.0 c/lb, per_pound,
-- all origins, invoiced on approved samples). This intentionally zeroes the
-- handful of clients that currently carry a per-pound rate (e.g. Coffein
-- Compagnie, and any other consistent per_pound row) — per instruction only
-- Dunkin is billable. The per_sample model remains fully supported for any
-- client that later asks for it (set on sys.wolthers.com).

BEGIN;

-- 1. Reset everyone to zero (complimentary => calculate_client_fee returns 0.00).
UPDATE qc_client_settings
SET pricing_model         = 'complimentary',
    price_per_sample      = NULL,
    price_per_pound_cents = NULL,
    has_origin_pricing    = false;

-- 2. Dunkin: per_pound @ 1.0 c/lb, all origins, invoiced on approved samples.
DO $$
DECLARE
  v_company_id UUID;
  v_name       TEXT;
BEGIN
  SELECT id, name INTO v_company_id, v_name
    FROM companies
   WHERE name ILIKE 'dunkin%'
   ORDER BY name
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company matching "dunkin%%" found — cannot set Dunkin pricing. Check the exact company name in companies.';
  END IF;

  INSERT INTO qc_client_settings (company_id, pricing_model, price_per_pound_cents, billing_basis, has_origin_pricing)
  VALUES (v_company_id, 'per_pound', 1.0, 'approved_only', false)
  ON CONFLICT (company_id) DO UPDATE SET
    pricing_model         = 'per_pound',
    price_per_pound_cents = 1.0,
    price_per_sample      = NULL,
    billing_basis         = 'approved_only',
    has_origin_pricing    = false;

  RAISE NOTICE 'Set "%" (%) to per_pound @ 1.0 c/lb, approved_only, all origins.', v_name, v_company_id;
END $$;

-- 3. Verify: exactly one billable client remains.
DO $$
DECLARE v_billable INT;
BEGIN
  SELECT COUNT(*) INTO v_billable
    FROM qc_client_settings
   WHERE pricing_model <> 'complimentary'
      OR price_per_sample IS NOT NULL
      OR price_per_pound_cents IS NOT NULL;
  RAISE NOTICE 'Billable (non-zero) QC clients after baseline: % (expected 1 = Dunkin).', v_billable;
END $$;

COMMIT;

-- Migration 20260529000005
-- Repoint calculate_client_fee() off the dropped `clients` table.
--
-- BACKGROUND
-- The counterparty consolidation (#20260528000005 / #20260528000009) dropped the
-- `clients` table (DROP TABLE clients CASCADE) and moved per-client config —
-- including pricing — into qc_client_settings, keyed by company_id.
--
-- CASCADE removed FKs/policies/triggers that *depend* on clients, but Postgres
-- does NOT track table references inside plpgsql function bodies. So
-- calculate_client_fee() kept its fallback:
--
--     SELECT pricing_model, price_per_sample, price_per_pound_cents
--     INTO pricing_data
--     FROM clients
--     WHERE id = client_id_param;
--
-- and now raises `relation "clients" does not exist` (SQLSTATE 42P01) whenever
-- it is reached. PostgREST maps 42P01 -> HTTP 404.
--
-- The function is invoked by update_sample_fees(), which is wired to two live
-- triggers on `samples`:
--     trigger_calculate_sample_fees_insert  (BEFORE INSERT)
--     trigger_calculate_sample_fees_update  (BEFORE UPDATE OF status, client_id, ...)
--
-- Net effect before this fix:
--   * Cupper assignment PATCHes samples.status -> 'in_progress' -> trigger fires
--     -> 42P01 -> "Cupper assignment failed: relation clients does not exist".
--   * Approving a sample (status -> 'approved') fails the same way, so the
--     status update aborts and the auto-certificate trigger never runs ->
--     "unable to create certificates".
--   * INSERT happens to survive: at BEFORE-INSERT the row isn't in `samples`
--     yet, so the function returns NULL at `SELECT ... FROM samples` (NOT FOUND)
--     before ever reaching the clients lookup.
--
-- Sibling migration #20260528000007 already repointed generate_certificate_number
-- and generate_tracking_number to qc_client_settings; it explicitly deferred the
-- fee functions on the (incorrect) assumption that the fee triggers were
-- disabled. They were not. This migration finishes the job.
--
-- FIX
-- Replace the `clients` fallback with qc_client_settings (company_id). The
-- pricing columns live there as of #20260528000006 and were backfilled from
-- clients. client_origin_pricing is unchanged (its client_id FK was already
-- repointed to companies by #20260528000005), so the origin-pricing branch
-- still works. Only the default-pricing fallback changes.

BEGIN;

CREATE OR REPLACE FUNCTION calculate_client_fee(
    client_id_param UUID,
    sample_id_param UUID
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    sample_data RECORD;
    pricing_data RECORD;
    total_pounds DECIMAL(12,4);
    fee DECIMAL(10,2);
    cents_per_pound DECIMAL(10,4);
BEGIN
    -- Get sample data
    SELECT origin, bags_quantity_mt, bag_count, bag_weight_kg
    INTO sample_data
    FROM samples
    WHERE id = sample_id_param;

    -- If sample not found, return NULL
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Check for origin-specific pricing first
    SELECT pricing_model, price_per_sample, price_per_pound_cents
    INTO pricing_data
    FROM client_origin_pricing
    WHERE client_id = client_id_param
      AND origin = sample_data.origin
      AND is_active = true;

    -- If no origin pricing found, fall back to default client pricing.
    -- Post-consolidation this lives on qc_client_settings (keyed by company_id),
    -- not the dropped `clients` table.
    IF NOT FOUND THEN
        SELECT pricing_model, price_per_sample, price_per_pound_cents
        INTO pricing_data
        FROM qc_client_settings
        WHERE company_id = client_id_param
        LIMIT 1;

        -- If no settings row or no pricing, return NULL
        IF NOT FOUND OR pricing_data.pricing_model IS NULL THEN
            RETURN NULL;
        END IF;
    END IF;

    -- Calculate based on pricing model
    IF pricing_data.pricing_model = 'complimentary' THEN
        RETURN 0.00;

    ELSIF pricing_data.pricing_model = 'per_sample' THEN
        RETURN pricing_data.price_per_sample;

    ELSIF pricing_data.pricing_model = 'per_pound' THEN
        -- No rate configured yet (common while prices are still being entered
        -- on sys.wolthers.com) => no fee. The original GREATEST(rate, 0.25)
        -- floor below would otherwise silently bill 0.25c/lb on a NULL rate.
        IF pricing_data.price_per_pound_cents IS NULL THEN
            RETURN NULL;
        END IF;

        -- Calculate total pounds
        IF sample_data.bags_quantity_mt IS NOT NULL THEN
            -- 1 Metric Ton = 2204.62 pounds
            total_pounds := sample_data.bags_quantity_mt * 2204.62;
        ELSIF sample_data.bag_count IS NOT NULL AND sample_data.bag_weight_kg IS NOT NULL THEN
            -- 1 kg = 2.20462 pounds
            total_pounds := (sample_data.bag_count * sample_data.bag_weight_kg) * 2.20462;
        ELSE
            -- No lot size data, return NULL
            RETURN NULL;
        END IF;

        -- Calculate fee (minimum 0.25¢/lb)
        cents_per_pound := GREATEST(pricing_data.price_per_pound_cents, 0.25);
        fee := total_pounds * (cents_per_pound / 100);

        RETURN ROUND(fee, 2);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_client_fee(UUID, UUID) IS
  'Calculate fee to charge client - checks client_origin_pricing first, then '
  'falls back to qc_client_settings (company_id). Repointed off the dropped '
  'clients table on 2026-05-29.';

-- Sanity check: the function must no longer reference "FROM clients".
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'calculate_client_fee'
   LIMIT 1;

  IF v_def ~* 'FROM\s+clients\b' THEN
    RAISE EXCEPTION 'calculate_client_fee still references FROM clients — inspect manually.';
  END IF;

  RAISE NOTICE 'calculate_client_fee repointed to qc_client_settings — no clients reference remains.';
END $$;

COMMIT;

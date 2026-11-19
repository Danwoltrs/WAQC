-- 20261119000000_type_samples_never_billable.sql
--
-- A type sample is never billable and never reaches finance.
--
-- Until now nothing in the database knew that: the billing feed sys invoices
-- from, the finance page's per-lab views and the cached fee columns all counted
-- a type sample like any other lot. On 2026-11-19 no type sample was being
-- billed (all 11 approved ones belong to complimentary clients), so this changes
-- no figure today; it closes the door for the day a per-pound client gets one.
--
-- What it changes (definitions taken from the live database, 2026-11-19):
--   1. qc_billing_feed          leaves type samples out.
--   2. lab_payment_summary      does not count type samples.
--   3. lab_sample_breakdown     does not count type samples.
--   4. calculate_client_fee()   answers 0.00 for a type sample.
--   5. update_sample_fees()     stamps a type sample with fee 0 and no lab fee,
--      and the UPDATE trigger now also fires when sample_type changes, so a lot
--      re-typed after intake is re-stamped.
--
-- CREATE OR REPLACE VIEW resets a view's options, so security_invoker is named
-- again on each view (all three run as the caller today).
--
-- sys has its own lab-fees view (dashboard_lab_fees_v, sys migration 0786). It
-- is changed in the sys repo: 0997_lab_fees_exclude_type_samples.sql.
--
-- Safe to run twice.

BEGIN;

-- Fail fast instead of queueing behind a long transaction on samples.
SET LOCAL lock_timeout = '3s';

-- ── 1. The billing feed ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW qc_billing_feed WITH (security_invoker = on) AS
SELECT
  s.id                                   AS sample_id,
  s.tracking_number,
  s.origin,
  s.status,
  s.workflow_stage,
  s.client_id,
  prog.name                              AS billed_program,
  pounds.lbs                             AS billable_pounds,
  qcs.price_per_pound_cents              AS cents_per_pound,
  ROUND(pounds.lbs * (qcs.price_per_pound_cents / 100), 2) AS fee_amount,
  COALESCE(qcs.currency, 'USD')          AS currency,
  COALESCE(s.roaster_id, s.importer_id)  AS payer_company_id,
  CASE
    WHEN s.roaster_id  IS NOT NULL THEN 'roaster'
    WHEN s.importer_id IS NOT NULL THEN 'importer'
    ELSE 'unattributed'
  END                                    AS payer_role,
  payer.name                             AS payer_name
FROM samples s
JOIN qc_client_settings qcs ON qcs.company_id = s.client_id
JOIN companies prog         ON prog.id = s.client_id
LEFT JOIN companies payer   ON payer.id = COALESCE(s.roaster_id, s.importer_id)
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN s.bags_quantity_mt IS NOT NULL
      THEN s.bags_quantity_mt * 2204.62
    WHEN s.bag_count IS NOT NULL AND s.bag_weight_kg IS NOT NULL
      THEN (s.bag_count * s.bag_weight_kg) * 2.20462
  END AS lbs
) pounds ON true
WHERE s.status = 'approved'
  -- sample_type may be NULL on old rows: those stay in, only 'type' is out.
  AND s.sample_type::text IS DISTINCT FROM 'type'
  AND qcs.pricing_model = 'per_pound'
  AND qcs.price_per_pound_cents IS NOT NULL;

-- ── 2. Third-party lab payments (finance page) ─────────────────────────────
CREATE OR REPLACE VIEW lab_payment_summary WITH (security_invoker = on) AS
SELECT
    l.id AS laboratory_id,
    l.name,
    l.location,
    l.type,
    l.is_active,
    ltpc.fee_per_sample,
    ltpc.payment_schedule,
    ltpc.billing_basis,
    ltpc.currency,
    ltpc.contact_name,
    ltpc.contact_email,
    COUNT(s.id) AS total_samples,
    COUNT(CASE WHEN s.status = 'approved' THEN 1 END) AS approved_samples,
    COUNT(CASE WHEN s.status = 'rejected' THEN 1 END) AS rejected_samples,
    COUNT(CASE WHEN s.status::text IN ('received', 'in_progress', 'under_review') THEN 1 END) AS pending_samples,
    SUM(CASE
        WHEN ltpc.billing_basis::text = 'all_samples' THEN s.calculated_lab_fee
        WHEN ltpc.billing_basis::text = 'approved_only' AND s.status::text = 'approved' THEN s.calculated_lab_fee
        WHEN ltpc.billing_basis::text = 'approved_and_rejected' AND s.status::text IN ('approved', 'rejected') THEN s.calculated_lab_fee
        ELSE 0
    END) AS total_owed_amount,
    SUM(s.calculated_lab_fee) AS total_potential_amount,
    MIN(s.created_at) AS first_sample_date,
    MAX(s.created_at) AS last_sample_date
FROM laboratories l
INNER JOIN laboratory_third_party_config ltpc ON ltpc.laboratory_id = l.id
LEFT JOIN samples s ON s.laboratory_id = l.id
                   AND s.sample_type::text IS DISTINCT FROM 'type'
WHERE l.type::text = 'third_party' AND ltpc.is_active = true
GROUP BY l.id, l.name, l.location, l.type, l.is_active, ltpc.fee_per_sample,
         ltpc.payment_schedule, ltpc.billing_basis, ltpc.currency,
         ltpc.contact_name, ltpc.contact_email;

-- ── 3. Per-lab breakdown (finance page) ────────────────────────────────────
CREATE OR REPLACE VIEW lab_sample_breakdown WITH (security_invoker = on) AS
SELECT
    l.id AS laboratory_id,
    l.name,
    l.location,
    l.type,
    COUNT(s.id) AS total_samples,
    COUNT(CASE WHEN s.status = 'approved' THEN 1 END) AS approved_samples,
    COUNT(CASE WHEN s.status = 'rejected' THEN 1 END) AS rejected_samples,
    COUNT(CASE WHEN s.status::text IN ('received', 'in_progress', 'under_review') THEN 1 END) AS pending_samples,
    ROUND(
        CASE
            WHEN COUNT(s.id) > 0
            THEN (COUNT(CASE WHEN s.status = 'approved' THEN 1 END)::DECIMAL / COUNT(s.id)::DECIMAL) * 100
            ELSE 0
        END,
        2
    ) AS approval_rate
FROM laboratories l
LEFT JOIN samples s ON s.laboratory_id = l.id
                   AND s.sample_type::text IS DISTINCT FROM 'type'
WHERE l.is_active = true
GROUP BY l.id, l.name, l.location, l.type;

-- ── 4. The cached client fee ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_client_fee(client_id_param uuid, sample_id_param uuid)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    sample_data RECORD;
    pricing_data RECORD;
    total_pounds DECIMAL(12,4);
    fee DECIMAL(10,2);
    cents_per_pound DECIMAL(10,4);
BEGIN
    SELECT origin, bags_quantity_mt, bag_count, bag_weight_kg, sample_type
    INTO sample_data
    FROM samples
    WHERE id = sample_id_param;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- A type sample is never billable, whatever the client's pricing.
    IF sample_data.sample_type::text = 'type' THEN
        RETURN 0.00;
    END IF;

    -- Origin-specific pricing first
    SELECT pricing_model, price_per_sample, price_per_pound_cents
    INTO pricing_data
    FROM client_origin_pricing
    WHERE client_id = client_id_param
      AND origin = sample_data.origin
      AND is_active = true;

    -- Fall back to default pricing — now on qc_client_settings (company_id).
    IF NOT FOUND THEN
        SELECT pricing_model, price_per_sample, price_per_pound_cents
        INTO pricing_data
        FROM qc_client_settings
        WHERE company_id = client_id_param
        LIMIT 1;

        IF NOT FOUND OR pricing_data.pricing_model IS NULL THEN
            RETURN NULL;
        END IF;
    END IF;

    IF pricing_data.pricing_model = 'complimentary' THEN
        RETURN 0.00;

    ELSIF pricing_data.pricing_model = 'per_sample' THEN
        RETURN pricing_data.price_per_sample;

    ELSIF pricing_data.pricing_model = 'per_pound' THEN
        -- No rate configured yet => no fee (avoids silently billing the
        -- 0.25c/lb floor via GREATEST(NULL, 0.25)).
        IF pricing_data.price_per_pound_cents IS NULL THEN
            RETURN NULL;
        END IF;

        IF sample_data.bags_quantity_mt IS NOT NULL THEN
            total_pounds := sample_data.bags_quantity_mt * 2204.62;
        ELSIF sample_data.bag_count IS NOT NULL AND sample_data.bag_weight_kg IS NOT NULL THEN
            total_pounds := (sample_data.bag_count * sample_data.bag_weight_kg) * 2.20462;
        ELSE
            RETURN NULL;
        END IF;

        cents_per_pound := GREATEST(pricing_data.price_per_pound_cents, 0.25);
        fee := total_pounds * (cents_per_pound / 100);
        RETURN ROUND(fee, 2);
    END IF;

    RETURN NULL;
END;
$function$;

-- ── 5. The fee stamp on the sample row ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_sample_fees()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- A type sample carries no fee on either side: nothing to bill the client,
    -- nothing owed to a third-party lab.
    IF NEW.sample_type::text = 'type' THEN
        NEW.calculated_client_fee := 0.00;
        NEW.calculated_lab_fee := NULL;
        RETURN NEW;
    END IF;

    NEW.calculated_client_fee := calculate_client_fee(NEW.client_id, NEW.id);
    NEW.calculated_lab_fee := calculate_lab_fee(NEW.laboratory_id, NEW.status);
    RETURN NEW;
END;
$function$;

-- The same trigger as before, now also firing when the sample type changes.
DROP TRIGGER IF EXISTS trigger_calculate_sample_fees_update ON public.samples;
CREATE TRIGGER trigger_calculate_sample_fees_update
    BEFORE UPDATE OF status, client_id, laboratory_id, origin, bags_quantity_mt, bag_count, bag_weight_kg, sample_type
    ON public.samples
    FOR EACH ROW
    WHEN (
        OLD.status IS DISTINCT FROM NEW.status OR
        OLD.client_id IS DISTINCT FROM NEW.client_id OR
        OLD.laboratory_id IS DISTINCT FROM NEW.laboratory_id OR
        OLD.origin IS DISTINCT FROM NEW.origin OR
        OLD.bags_quantity_mt IS DISTINCT FROM NEW.bags_quantity_mt OR
        OLD.bag_count IS DISTINCT FROM NEW.bag_count OR
        OLD.bag_weight_kg IS DISTINCT FROM NEW.bag_weight_kg OR
        OLD.sample_type IS DISTINCT FROM NEW.sample_type
    )
    EXECUTE FUNCTION update_sample_fees();

-- ── Checks: abort the whole migration if any of this did not hold ──────────
DO $$
DECLARE
  v_count INT;
  v_view  TEXT;
BEGIN
  SELECT count(*) INTO v_count
  FROM qc_billing_feed f JOIN samples s ON s.id = f.sample_id
  WHERE s.sample_type::text = 'type';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'qc_billing_feed still lists % type sample(s)', v_count;
  END IF;

  FOREACH v_view IN ARRAY ARRAY['qc_billing_feed', 'lab_payment_summary', 'lab_sample_breakdown'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relname = v_view
        AND c.reloptions::text ~ 'security_invoker=(on|true)'
    ) THEN
      RAISE EXCEPTION '% lost security_invoker', v_view;
    END IF;
  END LOOP;

  RAISE NOTICE 'Type samples are out of the billing feed and the finance views.';
END $$;

COMMIT;

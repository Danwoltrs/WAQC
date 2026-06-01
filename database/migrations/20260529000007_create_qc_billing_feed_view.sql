-- Migration 20260529000007: qc_billing_feed view.
--
-- Read-only billing feed consumed by the (future) sys.wolthers.com finance dept
-- -> QuickBooks. WAQC computes the line; downstream does no business logic.
--
-- Rules (confirmed 2026-05-29):
--   * Billable = any QC client on pricing_model 'per_pound' with a rate set.
--     After the 2026-05-29 baseline (#20260529000006) that is Dunkin only;
--     keying on pricing keeps the feed automatic if another client is added.
--   * Rate is data-driven from qc_client_settings.price_per_pound_cents — change
--     it on sys and the feed follows; no view edit needed.
--   * Coffee is identified by samples.client_id (the QC client / program). The
--     diagnostic confirmed Dunkin coffee always carries client_id = Dunkin,
--     while end_client_id is usually NULL — so client_id is the join key.
--   * PAYER: roaster_id if a roaster is assigned (sold to roaster) else
--     importer_id ("unsold"). Both NULL => 'unattributed' (needs manual fix).
--   * Only approved samples are invoiced.
--
-- Notes:
--   * fee_amount is NULL when weight data is missing (not 0) so finance can see
--     an approved-but-unbillable sample rather than silently billing zero.
--   * The roaster-else-importer routing currently applies to every per_pound
--     client. If a future client must bill itself instead, extend payer_role
--     with a CASE on qc_client_settings.fee_payer = 'client_pays'.
--   * Intended for server-side reads (service role) by sys; not exposed to the
--     browser. Revisit security_invoker / RLS when the sys integration lands.

-- Drop first: CREATE OR REPLACE can't reorder/rename existing view columns,
-- and an earlier-shaped version of this view may already exist.
DROP VIEW IF EXISTS qc_billing_feed;

CREATE VIEW qc_billing_feed AS
SELECT
  s.id                                   AS sample_id,
  s.tracking_number,
  s.origin,
  s.status,
  s.workflow_stage,
  s.client_id,
  prog.name                              AS billed_program,   -- e.g. Dunkin Donuts
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
  AND qcs.pricing_model = 'per_pound'
  AND qcs.price_per_pound_cents IS NOT NULL;

COMMENT ON VIEW qc_billing_feed IS
  'Read-only QC fee billing feed for sys.wolthers.com finance -> QuickBooks. '
  'One row per approved billable sample: fee_amount + resolved payer '
  '(roaster if sold, else importer if unsold). Keyed on samples.client_id.';

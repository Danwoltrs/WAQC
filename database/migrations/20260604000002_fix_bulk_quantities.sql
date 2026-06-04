-- Migration 20260604000002: Correct stale BULK quantities
--
-- WHY: For bag_type='bulk', bag_count holds the 60kg-bag EQUIVALENT, so
--   bags_quantity_mt   = bag_count * 60 / 1000
--   equivalent_60kg_bags = bag_count
-- The sub-contract dialog applied this, but an older version of the main sample
-- intake form multiplied bag_count by the 21,600 kg container weight, storing
-- absurd tonnages (e.g. SAG-011692/26: 1050 bags -> 22,680 MT instead of 63).
-- The CURRENT intake code (quantity-step.tsx) already computes bulk correctly;
-- this migration only repairs the rows written before that fix shipped.
--
-- Found wrong (Santos / 2026): SAX-011687/88/89 (720 -> 43.2), SAX-011690/91
-- (360 -> 21.6), SAG-011692 (1050 -> 63). Safe/idempotent via the guard.

BEGIN;

UPDATE samples
SET bags_quantity_mt = ROUND(bag_count * 60.0 / 1000, 3),
    equivalent_60kg_bags = bag_count
WHERE bag_type = 'bulk'
  AND bag_count IS NOT NULL
  AND bags_quantity_mt IS DISTINCT FROM ROUND(bag_count * 60.0 / 1000, 3);

UPDATE sample_contracts
SET bags_quantity_mt = ROUND(bag_count * 60.0 / 1000, 3),
    equivalent_60kg_bags = bag_count
WHERE bag_type = 'bulk'
  AND bag_count IS NOT NULL
  AND bags_quantity_mt IS DISTINCT FROM ROUND(bag_count * 60.0 / 1000, 3);

-- Drop cached cert PDFs for bulk samples so they regenerate with the corrected
-- tonnage (and the new per-contract bags + buyer-ref header) on next download.
UPDATE certificates
SET pdf_url = NULL
WHERE sample_id IN (SELECT id FROM samples WHERE bag_type = 'bulk');

COMMIT;

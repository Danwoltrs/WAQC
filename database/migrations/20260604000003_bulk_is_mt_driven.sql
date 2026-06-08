-- Migration 20260604000003: Make BULK quantity MT-driven (fix the trigger)
--
-- ROOT CAUSE: trigger update_equivalent_60kg_bags() (migration 057) recomputes,
-- on every write to samples:
--   bags_quantity_mt    = bag_count * bag_weight_kg / 1000
--   equivalent_60kg_bags = bag_count * 360   (the 'bulk' standard, 21600kg row)
-- For bulk that yields nonsense (1050 * 21600/1000 = 22,680 MT). It silently
-- overwrote the correct value the intake form computed, and reverted the data
-- fix in migration ...0002 as soon as any bag field changed.
--
-- NEW MODEL (confirmed with product): a bulk container's weight varies with
-- density (grinder coffee is lighter, sometimes < 21.6 MT/container), so for
-- bulk the NET WEIGHT IN MT is the source of truth and the 60kg-bag equivalent
-- is DERIVED from it (MT * 1000 / 60). Non-bulk stays bags-driven (unchanged).

BEGIN;

CREATE OR REPLACE FUNCTION update_equivalent_60kg_bags()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.bag_type = 'bulk' THEN
        -- Bulk is weight-driven. Keep the entered MT; if it's missing, fall back
        -- to the standard 60kg-per-equivalent-bag derivation from bag_count.
        IF NEW.bags_quantity_mt IS NULL AND NEW.bag_count IS NOT NULL THEN
            NEW.bags_quantity_mt := ROUND((NEW.bag_count * 60.0 / 1000.0)::numeric, 3);
        END IF;
        IF NEW.bags_quantity_mt IS NOT NULL THEN
            NEW.equivalent_60kg_bags := ROUND((NEW.bags_quantity_mt * 1000.0 / 60.0)::numeric, 2);
        END IF;
    ELSE
        -- Bags-driven (jute/PP/big bag): unchanged from migration 057.
        NEW.equivalent_60kg_bags := calculate_equivalent_60kg_bags(
            NEW.bag_count,
            NEW.bag_weight_kg,
            NEW.bag_type
        );
        IF NEW.bag_count IS NOT NULL AND NEW.bag_weight_kg IS NOT NULL THEN
            NEW.bags_quantity_mt := ROUND(((NEW.bag_count * NEW.bag_weight_kg) / 1000.0)::numeric, 3);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also fire when bags_quantity_mt changes, so editing the MT re-derives the
-- 60kg-bag equivalent for bulk samples.
DROP TRIGGER IF EXISTS trigger_update_equivalent_60kg_bags ON samples;
CREATE TRIGGER trigger_update_equivalent_60kg_bags
    BEFORE INSERT OR UPDATE OF bag_count, bag_weight_kg, bag_type, bags_quantity_mt
    ON samples
    FOR EACH ROW
    EXECUTE FUNCTION update_equivalent_60kg_bags();

-- Repair existing bulk rows to the standard net weight (bag_count was the
-- intended 60kg-bag equivalent). Where real density differs (grinder coffee),
-- edit the MT afterwards. Setting bags_quantity_mt fires the corrected trigger,
-- which derives equivalent_60kg_bags from it.
UPDATE samples
SET bags_quantity_mt = ROUND((bag_count * 60.0 / 1000.0)::numeric, 3)
WHERE bag_type = 'bulk' AND bag_count IS NOT NULL;

-- Clear cached cert PDFs for bulk samples so they regenerate with correct MT.
UPDATE certificates
SET pdf_url = NULL
WHERE sample_id IN (SELECT id FROM samples WHERE bag_type = 'bulk');

COMMIT;

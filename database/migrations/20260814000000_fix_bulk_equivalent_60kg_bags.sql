-- Repair bulk rows whose derived totals were computed with the non-bulk formula.
--
-- For bag_type = 'bulk', bag_count IS the 60kg-equivalent count and
-- bag_weight_kg is the container's WHOLE net weight (21,600 kg), not a
-- per-unit weight. So the invariant is:
--
--     equivalent_60kg_bags = bag_count
--     bags_quantity_mt     = bag_count * 60 / 1000
--
-- The certificate editor used to save its own `bag_count * bag_weight_kg`
-- without checking bag_type, which overstates a bulk lot by exactly 360x
-- (21600 / 60). Sample SAN-00513/26 (cert SAK-011813/26, Expocacer ->
-- Rothfos GmbH -> Ahold) was stored as 388,800 bags / 23,328 MT instead of
-- 1,080 bags / 64.8 MT — three containers — and on its own dominated the
-- supply-chain flow on every report that included it.
--
-- The write path was fixed in the same change set (use-cert-editor now
-- delegates to computeBagQuantities, as every other write path already did).
-- This only repairs the rows already on disk.
--
-- Idempotent: the WHERE clause matches nothing once the invariant holds, so
-- re-running is a no-op. Rows with a NULL bag_count are left alone — there is
-- nothing to derive from.

update samples
set equivalent_60kg_bags = bag_count,
    bags_quantity_mt     = round(bag_count * 60 / 1000.0, 3)
where deleted_at is null
  and bag_type::text = 'bulk'
  and bag_count is not null
  and equivalent_60kg_bags is distinct from bag_count;

update sample_contracts
set equivalent_60kg_bags = bag_count,
    bags_quantity_mt     = round(bag_count * 60 / 1000.0, 3)
where bag_type::text = 'bulk'
  and bag_count is not null
  and equivalent_60kg_bags is distinct from bag_count;

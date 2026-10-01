-- Migration 20261001000000: packaging liner and container size on samples
--
-- Intake now enters a quantity as sys quotes a contract: boxes (containers)
-- × bags per box, in a 20' or 40', with a packaging. container_count already
-- holds the boxes; these two columns keep what else was entered:
--   bag_liner      GrainPro, Generic GrainPro or any liner staff add (names
--                  from the shared packaging_liners table); for bulk / big
--                  bags a floor add-on such as "+ Pallets". bag_type stays
--                  jute_bag for a lined bag, so counts and reports are unchanged.
--   container_size 20' or 40'.

BEGIN;

ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS bag_liner text NULL,
  ADD COLUMN IF NOT EXISTS container_size text NULL
    CHECK (container_size IN ('20''', '40'''));

COMMENT ON COLUMN samples.bag_liner IS
  'Liner inside the bags (GrainPro, Generic GrainPro, ...) or a bulk / big-bag add-on (+ Pallets). NULL = none.';
COMMENT ON COLUMN samples.container_size IS
  'Container size the quantity was entered for: 20'' or 40''. container_count holds the number of boxes.';

COMMIT;

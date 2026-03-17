-- Migration: Move certificate number generation to certify moment
--
-- This migration cleans up any certificates that were created for samples
-- that have not yet been certified/rejected. Since certificate numbers are
-- now generated at certification time (not at intake), any premature
-- certificate records need to be removed so sequences stay clean.
--
-- After this migration:
-- - Only certified/rejected samples have certificate records
-- - Certificate sequences reflect only actually-certified samples
-- - Gaps in sequences are acceptable (voided/archived certs)

-- ========================================
-- 1. Audit: Show certificates for non-certified samples
-- ========================================
-- Run this SELECT first to see what will be affected:
--
-- SELECT c.id, c.certificate_number, c.created_at, s.tracking_number, s.workflow_stage, s.status
-- FROM certificates c
-- JOIN samples s ON c.sample_id = s.id
-- WHERE s.workflow_stage NOT IN ('certified', 'rejected')
--   AND s.deleted_at IS NULL;

-- ========================================
-- 2. Delete certificate records for uncertified samples
-- ========================================
-- These samples never completed the certification flow, so their
-- certificate records (which used tracking numbers as cert numbers)
-- should be removed. When they are eventually certified, a proper
-- sequence-based certificate number will be generated.

DELETE FROM certificates
WHERE sample_id IN (
  SELECT s.id
  FROM samples s
  WHERE s.workflow_stage NOT IN ('certified', 'rejected')
    AND s.deleted_at IS NULL
);

-- ========================================
-- 3. Verify: No orphaned certificates remain
-- ========================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM certificates c
  JOIN samples s ON c.sample_id = s.id
  WHERE s.workflow_stage NOT IN ('certified', 'rejected')
    AND s.deleted_at IS NULL;

  IF v_count > 0 THEN
    RAISE WARNING 'Found % certificates for non-certified samples after cleanup', v_count;
  ELSE
    RAISE NOTICE 'Migration complete: all certificates now belong to certified/rejected samples only';
  END IF;
END;
$$;

SELECT 'Migration: cert number generation moved to certify moment - complete' AS status;

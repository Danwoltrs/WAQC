-- Restamp the validator's taint/fault list with who settled it and when.
--
-- From 2026-09-10 to 2026-10-30 every cupping finalize saved the validator's
-- list stamped BEFORE the approval gate, then overwrote it AFTER the gate with
-- the same two arrays minus resolved_by/resolved_at (0 of 1,277 lots carried
-- the stamp). The PDF prints the list regardless; the QR page, compliance
-- check, approval email and reports only trust a stamped list and recounted
-- from the cupping cards instead, so they disagreed with the certificate
-- wherever the validator removed or changed a taint.
--
-- The same request froze quality_assessments.score_resolution with the same
-- who and when, so the stamp is copied from there. Lots without one were
-- finalized before 2026-09-10, when the list was derived rather than settled
-- by a validator; they stay unstamped on purpose (see hasResolvedDefects).

BEGIN;

UPDATE quality_assessments
SET resolved_defects = resolved_defects || jsonb_build_object(
      'resolved_at', score_resolution->'resolved_at',
      'resolved_by', score_resolution->'resolved_by',
      'restamped_on', '2026-10-30'
    )
WHERE jsonb_typeof(resolved_defects) = 'object'
  AND NOT resolved_defects ? 'resolved_at'
  AND jsonb_typeof(score_resolution->'resolved_at') = 'string';

COMMIT;

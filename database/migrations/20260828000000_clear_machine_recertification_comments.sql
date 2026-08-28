-- Clear the machine-written re-certification text out of certificates.override_comment.
--
-- WHY
-- `override_comment` is printed verbatim on the customer's certificate under
-- COMMENTS. It is meant for a remark a human left when overriding a decision.
-- The finalize pipeline used to stamp bookkeeping into it on every
-- re-finalize —
--
--   "Re-certified (rev 4): Re-certified with no changes to decision or violations"
--
-- — which was published to the buyer, and which also OVERWROTE any genuine
-- override remark that was already there. The write has been removed from
-- mintCertificates, and the certificate renderer suppresses this exact
-- generated prefix so already-issued certificates print clean without waiting
-- on this file. This clears the stored values so the data matches what prints.
--
-- SCOPE: anchored to the exact generated prefix, so the 26 real human remarks
-- in this column (e.g. "Quality spec changed, re-review recommended") are left
-- untouched. Expected on 2026-08-28: 3 rows updated.
--
-- Remarks overwritten by the old code before today are NOT recoverable from
-- this column; certificate_versions.changes_description holds the revision
-- history that belonged there all along.

-- Dry run — inspect before applying the UPDATE below.
--   SELECT certificate_number, revision_number, override_comment
--   FROM certificates
--   WHERE override_comment ~* '^Re-certified \(rev [0-9]+\):'
--   ORDER BY updated_at DESC;

UPDATE certificates
SET override_comment = NULL,
    updated_at       = now()
WHERE override_comment ~* '^Re-certified \(rev [0-9]+\):';

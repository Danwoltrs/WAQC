-- Migration: persist validator-resolved defects per sample for the certificate.
--
-- Problem: the certificate's defect list was derived by filtering all cuppers'
-- cupping_scores.defects through the master cupper's defect names. This inference
-- chain has multiple silent failure modes (session in 'setup' status, master cupper
-- not in cupper_ids, master row filtered out of the cupping_scores query, etc.).
-- Each failure produces the same bad behavior: skip the filter, dump every cupper's
-- raw defects onto the cert.
--
-- Fix: store the validator's exact resolved defect list per sample on
-- quality_assessments. The finalize endpoint writes it; the cert reads it as
-- authoritative. No more chain.

ALTER TABLE quality_assessments
ADD COLUMN IF NOT EXISTS resolved_defects JSONB;

COMMENT ON COLUMN quality_assessments.resolved_defects IS
  'Validator-resolved defect list for the certificate. Shape: {taints:[{name,intensity,cups_affected}],faults:[...]}. Written by /api/cupping/finalize on finalize. Read by certificate-data.ts as the authoritative source — bypasses the master-cupper-filter inference chain.';

-- Backfill: for existing finalized samples, copy the master cupper's defects into
-- resolved_defects so previously-finalized certs regenerate correctly.
UPDATE quality_assessments qa
SET resolved_defects = cs.defects
FROM cupping_scores cs
JOIN cupping_sessions sess ON sess.id = cs.session_id
WHERE qa.sample_id = cs.sample_id
  AND sess.master_cupper_id IS NOT NULL
  AND cs.cupper_id = sess.master_cupper_id
  AND qa.resolved_defects IS NULL;

-- Clear cached cert PDFs so they regenerate from the new logic on next view.
UPDATE certificates SET pdf_url = NULL WHERE pdf_url IS NOT NULL;

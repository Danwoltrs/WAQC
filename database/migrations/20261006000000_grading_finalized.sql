-- Grading is finished when someone says so, not when anything was saved.
--
-- Until now "grading done" meant "quality_assessments.green_bean_data is not
-- null". The grading page's single Save button writes that column, so saving
-- the screen sizes alone counted as a complete grading: cupping finalize then
-- certified the lot, a Save on a lot already in Review certified it, and the
-- cupping page's Generate Certificate approved it. A certificate went out with
-- no defects, no moisture and no density (2026-10-05).
--
-- The grading half is now an explicit act, stamped here, and every certify
-- path requires it. Save only saves.

BEGIN;

ALTER TABLE public.quality_assessments
  ADD COLUMN IF NOT EXISTS grading_finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS grading_finalized_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.quality_assessments.grading_finalized_at IS
  'When green-bean grading was finalized on the Grading page. A lot is certified only once both this and the cupping are finalized.';
COMMENT ON COLUMN public.quality_assessments.grading_finalized_by IS
  'Lab user who finalized the grading.';

-- History: every lot that was already decided had its grading accepted at the
-- time, so stamp it with the first certificate's date. Lots still in the
-- pipeline stay unstamped and need an explicit Finalize grading.
UPDATE public.quality_assessments qa
SET grading_finalized_at = first_cert.created_at
FROM (
  SELECT c.sample_id, min(c.created_at) AS created_at
  FROM public.certificates c
  GROUP BY c.sample_id
) first_cert
WHERE first_cert.sample_id = qa.sample_id
  AND qa.grading_finalized_at IS NULL
  AND qa.green_bean_data IS NOT NULL;

COMMIT;

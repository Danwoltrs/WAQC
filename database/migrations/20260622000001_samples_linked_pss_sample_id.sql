-- Link a Shipment Sample (SS) to its approved Pre-Shipment Sample (PSS).
-- Nullable + ON DELETE SET NULL: the link is informational; deleting a PSS must
-- not cascade-delete its SS. Self-referential FK on samples.
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS linked_pss_sample_id uuid NULL;

ALTER TABLE public.samples
  DROP CONSTRAINT IF EXISTS samples_linked_pss_sample_id_fkey;

ALTER TABLE public.samples
  ADD CONSTRAINT samples_linked_pss_sample_id_fkey
  FOREIGN KEY (linked_pss_sample_id)
  REFERENCES public.samples(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_samples_linked_pss_sample_id
  ON public.samples (linked_pss_sample_id);

COMMENT ON COLUMN public.samples.linked_pss_sample_id IS
  'For SS samples: the approved PSS this shipment sample was prefilled from. Informational lineage link.';

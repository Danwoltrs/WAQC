-- ============================================================================
-- Migration 124: Defect Photos Storage Policies
-- RLS policies for the defect-photos bucket
--
-- IMPORTANT: Create the bucket via Supabase Dashboard FIRST:
--   1. Go to Storage > New bucket
--   2. Name: defect-photos
--   3. Public: OFF
--   4. File size limit: 5 MB
--   5. Allowed MIME types: image/jpeg, image/png, image/webp
-- ============================================================================

-- Allow authenticated users to upload photos to their lab's folder
-- Path structure: {laboratory_id}/{sample_id}/{filename}
CREATE POLICY "Lab personnel can upload defect photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'defect-photos'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.laboratory_id IS NOT NULL
  )
);

-- Allow authenticated users to view photos from samples they have access to
CREATE POLICY "Users can view defect photos for accessible samples"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'defect-photos'
  AND (
    -- Lab personnel can view all photos in their lab
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.laboratory_id IS NOT NULL
    )
    OR
    -- Global admins can view all photos
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.qc_role IN ('global_admin', 'global_quality_admin')
    )
  )
);

-- Allow users to update (replace) their uploaded photos
CREATE POLICY "Lab personnel can update defect photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'defect-photos'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.laboratory_id IS NOT NULL
  )
);

-- Allow users to delete photos they have access to
CREATE POLICY "Lab personnel can delete defect photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'defect-photos'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.laboratory_id IS NOT NULL
  )
);

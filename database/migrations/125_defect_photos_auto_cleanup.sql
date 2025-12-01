-- ============================================================================
-- Migration 125: Defect Photos Auto-Cleanup Function
-- Creates a function to delete defect photos older than 12 months
-- Schedule this function to run daily via Supabase pg_cron or external cron
-- ============================================================================

-- Function to clean up old defect photos (older than 12 months)
CREATE OR REPLACE FUNCTION cleanup_old_defect_photos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER := 0;
  deleted_paths TEXT[] := '{}';
  old_photo TEXT;
  photo_record RECORD;
  cutoff_date TIMESTAMP := NOW() - INTERVAL '12 months';
BEGIN
  -- Find all photos older than 12 months based on filename timestamp
  -- Filename format: {timestamp}_{random}.{ext}
  FOR photo_record IN
    SELECT
      o.name as path,
      o.created_at,
      qa.id as assessment_id,
      qa.defect_photos
    FROM storage.objects o
    JOIN quality_assessments qa ON qa.defect_photos @> ARRAY[o.name]
    WHERE o.bucket_id = 'defect-photos'
    AND o.created_at < cutoff_date
  LOOP
    -- Delete from storage
    DELETE FROM storage.objects
    WHERE bucket_id = 'defect-photos'
    AND name = photo_record.path;

    -- Remove from quality_assessments array
    UPDATE quality_assessments
    SET defect_photos = array_remove(defect_photos, photo_record.path)
    WHERE id = photo_record.assessment_id;

    deleted_paths := array_append(deleted_paths, photo_record.path);
    deleted_count := deleted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted_count', deleted_count,
    'deleted_paths', deleted_paths,
    'cutoff_date', cutoff_date,
    'executed_at', NOW()
  );
END;
$$;

-- Grant execute permission to service role (for scheduled jobs)
GRANT EXECUTE ON FUNCTION cleanup_old_defect_photos() TO service_role;

-- Comment for documentation
COMMENT ON FUNCTION cleanup_old_defect_photos() IS
'Deletes defect photos older than 12 months from storage and removes references from quality_assessments.
Schedule to run daily via pg_cron: SELECT cron.schedule(''cleanup-defect-photos'', ''0 3 * * *'', ''SELECT cleanup_old_defect_photos()'');';

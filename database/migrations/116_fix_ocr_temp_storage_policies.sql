-- Fix RLS policies for ocr-temp storage bucket
-- The bucket should allow authenticated users to upload and read temporarily

-- First, ensure the bucket exists with correct settings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ocr-temp',
  'ocr-temp',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

-- Drop any existing policies for this bucket that might have issues
DROP POLICY IF EXISTS "Authenticated users can upload to ocr-temp" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from ocr-temp" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from ocr-temp" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for ocr-temp" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to ocr-temp" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from ocr-temp" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete from ocr-temp" ON storage.objects;

-- Create simple, non-recursive policies for the ocr-temp bucket

-- Allow authenticated users to upload files
CREATE POLICY "ocr_temp_insert_authenticated"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ocr-temp');

-- Allow anyone to read (public bucket)
CREATE POLICY "ocr_temp_select_public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ocr-temp');

-- Allow authenticated users to delete their uploads
CREATE POLICY "ocr_temp_delete_authenticated"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'ocr-temp');

-- Add policy comments
COMMENT ON POLICY "ocr_temp_insert_authenticated" ON storage.objects IS
'Allows authenticated users to upload images to ocr-temp bucket for OCR processing';

COMMENT ON POLICY "ocr_temp_select_public" ON storage.objects IS
'Allows public read access to ocr-temp bucket for Google Vision API';

COMMENT ON POLICY "ocr_temp_delete_authenticated" ON storage.objects IS
'Allows authenticated users to delete temporary OCR images after processing';

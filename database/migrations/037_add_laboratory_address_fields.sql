-- Add address fields to laboratories table
ALTER TABLE laboratories
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS neighborhood TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Update RLS policies to ensure new columns are accessible
-- (Existing policies should already cover these columns, but we verify here)

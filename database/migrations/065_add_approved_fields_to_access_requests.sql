-- Add missing approved_role and approved_laboratory_id columns
ALTER TABLE access_requests
ADD COLUMN IF NOT EXISTS approved_role TEXT;

ALTER TABLE access_requests
ADD COLUMN IF NOT EXISTS approved_laboratory_id UUID REFERENCES laboratories(id) ON DELETE SET NULL;

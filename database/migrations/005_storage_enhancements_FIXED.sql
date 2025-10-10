-- Wolthers Coffee QC System - Storage Enhancements Migration (FIXED)
-- This migration enhances the storage management system with:
-- - Visual 2D shelf positioning
-- - Client-specific shelf assignments
-- - Client portal visibility controls
-- - Enhanced position naming conventions

-- ========================================
-- 0. ADD CLIENT_ID TO PROFILES (if needed)
-- ========================================

-- Add client_id to profiles table if it doesn't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON profiles(client_id);

COMMENT ON COLUMN profiles.client_id IS 'Client association for client portal users';

-- ========================================
-- 1. ADD COLUMNS TO lab_shelves
-- ========================================

-- Add client assignment
ALTER TABLE lab_shelves
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Add client visibility permission
ALTER TABLE lab_shelves
ADD COLUMN IF NOT EXISTS allow_client_view BOOLEAN DEFAULT false;

-- Add 2D positioning for visual layout
ALTER TABLE lab_shelves
ADD COLUMN IF NOT EXISTS x_position INTEGER DEFAULT 0;

ALTER TABLE lab_shelves
ADD COLUMN IF NOT EXISTS y_position INTEGER DEFAULT 0;

-- Add shelf letter identifier (A, B, C, D, etc.)
ALTER TABLE lab_shelves
ADD COLUMN IF NOT EXISTS shelf_letter TEXT;

COMMENT ON COLUMN lab_shelves.client_id IS 'Client assigned to this shelf for dedicated storage';
COMMENT ON COLUMN lab_shelves.allow_client_view IS 'Allow client to view this shelf and their samples in client portal';
COMMENT ON COLUMN lab_shelves.x_position IS 'X coordinate for 2D floor plan visualization (in meters)';
COMMENT ON COLUMN lab_shelves.y_position IS 'Y coordinate for 2D floor plan visualization (in meters)';
COMMENT ON COLUMN lab_shelves.shelf_letter IS 'Letter identifier for shelf (A, B, C, D, etc.) used in position naming';

-- ========================================
-- 2. UPDATE EXISTING lab_shelves RECORDS
-- ========================================

-- Set shelf_letter based on shelf_number for existing records
-- This will convert shelf_number 1 -> A, 2 -> B, etc.
UPDATE lab_shelves
SET shelf_letter = CHR(64 + shelf_number)
WHERE shelf_letter IS NULL;

-- Make shelf_letter NOT NULL after populating
ALTER TABLE lab_shelves
ALTER COLUMN shelf_letter SET NOT NULL;

-- ========================================
-- 3. ADD FUNCTION TO GENERATE POSITION CODES
-- ========================================

CREATE OR REPLACE FUNCTION generate_position_code(
  p_shelf_letter TEXT,
  p_row_number INTEGER,
  p_column_number INTEGER
) RETURNS TEXT AS $$
DECLARE
  row_letter TEXT;
BEGIN
  -- Convert row number to letter (1 -> A, 2 -> B, etc.)
  row_letter := CHR(64 + p_row_number);

  -- Return format: {shelf_letter}-{row_letter}{column_number}
  -- Example: D-A1, D-A2, D-B1, etc.
  RETURN p_shelf_letter || '-' || row_letter || p_column_number::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION generate_position_code IS 'Generate position code in format: {shelf_letter}-{row_letter}{column_number}';

-- ========================================
-- 4. ADD FUNCTION TO AUTO-GENERATE STORAGE POSITIONS
-- ========================================

CREATE OR REPLACE FUNCTION generate_storage_positions_for_shelf(
  p_shelf_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_shelf RECORD;
  v_row INTEGER;
  v_col INTEGER;
  v_position_code TEXT;
  v_count INTEGER := 0;
BEGIN
  -- Get shelf details
  SELECT
    laboratory_id,
    shelf_letter,
    rows,
    columns,
    samples_per_position
  INTO v_shelf
  FROM lab_shelves
  WHERE id = p_shelf_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shelf not found: %', p_shelf_id;
  END IF;

  -- Delete existing positions for this shelf
  DELETE FROM storage_positions WHERE shelf_id = p_shelf_id;

  -- Generate positions for each row and column
  FOR v_row IN 1..v_shelf.rows LOOP
    FOR v_col IN 1..v_shelf.columns LOOP
      -- Generate position code
      v_position_code := generate_position_code(v_shelf.shelf_letter, v_row, v_col);

      -- Insert storage position
      INSERT INTO storage_positions (
        laboratory_id,
        shelf_id,
        position_code,
        column_number,
        row_number,
        capacity_per_position,
        current_samples,
        current_count
      ) VALUES (
        v_shelf.laboratory_id,
        p_shelf_id,
        v_position_code,
        v_col,
        v_row,
        v_shelf.samples_per_position,
        '{}',
        0
      );

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_storage_positions_for_shelf IS 'Auto-generate all storage positions for a shelf based on its rows, columns, and samples_per_position';

-- ========================================
-- 5. CREATE INDEXES FOR PERFORMANCE
-- ========================================

CREATE INDEX IF NOT EXISTS idx_lab_shelves_client_id ON lab_shelves(client_id);
CREATE INDEX IF NOT EXISTS idx_lab_shelves_allow_client_view ON lab_shelves(allow_client_view);
CREATE INDEX IF NOT EXISTS idx_lab_shelves_client_visible
  ON lab_shelves(client_id, allow_client_view)
  WHERE allow_client_view = true;
CREATE INDEX IF NOT EXISTS idx_lab_shelves_shelf_letter ON lab_shelves(laboratory_id, shelf_letter);

-- ========================================
-- 6. ADD VIEW FOR CLIENT STORAGE ACCESS
-- ========================================

CREATE OR REPLACE VIEW client_visible_shelves AS
SELECT
  s.id,
  s.laboratory_id,
  s.shelf_number,
  s.shelf_letter,
  s.columns,
  s.rows,
  s.samples_per_position,
  s.naming_convention,
  s.client_id,
  s.x_position,
  s.y_position,
  s.created_at,
  s.updated_at,
  l.name as laboratory_name,
  l.location as laboratory_location,
  c.name as client_name,
  (s.columns * s.rows * s.samples_per_position) as total_capacity
FROM lab_shelves s
INNER JOIN laboratories l ON s.laboratory_id = l.id
LEFT JOIN clients c ON s.client_id = c.id
WHERE s.allow_client_view = true;

COMMENT ON VIEW client_visible_shelves IS 'Shelves that are approved for client portal visibility';

-- ========================================
-- 7. CREATE FUNCTION FOR STORAGE ANALYTICS
-- ========================================

CREATE OR REPLACE FUNCTION get_shelf_utilization(p_shelf_id UUID)
RETURNS TABLE(
  total_positions BIGINT,
  occupied_positions BIGINT,
  total_capacity BIGINT,
  current_count BIGINT,
  utilization_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_positions,
    COUNT(*) FILTER (WHERE sp.current_count > 0)::BIGINT as occupied_positions,
    SUM(sp.capacity_per_position)::BIGINT as total_capacity,
    SUM(sp.current_count)::BIGINT as current_count,
    ROUND(
      (SUM(sp.current_count)::NUMERIC / NULLIF(SUM(sp.capacity_per_position), 0)) * 100,
      2
    ) as utilization_percentage
  FROM storage_positions sp
  WHERE sp.shelf_id = p_shelf_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_shelf_utilization IS 'Get utilization statistics for a specific shelf';

-- ========================================
-- 8. CREATE FUNCTION FOR CLIENT SAMPLE LOOKUP
-- ========================================

CREATE OR REPLACE FUNCTION get_client_samples_in_storage(
  p_client_id UUID,
  p_laboratory_id UUID DEFAULT NULL
)
RETURNS TABLE(
  sample_id UUID,
  tracking_number TEXT,
  origin TEXT,
  client_reference TEXT,
  intake_date DATE,
  status TEXT,
  storage_position TEXT,
  shelf_id UUID,
  shelf_letter TEXT,
  position_code TEXT,
  laboratory_id UUID,
  laboratory_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.tracking_number,
    s.origin,
    s.client_reference,
    s.intake_date,
    s.status,
    s.storage_position,
    ls.id as shelf_id,
    ls.shelf_letter,
    sp.position_code,
    s.laboratory_id,
    l.name as laboratory_name
  FROM samples s
  INNER JOIN storage_positions sp ON s.storage_position = sp.position_code
    AND s.laboratory_id = sp.laboratory_id
  INNER JOIN lab_shelves ls ON sp.shelf_id = ls.id
  INNER JOIN laboratories l ON s.laboratory_id = l.id
  WHERE s.client_id = p_client_id
    AND ls.allow_client_view = true
    AND (p_laboratory_id IS NULL OR s.laboratory_id = p_laboratory_id)
  ORDER BY s.intake_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_client_samples_in_storage IS 'Get all samples for a client that are stored in client-visible shelves';

-- ========================================
-- 9. ROW LEVEL SECURITY POLICIES
-- ========================================

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS lab_shelves_lab_personnel_select ON lab_shelves;
DROP POLICY IF EXISTS lab_shelves_global_admin_all ON lab_shelves;
DROP POLICY IF EXISTS lab_shelves_client_view ON lab_shelves;

-- Enable RLS on lab_shelves if not already enabled
ALTER TABLE lab_shelves ENABLE ROW LEVEL SECURITY;

-- Policy: Lab personnel can see all shelves in their lab
CREATE POLICY lab_shelves_lab_personnel_select ON lab_shelves
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.laboratory_id = lab_shelves.laboratory_id
    )
  );

-- Policy: Global admins can see and manage all shelves
CREATE POLICY lab_shelves_global_admin_all ON lab_shelves
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.is_global_admin = true OR p.qc_role = 'global_quality_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.is_global_admin = true OR p.qc_role = 'global_quality_admin')
    )
  );

-- Policy: Clients can see their assigned shelves if allow_client_view is true
CREATE POLICY lab_shelves_client_view ON lab_shelves
  FOR SELECT
  TO authenticated
  USING (
    allow_client_view = true
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.client_id IS NOT NULL
        AND p.client_id = lab_shelves.client_id
    )
  );

-- ========================================
-- 10. DATA MIGRATION FOR EXISTING POSITIONS
-- ========================================

-- Update existing position codes to use new format
-- This will update positions like 'S1C3R2' to 'A-C3' format
-- Only if positions already exist and follow old format

DO $$
DECLARE
  shelf_rec RECORD;
  pos_rec RECORD;
  new_code TEXT;
BEGIN
  -- Loop through each shelf
  FOR shelf_rec IN
    SELECT id, shelf_letter, laboratory_id
    FROM lab_shelves
    WHERE shelf_letter IS NOT NULL
  LOOP
    -- Loop through each position for this shelf
    FOR pos_rec IN
      SELECT id, row_number, column_number
      FROM storage_positions
      WHERE shelf_id = shelf_rec.id
    LOOP
      -- Generate new position code
      new_code := generate_position_code(
        shelf_rec.shelf_letter,
        pos_rec.row_number,
        pos_rec.column_number
      );

      -- Update position code
      UPDATE storage_positions
      SET position_code = new_code
      WHERE id = pos_rec.id;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Position codes updated to new format';
END $$;

-- ========================================
-- MIGRATION COMPLETE
-- ========================================

SELECT 'Storage enhancements migration completed successfully' as status;

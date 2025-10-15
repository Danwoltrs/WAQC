-- Migration 034: Improve Template Sharing Model
-- Date: 2025-10-15
-- Purpose: Allow global admins to assign templates to specific labs

-- ========================================
-- ADD ASSIGNED LABORATORIES ARRAY
-- ========================================

-- Add array field for multi-lab assignment
ALTER TABLE quality_templates
ADD COLUMN IF NOT EXISTS assigned_laboratories UUID[] DEFAULT '{}';

COMMENT ON COLUMN quality_templates.assigned_laboratories IS 'Array of laboratory IDs that have access to this template. Empty array means no lab assignment (private or global).';

-- Create index for array lookups
CREATE INDEX IF NOT EXISTS idx_quality_templates_assigned_labs ON quality_templates USING GIN (assigned_laboratories);

-- ========================================
-- UPDATE EXISTING DATA
-- ========================================

-- Migrate existing lab-specific templates to use the array
UPDATE quality_templates
SET assigned_laboratories = ARRAY[laboratory_id]
WHERE laboratory_id IS NOT NULL
  AND is_global = false
  AND assigned_laboratories = '{}';

-- ========================================
-- DROP OLD RLS POLICIES
-- ========================================

DROP POLICY IF EXISTS "Anyone can view global templates" ON quality_templates;
DROP POLICY IF EXISTS "Lab users can view lab templates" ON quality_templates;
DROP POLICY IF EXISTS "Users can view their own templates" ON quality_templates;

-- ========================================
-- CREATE NEW RLS POLICIES
-- ========================================

-- Policy 1: Global templates visible to all authenticated users
CREATE POLICY "Global templates visible to all" ON quality_templates
    FOR SELECT USING (
        is_global = true
    );

-- Policy 2: Lab-assigned templates visible to users in those labs
CREATE POLICY "Lab-assigned templates visible to lab members" ON quality_templates
    FOR SELECT USING (
        is_global = false
        AND assigned_laboratories && (
            SELECT ARRAY_AGG(laboratory_id)
            FROM profiles
            WHERE id = auth.uid()
              AND laboratory_id IS NOT NULL
        )
    );

-- Policy 3: Private templates visible only to creator
CREATE POLICY "Private templates visible to creator" ON quality_templates
    FOR SELECT USING (
        is_global = false
        AND (assigned_laboratories IS NULL OR assigned_laboratories = '{}')
        AND created_by = auth.uid()
    );

-- Policy 4: Global admins can see all templates
CREATE POLICY "Global admins can view all templates" ON quality_templates
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND qc_role IN ('global_admin', 'global_quality_admin')
        )
    );

-- Policy 5: Users can insert templates for their own lab
CREATE POLICY "Users can create lab templates" ON quality_templates
    FOR INSERT WITH CHECK (
        -- Lab users can create for their lab
        (
            laboratory_id IN (
                SELECT laboratory_id FROM profiles WHERE id = auth.uid()
            )
            AND is_global = false
        )
        OR
        -- Global admins can create for any lab or global
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND qc_role IN ('global_admin', 'global_quality_admin')
        )
    );

-- Policy 6: Users can update their own templates or global admins can update any
CREATE POLICY "Users can update own templates or admins all" ON quality_templates
    FOR UPDATE USING (
        created_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND qc_role IN ('global_admin', 'global_quality_admin')
        )
    );

-- Policy 7: Only creator or global admins can delete
CREATE POLICY "Users can delete own templates or admins all" ON quality_templates
    FOR DELETE USING (
        created_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND qc_role IN ('global_admin', 'global_quality_admin')
        )
    );

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
    -- Check that column was added
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quality_templates'
        AND column_name = 'assigned_laboratories'
    ) THEN
        RAISE EXCEPTION 'Migration 034 verification failed: assigned_laboratories column not created';
    END IF;

    RAISE NOTICE 'Migration 034 completed successfully: Improved template sharing model';
END;
$$;

SELECT 'Migration 034: Improve template sharing model completed' as status;

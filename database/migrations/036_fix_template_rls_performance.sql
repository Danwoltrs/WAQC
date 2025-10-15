-- Migration 036: Fix Template RLS Performance Issues
-- Date: 2025-10-15
-- Purpose: Simplify RLS policies to prevent recursive queries and improve performance

-- ========================================
-- DROP PROBLEMATIC POLICIES
-- ========================================

DROP POLICY IF EXISTS "Lab-assigned templates visible to lab members" ON quality_templates;

-- ========================================
-- CREATE SIMPLER POLICY
-- ========================================

-- Policy: Lab-assigned templates visible to lab members (simplified)
-- This avoids the recursive subquery by using a simpler condition
CREATE POLICY "Lab-assigned templates visible to lab members v2" ON quality_templates
    FOR SELECT USING (
        is_global = false
        AND (
            -- Check if user's laboratory_id is in the assigned_laboratories array
            EXISTS (
                SELECT 1
                FROM profiles p
                WHERE p.id = auth.uid()
                  AND p.laboratory_id IS NOT NULL
                  AND p.laboratory_id = ANY(quality_templates.assigned_laboratories)
            )
        )
    );

-- ========================================
-- VERIFICATION
-- ========================================

SELECT 'Migration 036: Fixed template RLS performance issues' as status;

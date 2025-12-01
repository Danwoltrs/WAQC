-- Migration 123: Cupping Access Control and Master Cupper Support
-- Date: 2025-11-28
-- Purpose: Add master cupper designation, validation audit trail, and access control infrastructure

-- Step 1: Add is_master_cupper field to profiles
-- Master cuppers can:
-- 1. Validate scores even if they didn't cup
-- 2. Finalize cupping sessions
-- 3. Override scores if needed
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_master_cupper BOOLEAN DEFAULT false;

COMMENT ON COLUMN profiles.is_master_cupper IS 'Designates if user is a master cupper who can validate and finalize cupping sessions';

CREATE INDEX IF NOT EXISTS idx_profiles_is_master_cupper ON profiles(is_master_cupper) WHERE is_master_cupper = true;

-- Step 2: Add validation tracking to cupping_sessions
-- This tracks who validated the scores (separate from who finalized)
ALTER TABLE cupping_sessions
ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS validation_notes TEXT,
ADD COLUMN IF NOT EXISTS min_cuppers_required INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS allow_single_cupper BOOLEAN DEFAULT false;

COMMENT ON COLUMN cupping_sessions.validated_by IS 'Profile ID of the person who validated the scores';
COMMENT ON COLUMN cupping_sessions.validated_at IS 'Timestamp when scores were validated';
COMMENT ON COLUMN cupping_sessions.validation_notes IS 'Notes from the validator explaining any adjustments';
COMMENT ON COLUMN cupping_sessions.min_cuppers_required IS 'Minimum number of cuppers required to complete before validation (default: 2)';
COMMENT ON COLUMN cupping_sessions.allow_single_cupper IS 'If true, allows a single cupper to validate their own scores (for solo labs)';

-- Step 3: Add cupping audit log table for comprehensive tracking
CREATE TABLE IF NOT EXISTS cupping_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES cupping_sessions(id) ON DELETE CASCADE,
    sample_id UUID REFERENCES samples(id),
    action TEXT NOT NULL, -- 'score_submitted', 'score_edited', 'validated', 'finalized', 'discrepancy_resolved'
    performed_by UUID REFERENCES profiles(id),
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    details JSONB, -- Action-specific details (old values, new values, reason, etc.)
    laboratory_id UUID REFERENCES laboratories(id)
);

COMMENT ON TABLE cupping_audit_log IS 'Comprehensive audit trail for all cupping actions - visible to lab admins and global admins';

CREATE INDEX IF NOT EXISTS idx_cupping_audit_session ON cupping_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_cupping_audit_sample ON cupping_audit_log(sample_id);
CREATE INDEX IF NOT EXISTS idx_cupping_audit_performer ON cupping_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_cupping_audit_lab ON cupping_audit_log(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_cupping_audit_time ON cupping_audit_log(performed_at DESC);

-- Step 4: Add RLS policies for cupping_audit_log
ALTER TABLE cupping_audit_log ENABLE ROW LEVEL SECURITY;

-- Lab admins can see audit logs for their lab
CREATE POLICY "Lab admins can view their lab audit logs"
ON cupping_audit_log FOR SELECT
USING (
    laboratory_id IN (
        SELECT laboratory_id FROM profiles WHERE id = auth.uid() AND qc_role IN ('lab_admin', 'lab_manager')
    )
);

-- Global admins can see all audit logs
CREATE POLICY "Global admins can view all audit logs"
ON cupping_audit_log FOR SELECT
USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_global_admin = true)
);

-- Anyone can insert audit logs (they're created by the system)
CREATE POLICY "System can create audit logs"
ON cupping_audit_log FOR INSERT
WITH CHECK (true);

-- Step 5: Create helper function to check if user can validate a session
CREATE OR REPLACE FUNCTION can_validate_cupping_session(
    p_session_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_record RECORD;
    v_user_is_master_cupper BOOLEAN;
    v_user_is_assigned BOOLEAN;
    v_has_master_cupper_assigned BOOLEAN;
    v_all_cuppers_completed BOOLEAN;
    v_completed_cupper_count INTEGER;
    v_assigned_cupper_count INTEGER;
    v_is_single_cupper_session BOOLEAN;
BEGIN
    -- Get session details
    SELECT * INTO v_session_record
    FROM cupping_sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Check if user is a master cupper
    SELECT COALESCE(is_master_cupper, false) INTO v_user_is_master_cupper
    FROM profiles
    WHERE id = p_user_id;

    -- Check if user is assigned to this session
    v_user_is_assigned := v_session_record.cupper_ids ? p_user_id::text;

    -- Count assigned cuppers to detect single-cupper sessions
    SELECT jsonb_array_length(COALESCE(v_session_record.cupper_ids, '[]'::jsonb)) INTO v_assigned_cupper_count;
    v_is_single_cupper_session := v_assigned_cupper_count = 1;

    -- Check if any master cupper is assigned to the session
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id::text = ANY(
            SELECT jsonb_array_elements_text(v_session_record.cupper_ids)
        )
        AND is_master_cupper = true
    ) INTO v_has_master_cupper_assigned;

    -- Count completed cuppers (those who have submitted scores)
    SELECT COUNT(DISTINCT cupper_id) INTO v_completed_cupper_count
    FROM cupping_scores
    WHERE session_id = p_session_id;

    -- Check if minimum cuppers have completed
    -- Key rule: If only 1 cupper is assigned, automatically allow single cupper validation
    -- This handles emergency/holiday situations where a single cupper needs to complete the workflow
    IF v_session_record.allow_single_cupper OR v_is_single_cupper_session THEN
        v_all_cuppers_completed := v_completed_cupper_count >= 1;
    ELSE
        v_all_cuppers_completed := v_completed_cupper_count >= COALESCE(v_session_record.min_cuppers_required, 2);
    END IF;

    -- Validation rules:
    -- 1. At least min_cuppers_required (or 1 if allow_single_cupper) must have completed
    -- 2. If master cupper is assigned: only master cupper can validate
    -- 3. If no master cupper assigned: any assigned cupper who completed can validate
    -- 4. Global admins can always validate

    -- Check for global admin
    IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND is_global_admin = true) THEN
        RETURN v_all_cuppers_completed;
    END IF;

    IF NOT v_all_cuppers_completed THEN
        RETURN false;
    END IF;

    IF v_has_master_cupper_assigned THEN
        -- Only master cuppers can validate when one is assigned
        RETURN v_user_is_master_cupper AND (v_user_is_assigned OR EXISTS (
            SELECT 1 FROM profiles WHERE id = p_user_id AND is_master_cupper = true AND laboratory_id = v_session_record.laboratory_id
        ));
    ELSE
        -- Any assigned cupper who has completed their scores can validate
        RETURN v_user_is_assigned AND EXISTS (
            SELECT 1 FROM cupping_scores WHERE session_id = p_session_id AND cupper_id = p_user_id
        );
    END IF;
END;
$$;

COMMENT ON FUNCTION can_validate_cupping_session IS 'Check if a user has permission to validate a cupping session';

-- Step 6: Create function to log cupping audit events
CREATE OR REPLACE FUNCTION log_cupping_action(
    p_session_id UUID,
    p_sample_id UUID,
    p_action TEXT,
    p_performed_by UUID,
    p_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lab_id UUID;
    v_audit_id UUID;
BEGIN
    -- Get laboratory_id from session
    SELECT laboratory_id INTO v_lab_id
    FROM cupping_sessions
    WHERE id = p_session_id;

    -- Insert audit log entry
    INSERT INTO cupping_audit_log (
        session_id,
        sample_id,
        action,
        performed_by,
        details,
        laboratory_id
    ) VALUES (
        p_session_id,
        p_sample_id,
        p_action,
        p_performed_by,
        p_details,
        v_lab_id
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$;

COMMENT ON FUNCTION log_cupping_action IS 'Log a cupping-related action to the audit trail';

-- Step 7: Create function to get samples assigned to a cupper
CREATE OR REPLACE FUNCTION get_cupper_assigned_samples(p_cupper_id UUID)
RETURNS TABLE (
    sample_id UUID,
    session_id UUID,
    session_status TEXT,
    has_submitted_score BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id as sample_id,
        cs.id as session_id,
        cs.status::TEXT as session_status,
        EXISTS (
            SELECT 1 FROM cupping_scores csc
            WHERE csc.session_id = cs.id
            AND csc.sample_id = s.id
            AND csc.cupper_id = p_cupper_id
        ) as has_submitted_score
    FROM cupping_sessions cs
    CROSS JOIN LATERAL unnest(cs.sample_ids) AS sample_id_unnest(sid)
    JOIN samples s ON s.id = sample_id_unnest.sid
    WHERE cs.cupper_ids ? p_cupper_id::text
    AND cs.status IN ('active', 'review')
    AND s.workflow_stage = 'analysis';
END;
$$;

COMMENT ON FUNCTION get_cupper_assigned_samples IS 'Get all samples assigned to a cupper through cupping sessions';

-- Verification
SELECT
    'Migration 123 completed - Cupping access control ready' as status,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'profiles' AND column_name = 'is_master_cupper') as master_cupper_field,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'cupping_sessions' AND column_name = 'validated_by') as validation_tracking,
    (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'cupping_audit_log') as audit_table_created;

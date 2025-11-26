-- Migration 111: Cupping Session Analytics and Reporting Schema
-- Date: 2025-11-26
-- Purpose: Add session state management, analytics views, and reporting infrastructure

-- Step 1: Add session status enum and update cupping_sessions table
DO $$ BEGIN
    CREATE TYPE cupping_session_status AS ENUM ('in_progress', 'review', 'finalized', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add session management fields to cupping_sessions
ALTER TABLE cupping_sessions
ADD COLUMN IF NOT EXISTS status cupping_session_status DEFAULT 'in_progress',
ADD COLUMN IF NOT EXISTS cupper_completion JSONB DEFAULT '{}', -- {cupper_id: {completed_at: timestamp, samples_completed: [sample_ids]}}
ADD COLUMN IF NOT EXISTS discrepancy_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS discrepancy_notes TEXT,
ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS auto_averaged BOOLEAN DEFAULT false, -- True if scores were auto-averaged
ADD COLUMN IF NOT EXISTS review_required BOOLEAN DEFAULT false; -- True if manual review needed

-- Step 2: Add laboratory_id and calibration session fields
ALTER TABLE cupping_sessions
ADD COLUMN IF NOT EXISTS laboratory_id UUID REFERENCES laboratories(id), -- Lab where session is happening
ADD COLUMN IF NOT EXISTS session_date DATE DEFAULT CURRENT_DATE, -- Date of the cupping session
ADD COLUMN IF NOT EXISTS cupper_ids JSONB DEFAULT '[]', -- Array of cupper IDs assigned to this session
ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'regular', -- 'regular', 'calibration', 'type_sample'
ADD COLUMN IF NOT EXISTS cup_count INTEGER, -- For calibration: number of cups per sample
ADD COLUMN IF NOT EXISTS cup_pattern TEXT; -- For calibration: pattern like 'triangle', 'square', '3-3-2-2'

COMMENT ON COLUMN cupping_sessions.status IS 'Session workflow state: in_progress → review → finalized';
COMMENT ON COLUMN cupping_sessions.laboratory_id IS 'Laboratory where the cupping session is taking place';
COMMENT ON COLUMN cupping_sessions.session_date IS 'Date of the cupping session';
COMMENT ON COLUMN cupping_sessions.cupper_ids IS 'Array of cupper profile IDs assigned to this session';
COMMENT ON COLUMN cupping_sessions.cupper_completion IS 'Tracks which cuppers have finished and when: {cupper_id: {completed_at, samples_completed}}';
COMMENT ON COLUMN cupping_sessions.discrepancy_detected IS 'True if cupper scores exceed quality template threshold';
COMMENT ON COLUMN cupping_sessions.auto_averaged IS 'True if scores were automatically averaged (within threshold)';
COMMENT ON COLUMN cupping_sessions.session_type IS 'Type of session: regular, calibration, type_sample';
COMMENT ON COLUMN cupping_sessions.cup_count IS 'Number of cups per sample (for calibration sessions)';
COMMENT ON COLUMN cupping_sessions.cup_pattern IS 'Cup arrangement pattern for calibration (e.g., triangle, square, 3-3-2-2 for 10 cups)';

-- Step 3: Add per-cup defect tracking to cupping_scores
ALTER TABLE cupping_scores
ADD COLUMN IF NOT EXISTS cup_defects JSONB; -- For calibration: {cup_1: [{defect, intensity}], cup_2: [...]}

COMMENT ON COLUMN cupping_scores.cup_defects IS 'Per-cup defect tracking for calibration sessions: {cup_1: [{defect, intensity}], cup_2: [...]}';

-- Step 4: Add discrepancy threshold to client_qualities
ALTER TABLE client_qualities
ADD COLUMN IF NOT EXISTS discrepancy_threshold NUMERIC(4,2) DEFAULT 0.50; -- Default: 0.50 points difference allowed

COMMENT ON COLUMN client_qualities.discrepancy_threshold IS 'Maximum allowed score difference between cuppers before flagging for manual review (e.g., 0.50 = half a point)';

-- Step 5: Add client branding fields
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS report_branding_preference TEXT DEFAULT 'co_branded'; -- 'co_branded', 'wolthers_only', 'white_label'

COMMENT ON COLUMN clients.logo_url IS 'URL to client logo for co-branded reports';
COMMENT ON COLUMN clients.report_branding_preference IS 'Report branding: co_branded (Wolthers + Client), wolthers_only, white_label';

-- Step 6: Create analytics database views

-- View: Cupper performance statistics
CREATE OR REPLACE VIEW cupper_performance_stats AS
SELECT
    cs.cupper_id,
    p.full_name as cupper_name,
    cs.session_id,
    cupp_sess.laboratory_id,
    cupp_sess.session_date,
    COUNT(DISTINCT cs.sample_id) as samples_scored,
    AVG((cs.scores->>'total_score')::numeric) as avg_total_score,
    STDDEV((cs.scores->>'total_score')::numeric) as score_stddev,
    COUNT(*) FILTER (WHERE cs.defects IS NOT NULL AND jsonb_array_length(cs.defects) > 0) as samples_with_defects,
    cupp_sess.status as session_status
FROM cupping_scores cs
JOIN cupping_sessions cupp_sess ON cs.session_id = cupp_sess.id
JOIN profiles p ON cs.cupper_id = p.id
WHERE cupp_sess.status = 'finalized' -- Only include finalized sessions
GROUP BY cs.cupper_id, p.full_name, cs.session_id, cupp_sess.laboratory_id, cupp_sess.session_date, cupp_sess.status;

COMMENT ON VIEW cupper_performance_stats IS 'Aggregated cupper performance metrics for analytics dashboard';

-- View: Session summary statistics
CREATE OR REPLACE VIEW session_summary_stats AS
SELECT
    sess.id as session_id,
    sess.session_date,
    sess.laboratory_id,
    l.name as lab_name,
    sess.status,
    sess.session_type,
    sess.discrepancy_detected,
    sess.auto_averaged,
    jsonb_array_length(sess.sample_ids) as sample_count,
    (SELECT COUNT(DISTINCT cupper_id) FROM cupping_scores WHERE session_id = sess.id) as cupper_count,
    (SELECT AVG((scores->>'total_score')::numeric) FROM cupping_scores WHERE session_id = sess.id) as avg_session_score,
    (SELECT STDDEV((scores->>'total_score')::numeric) FROM cupping_scores WHERE session_id = sess.id) as session_score_stddev,
    sess.finalized_at,
    sess.created_at
FROM cupping_sessions sess
JOIN laboratories l ON sess.laboratory_id = l.id;

COMMENT ON VIEW session_summary_stats IS 'Summary statistics for each cupping session';

-- View: Sample cupping history
CREATE OR REPLACE VIEW sample_cupping_history AS
SELECT
    s.id as sample_id,
    s.tracking_number,
    s.origin,
    s.client_id,
    c.fantasy_name as client_name,
    cs.session_id,
    sess.session_date,
    sess.laboratory_id,
    cs.cupper_id,
    p.full_name as cupper_name,
    cs.scores,
    cs.defects,
    cs.notes,
    cs.created_at as scored_at
FROM samples s
JOIN cupping_scores cs ON s.id = cs.sample_id
JOIN cupping_sessions sess ON cs.session_id = sess.id
JOIN profiles p ON cs.cupper_id = p.id
LEFT JOIN clients c ON s.client_id = c.id
WHERE sess.status = 'finalized';

COMMENT ON VIEW sample_cupping_history IS 'Complete cupping history for each sample with cupper details';

-- View: Origin performance analysis
CREATE OR REPLACE VIEW origin_performance_analysis AS
SELECT
    s.origin,
    s.laboratory_id,
    l.name as lab_name,
    COUNT(DISTINCT s.id) as sample_count,
    AVG((cs.scores->>'total_score')::numeric) as avg_score,
    STDDEV((cs.scores->>'total_score')::numeric) as score_stddev,
    MIN((cs.scores->>'total_score')::numeric) as min_score,
    MAX((cs.scores->>'total_score')::numeric) as max_score,
    COUNT(*) FILTER (WHERE cs.defects IS NOT NULL AND jsonb_array_length(cs.defects) > 0) as samples_with_defects,
    COUNT(*) FILTER (WHERE (cs.scores->>'total_score')::numeric >= 80) as high_quality_samples
FROM samples s
JOIN cupping_scores cs ON s.id = cs.sample_id
JOIN cupping_sessions sess ON cs.session_id = sess.id
JOIN laboratories l ON s.laboratory_id = l.id
WHERE sess.status = 'finalized'
  AND s.origin IS NOT NULL
GROUP BY s.origin, s.laboratory_id, l.name;

COMMENT ON VIEW origin_performance_analysis IS 'Aggregated performance metrics by origin and laboratory';

-- Step 7: Create indexes for analytics performance
CREATE INDEX IF NOT EXISTS idx_cupping_sessions_status ON cupping_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cupping_sessions_session_date ON cupping_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_cupping_sessions_laboratory ON cupping_sessions(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_cupping_scores_session ON cupping_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_cupping_scores_cupper ON cupping_scores(cupper_id);
CREATE INDEX IF NOT EXISTS idx_cupping_scores_sample ON cupping_scores(sample_id);

-- Step 8: Create function to check session completion
CREATE OR REPLACE FUNCTION check_session_completion(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_expected_cuppers INT;
    v_completed_cuppers INT;
BEGIN
    -- Get expected number of cuppers from session
    SELECT jsonb_array_length(cupper_ids) INTO v_expected_cuppers
    FROM cupping_sessions
    WHERE id = p_session_id;

    -- Count cuppers who have completed
    SELECT COUNT(DISTINCT cupper_id) INTO v_completed_cuppers
    FROM cupping_scores
    WHERE session_id = p_session_id;

    RETURN v_completed_cuppers >= v_expected_cuppers;
END;
$$;

COMMENT ON FUNCTION check_session_completion IS 'Check if all assigned cuppers have completed their scores for a session';

-- Step 9: Create function to calculate score discrepancy
CREATE OR REPLACE FUNCTION calculate_score_discrepancy(p_session_id UUID, p_sample_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_score NUMERIC;
    v_min_score NUMERIC;
    v_discrepancy NUMERIC;
BEGIN
    -- Get max and min total scores for this sample in this session
    SELECT
        MAX((scores->>'total_score')::numeric),
        MIN((scores->>'total_score')::numeric)
    INTO v_max_score, v_min_score
    FROM cupping_scores
    WHERE session_id = p_session_id
      AND sample_id = p_sample_id;

    v_discrepancy := COALESCE(v_max_score - v_min_score, 0);

    RETURN v_discrepancy;
END;
$$;

COMMENT ON FUNCTION calculate_score_discrepancy IS 'Calculate the maximum score difference between cuppers for a specific sample';

-- Verification query
SELECT
    'Migration 111 completed - Cupping analytics schema ready' as status,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'cupping_sessions' AND column_name = 'status') as session_status_exists,
    (SELECT COUNT(*) FROM information_schema.views WHERE table_name = 'cupper_performance_stats') as analytics_views_created,
    (SELECT COUNT(*) FROM pg_proc WHERE proname IN ('check_session_completion', 'calculate_score_discrepancy')) as helper_functions_created;

-- Create user invitations table for managing email invitations
-- This table tracks invitation status and tokens for user onboarding

CREATE TABLE IF NOT EXISTS user_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    qc_role TEXT NOT NULL,
    laboratory_id UUID REFERENCES laboratories(id),
    is_cupper BOOLEAN DEFAULT false,
    invitation_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    invited_by UUID REFERENCES profiles(id),
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE user_invitations IS 'Stores user invitation data for account creation workflow';
COMMENT ON COLUMN user_invitations.email IS 'Email address of the invited user';
COMMENT ON COLUMN user_invitations.invitation_token IS 'Secure token for invitation link verification';
COMMENT ON COLUMN user_invitations.expires_at IS 'Expiration timestamp for invitation (typically 7 days)';
COMMENT ON COLUMN user_invitations.status IS 'Invitation status: pending, accepted, expired, or cancelled';
COMMENT ON COLUMN user_invitations.invited_by IS 'User who sent the invitation (for audit trail)';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON user_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON user_invitations(status);
CREATE INDEX IF NOT EXISTS idx_user_invitations_expires_at ON user_invitations(expires_at);

-- Enable RLS
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Only global admins and lab admins can view invitations
CREATE POLICY "Admins can view invitations" ON user_invitations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.qc_role IN ('global_admin', 'lab_quality_manager')
        )
    );

-- Only global admins and lab admins can create invitations
CREATE POLICY "Admins can create invitations" ON user_invitations
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.qc_role IN ('global_admin', 'lab_quality_manager')
        )
    );

-- Only global admins can update invitations
CREATE POLICY "Global admins can update invitations" ON user_invitations
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.qc_role = 'global_admin'
        )
    );

-- Function to automatically mark expired invitations
CREATE OR REPLACE FUNCTION mark_expired_invitations()
RETURNS void AS $$
BEGIN
    UPDATE user_invitations
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Create a scheduled job to run this function periodically
-- This would need to be set up in Supabase dashboard using pg_cron or similar

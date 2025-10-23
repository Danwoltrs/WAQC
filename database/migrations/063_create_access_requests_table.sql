-- Create access_requests table for managing user access requests
CREATE TABLE IF NOT EXISTS access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_role TEXT,
    requested_laboratory_id UUID REFERENCES laboratories(id) ON DELETE SET NULL,
    approved_role TEXT,
    approved_laboratory_id UUID REFERENCES laboratories(id) ON DELETE SET NULL,
    request_message TEXT,
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_access_requests_user_id ON access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_created_at ON access_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_requests_processed_by ON access_requests(processed_by);

-- Enable RLS
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Global admins can see all requests
CREATE POLICY "Global admins can view all access requests"
    ON access_requests
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_global_admin = true
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.email = 'anderson@wolthers.com'
        )
    );

-- Policy: Global admins can insert requests (for testing)
CREATE POLICY "Global admins can insert access requests"
    ON access_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_global_admin = true
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.email = 'anderson@wolthers.com'
        )
    );

-- Policy: Global admins can update requests
CREATE POLICY "Global admins can update access requests"
    ON access_requests
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_global_admin = true
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.email = 'anderson@wolthers.com'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_global_admin = true
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.email = 'anderson@wolthers.com'
        )
    );

-- Policy: Users can view their own requests
CREATE POLICY "Users can view their own access requests"
    ON access_requests
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Policy: Unauthenticated users can create access requests (for new registrations)
CREATE POLICY "Anyone can create access requests"
    ON access_requests
    FOR INSERT
    TO public
    WITH CHECK (true);

-- Add comment to the table
COMMENT ON TABLE access_requests IS 'Stores user access requests for the QC system';

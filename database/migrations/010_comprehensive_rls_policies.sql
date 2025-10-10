-- Comprehensive RLS Policies for Multi-Stakeholder Access
-- This migration implements role-based access control for:
-- - Lab personnel (Santos HQ sees all, regional labs see only their data)
-- - Suppliers/Exporters (see only their samples)
-- - Importers (see only their samples)
-- - Roasters/Buyers (see only their samples)
-- - Clients (see only their samples)

-- Add company_name to profiles for matching with sample supplier/roaster/importer fields
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS company_name TEXT;

COMMENT ON COLUMN profiles.company_name IS 'Company name for suppliers, importers, roasters - used to match samples';

-- Create helper function to get user's company name
CREATE OR REPLACE FUNCTION get_user_company_name(user_id UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN (SELECT company_name FROM profiles WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if user is a supplier
CREATE OR REPLACE FUNCTION is_supplier(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT qc_role = 'supplier' FROM profiles WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if user is a buyer/roaster
CREATE OR REPLACE FUNCTION is_buyer(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT qc_role = 'buyer' FROM profiles WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if user is a client
CREATE OR REPLACE FUNCTION is_client(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT qc_role = 'client' FROM profiles WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to get user's client_id
CREATE OR REPLACE FUNCTION get_user_client_id(user_id UUID)
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT client_id FROM profiles WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing sample policies to recreate them with comprehensive access control
DROP POLICY IF EXISTS "QC users can view lab samples" ON samples;
DROP POLICY IF EXISTS "QC personnel can insert samples" ON samples;
DROP POLICY IF EXISTS "QC personnel can update lab samples" ON samples;

-- Comprehensive sample access policy
CREATE POLICY "Users can view samples based on role" ON samples
    FOR SELECT USING (
        -- Santos HQ and global admins see everything
        has_global_qc_access(auth.uid()) OR
        -- Lab personnel see their lab's samples
        (laboratory_id = get_user_qc_laboratory(auth.uid())) OR
        -- Suppliers see samples where they are the supplier
        (is_supplier(auth.uid()) AND supplier = get_user_company_name(auth.uid())) OR
        -- Importers see samples where they are the importer
        (is_supplier(auth.uid()) AND importer = get_user_company_name(auth.uid())) OR
        -- Buyers/Roasters see samples where they are the roaster
        (is_buyer(auth.uid()) AND roaster = get_user_company_name(auth.uid())) OR
        -- Clients see their samples
        (is_client(auth.uid()) AND client_id = get_user_client_id(auth.uid()))
    );

-- Lab personnel can insert samples
CREATE POLICY "Lab personnel can insert samples" ON samples
    FOR INSERT WITH CHECK (
        laboratory_id = get_user_qc_laboratory(auth.uid()) AND
        get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Lab personnel can update samples
CREATE POLICY "Lab personnel can update samples" ON samples
    FOR UPDATE USING (
        (laboratory_id = get_user_qc_laboratory(auth.uid()) OR has_global_qc_access(auth.uid())) AND
        get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Drop and recreate quality assessments policy
DROP POLICY IF EXISTS "QC users can view assessments for lab samples" ON quality_assessments;

CREATE POLICY "Users can view quality assessments based on sample access" ON quality_assessments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM samples
            WHERE samples.id = sample_id AND (
                -- Santos HQ and global admins see everything
                has_global_qc_access(auth.uid()) OR
                -- Lab personnel see their lab's assessments
                samples.laboratory_id = get_user_qc_laboratory(auth.uid()) OR
                -- Suppliers see assessments for their samples
                (is_supplier(auth.uid()) AND samples.supplier = get_user_company_name(auth.uid())) OR
                -- Importers see assessments for their samples
                (is_supplier(auth.uid()) AND samples.importer = get_user_company_name(auth.uid())) OR
                -- Buyers/Roasters see assessments for their samples
                (is_buyer(auth.uid()) AND samples.roaster = get_user_company_name(auth.uid())) OR
                -- Clients see assessments for their samples
                (is_client(auth.uid()) AND samples.client_id = get_user_client_id(auth.uid()))
            )
        )
    );

-- Lab personnel can create quality assessments
CREATE POLICY "Lab personnel can create quality assessments" ON quality_assessments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM samples
            WHERE samples.id = sample_id AND
            samples.laboratory_id = get_user_qc_laboratory(auth.uid())
        ) AND
        get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Certificates access policy
CREATE POLICY "Users can view certificates based on sample access" ON certificates
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM samples
            WHERE samples.id = sample_id AND (
                -- Santos HQ and global admins see everything
                has_global_qc_access(auth.uid()) OR
                -- Lab personnel see their lab's certificates
                samples.laboratory_id = get_user_qc_laboratory(auth.uid()) OR
                -- Suppliers see certificates for their samples
                (is_supplier(auth.uid()) AND samples.supplier = get_user_company_name(auth.uid())) OR
                -- Importers see certificates for their samples
                (is_supplier(auth.uid()) AND samples.importer = get_user_company_name(auth.uid())) OR
                -- Buyers/Roasters see certificates for their samples
                (is_buyer(auth.uid()) AND samples.roaster = get_user_company_name(auth.uid())) OR
                -- Clients see certificates for their samples
                (is_client(auth.uid()) AND samples.client_id = get_user_client_id(auth.uid()))
            )
        )
    );

-- Add client_id to profiles for clients
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

COMMENT ON COLUMN profiles.client_id IS 'Link to clients table for client users';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_company_name ON profiles(company_name);
CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON profiles(client_id);

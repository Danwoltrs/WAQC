-- Wolthers Coffee QC System - Initial Database Schema
-- This file creates all the necessary tables and policies for the system

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'lab_personnel',
        'lab_finance_manager', 
        'lab_quality_manager',
        'santos_hq_finance',
        'global_finance_admin',
        'global_quality_admin',
        'global_admin',
        'client',
        'supplier',
        'buyer'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lab_type AS ENUM ('hq', 'regional', 'third_party');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sample_status AS ENUM ('received', 'in_progress', 'under_review', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE compliance_status AS ENUM ('pass', 'fail', 'pending');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE session_status AS ENUM ('setup', 'active', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE session_type AS ENUM ('digital', 'handwritten', 'q_grading');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE certificate_status AS ENUM ('draft', 'issued', 'revoked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create laboratories table
CREATE TABLE IF NOT EXISTS laboratories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    type lab_type NOT NULL DEFAULT 'regional',
    address TEXT NOT NULL,
    storage_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'lab_personnel',
    laboratory_id UUID REFERENCES laboratories(id),
    permissions TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create quality templates table (master recipes)
CREATE TABLE IF NOT EXISTS quality_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1,
    parameters JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES profiles(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT NOT NULL,
    address TEXT NOT NULL,
    default_quality_specs UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create client-specific quality configurations
CREATE TABLE IF NOT EXISTS client_qualities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    template_id UUID REFERENCES quality_templates(id),
    origin TEXT,
    custom_parameters JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create samples table
CREATE TABLE IF NOT EXISTS samples (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_number TEXT UNIQUE NOT NULL,
    client_id UUID REFERENCES clients(id),
    laboratory_id UUID REFERENCES laboratories(id),
    quality_spec_id UUID REFERENCES client_qualities(id),
    origin TEXT NOT NULL,
    supplier TEXT NOT NULL,
    status sample_status DEFAULT 'received',
    storage_position TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create quality assessments table
CREATE TABLE IF NOT EXISTS quality_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_id UUID REFERENCES samples(id) ON DELETE CASCADE,
    assessor_id UUID REFERENCES profiles(id),
    green_bean_data JSONB,
    roast_data JSONB,
    compliance_status compliance_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create cupping sessions table
CREATE TABLE IF NOT EXISTS cupping_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_ids UUID[] NOT NULL,
    participants UUID[] NOT NULL,
    status session_status DEFAULT 'setup',
    session_type session_type DEFAULT 'digital',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create cupping scores table
CREATE TABLE IF NOT EXISTS cupping_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES cupping_sessions(id) ON DELETE CASCADE,
    sample_id UUID REFERENCES samples(id) ON DELETE CASCADE,
    cupper_id UUID REFERENCES profiles(id),
    scores JSONB NOT NULL DEFAULT '{}',
    defects JSONB DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create certificates table
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sample_id UUID REFERENCES samples(id) ON DELETE CASCADE,
    certificate_number TEXT UNIQUE NOT NULL,
    pdf_url TEXT,
    issued_by UUID REFERENCES profiles(id),
    issued_to TEXT NOT NULL,
    status certificate_status DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_laboratory_id ON profiles(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_samples_tracking_number ON samples(tracking_number);
CREATE INDEX IF NOT EXISTS idx_samples_laboratory_id ON samples(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_samples_client_id ON samples(client_id);
CREATE INDEX IF NOT EXISTS idx_samples_status ON samples(status);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_sample_id ON quality_assessments(sample_id);
CREATE INDEX IF NOT EXISTS idx_cupping_sessions_created_by ON cupping_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_cupping_scores_session_id ON cupping_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_certificates_sample_id ON certificates(sample_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_laboratories_updated_at BEFORE UPDATE ON laboratories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quality_templates_updated_at BEFORE UPDATE ON quality_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_qualities_updated_at BEFORE UPDATE ON client_qualities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_samples_updated_at BEFORE UPDATE ON samples FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quality_assessments_updated_at BEFORE UPDATE ON quality_assessments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cupping_sessions_updated_at BEFORE UPDATE ON cupping_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cupping_scores_updated_at BEFORE UPDATE ON cupping_scores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_certificates_updated_at BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE laboratories ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_qualities ENABLE ROW LEVEL SECURITY;
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupping_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
BEGIN
    RETURN (SELECT role FROM profiles WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get user laboratory
CREATE OR REPLACE FUNCTION get_user_laboratory(user_id UUID)
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT laboratory_id FROM profiles WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user has global access
CREATE OR REPLACE FUNCTION has_global_access(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT role IN ('santos_hq_finance', 'global_finance_admin', 'global_quality_admin', 'global_admin') 
            FROM profiles WHERE id = user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Global admins can view all profiles" ON profiles
    FOR SELECT USING (has_global_access(auth.uid()));

CREATE POLICY "Lab managers can view lab profiles" ON profiles
    FOR SELECT USING (
        get_user_laboratory(auth.uid()) = laboratory_id AND
        get_user_role(auth.uid()) IN ('lab_finance_manager', 'lab_quality_manager')
    );

-- Laboratories policies
CREATE POLICY "Users can view their own laboratory" ON laboratories
    FOR SELECT USING (id = get_user_laboratory(auth.uid()));

CREATE POLICY "Global users can view all laboratories" ON laboratories
    FOR SELECT USING (has_global_access(auth.uid()));

-- Samples policies
CREATE POLICY "Users can view lab samples" ON samples
    FOR SELECT USING (
        laboratory_id = get_user_laboratory(auth.uid()) OR
        has_global_access(auth.uid())
    );

CREATE POLICY "Lab personnel can insert samples" ON samples
    FOR INSERT WITH CHECK (
        laboratory_id = get_user_laboratory(auth.uid()) AND
        get_user_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

CREATE POLICY "Lab personnel can update lab samples" ON samples
    FOR UPDATE USING (
        laboratory_id = get_user_laboratory(auth.uid()) AND
        get_user_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Quality assessments policies
CREATE POLICY "Users can view assessments for lab samples" ON quality_assessments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM samples 
            WHERE samples.id = sample_id AND (
                samples.laboratory_id = get_user_laboratory(auth.uid()) OR
                has_global_access(auth.uid())
            )
        )
    );

-- Client policies (for client dashboard access)
CREATE POLICY "Clients can view their own data" ON clients
    FOR SELECT USING (
        get_user_role(auth.uid()) = 'client' OR
        has_global_access(auth.uid()) OR
        get_user_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'lab_finance_manager')
    );

-- Insert default laboratories
INSERT INTO laboratories (id, name, location, type, address, storage_config) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Santos HQ', 'Santos, Brazil', 'hq', 'Santos Port, Brazil', '{"shelves": 20, "columns_per_shelf": 10, "rows_per_shelf": 8, "tins_per_position": 1, "naming_pattern": "SH-{shelf:02d}-{col:02d}-{row:02d}", "total_positions": 1600}'),
    ('550e8400-e29b-41d4-a716-446655440002', 'Buenaventura Lab', 'Buenaventura, Colombia', 'regional', 'Buenaventura Port, Colombia', '{"shelves": 12, "columns_per_shelf": 8, "rows_per_shelf": 6, "tins_per_position": 1, "naming_pattern": "BV-{shelf:02d}-{col:02d}-{row:02d}", "total_positions": 576}'),
    ('550e8400-e29b-41d4-a716-446655440003', 'Guatemala City Lab', 'Guatemala City, Guatemala', 'regional', 'Guatemala City, Guatemala', '{"shelves": 15, "columns_per_shelf": 8, "rows_per_shelf": 6, "tins_per_position": 1, "naming_pattern": "GT-{shelf:02d}-{col:02d}-{row:02d}", "total_positions": 720}'),
    ('550e8400-e29b-41d4-a716-446655440004', 'Peru Lab', 'Lima, Peru', 'third_party', 'Lima, Peru', '{"shelves": 10, "columns_per_shelf": 6, "rows_per_shelf": 5, "tins_per_position": 1, "naming_pattern": "PE-{shelf:02d}-{col:02d}-{row:02d}", "total_positions": 300}')
ON CONFLICT (id) DO NOTHING;

-- Insert default quality templates
INSERT INTO quality_templates (id, name, description, parameters, created_by) VALUES
    ('660e8400-e29b-41d4-a716-446655440001', 'Standard Brazilian', 'Standard quality parameters for Brazilian coffee', '{"screen_sizes": {"9": 0, "10": 0, "11": 0, "12": 0, "13": 5, "14": 10, "15": 20, "16": 30, "17": 25, "18": 8, "19": 2, "20": 0}, "moisture_max": 12.5, "defects": {"primary_max": 5, "secondary_max": 10}, "cupping_min": 80}', NULL),
    ('660e8400-e29b-41d4-a716-446655440002', 'Premium Colombian', 'Premium quality parameters for Colombian coffee', '{"screen_sizes": {"9": 0, "10": 0, "11": 0, "12": 0, "13": 2, "14": 5, "15": 15, "16": 35, "17": 30, "18": 10, "19": 3, "20": 0}, "moisture_max": 11.5, "defects": {"primary_max": 3, "secondary_max": 8}, "cupping_min": 83}', NULL),
    ('660e8400-e29b-41d4-a716-446655440003', 'Specialty Ethiopian', 'Specialty grade parameters for Ethiopian coffee', '{"screen_sizes": {"9": 0, "10": 0, "11": 0, "12": 0, "13": 3, "14": 8, "15": 20, "16": 35, "17": 25, "18": 7, "19": 2, "20": 0}, "moisture_max": 11.0, "defects": {"primary_max": 2, "secondary_max": 5}, "cupping_min": 85}', NULL)
ON CONFLICT (id) DO NOTHING;
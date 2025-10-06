# Database Setup for Wolthers Coffee QC System

This directory contains database migrations and setup files for the Wolthers Coffee Quality Control System.

## Setup Instructions

### 1. Supabase Project Setup

1. Create a new Supabase project at https://supabase.com
2. Get your project URL and anon key from the project settings
3. Update your `.env.local` file with the credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 2. Run the Initial Migration

Execute the SQL in `migrations/001_initial_schema.sql` in your Supabase SQL editor or using the Supabase CLI:

```sql
-- Copy and paste the contents of migrations/001_initial_schema.sql
-- into your Supabase SQL editor and run it
```

### 3. Configure Authentication

In your Supabase dashboard:

1. Go to Authentication > Settings
2. Enable Email authentication
3. Configure Microsoft OAuth if needed:
   - Go to Authentication > Providers
   - Enable Azure provider
   - Add your Azure AD credentials

### 4. Set up Row Level Security

The migration includes RLS policies that:
- Allow users to access only their laboratory's data
- Give Santos HQ special global access permissions
- Enable global admins to grant cross-lab permissions
- Protect sensitive financial data

### 5. Create Test Users

After running the migration, create test user profiles:

```sql
-- Example: Create a Santos HQ Finance user
INSERT INTO profiles (id, email, full_name, role, laboratory_id) VALUES 
('user-uuid-here', 'finance@wolthers.com', 'Finance Manager', 'santos_hq_finance', '550e8400-e29b-41d4-a716-446655440001');

-- Example: Create a lab personnel user
INSERT INTO profiles (id, email, full_name, role, laboratory_id) VALUES 
('user-uuid-here-2', 'lab@wolthers.com', 'Lab Technician', 'lab_personnel', '550e8400-e29b-41d4-a716-446655440002');
```

## Database Schema Overview

### Core Tables

- **laboratories**: Lab configurations and storage setups
- **profiles**: User profiles with roles and permissions
- **quality_templates**: Master quality specification templates
- **client_qualities**: Client-specific quality configurations
- **samples**: Coffee sample tracking and status
- **quality_assessments**: Green bean and roast analysis data
- **cupping_sessions**: Cupping session management
- **cupping_scores**: Individual cupper scores and notes
- **certificates**: Generated certificate records
- **clients**: Client information and settings

### User Roles

- `lab_personnel`: Standard lab access
- `lab_finance_manager`: Lab-specific finance access
- `lab_quality_manager`: Lab-specific quality management
- `santos_hq_finance`: Global finance access (automatic)
- `global_finance_admin`: Global finance access (assignable)
- `global_quality_admin`: Cross-lab quality oversight
- `global_admin`: Full system control
- `client`, `supplier`, `buyer`: External stakeholder access

### Laboratory Types

- `hq`: Santos HQ (special permissions)
- `regional`: Regional Wolthers labs
- `third_party`: External partner labs

### Storage Configuration

Each lab has a flexible storage configuration stored as JSONB:

```json
{
  "shelves": 20,
  "columns_per_shelf": 10,
  "rows_per_shelf": 8,
  "tins_per_position": 1,
  "naming_pattern": "SH-{shelf:02d}-{col:02d}-{row:02d}",
  "total_positions": 1600
}
```

### Quality Templates (Recipe System)

Quality templates act as "recipes" that can be:
- Cloned and customized for different clients
- Versioned for change tracking
- Applied to specific origins or micro-lots
- Inherited and modified by client-specific configurations

## Security Features

- **Row Level Security**: Users can only access data from their laboratory
- **Global Access Control**: Santos HQ and designated global users can access all labs
- **Permission-Based Access**: Finance data is restricted based on user roles
- **Audit Trail**: All changes are logged with timestamps and user tracking

## Maintenance

### Adding New Labs

```sql
INSERT INTO laboratories (name, location, type, address, storage_config) VALUES 
('New Lab', 'Location', 'regional', 'Full Address', 
'{"shelves": 10, "columns_per_shelf": 8, "rows_per_shelf": 6, "tins_per_position": 1, "naming_pattern": "NL-{shelf:02d}-{col:02d}-{row:02d}", "total_positions": 480}');
```

### Granting Global Permissions

```sql
-- Grant global finance access to a user
UPDATE profiles SET role = 'global_finance_admin' WHERE id = 'user-uuid';

-- Grant global quality admin access
UPDATE profiles SET role = 'global_quality_admin' WHERE id = 'user-uuid';
```

### Backup and Recovery

- Supabase provides automatic daily backups
- For additional safety, export data regularly using pg_dump
- Test restore procedures periodically

## Domain Configuration

The application is configured to run on `qc.wolthers.com`. Update the OAuth redirect URLs and environment variables accordingly when deploying to production.
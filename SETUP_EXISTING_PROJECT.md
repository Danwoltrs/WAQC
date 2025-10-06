# Setup Guide for Existing Supabase Project Integration

This guide explains how to integrate the Wolthers Coffee QC System with your existing `wolthers-travels` Supabase project.

## Prerequisites

✅ You already have:
- Existing Supabase project: `wolthers-travels` 
- 59 tables including `profiles` and `clients` tables
- Working authentication system
- Environment variables configured in `.env.local`

## Integration Steps

### 1. Run the Database Migration

Execute the modified migration in your Supabase SQL editor:

```sql
-- Copy and paste the entire contents of:
-- database/migrations/001_initial_schema.sql
```

This migration will:
- **Extend your existing `profiles` table** with QC-specific columns:
  - `qc_role` (user_role enum)
  - `laboratory_id` (UUID)
  - `qc_permissions` (text array)
  - `qc_enabled` (boolean)

- **Extend your existing `clients` table** with QC-specific columns:
  - `default_quality_specs` (UUID array)
  - `qc_enabled` (boolean)

- **Create new QC-specific tables**:
  - `laboratories` (only Santos HQ initially)
  - `quality_templates`
  - `client_qualities`
  - `samples`
  - `quality_assessments`
  - `cupping_sessions`
  - `cupping_scores`
  - `certificates`

### 2. Verify Tables Created

After running the migration, verify in your Supabase dashboard:

```sql
-- Check if QC columns were added to existing tables
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name LIKE 'qc_%';

SELECT column_name FROM information_schema.columns 
WHERE table_name = 'clients' AND column_name LIKE '%quality%';

-- Check if new QC tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('laboratories', 'samples', 'quality_templates');
```

### 3. Enable QC for Test Users

Create test users with QC access:

```sql
-- Example: Enable QC for an existing user and make them Global Admin
UPDATE profiles 
SET 
  qc_enabled = true,
  qc_role = 'global_admin',
  laboratory_id = '550e8400-e29b-41d4-a716-446655440001' -- Santos HQ
WHERE email = 'your-admin@wolthers.com';

-- Example: Create a lab personnel user
UPDATE profiles 
SET 
  qc_enabled = true,
  qc_role = 'lab_personnel',
  laboratory_id = '550e8400-e29b-41d4-a716-446655440001' -- Santos HQ
WHERE email = 'lab-tech@wolthers.com';

-- Example: Create Santos HQ Finance user (automatic global access)
UPDATE profiles 
SET 
  qc_enabled = true,
  qc_role = 'santos_hq_finance',
  laboratory_id = '550e8400-e29b-41d4-a716-446655440001' -- Santos HQ
WHERE email = 'finance@wolthers.com';
```

### 4. Enable QC for Test Clients

Enable QC functionality for specific clients:

```sql
-- Enable QC for existing clients
UPDATE clients 
SET qc_enabled = true 
WHERE company IN ('Test Client 1', 'Test Client 2');
```

### 5. Test the Application

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Access the QC system:**
   - Navigate to http://localhost:3001
   - Sign in with a QC-enabled user account
   - Verify the three-column layout appears
   - Check that navigation shows based on user role

### 6. User Access Flow

**For Existing Travel System Users:**
1. Users must be explicitly enabled for QC (`qc_enabled = true`)
2. Users need a QC role assigned (`qc_role`)
3. Lab users need a laboratory assigned (`laboratory_id`)
4. Only QC-enabled users can access the QC application

**User Experience:**
- Travel system users without QC access: Cannot access QC system
- Users with QC access: See QC interface based on their role
- Global admins: Can create new laboratories via admin wizard

## User Role Hierarchy

### Laboratory Roles
- **lab_personnel**: Basic sample management and assessments
- **lab_finance_manager**: Lab-specific finance access
- **lab_quality_manager**: Lab-specific quality management

### Global Roles  
- **santos_hq_finance**: Automatic global finance access
- **global_finance_admin**: Assignable global finance access  
- **global_quality_admin**: Cross-lab quality oversight + can create labs
- **global_admin**: Full system control + can create labs

### External Roles
- **client**: Sample tracking and certificates
- **supplier**: Performance dashboards
- **buyer**: Supply chain visibility

## Laboratory Management

### Current Setup
- **Santos HQ only** is created initially
- Other labs (Buenaventura, Guatemala, Peru) will be created later

### Creating New Labs
Only users with these roles can create laboratories:
- `global_admin`
- `global_quality_admin`

```sql
-- Grant lab creation permission
UPDATE profiles 
SET qc_role = 'global_quality_admin'
WHERE email = 'quality-director@wolthers.com';
```

## Finance Access Control

### Santos HQ Special Privileges
- Users with `santos_hq_finance` role automatically get global access
- Lab finance managers at Santos HQ (`laboratory_id` = Santos HQ ID) get elevated permissions

### Finance Data Access
- **Global finance users**: See all labs
- **Lab finance managers**: See only their lab (unless Santos HQ)
- **Regular users**: No finance access

## Integration Benefits

### Shared Data
- **Clients**: Same client records used for both travel and QC
- **Users**: Single user management across both systems
- **Authentication**: Unified login system

### Data Relationships
```sql
-- Example: Find all QC samples for a travel client
SELECT s.*, c.company 
FROM samples s
JOIN clients c ON s.client_id = c.id
WHERE c.company = 'Client Company Name';

-- Example: Find all users with both travel and QC access
SELECT * FROM profiles 
WHERE qc_enabled = true; -- QC access
-- (travel access determined by existing travel system logic)
```

## Troubleshooting

### Common Issues

1. **"QC not enabled for this user" message**
   ```sql
   -- Enable QC for the user
   UPDATE profiles SET qc_enabled = true, qc_role = 'lab_personnel' WHERE email = 'user@email.com';
   ```

2. **Permission denied errors**
   ```sql
   -- Check RLS policies are working
   SELECT * FROM laboratories; -- Should only show user's lab or all labs for global users
   ```

3. **Missing laboratory assignment**
   ```sql
   -- Assign user to Santos HQ
   UPDATE profiles 
   SET laboratory_id = '550e8400-e29b-41d4-a716-446655440001' 
   WHERE email = 'user@email.com';
   ```

## Next Steps

After successful integration:

1. **Create more test data** using the QC interface
2. **Add more users** with different roles for testing
3. **Start Phase 2 development**: Sample management forms
4. **Plan additional laboratories** (Buenaventura, Guatemala, Peru)

## Security Notes

- **Row Level Security**: Automatically enforced for all QC tables
- **Data Isolation**: Lab users can only see their lab's data
- **Global Access**: Only Santos HQ and designated global users can see all labs
- **Permission Inheritance**: Existing travel system permissions remain unchanged
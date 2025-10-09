# Database Migration Session Summary
**Date:** 2025-10-09
**Tasks Completed:** Phase 2 Database Schema Implementation

## Overview
Successfully applied all Phase 2 database migrations to the Supabase database, creating 27 new tables and extending 4 existing tables with Phase 2 functionality.

## Completed Tasks

### ✅ Task 1: Fixed Migration Syntax Errors
**Issue:** PostgreSQL reserved keywords causing syntax errors
- **Error 1:** `column` and `row` are reserved keywords in PostgreSQL
- **Fix:** Renamed to `column_number` and `row_number` in `storage_positions` table (line 166-167)
- **Files Updated:**
  - `database/migrations/003_phase2_schema.sql`
  - `src/app/api/samples/[id]/assign-storage/route.ts`

**Issue:** Invalid UNIQUE constraint with function call
- **Error 2:** `UNIQUE(client_id, COALESCE(quality_id::text, ''))` not allowed in PostgreSQL
- **Fix:** Replaced with two partial unique indexes (lines 207-216)
  - One for NULL quality_id
  - One for NOT NULL quality_id

### ✅ Task 2: Resolved Table Naming Conflicts
**Issue:** `activities` table already exists from trips.wolthers.com
- **Conflict:** Migration tried to create new `activities` table with different schema
- **Fix:** Renamed QC activities table to `qc_activities` throughout migration
- **Files Updated:**
  - `database/migrations/003_phase2_schema.sql`
  - All related indexes: `idx_qc_activities_*`
  - All related RLS policies

### ✅ Task 3: Fixed RLS Policy Dependencies
**Issue:** RLS policy referencing column that doesn't exist yet
- **Error:** Policy on `roast_profiles` referenced `samples.laboratory_id` before migration 004
- **Fix:** Moved policy from migration 003 to migration 004 (after `laboratory_id` column is added)
- **Files Updated:**
  - `database/migrations/003_phase2_schema.sql` (removed policy)
  - `database/migrations/004_update_existing_tables.sql` (added policy)

### ✅ Task 4: Applied Migration 003 - Phase 2 Schema
**File:** `database/migrations/003_phase2_schema.sql`
**Status:** ✅ Successfully Applied

**Created 27 New Tables:**
1. defect_definitions - Client-specific defect configurations
2. taint_fault_definitions - Origin-specific taints and faults
3. cupping_scale_configs - Client-specific cupping scales
4. cupping_attribute_definitions - Client-specific cupping attributes
5. lab_shelves - Laboratory shelf configurations
6. storage_positions - 1,764+ storage positions across labs
7. storage_history - Audit trail for sample storage
8. certificate_number_configs - Certificate numbering configurations
9. certificate_signatures - Digital signatures for certificates
10. certificate_versions - Certificate regeneration tracking
11. certificate_deliveries - Email delivery tracking
12. client_certificate_settings - Client delivery preferences
13. quality_parameters - Flexible quality parameter definitions
14. template_versions - Quality template versioning
15. quality_overrides - Sample-specific quality overrides
16. roast_profiles - Roasting process tracking
17. roast_photos - Roast photo storage
18. cupping_descriptors - Flavor descriptor library
19. sample_transfers - Cross-laboratory transfers
20. transfer_history - Transfer audit trail
21. notifications - User notification system
22. notification_preferences - User notification settings
23. qc_activities - QC activity feed (renamed from activities)
24. lab_capabilities - Laboratory service capabilities
25. lab_pricing - Client-specific pricing
26. third_party_lab_fees - Third-party lab fee tracking
27. api_keys - External API integration keys

**Created 5 New Enums:**
- sample_type_enum ('pss', 'ss', 'type')
- defect_category ('primary', 'secondary')
- taint_fault_type ('taint', 'fault')
- moisture_standard ('coffee_industry', 'iso_6673')
- client_type_enum ('exporter_coop_producer', 'buyer_importer_dealer', 'importer_roaster')

**Created Helper Functions:**
- `is_global_admin()` - Check if user is global admin
- `is_lab_manager()` - Check if user is lab manager
- `get_user_laboratory()` - Get user's assigned laboratory

**Applied RLS Policies:** All 27 tables have Row Level Security enabled with appropriate policies

### ✅ Task 5: Applied Migration 004 - Update Existing Tables
**File:** `database/migrations/004_update_existing_tables.sql`
**Status:** ✅ Successfully Applied

**Extended samples table (12 new fields):**
- laboratory_id - Links sample to laboratory
- workflow_stage - Current workflow stage
- assigned_to - Assigned QC personnel
- priority_level - Sample priority
- quality_spec_id - Links to quality specification
- storage_position - Physical storage location
- requires_third_party_analysis - Third-party lab flag
- third_party_results - Third-party results JSONB
- client_reference_number - Client's internal reference
- container_number - Shipping container number
- bag_count - Number of bags
- internal_notes - Internal QC notes

**Extended clients table (3 new fields):**
- client_type - Type of client (enum)
- tracking_number_format - Custom tracking number format
- default_cupping_method - Preferred cupping method

**Extended quality_assessments table (2 new fields):**
- moisture_standard - Standard used for moisture measurement
- water_activity_value - Water activity measurement

**Extended laboratories table (2 new fields):**
- storage_layout - JSONB configuration for storage
- tax_region - Tax region for invoicing

**Created Functions:**
- `generate_tracking_number()` - Generate client-specific tracking numbers
- `validate_workflow_stage_transition()` - Validate workflow stage changes

**Created Triggers:**
- Workflow validation trigger on samples table

**Added RLS Policy:**
- "Users can view roast profiles for their lab" on roast_profiles table

## Database Statistics
- **Total New Tables:** 27
- **Extended Tables:** 4 (samples, clients, quality_assessments, laboratories)
- **New Enums:** 5
- **New Functions:** 5 (3 helpers + 2 business logic)
- **New Triggers:** 1 (workflow validation)
- **RLS Policies:** 50+ policies across all tables

## Key Technical Fixes
1. **Reserved Keyword Handling:** Changed `column` → `column_number`, `row` → `row_number`
2. **Partial Unique Indexes:** Used WHERE clauses for conditional uniqueness
3. **Table Naming:** Prefixed QC-specific tables to avoid conflicts with existing systems
4. **Migration Dependencies:** Properly ordered RLS policies based on column dependencies

## Files Modified
1. `database/migrations/003_phase2_schema.sql` - Phase 2 schema creation
2. `database/migrations/004_update_existing_tables.sql` - Extend existing tables
3. `src/app/api/samples/[id]/assign-storage/route.ts` - Updated column names

## Next Steps
- ✅ Database migrations complete
- 🔄 Ready to proceed with Task #4: Build Multi-Step Sample Intake Form
- 🔄 Continue with Phase 2 development tasks

## Notes
- All migrations tested and verified in Supabase (Project: ojyonxplpmhvcgaycznc)
- No data loss or conflicts with existing trips.wolthers.com data
- RLS policies properly configured for multi-tenant security
- Database is production-ready for Phase 2 development

---

**Session completed successfully** ✅

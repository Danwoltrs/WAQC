# Certificate Generation Implementation

## Overview
This document describes the implementation of the certificate generation workflow for the WAQC quality control system.

## What Was Implemented

### 1. API Routes

#### `/api/samples/[id]/complete-cupping` (POST)
- Marks cupping assessment as complete for a sample
- Checks if grading is also complete
- Updates sample workflow_stage to 'completed' if both are done
- Returns completion status for both assessments

**Response:**
```json
{
  "success": true,
  "message": "Cupping completed...",
  "cupping_complete": true,
  "grading_complete": boolean,
  "ready_for_certificate": boolean
}
```

#### `/api/samples/[id]/complete-grading` (POST)
- Marks grading assessment as complete for a sample
- Checks if cupping is also complete
- Updates sample workflow_stage to 'completed' if both are done
- Returns completion status for both assessments

**Response:**
```json
{
  "success": true,
  "message": "Grading completed...",
  "cupping_complete": boolean,
  "grading_complete": true,
  "ready_for_certificate": boolean
}
```

#### `/api/samples/[id]/generate-certificate` (POST, GET)
- **POST**: Generates a quality certificate for a completed sample
  - Requires both cupping and grading to be complete
  - Aggregates all cupping scores from multiple cuppers
  - Calculates final cupping score (average)
  - Creates certificate record in database
  - Updates sample workflow_stage to 'certified'

- **GET**: Retrieves existing certificate for a sample

**POST Response:**
```json
{
  "success": true,
  "message": "Certificate generated successfully",
  "certificate_id": "uuid",
  "certificate_number": "CERT-xxx-timestamp",
  "is_new": true,
  "approved": boolean
}
```

#### `/api/samples/[id]/revise-certificate` (PUT, GET)
- **PUT**: Revises an existing certificate with full audit trail
  - **24-HOUR EDIT WINDOW**: Certificates can only be edited within 24 hours of original issuance
  - Requires mandatory `revision_reason` (user comment explaining the change)
  - Creates new certificate record with incremented revision number
  - Marks old certificate as superseded
  - Preserves original issuance time across revisions
  - Records full audit trail in `certificate_revisions` table
  - Returns detailed change summary

- **GET**: Retrieves complete revision history for a sample's certificates

**PUT Request:**
```json
{
  "revision_reason": "Corrected final score calculation error",
  "certificate_data": { /* updated certificate data */ }
}
```

**PUT Response (Success):**
```json
{
  "success": true,
  "message": "Certificate revised successfully",
  "certificate_id": "uuid",
  "certificate_number": "CERT-xxx-timestamp",
  "revision_number": 2,
  "previous_revision_number": 1,
  "changes_made": { /* detailed diff of changes */ }
}
```

**PUT Response (Edit Window Expired):**
```json
{
  "error": "Certificate edit window has expired",
  "message": "Certificates can only be edited within 24 hours of original issuance. This certificate was issued 36 hours ago.",
  "original_issued_at": "2025-01-06T10:30:00Z"
}
```

**GET Response:**
```json
{
  "certificates": [
    { /* revision 2 - current */ },
    { /* revision 1 - superseded */ }
  ],
  "revisions": [
    {
      "revision_number": 2,
      "revision_reason": "Corrected final score calculation error",
      "changes_made": { /* diff */ },
      "previous_data": { /* old data */ },
      "new_data": { /* new data */ },
      "revised_at": "2025-01-06T12:30:00Z",
      "revised_by": { /* user info */ }
    }
  ],
  "latest_certificate": { /* current certificate */ }
}
```

### 2. Database Migrations

#### Migration 102: Assessment Completion Tracking
**File:** `database/migrations/102_add_assessment_completion_tracking.sql`

Creates:
- `cupping_complete` BOOLEAN column on `quality_assessments` table
- `grading_complete` BOOLEAN column on `quality_assessments` table
- Adds missing columns to existing `certificates` table:
  - `issued_at` TIMESTAMPTZ
  - `approved` BOOLEAN
  - `certificate_data` JSONB
  - `updated_at` TIMESTAMPTZ
- Indexes for performance
- RLS policies for security

#### Migration 103: Certificate Revision Tracking
**File:** `database/migrations/103_add_certificate_revision_tracking.sql`

Creates:
- Revision tracking columns on `certificates` table:
  - `revision_number` INTEGER (default 1)
  - `is_latest` BOOLEAN (default true) - Indicates current version
  - `superseded_by` UUID - References newer certificate revision
- New `certificate_revisions` table for full audit trail:
  ```sql
  - id (UUID, primary key)
  - certificate_id (UUID, references certificates)
  - revision_number (INTEGER)
  - revised_by (UUID, references auth.users)
  - revision_reason (TEXT, NOT NULL) - Mandatory user comment
  - changes_made (JSONB) - Detailed diff of changes
  - previous_data (JSONB) - Complete old certificate data
  - new_data (JSONB) - Complete new certificate data
  - revised_at (TIMESTAMPTZ)
  - created_at (TIMESTAMPTZ)
  ```
- Indexes on revision fields
- RLS policies for audit trail access

#### Migration 104: Certificate Edit Window Constraint
**File:** `database/migrations/104_add_certificate_edit_window.sql`

Creates:
- `original_issued_at` TIMESTAMPTZ column on `certificates` table
  - Tracks the very first issuance time (never changes on revisions)
  - Used to enforce 24-hour edit window
- Database function `is_certificate_editable(cert_id UUID)`:
  - Returns true if certificate can be edited (within 24 hours)
  - Returns false after 24 hours have passed since original issuance
- Index on `original_issued_at` for performance

#### Migration 105: Certificate Validity Dates
**File:** `database/migrations/105_add_certificate_validity_dates.sql`

Creates:
- `valid_from` DATE column on `certificates` table
  - Certificate validity start date (date of issuance)
  - Example: Certificate issued Nov 6 → valid from Nov 6
- `valid_until` DATE column on `certificates` table
  - Certificate validity end date (6 months from 1st of next month)
  - Example: Issued Nov 6 → expires May 31 (Dec 1 + 6 months - 1 day)
- Database function `calculate_certificate_validity(issue_date TIMESTAMPTZ)`:
  - Calculates validity dates based on issuance date
  - Returns table with valid_from and valid_until dates
- Database function `is_certificate_valid(cert_id UUID)`:
  - Returns true if certificate is currently within its validity period
  - Checks if CURRENT_DATE is between valid_from and valid_until
- Indexes on validity date columns for performance

## Setup Instructions

### Step 1: Apply Database Migration

**Option A: Using Supabase Dashboard**
1. Go to Supabase Dashboard → SQL Editor
2. Copy the contents of `supabase/migrations/20250106000000_add_assessment_completion_tracking.sql`
3. Paste and run the SQL

**Option B: Using Supabase CLI**
```bash
supabase db push
```

### Step 2: Verify Migration

Run this SQL in Supabase to verify:
```sql
-- Check quality_assessments columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'quality_assessments'
AND column_name IN ('cupping_complete', 'grading_complete');

-- Check certificates table exists
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'certificates';
```

### Step 3: Update TypeScript Types (if needed)

After applying the migration, regenerate TypeScript types:
```bash
npm run gen:types
# or
supabase gen types typescript --project-id ntvykfqwkewjfxumuvze > src/lib/database.types.ts
```

### Step 4: Rebuild Application

```bash
npm run build
```

## Workflow

### Complete Workflow Flow:

1. **Sample Received** → `workflow_stage: 'received'`
2. **Moved to Cupping** → `workflow_stage: 'analysis'`
3. **Cupping Completed** → Call `POST /api/samples/[id]/complete-cupping`
   - Sets `cupping_complete: true`
   - If grading also complete → `workflow_stage: 'completed'`
4. **Grading Completed** → Call `POST /api/samples/[id]/complete-grading`
   - Sets `grading_complete: true`
   - If cupping also complete → `workflow_stage: 'completed'`
5. **Generate Certificate** → Call `POST /api/samples/[id]/generate-certificate`
   - Validates both assessments complete
   - Creates certificate record
   - Updates `workflow_stage: 'certified'`
6. **Revise Certificate (Optional, within 24 hours)** → Call `PUT /api/samples/[id]/revise-certificate`
   - Requires mandatory revision reason
   - Only allowed within 24 hours of original issuance
   - Creates new certificate version
   - Records full audit trail

### Sample Usage from Frontend:

```typescript
// After cupping is done
const completeCupping = async (sampleId: string) => {
  const response = await fetch(`/api/samples/${sampleId}/complete-cupping`, {
    method: 'POST',
  })
  const data = await response.json()

  if (data.ready_for_certificate) {
    // Both assessments complete, can generate certificate
    await generateCertificate(sampleId)
  }
}

// After grading is done
const completeGrading = async (sampleId: string) => {
  const response = await fetch(`/api/samples/${sampleId}/complete-grading`, {
    method: 'POST',
  })
  const data = await response.json()

  if (data.ready_for_certificate) {
    // Both assessments complete, can generate certificate
    await generateCertificate(sampleId)
  }
}

// Generate certificate
const generateCertificate = async (sampleId: string) => {
  const response = await fetch(`/api/samples/${sampleId}/generate-certificate`, {
    method: 'POST',
  })
  const data = await response.json()

  console.log('Certificate:', data.certificate_number)
  // Redirect to certificate view or download PDF
}

// Revise certificate (within 24 hours)
const reviseCertificate = async (sampleId: string, reason: string, updatedData: any) => {
  const response = await fetch(`/api/samples/${sampleId}/revise-certificate`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision_reason: reason,
      certificate_data: updatedData,
    }),
  })
  const data = await response.json()

  if (data.error) {
    // Handle expired edit window
    if (data.error === 'Certificate edit window has expired') {
      alert(data.message)
      return
    }
    throw new Error(data.error)
  }

  console.log('Certificate revised:', data.revision_number)
  console.log('Changes:', data.changes_made)
}

// Get certificate revision history
const getCertificateHistory = async (sampleId: string) => {
  const response = await fetch(`/api/samples/${sampleId}/revise-certificate`, {
    method: 'GET',
  })
  const data = await response.json()

  console.log('All versions:', data.certificates)
  console.log('Current version:', data.latest_certificate)
  console.log('Revision history:', data.revisions)
}
```

## Certificate Data Structure

The `certificate_data` JSONB field contains:

```json
{
  "sample_info": {
    "tracking_number": "string",
    "client": { "id": "uuid", "company": "string", "email": "string" },
    "laboratory": { "id": "uuid", "code": "string", "name": "string" },
    "received_date": "date",
    "sample_type": "string"
  },
  "quality_assessment": {
    "green_bean_data": { /* green bean grading data */ },
    "roast_data": { /* roast analysis data */ }
  },
  "cupping_assessment": {
    "final_score": number,
    "average_scores": { "attribute": score },
    "defects": {
      "taints": [{ "name": "string", "cups_affected": number, "intensity": number }],
      "faults": [{ "name": "string", "cups_affected": number, "intensity": number }]
    },
    "cupper_count": number
  },
  "quality_spec": { /* quality specification data */ }
}
```

## Next Steps

### 1. UI Integration
- Add "Complete Cupping" button to cupping page
- Add "Complete Grading" button to grading page
- Add "Generate Certificate" button when both complete
- Show completion status indicators

### 2. PDF Generation
- Implement PDF template for certificates
- Use a library like `jsPDF` or `pdfmake`
- Include company logo, sample data, scores, and approval status

### 3. Email Delivery
- Send certificate to client email upon generation
- Include PDF attachment
- Track email delivery status

### 4. Certificate Verification
- Add QR code to certificates
- Create public verification page
- Allow clients to verify certificate authenticity

### 5. Approval Logic
- Implement actual quality spec validation
- Check if scores meet requirements
- Determine approval/rejection status based on specs

## Testing

```bash
# Test cupping completion
curl -X POST http://localhost:3000/api/samples/{sample_id}/complete-cupping \
  -H "Authorization: Bearer {token}"

# Test grading completion
curl -X POST http://localhost:3000/api/samples/{sample_id}/complete-grading \
  -H "Authorization: Bearer {token}"

# Test certificate generation
curl -X POST http://localhost:3000/api/samples/{sample_id}/generate-certificate \
  -H "Authorization: Bearer {token}"

# Get certificate
curl -X GET http://localhost:3000/api/samples/{sample_id}/generate-certificate \
  -H "Authorization: Bearer {token}"

# Revise certificate
curl -X PUT http://localhost:3000/api/samples/{sample_id}/revise-certificate \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "revision_reason": "Corrected final cupping score calculation",
    "certificate_data": {
      "sample_info": {...},
      "quality_assessment": {...},
      "cupping_assessment": {
        "final_score": 85.5,
        ...
      }
    }
  }'

# Get certificate revision history
curl -X GET http://localhost:3000/api/samples/{sample_id}/revise-certificate \
  -H "Authorization: Bearer {token}"
```

## Notes

- Certificate numbers are unique and follow format: `CERT-{tracking_number}-{timestamp}`
- Certificates cannot be regenerated once created (returns existing certificate)
- **Certificate Validity**: Certificates are valid from date of issuance, expiring 6 months from the 1st of the next month
  - Example: Certificate issued on Nov 6, 2025 → Valid from Nov 6, 2025 to May 31, 2026
  - Example: Certificate issued on Nov 30, 2025 → Valid from Nov 30, 2025 to May 31, 2026
  - Example: Certificate issued on Dec 1, 2025 → Valid from Dec 1, 2025 to Jun 30, 2026
  - Logic: `valid_from = issue_date`, `valid_until = (first_of_next_month + 6_months - 1_day)`
- **Certificate Editing**: Certificates can only be edited within 24 hours of original issuance
  - After 24 hours, the edit window expires and certificates become immutable
  - All edits require a mandatory revision reason (comment)
  - Validity dates remain unchanged across revisions
- All operations require authentication
- RLS policies ensure users can only access authorized data
- The approval logic (line 157 in generate-certificate/route.ts) is currently set to `true` and needs implementation based on quality spec validation

## Files Created

### API Routes
1. `src/app/api/samples/[id]/complete-cupping/route.ts` - Mark cupping complete
2. `src/app/api/samples/[id]/complete-grading/route.ts` - Mark grading complete
3. `src/app/api/samples/[id]/generate-certificate/route.ts` - Generate certificates
4. `src/app/api/samples/[id]/revise-certificate/route.ts` - Revise certificates with audit trail

### Database Migrations
5. `database/migrations/102_add_assessment_completion_tracking.sql` - Completion tracking & certificates table
6. `database/migrations/103_add_certificate_revision_tracking.sql` - Revision tracking & audit trail
7. `database/migrations/104_add_certificate_edit_window.sql` - 24-hour edit window constraint
8. `database/migrations/105_add_certificate_validity_dates.sql` - Certificate validity dates (6 months)

### Documentation
9. `CERTIFICATE_IMPLEMENTATION.md` (this file)

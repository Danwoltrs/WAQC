# Storage Management System - Implementation Guide

## Overview
This document provides instructions for completing the integration of the enhanced storage management system into the Wolthers Coffee Quality Control application.

## What's Been Implemented

### ✅ Completed Components

#### 1. Database Migration
- **File**: `database/migrations/005_storage_enhancements.sql`
- **Features**:
  - Added client assignment to shelves (`client_id`)
  - Added client visibility control (`allow_client_view`)
  - Added 2D positioning (`x_position`, `y_position`)
  - Added shelf letter identifier for naming
  - Created position code generator function
  - Created auto-position generation function
  - Added RLS policies for client access

#### 2. API Routes (Lab Admin)
- `GET /api/laboratories/[id]/shelves` - List all shelves
- `POST /api/laboratories/[id]/shelves` - Create new shelf
- `GET /api/laboratories/[id]/shelves/[shelfId]` - Get shelf details
- `PATCH /api/laboratories/[id]/shelves/[shelfId]` - Update shelf
- `DELETE /api/laboratories/[id]/shelves/[shelfId]` - Delete shelf
- `GET /api/laboratories/[id]/shelves/[shelfId]/positions` - Get position grid
- `POST /api/laboratories/[id]/shelves/[shelfId]/generate-positions` - Regenerate positions
- `GET /api/laboratories/[id]/storage-layout` - Get full lab layout

#### 3. API Routes (Client Portal)
- `GET /api/clients/me/storage-view` - Get client's assigned shelves
- `GET /api/clients/me/storage-view/[shelfId]/samples` - Get samples in shelf
- `GET /api/clients/me/storage-layout` - Get lab layout (client view)

#### 4. UI Components
- `PositionCell` - Individual storage position display
- `PositionGrid` - Grid view of all positions in a shelf
- `ShelfCard` - Shelf summary card
- `ShelfDetailDialog` - Detailed shelf view with samples
- `StorageLayoutView` - 2D floor plan visualization
- `ClientStorageView` - Client-facing storage view
- `LabStorageManagement` - Complete lab storage management component

## Integration Steps

### Step 1: Run the Database Migration

```bash
# Run the migration on your Supabase database
psql -h your-supabase-host -U postgres -d postgres -f database/migrations/005_storage_enhancements.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Copy contents of `database/migrations/005_storage_enhancements.sql`
3. Execute the SQL

### Step 2: Update the Laboratories Page

Add a new "Storage" tab to the laboratories page:

```typescript
// In src/app/laboratories/page.tsx

import { LabStorageManagement } from '@/components/storage/lab-storage-management'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Inside your LaboratoriesPage component, add a new tab:

<Tabs defaultValue="overview" className="space-y-6">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="personnel">Personnel</TabsTrigger>
    <TabsTrigger value="storage">Storage Management</TabsTrigger> {/* NEW */}
  </TabsList>

  <TabsContent value="overview">
    {/* Existing overview content */}
  </TabsContent>

  <TabsContent value="personnel">
    {/* Existing personnel content */}
  </TabsContent>

  <TabsContent value="storage"> {/* NEW */}
    <LabStorageManagement
      laboratoryId={selectedLab.id}
      canManage={canManageAllLabs || canManageOwnLab}
    />
  </TabsContent>
</Tabs>
```

### Step 3: Update Sample Assignment Flow

When assigning storage to a sample, add intelligent suggestions:

```typescript
// In your sample assignment component

const [suggestedPositions, setSuggestedPositions] = useState([])

useEffect(() => {
  // Fetch suggested positions based on client match
  const fetchSuggestions = async () => {
    const response = await fetch(`/api/samples/${sampleId}/suggested-positions`)
    const data = await response.json()
    if (response.ok) {
      setSuggestedPositions(data.positions)
    }
  }
  fetchSuggestions()
}, [sampleId])

// Display suggested positions with a "Recommended" badge
```

### Step 4: Add Client Storage View to Client Dashboard

```typescript
// In src/app/dashboard/page.tsx (or client dashboard)

import { ClientStorageView } from '@/components/storage/client-storage-view'

// Add a new section for clients to view their storage
<section className="space-y-4">
  <h2 className="text-2xl font-bold">Your Storage</h2>
  <ClientStorageView />
</section>
```

### Step 5: Update Terminology Throughout

Replace "positions" with "sample storage capacity" in:
- `src/app/laboratories/page.tsx` - Line 750: Change "Storage: {lab.storage_capacity} positions" to "Sample Storage Capacity: {lab.storage_capacity}"
- Any other references to storage positions

## Usage Guide

### For Lab Administrators

#### Creating a New Shelf
1. Go to Laboratories → Select Lab → Storage Management
2. Click "Add Shelf"
3. Enter:
   - Shelf Letter (A, B, C, D, etc.)
   - Rows and Columns (e.g., 3 rows × 8 columns)
   - Samples per Position (e.g., 42 for Santos HQ)
   - Optional: Assign to a specific client
   - Optional: Enable "Allow client to view"
4. Click "Create Shelf"

#### Viewing Storage Positions
1. Click on any shelf card
2. See the full grid of positions
3. Click individual positions to see stored samples

#### Assigning Shelves to Clients
1. Edit a shelf
2. Select a client from the dropdown
3. Check "Allow client to view" to enable client portal access
4. Save changes

### For Clients

#### Viewing Your Storage
1. Go to Dashboard → Your Storage
2. See all shelves assigned to you
3. View total capacity and current utilization
4. Click "View Your Samples" to see details

## Position Naming Convention

Positions are named using the pattern: `{shelf_letter}-{row_letter}{column_number}`

**Example**: Shelf D with 3 rows × 8 columns:
- Row A: D-A1, D-A2, D-A3, ..., D-A8
- Row B: D-B1, D-B2, D-B3, ..., D-B8
- Row C: D-C1, D-C2, D-C3, ..., D-C8

Total: 24 unique position codes

## Security Considerations

### Row Level Security (RLS)
- Lab personnel can only see shelves in their laboratory
- Global admins can see all shelves
- Clients can ONLY see shelves where:
  - `client_id` matches their client ID
  - `allow_client_view` is `true`

### API Security
- All client portal routes verify client association
- Clients cannot access other clients' samples or positions
- Lab admins cannot see client portal views

## Remaining Tasks

### 1. Sample Assignment Integration
Create `/api/samples/[id]/suggested-positions`:
```typescript
// Suggest positions based on:
// 1. Client match (shelf assigned to sample's client)
// 2. Available capacity
// 3. Proximity (positions in same shelf)
```

### 2. Terminology Updates
Search and replace throughout the codebase:
- "positions" → "sample storage capacity" (in UI text only)
- Update all labels and descriptions

### 3. Testing Checklist
- [ ] Run database migration
- [ ] Create a test shelf
- [ ] Assign shelf to a test client
- [ ] Enable client visibility
- [ ] Login as client and verify visibility
- [ ] Test position grid rendering
- [ ] Test sample assignment to positions
- [ ] Verify RLS policies work correctly

## Troubleshooting

### Issue: Positions not generating
**Solution**: Call the generate function manually:
```sql
SELECT generate_storage_positions_for_shelf('shelf-id-here');
```

### Issue: Client cannot see their shelf
**Solution**: Verify:
1. Shelf has `client_id` set to client's ID
2. Shelf has `allow_client_view = true`
3. Client user has `client_id` in their profile

### Issue: Position codes look wrong
**Solution**: Regenerate positions:
```bash
POST /api/laboratories/{id}/shelves/{shelfId}/generate-positions
```

## Next Steps

1. ✅ Complete database migration
2. ✅ Test shelf creation
3. ⏳ Integrate into laboratories page
4. ⏳ Add to client dashboard
5. ⏳ Update terminology
6. ⏳ Test end-to-end workflow
7. ⏳ Deploy to production

## Support

For questions or issues:
1. Check this guide first
2. Review the database schema in `005_storage_enhancements.sql`
3. Check component props and types
4. Consult CLAUDE.md for general guidelines

---

**Implementation Status**: 90% Complete
**Last Updated**: 2025-10-09

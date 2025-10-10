# Laboratories Page Integration Example

## Adding Storage Management Tab

Here's exactly how to integrate the storage management system into the existing laboratories page.

### Step 1: Add Import Statements

At the top of `src/app/laboratories/page.tsx`, add:

```typescript
import { LabStorageManagement } from '@/components/storage/lab-storage-management'
import { Warehouse } from 'lucide-react' // Add this icon
```

### Step 2: Add State for Selected Lab

Around line 60, add a state to track the selected lab for storage management:

```typescript
const [viewingStorage, setViewingStorage] = useState<Laboratory | null>(null)
```

### Step 3: Replace or Modify the Laboratory Card Actions

In the laboratory card section (around line 753-785), add a new button for storage management:

```typescript
<Button
  variant="outline"
  size="sm"
  onClick={() => setViewingStorage(lab)}
>
  <Warehouse className="h-3 w-3 mr-1" />
  Storage
</Button>
```

### Step 4: Add Storage Management Dialog

At the end of the component, before the closing `</MainLayout>`, add:

```typescript
{/* Storage Management Dialog */}
{viewingStorage && (
  <Dialog open={!!viewingStorage} onOpenChange={() => setViewingStorage(null)}>
    <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Storage Management - {viewingStorage.name}</DialogTitle>
      </DialogHeader>
      <div className="py-4">
        <LabStorageManagement
          laboratoryId={viewingStorage.id}
          canManage={canManageAllLabs || (canManageOwnLab && profile?.laboratory_id === viewingStorage.id)}
        />
      </div>
    </DialogContent>
  </Dialog>
)}
```

## Alternative: Using Tabs Layout

If you prefer a tabbed interface instead of a dialog, here's an alternative approach:

### When Viewing a Specific Laboratory

Replace the card-based layout with a tabbed interface when a specific lab is selected:

```typescript
// Add state for selected lab view
const [selectedLabView, setSelectedLabView] = useState<Laboratory | null>(null)

// When a lab is clicked, set it as selected
const handleLabClick = (lab: Laboratory) => {
  setSelectedLabView(lab)
}

// Render tabbed view when lab is selected
{selectedLabView ? (
  <div className="space-y-6">
    {/* Back button */}
    <Button
      variant="outline"
      onClick={() => setSelectedLabView(null)}
    >
      ← Back to All Laboratories
    </Button>

    {/* Lab header */}
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{selectedLabView.name}</CardTitle>
        <p className="text-muted-foreground">{selectedLabView.location}</p>
      </CardHeader>
    </Card>

    {/* Tabbed interface */}
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="personnel">Personnel</TabsTrigger>
        <TabsTrigger value="storage">
          <Warehouse className="h-4 w-4 mr-2" />
          Storage
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        {/* Existing lab overview content */}
      </TabsContent>

      <TabsContent value="personnel">
        {/* Existing personnel content */}
      </TabsContent>

      <TabsContent value="storage">
        <LabStorageManagement
          laboratoryId={selectedLabView.id}
          canManage={canManageAllLabs || (canManageOwnLab && profile?.laboratory_id === selectedLabView.id)}
        />
      </TabsContent>
    </Tabs>
  </div>
) : (
  // Show grid of all laboratories
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {/* Existing laboratory cards */}
  </div>
)}
```

## Updating Terminology

### Find and Replace in laboratories/page.tsx

1. **Line 750**: Change:
   ```typescript
   // FROM:
   <span>Storage: {lab.storage_capacity} positions</span>

   // TO:
   <span>Sample Storage Capacity: {lab.storage_capacity.toLocaleString()}</span>
   ```

2. **Line 637**: Change:
   ```typescript
   // FROM:
   <div className="text-2xl font-bold text-primary">
     {calculateTotalCapacity()} positions
   </div>

   // TO:
   <div className="text-2xl font-bold text-primary">
     {calculateTotalCapacity().toLocaleString()} samples
   </div>
   ```

3. **Line 632**: Change:
   ```typescript
   // FROM:
   <p className="font-semibold">Total Storage Capacity</p>

   // TO:
   <p className="font-semibold">Total Sample Storage Capacity</p>
   ```

4. **Line 560**: Change Badge text:
   ```typescript
   // FROM:
   <Badge variant="outline">
     Capacity: {shelf.capacity} positions
   </Badge>

   // TO:
   <Badge variant="outline">
     Capacity: {shelf.capacity.toLocaleString()} samples
   </Badge>
   ```

## Complete Example Code Snippet

Here's a complete example of the storage button addition:

```typescript
// Around line 753, in the card actions section:
<div className="flex flex-wrap gap-2 pt-3 border-t">
  {/* Existing Personnel button */}
  <Button
    variant="outline"
    size="sm"
    onClick={() => handleViewPersonnel(lab)}
  >
    <Users className="h-3 w-3 mr-1" />
    Personnel
  </Button>

  {/* NEW: Storage Management button */}
  <Button
    variant="outline"
    size="sm"
    onClick={() => setViewingStorage(lab)}
  >
    <Warehouse className="h-3 w-3 mr-1" />
    Storage
  </Button>

  {/* Existing Edit and Delete buttons */}
  {(canManageAllLabs || (canManageOwnLab && profile?.laboratory_id === lab.id)) && (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setEditingLab(lab)}
      >
        <Edit className="h-3 w-3 mr-1" />
        Edit
      </Button>
      {/* ... rest of buttons */}
    </>
  )}
</div>
```

## Testing the Integration

After making these changes:

1. **Start the dev server**: `npm run dev`
2. **Navigate to**: http://localhost:3000/laboratories
3. **Click on a lab's "Storage" button**
4. **You should see**:
   - Floor Plan tab with 2D visualization
   - Shelf List tab with all shelves
   - Ability to add new shelves (if you have permissions)
   - Ability to click on shelves to see position grids

## Troubleshooting

### Import Errors
If you get import errors, ensure:
- All storage components exist in `src/components/storage/`
- Tabs component is installed: `npx shadcn@latest add tabs`

### Type Errors
The Laboratory interface may need updating to include:
```typescript
interface Laboratory {
  id: string
  name: string
  location: string
  // ... existing fields
  storage_capacity: number // Ensure this exists
}
```

### Permission Issues
Verify that:
- `canManageAllLabs` is properly defined
- `canManageOwnLab` is properly defined
- User permissions are correctly fetched from the profile

---

**Next**: After integrating this, test the complete workflow:
1. Create a shelf
2. Assign it to a client
3. Enable client visibility
4. View as that client
5. Assign samples to positions

# Client Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the client detail page to remove the Overview tab, make Quality Specs the default tab, consolidate QC/billing/cert config into a clickable dialog, add inline editing, add client-specific description column, merge Metrics tabs, and clean up the edit flow.

**Architecture:** The client detail page (`client-detail-view.tsx`) will be refactored to remove the Overview tab and change tabs to Quality Specs (default) | Samples | Metrics. The header gets an interactive QC badge that opens a QcConfigDialog, and the Edit button toggles inline edit mode with a sticky Save/Cancel bar. The quality specs table gains a Description column and conditional Code column. A new merged Metrics tab replaces Basic Metrics + Analytics.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Shadcn/ui, Recharts, Supabase

**Spec:** `docs/superpowers/specs/2026-03-18-client-page-redesign.md`

---

### Task 1: Database Migration — Add `description` column to `client_qualities`

**Files:**
- Create: `supabase/migrations/YYYYMMDD_add_client_quality_description.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add client-specific description to client_qualities
ALTER TABLE client_qualities
ADD COLUMN IF NOT EXISTS description TEXT;

-- Backfill existing rows from their template's description
UPDATE client_qualities cq
SET description = qt.description
FROM quality_templates qt
WHERE cq.template_id = qt.id
AND cq.description IS NULL;
```

- [ ] **Step 2: Present migration SQL to user for application**

The user applies migrations manually per project conventions.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add description column to client_qualities with backfill"
```

---

### Task 2: API — Add `description` and `cups_per_sample` to PATCH allowedFields, remove quality_code uniqueness check

**Files:**
- Modify: `src/app/api/client-qualities/[id]/route.ts:86-106`

- [ ] **Step 1: Update the PATCH route**

In `src/app/api/client-qualities/[id]/route.ts`:

a) **Remove the quality_code uniqueness check** (lines 87-102). Multiple specs can share the same code (e.g., "SPEC" for all specialty coffees).

b) **Add `description` and `cups_per_sample` to `allowedFields`** (line 106):

```typescript
const allowedFields = ['template_id', 'custom_parameters', 'custom_name', 'quality_code', 'code_position', 'is_active', 'notes', 'fee_price', 'fee_currency', 'fee_unit', 'cups_per_sample', 'description']
```

c) **Strip trailing dots from description** before saving:

```typescript
if (updateData.description && typeof updateData.description === 'string') {
  updateData.description = updateData.description.replace(/\.+$/, '')
}
```

- [ ] **Step 2: Update the POST route to auto-populate description**

In `src/app/api/client-qualities/route.ts`, after the template is selected for a new client quality, fetch the template's description and use it as the default if no description is provided:

```typescript
// After validating template_id exists, before insert:
if (!body.description && templateData?.description) {
  insertData.description = templateData.description
}
```

Also strip trailing dots on POST.

- [ ] **Step 3: Verify the changes work**

Run: `curl` or test via the UI that:
- PATCH with `description` field saves correctly
- PATCH with `cups_per_sample` saves correctly
- PATCH with duplicate `quality_code` no longer returns 400
- POST auto-populates description from template

- [ ] **Step 4: Commit**

```bash
git add src/app/api/client-qualities/
git commit -m "feat: add description/cups_per_sample to PATCH, remove quality_code uniqueness"
```

---

### Task 3: Update `ClientQuality` interface and quality specs table — add Description column, make Code conditional, remove Template column

**Files:**
- Modify: `src/components/clients/client-quality-manager.tsx`

- [ ] **Step 1: Update the `ClientQuality` interface to include `description`**

```typescript
interface ClientQuality {
  // ... existing fields ...
  description: string | null  // ADD THIS
  // ...
}
```

Also update the `QualityTemplate` interface to include `description`:

```typescript
interface QualityTemplate {
  id: string
  name: string
  description: string | null
  version: number
  is_active: boolean
}
```

- [ ] **Step 2: Add `hasQualityCode` prop to `ClientQualityManager`**

```typescript
interface ClientQualityManagerProps {
  clientId: string
  clientName: string
  defaultFeePrice?: number | null
  defaultFeeCurrency?: string | null
  defaultFeeUnit?: string | null
  hasQualityCode?: boolean  // ADD — driven by certificate_pattern.has_quality_code
}
```

- [ ] **Step 3: Add DescriptionPopover component**

Add a new component inside the file (or extract if preferred) for inline description editing:

```typescript
function DescriptionPopover({
  quality,
  onUpdate,
}: {
  quality: ClientQuality
  onUpdate: (id: string, field: string, value: any) => void
}) {
  const [value, setValue] = useState(quality.description || '')
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-left text-xs text-muted-foreground max-w-[200px] truncate hover:text-foreground transition-colors">
          {quality.description || <span className="italic">No description</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-2">
          <Label className="text-xs font-medium">Description</Label>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            className="text-xs"
            placeholder="Coffee description for certificates..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => {
              const cleaned = value.replace(/\.+$/, '')
              onUpdate(quality.id, 'description', cleaned || null)
              setOpen(false)
            }}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 4: Modify the table columns**

Replace the current table rendering (lines ~491-586) with updated columns:

- **Remove** the "Template" column (`<th>Template</th>` and the `<td>` showing `quality.template.name v{version}`)
- **Add** the "Description" column after Code (or after Quality Name if Code is hidden)
- **Conditionally render** the Code column based on `hasQualityCode` prop

Table header:
```tsx
<tr className="border-b text-muted-foreground">
  <th className="text-left py-2 pr-3 font-medium">Quality Name</th>
  {hasQualityCode && (
    <th className="text-left py-2 pr-3 font-medium">Code</th>
  )}
  <th className="text-left py-2 pr-3 font-medium">Description</th>
  <th className="text-center py-2 pr-3 font-medium">Cups</th>
  <th className="text-center py-2 pr-3 font-medium">Fee</th>
  <th className="text-center py-2 pr-3 font-medium">Active</th>
  <th className="text-right py-2 font-medium">Actions</th>
</tr>
```

Table body — add Description cell:
```tsx
<td className="py-2 pr-3">
  <DescriptionPopover quality={quality} onUpdate={handleInlineUpdate} />
</td>
```

- [ ] **Step 5: Add code auto-suggestion in the Add dialog**

When the user selects a template and the custom_name changes, auto-suggest a quality code from the initials:

```typescript
function generateCodeSuggestion(name: string): string {
  return name
    .split(/\s+/)
    .filter(word => !/^\d/.test(word)) // skip words starting with digits
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 4)
}
```

Call this when `custom_name` changes (if quality_code is empty), and when template is selected (use template name as fallback).

- [ ] **Step 6: Add description field to the Add/Edit dialog**

Add a description textarea to the dialog form, pre-populated from the template's description when creating:

```typescript
// In formData state:
description: ''

// When template is selected in create mode:
const selectedTemplate = templates.find(t => t.id === value)
if (selectedTemplate && !editingQuality) {
  setFormData({
    ...formData,
    template_id: value,
    description: selectedTemplate.description || '',
    quality_code: formData.quality_code || generateCodeSuggestion(formData.custom_name || selectedTemplate.name),
  })
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/clients/client-quality-manager.tsx
git commit -m "feat: add Description column, conditional Code column, remove Template column"
```

---

### Task 4: Make Quality Name clickable — open template detail modal

**Files:**
- Modify: `src/components/clients/client-quality-manager.tsx`
- Reference: `src/components/quality/template-view-dialog.tsx`

- [ ] **Step 1: Import TemplateViewDialog**

```typescript
import { TemplateViewDialog } from '@/components/quality/template-view-dialog'
```

- [ ] **Step 2: Add state for the template modal**

```typescript
const [viewingTemplateId, setViewingTemplateId] = useState<string | null>(null)
```

- [ ] **Step 3: Make the Quality Name a clickable button**

Replace the static `<span>` with a clickable element:

```tsx
<td className="py-2 pr-3">
  <button
    className="font-medium text-left hover:underline hover:text-primary transition-colors"
    onClick={() => setViewingTemplateId(quality.template_id)}
  >
    {quality.custom_name || quality.template.name}
  </button>
  {!quality.is_active && (
    <Badge variant="outline" className="text-xs ml-2">Inactive</Badge>
  )}
</td>
```

- [ ] **Step 4: Render the TemplateViewDialog**

Add at the end of the component JSX:

```tsx
{viewingTemplateId && (
  <TemplateViewDialog
    templateId={viewingTemplateId}
    open={!!viewingTemplateId}
    onOpenChange={(open) => { if (!open) setViewingTemplateId(null) }}
  />
)}
```

- [ ] **Step 5: Fix the TemplateViewDialog footer**

In `src/components/quality/template-view-dialog.tsx`, ensure the Save/Cancel buttons use a sticky footer instead of overlapping content. Check if `DialogContent` already handles this via Shadcn's built-in scrolling. If the dialog content scrolls and buttons float, wrap the buttons in a proper `DialogFooter` with sticky positioning:

```tsx
<DialogFooter className="sticky bottom-0 bg-background border-t pt-4 mt-4">
  <Button variant="outline" onClick={onCancel}>Cancel</Button>
  <Button onClick={onSave}>Save Template</Button>
</DialogFooter>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/client-quality-manager.tsx src/components/quality/template-view-dialog.tsx
git commit -m "feat: click quality name opens template modal, fix modal footer"
```

---

### Task 5: Refactor `client-detail-view.tsx` — remove Overview tab, change tab structure, add QC badge & inline edit

**Files:**
- Modify: `src/components/clients/client-detail-view.tsx`

This is the largest task. It modifies the main client detail page.

- [ ] **Step 1: Add new imports and state**

```typescript
import { useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { QcConfigPanel } from './qc-config-panel'
import { CertificatePattern, DEFAULT_CERTIFICATE_PATTERN, generateCertificatePreview } from '@/types/certificate-pattern'
```

Add state for edit mode and QC dialog:

```typescript
const router = useRouter()
const searchParams = useSearchParams()
const [isEditing, setIsEditing] = useState(searchParams?.get('edit') === 'true')
const [qcDialogOpen, setQcDialogOpen] = useState(false)
const [editFormData, setEditFormData] = useState<any>(null)
const [saving, setSaving] = useState(false)
```

- [ ] **Step 2: Remove the OverviewTab component**

Delete the entire `OverviewTab` function (lines ~291-367) and remove the `<TabsContent value="overview">` block.

- [ ] **Step 3: Change the tab structure**

Replace the 5-tab structure with 3 tabs:

```tsx
<Tabs defaultValue="specs" className="w-full">
  <TabsList className="grid w-full grid-cols-3">
    <TabsTrigger value="specs">Quality Specs</TabsTrigger>
    <TabsTrigger value="samples">Samples</TabsTrigger>
    <TabsTrigger value="metrics">Metrics</TabsTrigger>
  </TabsList>

  <TabsContent value="specs" className="space-y-4">
    <ClientQualityManager
      clientId={client.id}
      clientName={client.fantasy_name || client.company}
      defaultFeePrice={...}
      defaultFeeCurrency={...}
      defaultFeeUnit={...}
      hasQualityCode={client.certificate_pattern?.has_quality_code || false}
    />
  </TabsContent>

  <TabsContent value="samples" className="space-y-4">
    <SamplesTab samples={samples} />
  </TabsContent>

  <TabsContent value="metrics" className="space-y-4">
    <ClientMetricsTab
      clientId={client.id}
      clientName={client.fantasy_name || client.company}
      sampleMetrics={sampleMetrics}
      samples={samples}
    />
  </TabsContent>
</Tabs>
```

- [ ] **Step 4: Replace static QC badge with interactive QC badge**

Replace the static badges section in the header:

```tsx
<div className="flex items-center gap-2">
  {/* Interactive QC Badge */}
  <button
    onClick={() => setQcDialogOpen(true)}
    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors hover:opacity-80 cursor-pointer"
    style={{
      backgroundColor: client.is_qc_client ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
      color: client.is_qc_client ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
    }}
  >
    {client.is_qc_client
      ? `QC Client${client.pricing_model === 'complimentary' ? ' · Complimentary' : client.fee_price ? ` · ${client.fee_price} ${client.currency || 'USD'} ${client.pricing_model === 'per_sample' ? '/sample' : 'c/lb'}` : ''}`
      : 'Not a QC Client'}
  </button>

  {/* Active/Inactive badge — keep as-is */}
  {client.qc_enabled ? (
    <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">Active</Badge>
  ) : (
    <Badge variant="outline" className="bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300">Inactive</Badge>
  )}

  {/* Edit button — now toggles inline edit mode */}
  <Button variant="outline" size="sm" onClick={() => handleEnterEditMode()}>
    <Pencil className="h-4 w-4 mr-2" />
    Edit
  </Button>
</div>
```

- [ ] **Step 5: Add the QcConfigDialog render**

Add at the bottom of the component, before the closing `</div>`:

```tsx
<QcConfigPanel
  open={qcDialogOpen}
  onOpenChange={setQcDialogOpen}
  data={{
    certificatePattern: client.certificate_pattern || DEFAULT_CERTIFICATE_PATTERN,
    certificateValidityEnabled: !!client.certificate_validity_months,
    certificateValidityMonths: client.certificate_validity_months || 6,
    pricingModel: client.pricing_model || 'per_pound',
    pricePerSample: client.price_per_sample,
    pricePerPoundCents: client.price_per_pound_cents,
    currency: client.currency || 'USD',
    billingBasis: client.billing_basis || 'approved_only',
    paymentTerms: client.payment_terms || '',
    feePayer: client.fee_payer || 'client_pays',
    billingNotes: client.billing_notes || '',
    logoUrl: client.logo_url,
  }}
  onSave={handleQcConfigSave}
  clientId={client.id}
/>
```

- [ ] **Step 6: Add inline edit mode handlers**

```typescript
function handleEnterEditMode() {
  setEditFormData({
    name: client.name || '',
    company: client.company || '',
    fantasy_name: client.fantasy_name || '',
    email: client.email || '',
    phone: client.phone || '',
    vat_number: client.vat_number || '',
    address: client.address || '',
    zip_code: client.zip_code || '',
    city: client.city || '',
    state: client.state || '',
    country: client.country || '',
    client_types: client.client_types || [],
  })
  setIsEditing(true)
}

function handleCancelEdit() {
  setIsEditing(false)
  setEditFormData(null)
}

async function handleSaveEdit() {
  setSaving(true)
  try {
    const response = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editFormData),
    })
    if (!response.ok) throw new Error('Failed to save')
    // Refetch client data
    window.location.reload() // Simple approach; can optimize later
  } catch (err) {
    console.error('Error saving client:', err)
    alert('Failed to save changes')
  } finally {
    setSaving(false)
  }
}

async function handleQcConfigSave(configData: any) {
  try {
    const response = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        certificate_pattern: configData.certificatePattern,
        certificate_validity_months: configData.certificateValidityEnabled ? configData.certificateValidityMonths : null,
        pricing_model: configData.pricingModel,
        price_per_sample: configData.pricePerSample,
        price_per_pound_cents: configData.pricePerPoundCents,
        currency: configData.currency,
        billing_basis: configData.billingBasis,
        payment_terms: configData.paymentTerms,
        fee_payer: configData.feePayer,
        billing_notes: configData.billingNotes,
        is_qc_client: true,
      }),
    })
    if (!response.ok) throw new Error('Failed to save QC config')
    setQcDialogOpen(false)
    window.location.reload()
  } catch (err) {
    console.error('Error saving QC config:', err)
    alert('Failed to save QC configuration')
  }
}
```

- [ ] **Step 7: Add Save/Cancel bar for edit mode**

Add a sticky bar at the top when editing:

```tsx
{isEditing && (
  <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-background border-b shadow-sm">
    <span className="text-sm font-medium">Editing client information</span>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
        Cancel
      </Button>
      <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 8: Make header fields editable in edit mode**

Wrap the header content in conditional rendering. When `isEditing` is true, render input fields instead of static text. For example, the company name:

```tsx
{isEditing ? (
  <Input
    value={editFormData.fantasy_name}
    onChange={(e) => setEditFormData({ ...editFormData, fantasy_name: e.target.value })}
    className="text-2xl font-semibold h-auto py-0 border-0 border-b rounded-none px-0"
  />
) : (
  <CardTitle className="text-2xl">{client.fantasy_name || client.company}</CardTitle>
)}
```

Apply this pattern for: name, company, fantasy_name, email, phone, address, city, state, country, VAT, client_types (multi-checkbox).

- [ ] **Step 9: Commit**

```bash
git add src/components/clients/client-detail-view.tsx
git commit -m "feat: remove Overview tab, add interactive QC badge and inline edit mode"
```

---

### Task 6: Enhance `QcConfigPanel` — add multi-origin pricing and lab sequences

**Files:**
- Modify: `src/components/clients/qc-config-panel.tsx`
- Reference: `src/components/clients/client-form.tsx` (lines 700-840 for multi-origin pricing)

- [ ] **Step 1: Verify what QcConfigPanel already has**

The panel already has: pricing model, price, currency, billing basis, payment terms, fee payer, billing notes, certificate pattern (quality code, origin code, sequence padding, starting sequence, year format), certificate validity period, and logo upload.

- [ ] **Step 2: Add multi-origin pricing support**

Add to `QcConfigData`:

```typescript
hasOriginPricing: boolean
```

Add state and UI for origin-specific pricing tiers. Replicate the existing multi-origin pricing UI from `client-form.tsx` (the "+ Add Origin" button with per-origin cards showing origin dropdown, pricing model, price, currency, billing basis, payment terms). Fetch existing tiers from `/api/client-origin-pricing?client_id=${clientId}` and save via the same endpoint.

- [ ] **Step 3: Add lab-specific starting sequences section**

Below the certificate pattern section, add a "Laboratory-Specific Starting Sequences" section. Fetch labs and existing sequences from `/api/client-lab-sequences?client_id=${clientId}`. Display each lab with starting sequence number and notes inputs, similar to the current layout in `client-form.tsx`.

- [ ] **Step 4: Ensure Complimentary pricing hides fee fields**

When `pricingModel === 'complimentary'`, hide/disable: price input, currency select. Keep billing basis, payment terms, and fee payer visible.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/qc-config-panel.tsx
git commit -m "feat: add multi-origin pricing and lab sequences to QC config dialog"
```

---

### Task 7: Create merged `ClientMetricsTab` component

**Files:**
- Create: `src/components/clients/client-metrics-tab.tsx`
- Reference: `src/components/clients/client-detail-view.tsx` (MetricsTab function, lines 467-545)
- Reference: `src/components/clients/client-analytics-dashboard.tsx`
- Reference: `src/components/metrics/supply-chain-sankey.tsx`

- [ ] **Step 1: Create the component file with KPI cards**

Create `src/components/clients/client-metrics-tab.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'
import { SupplyChainSankey } from '@/components/metrics/supply-chain-sankey'

interface ClientMetricsTabProps {
  clientId: string
  clientName: string
  sampleMetrics: {
    total: number
    received: number
    in_progress: number
    under_review: number
    approved: number
    rejected: number
  }
  samples: any[]
}

export function ClientMetricsTab({ clientId, clientName, sampleMetrics, samples }: ClientMetricsTabProps) {
  // ... component body
}
```

- [ ] **Step 2: Add KPI cards row**

```tsx
<div className="grid grid-cols-3 gap-4">
  <Card>
    <CardContent className="pt-6">
      <p className="text-sm text-muted-foreground">Approval Rate</p>
      <p className="text-2xl font-semibold mt-1">
        {sampleMetrics.total > 0
          ? `${((sampleMetrics.approved / sampleMetrics.total) * 100).toFixed(1)}%`
          : 'N/A'}
      </p>
    </CardContent>
  </Card>
  <Card>
    <CardContent className="pt-6">
      <p className="text-sm text-muted-foreground">Total Samples</p>
      <p className="text-2xl font-semibold mt-1">{sampleMetrics.total}</p>
    </CardContent>
  </Card>
  <Card>
    <CardContent className="pt-6">
      <p className="text-sm text-muted-foreground">Avg Cupping Score</p>
      <p className="text-2xl font-semibold mt-1">--</p>
    </CardContent>
  </Card>
</div>
```

- [ ] **Step 3: Add Sample Status Distribution pie chart**

Move the existing `MetricsTab` pie chart logic into this component (from `client-detail-view.tsx` lines 469-520).

- [ ] **Step 4: Add Samples by Origin bar chart**

Move the existing bar chart logic (from `client-detail-view.tsx` lines 478-542).

- [ ] **Step 5: Add Top Suppliers chart**

Fetch supplier data and display a bar chart showing top suppliers by quantity with approval rate:

```typescript
const [supplierData, setSupplierData] = useState<any[]>([])
const [qualityFilter, setQualityFilter] = useState<string>('all')

useEffect(() => {
  fetchSupplierMetrics()
}, [clientId, qualityFilter])

async function fetchSupplierMetrics() {
  try {
    const url = `/api/clients/${clientId}/supplier-metrics${qualityFilter !== 'all' ? `?quality_id=${qualityFilter}` : ''}`
    const response = await fetch(url)
    if (response.ok) {
      const data = await response.json()
      setSupplierData(data.suppliers || [])
    }
  } catch (err) {
    console.error('Error fetching supplier metrics:', err)
  }
}
```

- [ ] **Step 6: Add Top 3 Defects chart**

```typescript
const [defectData, setDefectData] = useState<any>(null)
const [cropYear, setCropYear] = useState<string>('25/26')

useEffect(() => {
  fetchDefectSummary()
}, [clientId, cropYear])

async function fetchDefectSummary() {
  try {
    const response = await fetch(`/api/clients/${clientId}/defect-summary?crop_year=${cropYear}`)
    if (response.ok) {
      const data = await response.json()
      setDefectData(data)
    }
  } catch (err) {
    console.error('Error fetching defect summary:', err)
  }
}
```

Render as horizontal bar chart.

- [ ] **Step 7: Add conditional Supply Chain Sankey**

Only render when there are 2+ distinct supply chain entities:

```tsx
{hasMultipleEntities && (
  <SupplyChainSankey filters={{ client: clientId }} />
)}
```

Determine `hasMultipleEntities` by checking if samples have at least 2 distinct values across `seller_id`, `exporter_id`, and the client's own role.

- [ ] **Step 8: Commit**

```bash
git add src/components/clients/client-metrics-tab.tsx
git commit -m "feat: create merged ClientMetricsTab with KPIs, suppliers, defects, Sankey"
```

---

### Task 8: Create API endpoints for metrics data

**Files:**
- Create: `src/app/api/clients/[id]/supplier-metrics/route.ts`
- Create: `src/app/api/clients/[id]/defect-summary/route.ts`

- [ ] **Step 1: Create supplier-metrics endpoint**

`GET /api/clients/[id]/supplier-metrics?quality_id=<optional>`

Query: Join `samples` with `exporters` table (via `seller_id` FK), filter by `client_id`, group by supplier, count samples and calculate approval rate.

```typescript
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const qualityId = request.nextUrl.searchParams.get('quality_id')

  let query = supabase
    .from('samples')
    .select('id, status, seller:exporters!samples_seller_id_fkey(id, name)')
    .eq('client_id', id)

  if (qualityId) query = query.eq('quality_id', qualityId)

  const { data: samples } = await query

  // Aggregate by supplier
  const supplierMap = new Map()
  for (const sample of samples || []) {
    const sellerName = sample.seller?.name || 'Unknown'
    const entry = supplierMap.get(sellerName) || { name: sellerName, total: 0, approved: 0 }
    entry.total++
    if (sample.status === 'approved') entry.approved++
    supplierMap.set(sellerName, entry)
  }

  const suppliers = Array.from(supplierMap.values())
    .map(s => ({ ...s, approvalRate: s.total > 0 ? (s.approved / s.total * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return NextResponse.json({ suppliers })
}
```

- [ ] **Step 2: Create defect-summary endpoint**

`GET /api/clients/[id]/defect-summary?crop_year=25/26`

Query: Join `quality_assessments` with `samples`, filter by client and crop year, aggregate defect counts from the `green_analysis` JSON and cupping scores.

```typescript
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cropYear = request.nextUrl.searchParams.get('crop_year')

  // Fetch quality assessments for this client's samples in the given crop year
  let query = supabase
    .from('quality_assessments')
    .select('green_analysis, samples!inner(client_id, crop_year)')
    .eq('samples.client_id', id)

  if (cropYear) query = query.eq('samples.crop_year', cropYear)

  const { data: assessments } = await query

  // Aggregate defect counts from green_analysis JSON
  const defectCounts: Record<string, number> = {}
  for (const assessment of assessments || []) {
    const ga = assessment.green_analysis as any
    if (!ga) continue
    // Extract defect fields — adjust based on actual JSON structure
    if (ga.quakers) defectCounts['Quakers'] = (defectCounts['Quakers'] || 0) + ga.quakers
    if (ga.broca) defectCounts['Broca'] = (defectCounts['Broca'] || 0) + ga.broca
    if (ga.green_beans) defectCounts['Green Beans'] = (defectCounts['Green Beans'] || 0) + ga.green_beans
    if (ga.fermented) defectCounts['Fermented'] = (defectCounts['Fermented'] || 0) + ga.fermented
  }

  const grading_defects = Object.entries(defectCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  // TODO: Add cupping defects (rioy, riado) from cupping_scores table
  const cupping_defects: any[] = []

  return NextResponse.json({ grading_defects, cupping_defects })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/\[id\]/supplier-metrics/ src/app/api/clients/\[id\]/defect-summary/
git commit -m "feat: add supplier-metrics and defect-summary API endpoints"
```

---

### Task 9: Redirect `/clients/[id]/edit` to `/clients/[id]?edit=true`

**Files:**
- Modify: `src/app/clients/[id]/edit/page.tsx`

- [ ] **Step 1: Replace the edit page with a redirect**

```typescript
import { redirect } from 'next/navigation'

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/clients/${id}?edit=true`)
}
```

This preserves existing bookmarks/links while routing to the new inline edit mode.

- [ ] **Step 2: Commit**

```bash
git add src/app/clients/\[id\]/edit/page.tsx
git commit -m "feat: redirect /clients/[id]/edit to inline edit mode"
```

---

### Task 10: Remove stale components and clean up

**Files:**
- Modify: `src/components/clients/client-detail-view.tsx`

- [ ] **Step 1: Remove the old `MetricsTab` function**

Delete the inline `MetricsTab` function from `client-detail-view.tsx` (lines ~467-545) since it's now replaced by `ClientMetricsTab`.

- [ ] **Step 2: Remove the old `QualitySpecsTab` function**

Delete the inline `QualitySpecsTab` function (lines ~428-465) — it was unused (the actual rendering uses `ClientQualityManager`).

- [ ] **Step 3: Remove unused `StatsCard` function**

Delete the `StatsCard` function (lines ~273-289) — it's not used in the current layout.

- [ ] **Step 4: Clean up unused imports**

Remove imports that are no longer needed after the Overview tab removal (e.g., chart imports if they moved to the metrics tab component).

- [ ] **Step 5: Verify the page renders correctly**

Run the dev server and navigate to a client page. Verify:
- Quality Specs is the default tab
- Overview tab is gone
- QC badge is clickable and opens the dialog
- Edit button toggles inline edit mode with Save/Cancel bar
- Description column shows in the quality specs table
- Code column only shows when certificate pattern has quality codes enabled
- Clicking a quality name opens the template modal
- Metrics tab renders with KPIs, charts, and Sankey (if applicable)

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/
git commit -m "refactor: remove stale components, clean up client detail view"
```

---

## Dependency Graph

```
Task 1 (DB migration) ──┐
                         ├── Task 2 (API changes) ── Task 3 (Table UI) ── Task 4 (Template modal)
                         │
Task 5 (Page refactor) ──┤
                         │
Task 6 (QC panel) ───────┘

Task 7 (Metrics tab) ── Task 8 (Metrics APIs)

Task 9 (Edit redirect) — independent

Task 10 (Cleanup) — depends on all above
```

Tasks 1, 5, 6, 7, 8, 9 can be worked in parallel where they don't touch the same files. Task 10 is the final cleanup pass.

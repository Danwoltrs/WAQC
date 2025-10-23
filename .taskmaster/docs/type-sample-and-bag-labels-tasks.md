# Type Sample Prefix & Bag Label Implementation Tasks

## Context
Migration 061 completed - database schema ready with:
- `laboratories.type_sample_prefix` field
- `samples.hide_exporter_on_label` field
- Updated `generate_tracking_number()` function with lab prefix support

## Remaining Tasks

### 1. Laboratory Edit UI - Type Sample Prefix
**File**: `src/components/laboratories/laboratory-form.tsx` or similar
- Add input field for `type_sample_prefix`
- Validation: 2-5 characters, alphanumeric with optional dash
- Example: "WA-", "GT-", "SANTOS"
- Show preview: "WA-00001-25"
- Update laboratory API to handle the new field

### 2. Sample Intake Form - Hide Exporter Checkbox
**File**: `src/components/samples/intake/basic-info-step.tsx`
- Add checkbox "Hide exporter name on labels"
- Show only when `sample_type === 'type'`
- Save to `samples.hide_exporter_on_label`
- Update samples POST API to accept this field

### 3. Update Sample Creation API
**File**: `src/app/api/samples/route.ts`
- Pass `laboratory_id` to `generate_tracking_number()`
- Pass `sample_type` to `generate_tracking_number()`
- Save `hide_exporter_on_label` from request body
- Ensure tracking numbers for type samples get lab prefix

### 4. Sample Bag Label Component
**File**: `src/components/pdf/sample-bag-label.tsx` (new)

**Layout**: Half or quarter A4 size

**Content**:
```
[Wolthers Logo - Black SVG]

Rua XV de Novembro, 94/96 3' andar
11.010-150 Santos / SP
Fones: (13) 2127-4144 Fax: (13) 3219-1863
CNPJ: 62.298.906/0001-91

PRE-SHIPMENT SAMPLE / SHIPMENT SAMPLE / TYPE SAMPLE

DATE:           [created_at formatted]
SAMPLE:         [tracking_number]
EXPORTER:       [exporter_name] (hide if hide_exporter_on_label = true)
BAGS:           [bag_count]
DESCRIPTION:    [quality description + processing method]

CONTRACT:       [wolthers_contract_nr] (only if exists)
BUYER REFERENCE:[buyer_contract_nr] (only if exists)
EXPORTER REF:   [exporter_contract_nr] (only if exists)
ROASTER REF:    [roaster_contract_nr] (only if exists)
```

### 5. Bag Label API Endpoint
**File**: `src/app/api/samples/[id]/print-bag-label/route.ts` (new)
- GET endpoint for single sample bag label
- Returns PDF using sample-bag-label component
- Respects `hide_exporter_on_label` flag

### 6. Bulk Bag Label Printing
**File**: `src/app/api/samples/bulk/print-bag-labels/route.ts` (new)
- POST endpoint accepting array of sample IDs
- Generates multi-page PDF with all bag labels
- Supports mixed sample types (PSS/SS/Type)
- Each sample respects its own `hide_exporter_on_label` setting

### 7. Sample List UI - Bag Label Actions
**File**: `src/app/samples/page.tsx`
- Add "Print Bag Label" action to single sample menu
- Add bulk selection checkbox
- Add "Print Bag Labels" bulk action button
- Works alongside existing QR label printing

### 8. Regenerate TypeScript Types
```bash
SUPABASE_ACCESS_TOKEN=xxx npx supabase gen types typescript --project-id xxx > src/lib/database.types.ts
```

## Logo File
- Place black Wolthers logo SVG in: `public/wolthers-logo-black.svg`
- Component import: `<Image src="/wolthers-logo-black.svg" ...>`

## Testing Checklist
- [ ] Santos lab configured with "WA-" prefix
- [ ] Create type sample - verify tracking number: "WA-00001-25"
- [ ] Create type sample with hide_exporter checked
- [ ] Print single bag label
- [ ] Print bulk bag labels (mixed PSS/SS/Type samples)
- [ ] Verify contracts only show when they exist
- [ ] Verify exporter hidden when flag is true
- [ ] Test with different labs (Colombia future)

## Dependencies
- Migration 061 applied ✅
- Logo SVG added to public folder (pending)
- TypeScript types regenerated (pending after schema final)

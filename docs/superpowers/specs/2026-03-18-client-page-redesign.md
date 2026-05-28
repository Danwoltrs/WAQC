# Client Page Redesign — Design Spec

## Summary

Redesign the client detail page to eliminate redundancy, consolidate QC/billing/certificate configuration into a clickable dialog, add inline editing, introduce a client-specific quality description field, and merge Basic Metrics + Analytics into a single Metrics tab.

**New tab structure**: Quality Specs (default) | Samples | Metrics

## 1. Page Structure Changes

### Remove Overview Tab

The Overview tab duplicates information already displayed in the header. Remove it entirely.

### New Default Tab

Quality Specs becomes the default tab when landing on a client page.

### Tab Order

1. **Quality Specs** (default)
2. **Samples** (unchanged)
3. **Metrics** (merged Basic Metrics + Analytics)

### Files Affected

- `src/components/clients/client-detail-view.tsx` — tab restructure, header changes, inline edit mode
- `src/components/clients/client-quality-manager.tsx` — Description column, conditional Code column, template modal link
- `src/components/clients/client-form.tsx` — convert to modal, strip QC/cert config
- `src/components/clients/qc-config-panel.tsx` — enhance to be the single QC config entry point
- New: metrics tab component merging existing MetricsTab + ClientAnalyticsDashboard

## 2. Header Redesign

### Current State

- Static "QC Client" badge + "Active" badge
- Edit button navigates to `/clients/[id]/edit` (full page)
- Displays: logo, name, company, email, address, client types, joined date

### New Behavior

#### Interactive QC Badge

Replace the static QC badge with a clickable element:

- **QC client**: Shows `QC Client · 1 USD c/lb` (or `Complimentary`). Click opens QC Config Dialog.
- **Not a QC client**: Shows `Not a QC Client`. Click opens the same QC Config Dialog. Filling in any configuration automatically sets `is_qc_client = true`.

#### Edit Button → Inline Edit Mode

- Click toggles the page into **inline edit mode** (no navigation)
- Header fields become editable inputs: name, company, fantasy name, email, phone, VAT/CNPJ, address fields, client roles (multi-checkbox), logo (upload/change/delete)
- A **Save / Cancel bar** appears at the top of the page (sticky)
- QC/billing/certificate config is NOT part of inline edit — it lives exclusively in the QC Config Dialog
- **Tab switching while editing**: If the user switches tabs while in edit mode, show a confirmation dialog ("You have unsaved changes. Discard?"). Same for clicking the QC badge or navigating away.
- **URL state**: Edit mode is reflected via `?edit=true` query param so it can be deep-linked

### Pricing Model Display

The QC badge shows the pricing summary. Pricing models include:
- **USD c/lb** (or other currency/unit combinations)
- **Per sample** pricing
- **Complimentary** (Wolthers earns on sales, no QC fee charged)

When Complimentary, the badge shows `QC Client · Complimentary`.

## 3. QC Config Dialog

A centered Dialog (modal) that consolidates all QC, billing, and certificate configuration. Opens when clicking the QC badge in the header.

### Left Column — Billing & Pricing

- **Pricing Model** dropdown (USD c/lb, per sample, Complimentary, etc.)
- **Price** input (hidden when Complimentary)
- **Currency** select (USD, EUR, BRL, GBP) (hidden when Complimentary)
- **Billing Basis** select (Approved Only, All Samples, etc.)
- **Payment Terms** input (Net 30, Net 60, etc.)
- **Who Pays the Fee** dropdown (Client Pays, Roaster, etc.)
- **Multi-Origin Pricing** toggle → origin-specific pricing tiers when enabled
- **Billing Notes** textarea

### Right Column — Certificate Pattern

- **Include Quality Code** checkbox → Prefix/Suffix position toggle
- **Include Origin Code** checkbox → Prefix/Suffix position toggle
- **Starting Sequence Number** input
- **Sequence Padding (Digits)** input
- **Year Format** select (YY / YYYY)
- **Certificate Validity Period** toggle → months input when enabled
- **Live Preview** display (e.g., `AD-008900/26`)

### Bottom Section — Lab-Specific Starting Sequences

- List of laboratories with per-lab starting sequence number and notes
- "How it works" explanation text
- Save Configuration / Remove buttons per lab

### Data Source

- `clients` table: pricing fields, `is_qc_client`, `qc_enabled`
- `clients.certificate_pattern`: JSON field for cert pattern config
- `client_lab_sequences` table: lab-specific sequences

### Implementation

Enhance existing `src/components/clients/qc-config-panel.tsx` to include all fields listed above. Currently it already has most of this; ensure Complimentary pricing model is preserved and all fields from the current edit form's QC section are present.

#### Multi-Origin Pricing

The multi-origin pricing feature already exists in `client-form.tsx` using:
- `clients.has_origin_pricing` (boolean) — toggle
- `/api/client-origin-pricing` endpoint — CRUD for origin-specific pricing tiers
- Each tier has: origin, pricing model, price, currency, billing basis, payment terms

Move this entire section from `client-form.tsx` into the QC Config Dialog. When `has_origin_pricing` is enabled, show the origin-specific pricing tiers below the default pricing fields. The "+ Add Origin" button adds a new tier. Each tier card shows origin dropdown, pricing model, price, currency, billing basis, payment terms, and a delete button.

## 4. Quality Specs Table Redesign

### Column Changes

| Column | Status | Notes |
|--------|--------|-------|
| Quality Name | **Keep** | Clickable → opens template detail modal |
| Code | **Keep, conditional** | Only visible when `certificate_pattern.has_quality_code === true` |
| Template | **Remove** | Redundant with Quality Name + Description |
| Description | **New** | Client-specific, truncated, clickable popover to edit |
| Cups | **Keep** | Inline editable (unchanged) |
| Fee | **Keep** | Per-spec fee override via FeePopover (unchanged) |
| Active | **Keep** | Toggle switch (unchanged) |
| Actions | **Keep** | Edit + Delete (unchanged) |

### Description Column

- **New DB field**: `client_qualities.description` (TEXT, nullable)
- **Default value**: Copied from `quality_templates.description` when a quality spec is first assigned to a client
- **Display**: Truncated text in the table row
- **Edit**: Clicking opens a Popover with a textarea input for inline editing
- **Validation**: Strip trailing dots (periods) silently on save — the description concatenates with crop year on certificates (e.g., `, crop 25/26`)
- **Independence**: Editing the client's description does NOT affect the template's description or other clients' descriptions

### Code Column (Conditional)

- **Visibility**: Only shown when `clients.certificate_pattern.has_quality_code === true`
- **Auto-suggestion**: When assigning a new quality spec, auto-suggest a code from the quality name initials (e.g., "Blaser Dulce" → "BD"). User can accept or modify.
- **Constraints**: Free text, max 4 characters. The existing API enforces uniqueness per client (active specs only) — **remove this uniqueness check** since multiple specialty coffees can share the same "SPEC" code.
- **Enforcement**: When `has_quality_code` is enabled in the QC Config Dialog, the dialog saves the pattern change immediately. The quality specs table then shows the Code column with empty codes for existing specs. A banner/warning appears above the table: "Quality codes are enabled but some specs are missing codes." Users fill in codes inline in the table — no blocking gate on the dialog.

### Quality Name Click → Template Modal

Clicking a quality name opens the full template detail modal (Screen Size Requirements, Green Aspect, Roast Aspect, Defect Configuration, Moisture %, Cupping Attributes, Taints and Faults, Clean/Uniform Cups).

**Fix**: The Save/Cancel buttons in this modal must be **fixed to a sticky footer** instead of overlapping content at the bottom.

### Add Quality Spec Dialog

The existing "+ Add" dialog flow is unchanged. Additions:
- Description field is pre-populated from the selected template's description
- Code field shows auto-suggested value from quality name initials
- Both are editable before saving

## 5. Client Edit — Modal Conversion

### Current State

Edit button navigates to `/clients/[id]/edit`, a full-page form with 1861 lines covering everything: basic info, QC config, pricing, certificate patterns, address, lab sequences.

### New Behavior

The inline edit mode on the client page handles basic client info editing. The fields:

- Contact Name, Company Name, Fantasy Name
- Email, Phone, VAT/CNPJ
- Street Address, ZIP/CEP, City, State/Province, Country
- Client Roles (multi-checkbox: Producer, Cooperative, Exporter, Importer, Roaster, Final Importer, End Client)
- Company Logo (upload/change/delete)

Save/Cancel bar at the top of the page.

### What Moves Out

All QC/billing/certificate configuration moves to the QC Config Dialog (Section 3). The inline edit mode does NOT include:
- Pricing Model, Price, Currency, Billing Basis, Payment Terms
- Who Pays the Fee, Billing Notes
- Multi-Origin Pricing tiers
- Certificate Pattern configuration
- Lab-specific starting sequences
- Certificate Validity Period
- QC Client toggle (handled by the QC badge interaction)

### Route Deprecation

The `/clients/[id]/edit` route should redirect to `/clients/[id]?edit=true`. The client detail page reads the `edit` query param on mount and auto-enters inline edit mode if present. This preserves any existing bookmarks or links.

## 6. Metrics Tab (Merged)

Combines the current Basic Metrics tab and Analytics tab into a single Metrics tab.

### Layout

#### Top — KPI Cards

- **Approval Rate** (percentage)
- **Total Samples** (count)
- **Avg Cupping Score** (if available)

#### Middle — Charts

**Top Suppliers** (bar chart):
- Shows quantity + approval rate per supplier (exporter/seller)
- Data: `samples` joined with `exporters` table, filtered by client
- Filterable by quality spec

**Top 3 Defects This Crop Year** (horizontal bar chart):
- Grading defects: quakers, broca, green beans, fermented, etc. (from `quality_assessments.green_analysis` JSON → defect counts)
- Cupping defects: rioy, riado, etc. (from `cupping_scores` → taints/faults fields)
- Crop year selector (e.g., 25/26) — crop year derived from `samples.crop_year` field
- Data: `quality_assessments` joined with `samples` (for client + crop year filter), plus `cupping_scores` for cupping-based defects
- Implementation: Create a new API endpoint `GET /api/clients/[id]/defect-summary?crop_year=25/26` that aggregates defect counts

**Sample Status Distribution** (pie chart):
- Reuses existing MetricsTab pie chart logic
- Status breakdown: approved, rejected, under review, in progress, received

**Samples by Origin** (bar chart):
- Reuses existing MetricsTab bar chart logic
- Top 10 origins by sample count

#### Bottom — Supply Chain Sankey (Conditional)

- Only renders when the client has 2+ distinct supply chain entities in their sample data
- Reuses existing `src/components/metrics/supply-chain-sankey.tsx` with client-specific filtering
- Shows flow: Seller → Exporter/Importer → Roaster
- Node colors indicate approval rates (green >90%, yellow 70-90%, red <70%)

## 7. Database Migration

### New Column

```sql
ALTER TABLE client_qualities
ADD COLUMN description TEXT;
```

### Backfill Existing Data

```sql
UPDATE client_qualities cq
SET description = qt.description
FROM quality_templates qt
WHERE cq.template_id = qt.id
AND cq.description IS NULL;
```

This copies the template description to all existing client quality assignments that don't already have a description.

### Fee Fields on client_qualities

The `client_qualities` table does NOT currently have `fee_price`, `fee_currency`, or `fee_unit` columns in the generated database types (`database.types.ts`). However, the PATCH API route at `src/app/api/client-qualities/[id]/route.ts` includes them in `allowedFields` (line 106), and the `FeePopover` component reads/writes them. This suggests the columns exist in the database but the TypeScript types were not regenerated. **Verify** with `supabase gen types` before proceeding. If the columns are missing from the actual DB, add them:

```sql
ALTER TABLE client_qualities
ADD COLUMN fee_price NUMERIC,
ADD COLUMN fee_currency TEXT,
ADD COLUMN fee_unit TEXT;
```

### cups_per_sample in PATCH allowedFields

The `cups_per_sample` field is used for inline editing in `ClientQualityManager` but is NOT in the PATCH route's `allowedFields` array. Add it:

```
allowedFields = ['template_id', 'custom_parameters', 'custom_name', 'quality_code', 'code_position', 'is_active', 'notes', 'fee_price', 'fee_currency', 'fee_unit', 'cups_per_sample', 'description']
```

### No Other Schema Changes

All other fields already exist:
- `client_qualities.quality_code` (varchar)
- `clients.certificate_pattern` (jsonb)
- `clients.is_qc_client` (boolean)
- `clients` pricing fields (`fee_price`, `fee_currency`, `fee_unit`, `billing_basis`, `payment_terms`, `fee_payer`)
- `clients.has_origin_pricing` (boolean) + `/api/client-origin-pricing` endpoint for origin-specific tiers

## 8. Component Architecture

### New/Modified Components

```
ClientDetailView (modified)
├── ClientHeader (extract from detail view)
│   ├── QC Badge (new interactive element)
│   ├── Edit Mode Toggle
│   └── Inline Edit Fields (conditional)
├── SaveCancelBar (new, sticky top)
├── QcConfigDialog (enhanced from qc-config-panel.tsx)
│   ├── BillingPricingSection
│   ├── CertificatePatternSection
│   └── LabSequencesSection
├── Tabs
│   ├── QualitySpecsTab (modified ClientQualityManager)
│   │   ├── DescriptionPopover (new)
│   │   ├── FeePopover (existing)
│   │   └── TemplateDetailModal (existing, fix footer)
│   ├── SamplesTab (unchanged)
│   └── MetricsTab (new, merged)
│       ├── KpiCards
│       ├── TopSuppliersChart (new)
│       ├── TopDefectsChart (new)
│       ├── SampleStatusPie (existing)
│       ├── SamplesByOriginBar (existing)
│       └── SupplyChainSankey (existing, filtered)
```

### File Size Considerations

- `client-form.tsx` is currently 1861 lines — will be significantly reduced after stripping QC config
- `client-detail-view.tsx` is 589 lines — will grow with inline edit; consider extracting header into its own component to keep under 2000 lines
- New metrics tab component should be its own file

## 9. API Changes

### PATCH /api/client-qualities/[id]

Add `description` to the list of allowed fields for inline updates.

### POST /api/client-qualities

When creating a new client quality assignment, auto-populate `description` from the template's description if not explicitly provided.

### New Endpoint: Defect Summary

`GET /api/clients/[id]/defect-summary?crop_year=25/26`

Returns aggregated defect counts for the client's samples in the given crop year. Response shape:

```json
{
  "grading_defects": [
    { "name": "Quakers", "count": 45 },
    { "name": "Broca", "count": 32 },
    { "name": "Green Beans", "count": 18 }
  ],
  "cupping_defects": [
    { "name": "Rioy", "count": 12 },
    { "name": "Fermented", "count": 8 }
  ]
}
```

### PATCH allowedFields Update

Add `description` and `cups_per_sample` to the `allowedFields` array in `/api/client-qualities/[id]/route.ts`.

### Quality Code Uniqueness

Remove the uniqueness check for `quality_code` per client in the PATCH route (lines 87-102). Multiple specs can share the same code (e.g., "SPEC" for all specialty coffees).

## 10. Edge Cases

1. **Enabling quality codes after specs exist**: When a user enables "Include Quality Code" in the QC Config Dialog, the Code column appears in the quality specs table. All existing specs will show empty codes. The user must fill in codes for all specs. Consider showing a warning in the dialog.

2. **Disabling quality codes**: When unchecked, the Code column disappears. Existing codes are preserved in the database but not displayed.

3. **Template description changes**: If a template's description is updated after a client has their own copy, the client's copy is NOT affected. Each client's description is independent after initial copy.

4. **Non-QC clients viewing quality specs**: The Quality Specs tab should still be visible but may be empty with a prompt to set up QC via the badge.

5. **Complimentary pricing**: When Complimentary is selected, fee-related fields in the QC Config Dialog are hidden/disabled. The Fee column in the quality specs table still shows but may show "-" for all specs.

6. **Sankey chart threshold**: Only render when `COUNT(DISTINCT entities) >= 2` across the supply chain. For single-entity flows, skip the chart entirely.

7. **Unsaved changes guard**: In inline edit mode, navigating away (tab switch, QC badge click, browser back) triggers a confirmation dialog. Clicking Cancel in the save bar discards all changes and exits edit mode.

8. **Quality code removal**: If a user unchecks "Include Quality Code" in the QC Config Dialog, existing codes are preserved in the DB but the Code column hides. Re-enabling shows the preserved codes — no data loss.

# Inline Attribute Editing + Addable Crop-Year / Processing Pickers — Design

**Date:** 2026-06-26
**Status:** Approved (design); pending spec review → plan
**Surface:** the unified cert-editor overlay (`src/components/certificates/cert-editor/`), used by `/certificates`, `/samples/qc`, `/samples/other`.

## Goal

Stop sending the user to a center "Edit details" panel to change one value. Each surfaced value on the sample header — the **attributes line** (Crop · Processing · Certifications) and the **info-strip tiles** (refs, quantity, container/ICO, etc.) — becomes editable **in place**: a pencil appears on hover, clicking opens a small popover anchored at the value with just that field's control. Crop year and Processing become **addable pickers** — a dropdown with a "+ add new" entry; newly added values persist and appear as choices on later samples.

## Locked decisions

1. **Inline edit via hover-pencil + popover** anchored at the value. One reusable wrapper (`InlineEdit`) drives every value. No per-field network call.
2. **Save model unchanged.** Inline editors write into the overlay's single lifted draft (`useCertEditor` → `setSampleField`); the existing **topbar Save** persists everything in one PATCH. The strip/attributes update live as you edit; the dirty indicator + Save behave exactly as today. This preserves the single-save model the cert-editor was rebuilt around — no second save path.
3. **Scope:** attributes line **and** info-strip tiles get inline edit. The full "Edit details" panel **stays**, reachable from a small "Edit all details" button (for the supply-chain parties table and fields not surfaced inline).
4. **Crop year is a picker** of `YY/YY` values. Default options = the **current crop window only** (computed from today: `25/26`, `26/27` as of 2026), newest first. Older crops appear only if they already exist in data or are added via "+ add new". No wide rolling range.
5. **Processing is a picker** seeded by the canonical `PROCESSING_METHODS` constant, with "+ add new".
6. **Addable vocab persists by usage, not a new table.** "+ add new" applies the typed value to the draft; once the sample is saved, that value is part of the **distinct set** read back for everyone. A new read-only endpoint returns the distinct values already saved across samples. No migration.
7. **Quality-lock unchanged** — only grading + cupping freeze 7 days post-cert; all these metadata fields stay editable (see `[[master-cupper-edit-permissions]]` / `LOCK_SENSITIVE_FIELDS` is empty).
8. **No emojis; lucide icons only.** Inter font, existing palette, light + dark.

## Components / architecture

### `InlineEdit` (new — `inline-edit.tsx`)
A wrapper around any displayed value.
- Renders the value + a `Pencil` icon that is `opacity-0` until `group-hover`/focus.
- Click on the value (or pencil) opens a shadcn `Popover` anchored at the trigger.
- Popover content is the field editor, supplied by the caller (render prop / children).
- Editors apply changes immediately to the draft via the passed `onChange`; the popover closes on select / Enter / outside-click. Multi-value editors (certifications) stay open while toggling and close on outside-click.
- Read-only when a `disabled` prop is set (not used now, but kept for future quality-lock reuse).
- Props: `{ label?, value (display node), disabled?, children: (close) => ReactNode }`.

### `AddableSelect` (new — `addable-select.tsx`)
Generic dropdown powering both Crop year and Processing (DRY — they differ only in base options + label).
- Props: `{ value: string, options: string[], onChange: (v: string) => void, placeholder?: string, addLabel?: string }`.
- Renders options (current value always present even if non-standard), plus a sticky **"+ add new"** row that reveals a small text input; submitting it selects the typed value (`onChange`) and adds it to the visible options for the session.
- Built on `command.tsx` inside the popover (searchable), or `select.tsx` + an add-row — implementer picks the cleaner fit; behavior is what matters.

### `crop-year-field.tsx` / `processing-field.tsx` (new, thin)
Thin wrappers over `AddableSelect`:
- **Crop year:** base options = current window computed from `new Date()` (`${YY-1}/${YY}`, `${YY}/${YY+1}`), newest first; merged with `vocab.crop_years` (distinct from data) and the current value. `addLabel="Add crop year"`.
- **Processing:** base options = `PROCESSING_METHODS`; merged with `vocab.processing_methods` and the current value. `addLabel="Add processing method"`.
Merge order: base → distinct-from-data → current value, deduped, preserving a stable order (base first, then extras alphabetically; current value appended if still missing).

### Vocabularies endpoint (new — `src/app/api/samples/vocabularies/route.ts`)
`GET /api/samples/vocabularies` → `{ processing_methods: string[], crop_years: string[] }`.
- Auth-gated (same preamble as sibling sample routes; 401 if no user).
- Selects the `processing_method` and `crop_year` columns across `samples`, filters null/blank, dedupes in JS, returns sorted arrays. Cardinality is tiny (a handful of distinct values); one column scan is acceptable. Note as a possible later optimization (RPC) if it ever matters.

### `use-sample-vocabularies.ts` (new, small hook)
Fetches the endpoint once when the overlay opens; returns `{ processing_methods, crop_years }` (empty arrays until loaded). Failure is non-fatal — pickers fall back to base options only.

## Wiring (modified files)

### `info-strip.tsx`
- **`AttributesLine`** → each of Crop / Processing / Certifications wrapped in `InlineEdit`:
  - Crop → `<CropYearField>` (in popover)
  - Processing → `<ProcessingField>` (in popover)
  - Certifications → existing `CertificationsField` (in popover; stays open while toggling)
- **`InfoStripBand`** tiles → each tile that maps to a single editable column becomes inline-editable (Wolthers ref → `wolthers_contract_nr`, Seller ref → its field, Container → `container_nr`, ICO → `ico_number`, Exporter sample # → `exporter_sample_number`, Bag type → `bag_type` select). The **Quantity** tile (derived from `bag_count × bag_weight_kg`) opens a small 2-field popover editing both; the tile keeps showing the computed value.
- Add a small ghost **"Edit all details"** button (opens the existing panel via the retained `onEdit`).
- Editors call a passed `onFieldChange(field, value)` that updates the lifted draft.

### `certificate-edit-overlay.tsx`
- Fetch vocab via `use-sample-vocabularies`; pass `vocab` + `onFieldChange={ed.setSampleField}` (and `draftSample={ed.draft.sample}`) into `InfoStripBand` / `AttributesLine`.
- Keep `onEdit={() => setPanel('details')}` wired to the new "Edit all details" button (not to the whole strip/attributes click).

## Save / data flow

`InlineEdit` editor → `onFieldChange(field, value)` → `ed.setSampleField` updates `draft.sample` → strip/attributes re-render from draft (live) → dirty flag set → user clicks topbar **Save** → existing single PATCH to `/api/samples/[id]` persists. New crop/processing values land in `samples.crop_year` / `samples.processing_method`; the next overlay open reads them back via the vocab endpoint's distinct set ("always shown later").

## Out of scope

- A curated vocab admin table / pre-use persistence (a typed value persists only once a sample saves — matches "saved and always shown later").
- Inline-editing the supply-chain parties table (stays in the full panel).
- Per-origin crop-year boundaries (current window is a simple calendar formula; "+ add new" covers anything else).
- Quality-lock changes (already settled).

## Files

- **New** `inline-edit.tsx`, `addable-select.tsx`, `crop-year-field.tsx`, `processing-field.tsx`, `use-sample-vocabularies.ts`
- **New** `src/app/api/samples/vocabularies/route.ts`
- **Modify** `info-strip.tsx` (AttributesLine + InfoStripBand inline-editable + "Edit all details" button), `certificate-edit-overlay.tsx` (vocab fetch + prop wiring)
- No migration; no PATCH allowlist change (all fields already accepted).

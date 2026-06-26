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
4. **Crop year is an auto-generated picker** of `YY/YY` values — **no "+ add new"**. The list **advances every May**: the latest crop year is `${S}/${S+1}` where `S = (month >= May) ? currentYear : currentYear - 1`. So from May 2026 onward the latest is `26/27` (the crop physically starting July 2026); before May 2026 it was `25/26`. The picker shows the latest plus the **previous three** crops (newest first, e.g. `26/27, 25/26, 24/25, 23/24`), and **always includes the sample's stored value** even if older. Span is adjustable but intentionally short.
5. **Processing is a picker** seeded by the canonical `PROCESSING_METHODS` constant, **with "+ add new"** (crop year has none).
6. **New processing values persist by usage, not a new table.** "+ add new" applies the typed value to the draft; once the sample is saved, that value is part of the **distinct set** read back for everyone. A read-only endpoint returns the distinct `processing_method` values already saved across samples. No migration. (Crop year needs no such endpoint — it is purely date-generated + the sample's own value.)
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
Generic dropdown powering both Crop year and Processing (DRY).
- Props: `{ value, options: string[], onChange: (v: string) => void, placeholder?, allowAdd?: boolean, addLabel?: string }`.
- Renders options (current value always present even if non-standard). When `allowAdd` (Processing), a sticky **"+ add new"** row reveals a small text input; submitting selects the typed value (`onChange`) and adds it to the visible options for the session. When `allowAdd` is false (Crop year), no add row.
- Built on `command.tsx` inside the popover (searchable) or `select.tsx` + an add-row — implementer picks the cleaner fit; behavior is what matters.

### `crop-year-field.tsx` (new, thin)
Wrapper over `AddableSelect` with `allowAdd={false}`. Options are **date-generated**: `S = (new Date().getMonth() >= 4 /* May */) ? year : year - 1`; emit `${pad(S%100)}/${pad((S+1)%100)}` for `S` down to `S-3` (newest first); append the sample's current value if not already present. No vocab fetch.

### `processing-field.tsx` (new, thin)
Wrapper over `AddableSelect` with `allowAdd`, `addLabel="Add processing method"`. Options = `PROCESSING_METHODS` → merged with `vocab.processing_methods` (distinct from data) → current value, deduped (canonical first, then extras alphabetically, current value appended if missing).

### Vocabularies endpoint (new — `src/app/api/samples/vocabularies/route.ts`)
`GET /api/samples/vocabularies` → `{ processing_methods: string[] }`.
- Auth-gated (same preamble as sibling sample routes; 401 if no user).
- Selects the `processing_method` column across `samples`, filters null/blank, dedupes in JS, returns a sorted array. Cardinality is tiny; one column scan is acceptable. (Crop year is not included — it is date-generated.)

### `use-sample-vocabularies.ts` (new, small hook)
Fetches the endpoint once when the overlay opens; returns `{ processing_methods }` (empty until loaded). Failure is non-fatal — Processing falls back to canonical options only.

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

`InlineEdit` editor → `onFieldChange(field, value)` → `ed.setSampleField` updates `draft.sample` → strip/attributes re-render from draft (live) → dirty flag set → user clicks topbar **Save** → existing single PATCH to `/api/samples/[id]` persists. New **processing** values land in `samples.processing_method` and are read back as choices via the vocab endpoint's distinct set ("always shown later"). **Crop** values land in `samples.crop_year`; the date-generated picker plus the sample's own stored value keep them selectable.

## Out of scope

- A curated vocab admin table / pre-use persistence (a new processing value persists only once a sample saves — matches "saved and always shown later").
- Inline-editing the supply-chain parties table (stays in the full panel).
- Per-origin crop-year boundaries (the May switch is a simple calendar formula; an unusually old crop is covered by always including the sample's stored value).
- Quality-lock changes (already settled).

## Files

- **New** `inline-edit.tsx`, `addable-select.tsx`, `crop-year-field.tsx`, `processing-field.tsx`, `use-sample-vocabularies.ts`
- **New** `src/app/api/samples/vocabularies/route.ts`
- **Modify** `info-strip.tsx` (AttributesLine + InfoStripBand inline-editable + "Edit all details" button), `certificate-edit-overlay.tsx` (vocab fetch + prop wiring)
- No migration; no PATCH allowlist change (all fields already accepted).

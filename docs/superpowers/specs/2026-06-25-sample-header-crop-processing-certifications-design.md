# Complete Sample Editing + Crop/Processing/Certifications in the Header — Design

**Date:** 2026-06-25
**Status:** Spec under review (broadened per quality-team feedback)
**Builds on:** the unified `SampleDetailOverlay` (`src/components/certificates/cert-editor/`)

## Problem

Two related gaps on the unified sample view:

1. **Not everything is editable.** The quality team wants to edit the *whole* sample after intake — both what they entered and **fields they left blank** at intake. Today the overlay's "Edit details" panel covers only a subset; notably **Container** and **ICO #** (editable in the old modal) are a regression, and **crop year** / **certifications** were never editable.
2. **Header ergonomics.** The info-strip tiles are too tall, and crop / processing / certifications aren't surfaced in the header at all.

## Goal

1. **Compact the info strip** (~half its height).
2. Add a **compact attributes line below the strip** showing Crop, Processing, Certifications, clickable to edit.
3. **Complete the "Edit details" panel** so every PATCH-supported commodity / logistics / quantity / party field is editable, rendering each field even when blank so it can be filled in later.
4. **Certifications pull from sys** (the linked contract) with manual override.

**No database migration** for the in-scope fields — all already exist on `samples` and are in the `/api/samples/[id]` PATCH `allowedFields`. Certifications already render on the certificate PDF (`CertificateQualityDescription`).

## Editable-field inventory

The PATCH route (`src/app/api/samples/[id]/route.ts`) `allowedFields` is the source of truth for what can be saved. Mapping it to the edit UI:

| Field | In PATCH allowlist | Editable today | Action |
| --- | --- | --- | --- |
| sample_type, origin, micro_origin, quality_spec_id, processing_method | ✅ | ✅ (panel) | keep; processing → dropdown |
| exporter_sample_number, storage_position | ✅ | ✅ (panel) | keep |
| bag_count, bag_weight_kg, bag_type | ✅ | ✅ (panel) | keep |
| seller/shipper/importer/roaster/qc/end_client ids + their `_contract_nr`, same_seller_shipper, importer_is_qc_client | ✅ | ✅ (`SupplyChainEditTable`) | keep |
| **crop_year** | ✅ | ❌ | **add** (text input) |
| **certifications** | ✅ | ❌ | **add** (pull-from-contract + chips) |
| **container_nr** | ✅ | ❌ (regression) | **add** (text input) |
| **ico_number** | ✅ | ❌ (regression) | **add** (text input) |
| **shipment_month** | ✅ | ❌ | **add** (month input, `YYYY-MM`) |
| **wolthers_contract_nr** | ✅ | ❌ (read-only in strip) | **add** (text input; also feeds the cert pull) — *verify it isn't already edited inside `SupplyChainEditTable` first, to avoid a duplicate control* |
| **supplier** (farm/coop name) | ✅ | partial | **add** (text input) |

**Out of scope (would need an API allowlist addition + extra UI — flagged for a follow-up if wanted):** `awb_number`, `courier_name`, `is_quick_look` (Other-sample logistics), `notes`, `arrival_date`, `hide_exporter_on_label`, `linked_pss_sample_id`. Quality data (defects / screen / physical / cupping) is already editable via the quadrant cards.

## Design

### 1. Compact info strip (`info-strip.tsx` → `InfoStripBand`)

Each tile renders label + value **+ a permanently-reserved `opacity-0` "Edit" hint line** with `py-3` — that hidden line reserves the extra height. Remove the per-tile hint line (hover background remains the affordance; the whole strip already opens the edit panel) and tighten `py-3 → py-2`. Tile height roughly halves. Tile content unchanged.

### 2. New attributes line (`info-strip.tsx` → new `AttributesLine`, rendered by the overlay right after `InfoStripBand`)

A thin band, `border-b border-border px-4 py-2`, clickable (`onEdit → setPanel('details')`), reading **draft-first** so it updates live:

```
CROP 25/26  ·  PROCESSING Natural  ·  [Rainforest Alliance] [Organic] [EUDR]
```

Crop / Processing as small uppercase label + value (`—` when blank); certifications as `Badge variant="outline"` per cert ("No certifications" muted when empty).

### 3. Complete the "Edit details" panel (`info-strip.tsx` → `DetailsEditPanel`)

Organize into clear groups; every field renders as an input even when its current value is blank:

- **Commodity:** sample type, origin, micro origin, quality, **processing (dropdown from `PROCESSING_METHODS`)**, **crop year (text)**, **certifications (sub-component, see §4)**, exporter sample #, **supplier (text)**.
- **Logistics:** **container # (text)**, **ICO # (text)**, **shipment month (`type="month"` → `YYYY-MM`)**, warehouse location, **Wolthers contract # (text)**.
- **Quantity:** bag count, bag weight, bag type (existing).
- **Supply chain / parties:** existing `SupplyChainEditTable`.

To keep the file focused, extract the certifications editor into its own small component (`certifications-field.tsx`) and, if `DetailsEditPanel` approaches the size ceiling, the panel's commodity/logistics field group into a sibling file.

### 4. Certifications editor (`certifications-field.tsx`)

- **"Pull from contract"** button → `GET /api/samples/[id]/contract-certifications` → sets `form.certifications` to the returned normalized list (toast when no linked contract / none found).
- Canonical `CERTIFICATIONS` (from intake constants) as toggle chips (selected = present in `form.certifications`).
- Any non-canonical certs already present shown as removable chips.
- Free-text "add custom" input + Add.
- Behavior: **pull populates, manual edits override before Save.**

### 5. Data wiring (`use-cert-editor.ts`)

- `COMMERCIAL_FIELDS += 'crop_year', 'certifications', 'shipment_month', 'supplier'` (most logistics fields — `container_nr`, `ico_number`, `wolthers_contract_nr` — are already in `COMMERCIAL_FIELDS`).
- `CertSample += crop_year?: string; certifications?: string[]; shipment_month?: string; supplier?: string`.
- Array dirty-tracking + PATCH diff already use `JSON.stringify`, so `certifications` round-trips correctly.

### 6. "Pull from contract" endpoint

New `GET /api/samples/[id]/contract-certifications`:
- Auth like sibling sample routes; load the sample's `wolthers_contract_nr`.
- Resolve `contracts` by `contract_number = wolthers_contract_nr` (not unique → take the **union** of certifications across matches).
- Normalize via a helper **extracted from `contract-intake-mapping.ts`** — export `normalizeCertifications(raw: unknown): string[]` (the `certMap` + `knownCerts` logic) and reuse it in both the intake mapping and this endpoint (DRY).
- Return `{ certifications: string[], contract_number: string | null, matched: boolean }`.

## Testing

- Unit-test `normalizeCertifications` (codes → canonical, dedupe, non-array → `[]`).
- `tsc` clean; existing vitest suite green.
- Manual smoke: strip is shorter; attributes line shows crop/processing/cert badges; open the panel and confirm a **blank** sample can have container/ICO/crop/shipment-month/certifications filled and saved (verify by reopening); "Pull from contract" loads certs when the Wolthers contract # matches a sys contract; certs appear on the regenerated cert PDF.

## Non-goals

- No DB migration; no intake changes.
- No editing of the out-of-scope fields listed above (separate follow-up if the team wants AWB/courier/notes/etc. — each needs an allowlist entry).
- No change to certificate-PDF cert rendering.

## Open items (confirm at plan time)

- Whether "supplier" and "shipment month" are worth surfacing in the compact attributes line too, or only in the panel (default: panel only).
- Whether processing should also pull from the contract (contract has `quality_description`, not a clean processing field → processing stays manual).

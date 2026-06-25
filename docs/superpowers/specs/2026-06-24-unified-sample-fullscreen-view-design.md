# Unified Fullscreen Sample View — Design

**Date:** 2026-06-24
**Status:** Approved (design); pending implementation plan
**Author:** Daniel + Claude

## Problem

Clicking a sample on `/samples` opens the old `SampleDetailModal` (`src/components/samples/sample-detail-modal.tsx`, 1,439 lines) — a cramped dialog. We just shipped a much nicer fullscreen quadrant view for editing certificates (`src/components/certificates/cert-editor/`). The two views show largely the same sample, so they should be the **same component**. This spec unifies them.

## Goal

One fullscreen, quadrant-based sample view in the cert-editor's visual language, used by **every** entry point:

- `/certificates` (already uses it)
- `/samples/qc` — row click opens it instead of `SampleDetailModal`
- `/samples/other` — same, with the quality quadrants hidden

After parity is verified, the old `SampleDetailModal` is deleted.

No database migration. `tsc` and the existing vitest suite must stay green.

## Approach: promote the cert editor into a shared view

The cert editor (`CertificateEditOverlay`) is already a load-by-`sampleId` fullscreen view, and its "Edit details" panel already reuses the same `SupplyChainEditTable` the modal uses. We generalize it rather than rebuild.

- Rename the public component to `SampleDetailOverlay`, keeping a `CertificateEditOverlay` re-export alias so existing imports don't break.
- Keep the `cert-editor/` directory to minimize churn (it is now "the shared sample view").
- Keep files small (project rule: ~2,000 line ceiling) by splitting new concerns into their own files:
  - `sample-actions.tsx` — the `⋯` menu + its sub-dialogs
  - `use-sample-actions.ts` — ported action handlers/state
  - `other-sections.tsx` — AWB/courier card + recipients panel for Other samples

## Layout

```
┌─ topbar ───────────────────────────────────────────────────────────┐
│ SAN-00111/26 [Approved][SS]    location A1-B2  [⋯][Cancel][Save]     │
│ Brazil · Sul de Minas · Dunkin · Created 24/06/2026                  │
├─ info strip — click any tile → "Edit details" panel ────────────────┤
│ WOLTHERS REF │ SELLER REF │ QUANTITY  │ BAG TYPE │ CONTAINER │ ICO # │
├─────────────────────────────────────────────────────────────────────┤
│  ┌ Defects ──────────┐   ┌ Screen distribution ┐                     │
│  ┌ Taints/faults/phys┐   ┌ Cupping / sensory ──┐                     │
│  │ (moisture/density)│   │ Clean ✓  Uniform ✓  │  ← new              │
│  │                   │   │ (attribute bars)    │                     │
│  ┌ Parties ────────────────────────────────────────────┐             │
│  │ Wolthers / Seller / Importer / End Client / QC + refs │            │
└─────────────────────────────────────────────────────────────────────┘
```

### Topbar
Tracking # + status badge + sample-type chip + storage location + `⋯` actions menu + Cancel + Save changes (with the existing "Unsaved changes" hint). Subtitle line = `origin · micro origin · quality · Created <date>`.

### Info strip (type-aware tiles)
Common tiles: **Wolthers ref, Seller ref, Quantity, Bag type**. Then:
- **SS / stocklot** → **Container**, **ICO #**
- **PSS** → **Exporter sample #**

Every tile opens the existing `DetailsEditPanel` (`info-strip.tsx`), which already edits commodity, quantity, and party fields. Origin, micro origin, and quality appear in the topbar subtitle; those plus processing remain editable through that same panel (processing is not shown in the subtitle to keep it short).

### Parties
The read-only `SupplyChainEditTable` (`src/components/samples/supply-chain-edit-table.tsx`), full-width beneath the quadrants. Clicking its edit affordance opens the same `DetailsEditPanel`.

### Quadrants
Unchanged components (`defects-quadrant.tsx`, `screen-quadrant.tsx`, `physical-quadrant.tsx`, `cupping-quadrant.tsx`), fed by the data `use-cert-editor.ts` already loads (quality assessment + cupping aggregate). No new fetching.

## Quadrant refinements (shared → both /certificates and /samples)

### Cupping/sensory: clean & uniform cup on top
Above the attribute bars in `cupping-quadrant.tsx`, render two status chips — **Clean cup** and **Uniform cup** — driven by the draft's existing `cleanCup` / `uniformCup` fields. Show a check when true, a cross when false, and a neutral "—" when unrecorded (`null`).

### Defects sort
Defects render **primary first, then secondary**, each group ordered **highest count → lowest**. Implemented once as a `sortDefectsForDisplay()` helper in `shared.ts` (reusing the existing `isPrimaryDefect()`), feeding `DefectBarChart` and any defect list. Applies in both the read view and the defects edit panel's preview.

## Actions (`⋯` menu)

Ported 1:1 from the modal footer (`sample-detail-modal.tsx:1170-1225`) with identical gating:

| Action | Condition |
| --- | --- |
| QR Code | always |
| Print Label | always |
| Export | always |
| View Certificate / Download PDF | `certificate_id` present |
| Generate Cert | no cert AND `workflow_stage ∈ {certified, rejected, review}` |
| Send approval email | `status ∈ {approved, rejected}` AND `wolthers_contract_nr` present |
| Delete | `profile.is_global_admin || profile.qc_role === 'global_admin'` |

Their sub-dialogs move with them: QR modal, certificate preview modal (`showCertificateModal`), and the approval-send view (`showApprovalSend`). Handlers to port: `handleShowQrCode`, `handlePrintLabel`, `handleExport`, `handleViewCertificate`, `handleDownloadCertificate`, `handleGenerateCertificate`, `handleDelete`, plus the approval-send trigger.

## Edit entry, sub-contracts, Other samples

- **Edit entry** — `/samples/qc`'s context-menu "Edit" passes `startInEditMode` (`qc/page.tsx:1647-1648`). The overlay maps this to opening the "Edit details" panel immediately on mount.
- **Sub-contracts** (`contractId`) — threaded into the overlay and `use-cert-editor.ts`. When present, the parties table is read-only (`forceReadOnly`) because sub-contract parties are edited in the sub-contract editor; matches `sample-detail-modal.tsx:1116`. Verify against the modal's exact `contractId` behavior during implementation.
- **Other samples** (`sample_category === 'other'`) — hide the quality quadrants; instead render the **AWB / Courier / Quick-Look** card and the **Recipients** panel (`OtherSampleRecipientsPanel`), ported into `other-sections.tsx`. The info strip omits Container/ICO# where not relevant.

## Data sources

`use-cert-editor.ts` already loads sample + quality assessment + cupping aggregate + edit permission + quality options in parallel. Extend its `CertSample` type and select to also carry the fields the actions/Other sections need: `certificate_id`, `workflow_stage`, `status`, `wolthers_contract_nr`, `sample_category`, `awb_number`, `courier_name`, `is_quick_look`, `sample_recipients`, `linked_pss`, `storage_position`.

## Callers to rewire

- `src/app/samples/qc/page.tsx` — import + render swap `SampleDetailModal` → `SampleDetailOverlay`, preserving `sampleId` / `contractId` / `startInEditMode` / `onSampleUpdated` (state at `:186-190`, render at `:2229-2241`).
- `src/app/samples/other/page.tsx` — same swap (`:16`, `:258`).
- `src/app/certificates/page.tsx` — already wired; update to the new name (alias keeps it working regardless).

## Scope / cleanup

1. Build the unified view + new sub-files.
2. Apply the two quadrant refinements.
3. Rewire all three callers.
4. Verify parity: every action works, sub-contract read-only parties, Other-sample sections, edit-mode entry.
5. Delete `sample-detail-modal.tsx`; remove now-unused helpers (e.g. `cupping-grading-section.tsx` if no other caller remains — confirm before deleting).

## Testing

- `tsc` clean; existing vitest suite green.
- Unit test `sortDefectsForDisplay()` (primary-before-secondary, count-descending, ties, empty).
- Manual smoke on a real Dunkin SS sample (e.g. SAN-00111/26): quadrants render, clean/uniform chips correct, defect order correct, every action fires, Other sample shows AWB/recipients with no quadrants, sub-contract parties read-only.

## Non-goals

- No DB schema/migration changes.
- No change to what data is computed — only how it's presented and which component presents it.
- No redesign of the quadrant internals beyond the two named refinements.

## Open items (confirm during implementation)

- Exact `contractId` behavior in the old modal beyond locking parties (does it change the displayed tracking number for sub-contracts?).
- Whether `cupping-grading-section.tsx` has any remaining caller after the modal is removed.

# Unified Fullscreen Sample View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make clicking any sample (on `/samples/qc`, `/samples/other`, and `/certificates`) open one shared fullscreen quadrant view — the cert editor promoted into a `SampleDetailOverlay` — and retire the old `SampleDetailModal`.

**Architecture:** The cert editor (`src/components/certificates/cert-editor/`) is already a load-by-`sampleId` fullscreen overlay whose "Edit details" panel reuses the same `SupplyChainEditTable` the modal uses. We generalize it: widen its data hook, rename its export, add a type-aware info strip, a read-only parties card, a `⋯` actions menu (ported from the modal), and an "Other sample" mode. Then we point all three callers at it and delete the modal. Two quality-quadrant refinements (clean/uniform cup chips; primary→secondary, count-desc defect sort) land in the shared quadrant components so both `/certificates` and `/samples` get them.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Recharts, Vitest (jsdom). Supabase backend (no schema change here).

## Global Constraints

- Font **Inter**; **no emojis in the UI** — use lucide-react icons for any glyph.
- Chart palette (hardcoded hex, already in `shared.ts`): `#556b2f`, `#a9a454`, `#efe4d4`, `#b07946`, `#445763`, `#151618`; validation green `#22c55e`, red `#ef4444`.
- Cards: `rounded-2xl` (20px), `p-5`/`p-6`, subtle `border-border` + `bg-card`/`bg-muted/30`. Support light + dark.
- Keep files under ~2000 lines; new concerns go in their own files (`use-sample-actions.ts`, `sample-actions.tsx`, `other-sections.tsx`).
- **No mock data.** All data comes from the existing `/api/samples/*` and `/api/cupping/*` endpoints.
- Typecheck command: `npx tsc --noEmit`. Test command: `npx vitest run` (single file: `npx vitest run <path>`). There is no `typecheck`/`test:run`-only script besides `npm run test:run` (= `vitest run`).
- Every commit message ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Trunk-based: commit directly to `main`. Do **not** push unless the user asks.
- `/certificates` is in production and must keep working after **every** task (the `CertificateEditOverlay` import keeps resolving via an alias until the final rewire).

---

### Task 1: Defect display sort (primary→secondary, count desc)

**Files:**
- Modify: `src/components/certificates/cert-editor/shared.ts` (add `sortDefectsForDisplay`)
- Modify: `src/components/certificates/cert-editor/charts.tsx:23-27` (apply sort in `DefectBarChart`)
- Test: `src/components/certificates/cert-editor/shared.test.ts` (new)

**Interfaces:**
- Consumes: `DefectDraft` (`{ name: string; count: number }`) and `isPrimaryDefect(name)` from `shared.ts`.
- Produces: `sortDefectsForDisplay(defects: DefectDraft[]): DefectDraft[]` — pure, non-mutating; primary defects first, then secondary, each group by `count` descending.

- [ ] **Step 1: Write the failing test**

Create `src/components/certificates/cert-editor/shared.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sortDefectsForDisplay } from './shared'

describe('sortDefectsForDisplay', () => {
  it('orders primary defects before secondary', () => {
    const out = sortDefectsForDisplay([
      { name: 'Broken', count: 1 },     // secondary
      { name: 'Full Black', count: 1 }, // primary
    ])
    expect(out.map((d) => d.name)).toEqual(['Full Black', 'Broken'])
  })

  it('orders by count descending within a group', () => {
    const out = sortDefectsForDisplay([
      { name: 'Broken', count: 2 },
      { name: 'Bad Formed', count: 9 },
      { name: 'Minor Broca', count: 5 },
    ])
    expect(out.map((d) => d.name)).toEqual(['Bad Formed', 'Minor Broca', 'Broken'])
  })

  it('keeps primary before secondary even when a secondary has a higher count', () => {
    const out = sortDefectsForDisplay([
      { name: 'Broken', count: 50 },   // secondary, high count
      { name: 'Full Sour', count: 1 }, // primary, low count
    ])
    expect(out.map((d) => d.name)).toEqual(['Full Sour', 'Broken'])
  })

  it('does not mutate the input array', () => {
    const input = [{ name: 'Broken', count: 1 }, { name: 'Full Black', count: 1 }]
    const snapshot = JSON.parse(JSON.stringify(input))
    sortDefectsForDisplay(input)
    expect(input).toEqual(snapshot)
  })

  it('returns empty for empty input', () => {
    expect(sortDefectsForDisplay([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/certificates/cert-editor/shared.test.ts`
Expected: FAIL — `sortDefectsForDisplay is not a function` / no export.

- [ ] **Step 3: Implement the helper**

In `src/components/certificates/cert-editor/shared.ts`, immediately after `computeDefectTotals` (around line 97), add:

```ts
/**
 * Display order for defect bars/lists: primary defects first, then secondary,
 * each group ordered by count descending. Pure — never mutates the input.
 */
export function sortDefectsForDisplay(defects: DefectDraft[]): DefectDraft[] {
  return [...defects].sort((a, b) => {
    const ap = isPrimaryDefect(a.name) ? 0 : 1
    const bp = isPrimaryDefect(b.name) ? 0 : 1
    if (ap !== bp) return ap - bp
    const ac = Number.isFinite(a.count) ? a.count : 0
    const bc = Number.isFinite(b.count) ? b.count : 0
    return bc - ac
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/certificates/cert-editor/shared.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Apply the sort in the chart**

In `src/components/certificates/cert-editor/charts.tsx`, update the import on line 6-9 to add `sortDefectsForDisplay`, then change the `data` builder in `DefectBarChart` (lines 24-26) from:

```ts
  const data = defects
    .filter((d) => d.name.trim())
    .map((d) => ({ name: d.name, count: Number(d.count) || 0, primary: isPrimaryDefect(d.name) }))
```

to:

```ts
  const data = sortDefectsForDisplay(defects)
    .filter((d) => d.name.trim())
    .map((d) => ({ name: d.name, count: Number(d.count) || 0, primary: isPrimaryDefect(d.name) }))
```

(Add `sortDefectsForDisplay` to the existing `from './shared'` import.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/certificates/cert-editor/shared.ts src/components/certificates/cert-editor/shared.test.ts src/components/certificates/cert-editor/charts.tsx
git commit -m "feat(cert-editor): sort defect bars primary→secondary, count desc" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Clean & uniform cup chips on the cupping quadrant

**Files:**
- Modify: `src/components/certificates/cert-editor/cupping-quadrant.tsx` (add chips at top of `CuppingQuadrant`)

**Interfaces:**
- Consumes: `draft.cleanCup` / `draft.uniformCup` (`boolean | null`) — already in the `CuppingDraft` Pick on lines 10-13.
- Produces: no new exports; visual only.

- [ ] **Step 1: Add the chip component**

In `src/components/certificates/cert-editor/cupping-quadrant.tsx`, add to the lucide import (top of file) and define a helper above `CuppingQuadrant`:

```tsx
import { Check, X, Minus } from 'lucide-react'

function CupFlag({ label, value }: { label: string; value: boolean | null }) {
  const Icon = value === true ? Check : value === false ? X : Minus
  const cls =
    value === true
      ? 'border-green-500/40 text-green-600 dark:text-green-400'
      : value === false
        ? 'border-red-500/40 text-red-600 dark:text-red-400'
        : 'border-border text-muted-foreground'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
```

- [ ] **Step 2: Render the chips at the top of the quadrant body**

In `CuppingQuadrant`'s return, inside `<QuadrantCard …>` and immediately before `<div className="flex gap-5">` (line 62), insert:

```tsx
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CupFlag label="Clean cup" value={draft.cleanCup} />
        <CupFlag label="Uniform cup" value={draft.uniformCup} />
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke**

Run `npm run dev`, open `/certificates`, click a sample's edit. Confirm the Cupping / sensory card now shows "Clean cup" and "Uniform cup" chips above the attribute bars — green check when true, red X when false, grey dash when unrecorded.

- [ ] **Step 5: Commit**

```bash
git add src/components/certificates/cert-editor/cupping-quadrant.tsx
git commit -m "feat(cert-editor): show clean/uniform cup chips on cupping quadrant" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Generalize the data hook (`CertSample` fields + `contractId`)

**Files:**
- Modify: `src/components/certificates/cert-editor/use-cert-editor.ts` (widen `CertSample`, thread `contractId`)

**Interfaces:**
- Consumes: `/api/samples/[id]?contract_id=<id>` (the same query the modal used at `sample-detail-modal.tsx:277`).
- Produces: `useCertEditor(sampleId, open, contractId?)` — third arg optional; `CertSample` now also exposes `workflow_stage`, `certificate_status`, `certificate_created_at`, `container_nr`, `ico_number`, `sample_category`, `awb_number`, `courier_name`, `is_quick_look`, `linked_pss`, `sample_recipients`.

- [ ] **Step 1: Widen the `CertSample` interface**

In `use-cert-editor.ts`, inside `interface CertSample` (ends at line 59 with `[key: string]: any`), add these fields before the index signature:

```ts
  workflow_stage?: string
  certificate_status?: string | null
  certificate_created_at?: string | null
  wolthers_contract_nr?: string
  seller_contract_nr?: string
  container_nr?: string
  ico_number?: string
  sample_category?: 'qc' | 'other'
  awb_number?: string | null
  courier_name?: string | null
  is_quick_look?: boolean
  linked_pss?: { id: string; tracking_number: string } | null
  sample_recipients?: any[]
```

(If `wolthers_contract_nr` / `seller_contract_nr` already exist, leave the existing line — do not duplicate.)

- [ ] **Step 2: Add the `contractId` parameter**

Change the signature on line 148 from:

```ts
export function useCertEditor(sampleId: string | null, open: boolean): CertEditorState {
```

to:

```ts
export function useCertEditor(sampleId: string | null, open: boolean, contractId?: string | null): CertEditorState {
```

- [ ] **Step 3: Thread `contractId` into the sample fetch + deps**

In the `load` callback, change the sample fetch (line 180) from:

```ts
        fetch(`/api/samples/${id}`),
```

to:

```ts
        fetch(`/api/samples/${id}${contractId ? `?contract_id=${contractId}` : ''}`),
```

Change the `load` dependency array (line 309) from `}, [])` to `}, [contractId])`.
Change the effect dependency array (line 321) from `}, [open, sampleId, reloadKey])` to `}, [open, sampleId, reloadKey, contractId])`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. `/certificates` still calls `useCertEditor(sampleId, open)` (via the overlay) — `contractId` is `undefined`, so the fetch URL is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/certificates/cert-editor/use-cert-editor.ts
git commit -m "feat(cert-editor): widen CertSample + thread contractId into the data hook" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Rename overlay → `SampleDetailOverlay`; add props, storage chip, edit-on-open

**Files:**
- Modify: `src/components/certificates/cert-editor/certificate-edit-overlay.tsx` (rename, props, topbar storage, `startInEditMode`, `onSampleUpdated`)
- Modify: `src/components/certificates/cert-editor/index.ts` (export both names)

**Interfaces:**
- Consumes: `useCertEditor(sampleId, open, contractId)` from Task 3.
- Produces: `SampleDetailOverlay` (+ alias `CertificateEditOverlay`) with props `{ open, sampleId, onOpenChange, onSaved?, onSampleUpdated?, contractId?, startInEditMode? }`. The same `SampleDetailOverlayProps` type is aliased as `CertificateEditOverlayProps`.

- [ ] **Step 1: Rename the props interface and component, add new props**

In `certificate-edit-overlay.tsx`:

Replace the props interface (lines 15-21) with:

```tsx
export interface SampleDetailOverlayProps {
  open: boolean
  sampleId: string | null
  onOpenChange: (open: boolean) => void
  /** Fired after a successful save so the underlying list can refetch in place. */
  onSaved?: () => void
  /** Same as onSaved — the samples pages use this name. Both fire. */
  onSampleUpdated?: () => void
  /** Sub-contract context: when set, parties are read-only and the sample loads with ?contract_id. */
  contractId?: string | null
  /** Open straight into the "Edit details" panel (the samples list's context-menu "Edit"). */
  startInEditMode?: boolean
}
```

Replace the function signature (line 46) with:

```tsx
export function SampleDetailOverlay({ open, sampleId, onOpenChange, onSaved, onSampleUpdated, contractId, startInEditMode }: SampleDetailOverlayProps) {
```

- [ ] **Step 2: Pass `contractId` to the hook**

Change line 48 from:

```tsx
  const ed = useCertEditor(sampleId, open)
```

to:

```tsx
  const ed = useCertEditor(sampleId, open, contractId)
```

- [ ] **Step 3: Open the details panel when `startInEditMode`**

After the existing "reset transient UI" effect (lines 51-54), add:

```tsx
  // The samples list's context-menu "Edit" opens straight into the details editor.
  useEffect(() => {
    if (open && startInEditMode && ed.sample && !ed.loading) setPanel('details')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startInEditMode, ed.sample, ed.loading])
```

- [ ] **Step 4: Fire both save callbacks**

In `handleSave` (lines 72-87), change the success branch from:

```tsx
        onSaved?.()
        onOpenChange(false)
```

to:

```tsx
        onSaved?.()
        onSampleUpdated?.()
        onOpenChange(false)
```

- [ ] **Step 5: Add micro origin to the subtitle, and a storage-location chip to the topbar**

First, add micro origin to the subtitle. Change the subtitle array (lines 110-112) from:

```tsx
              {[sample.origin, sample.quality_name, `Created ${formatDate(sample.created_at)}`]
                .filter(Boolean)
                .join(' · ')}
```

to:

```tsx
              {[sample.origin, sample.micro_origin, sample.quality_name, `Created ${formatDate(sample.created_at)}`]
                .filter(Boolean)
                .join(' · ')}
```

Then add the storage chip. Add `MapPin` to the lucide import (line 6: `import { Loader2, X, Save, MapPin } from 'lucide-react'`). In the topbar's left block, immediately after the closing `</div>` of the badges row (after line 108, before the subtitle block on line 109), insert:

```tsx
          {sample?.storage_position ? (
            <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {sample.storage_position}
            </div>
          ) : null}
```

- [ ] **Step 6: Update the barrel exports**

Replace the entire contents of `src/components/certificates/cert-editor/index.ts` with:

```ts
export { SampleDetailOverlay } from './certificate-edit-overlay'
export { SampleDetailOverlay as CertificateEditOverlay } from './certificate-edit-overlay'
export type { SampleDetailOverlayProps } from './certificate-edit-overlay'
export type { SampleDetailOverlayProps as CertificateEditOverlayProps } from './certificate-edit-overlay'
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. `/certificates/page.tsx` still imports `CertificateEditOverlay` — resolves via the alias.

- [ ] **Step 8: Manual smoke**

`/certificates` still opens the overlay; topbar shows the storage location when present.

- [ ] **Step 9: Commit**

```bash
git add src/components/certificates/cert-editor/certificate-edit-overlay.tsx src/components/certificates/cert-editor/index.ts
git commit -m "refactor(cert-editor): rename to SampleDetailOverlay + add contractId/startInEditMode/onSampleUpdated" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Type-aware info strip (Container/ICO# for SS, Exporter # for PSS)

**Files:**
- Modify: `src/components/certificates/cert-editor/info-strip.tsx:39-48` (`InfoStripBand` tiles)

**Interfaces:**
- Consumes: `sample` / `draftSample` fields `wolthers_contract_nr`, `seller_contract_nr`, `bag_count`/`bags`, `bag_weight_kg`, `bag_type`, `container_nr`, `ico_number`, `exporter_sample_number`, `sample_type`.
- Produces: no signature change; the strip now drops the Importer tile (it moves to the parties card in Task 6) and shows logistics tiles by sample type.

- [ ] **Step 1: Replace the tile list**

In `info-strip.tsx`, replace the `tiles` array (lines 41-48) with:

```tsx
  const isPSS = (sample.sample_type || '').toLowerCase() === 'pss'
  const tiles: { label: string; value: React.ReactNode }[] = [
    { label: 'Wolthers ref', value: draftSample.wolthers_contract_nr || sample.wolthers_contract_nr || '—' },
    { label: 'Seller ref', value: draftSample.seller_contract_nr || sample.seller_contract_nr || '—' },
    { label: 'Quantity', value: bagCount ? `${bagCount} × ${bagWeight ?? '—'} kg` : '—' },
    { label: 'Bag type', value: bagTypeLabel(draftSample.bag_type ?? sample.bag_type) },
  ]
  if (isPSS) {
    tiles.push({ label: 'Exporter sample #', value: draftSample.exporter_sample_number || sample.exporter_sample_number || '—' })
  } else {
    tiles.push({ label: 'Container', value: draftSample.container_nr || sample.container_nr || '—' })
    tiles.push({ label: 'ICO #', value: draftSample.ico_number || sample.ico_number || '—' })
  }
```

(The `bagCount` / `bagWeight` consts on lines 39-40 stay as-is.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke**

On `/certificates`, an SS sample's strip shows Container + ICO #; a PSS sample shows Exporter sample #. Six tiles fill the `lg:grid-cols-6` row for SS; PSS leaves one empty cell (acceptable).

- [ ] **Step 4: Commit**

```bash
git add src/components/certificates/cert-editor/info-strip.tsx
git commit -m "feat(cert-editor): type-aware info strip (container/ICO for SS, exporter # for PSS)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Read-only parties card beneath the quadrants

**Files:**
- Modify: `src/components/certificates/cert-editor/certificate-edit-overlay.tsx` (render `SupplyChainEditTable` below the quadrant grid)

**Interfaces:**
- Consumes: `SupplyChainEditTable` from `@/components/samples/supply-chain-edit-table` — props `{ sample, isEditMode, forceReadOnly?, formData, onFormChange, onEditClick? }` (read-only when `isEditMode` is false or `forceReadOnly` is true).
- Produces: no new exports.

- [ ] **Step 1: Import the parties table**

In `certificate-edit-overlay.tsx`, add near the other imports:

```tsx
import { SupplyChainEditTable } from '@/components/samples/supply-chain-edit-table'
```

- [ ] **Step 2: Render the parties card under the quadrant grid**

In the scrollable region, immediately after the quadrant grid's closing `</div>` (the `<div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">…</div>` block ending at line 175) and still inside `<div className="flex-1 overflow-y-auto p-5">`, add:

```tsx
            <div className="mx-auto mt-5 max-w-6xl">
              <SupplyChainEditTable
                sample={sample as any}
                isEditMode={false}
                forceReadOnly={!!contractId}
                formData={draft.sample}
                onFormChange={() => {}}
                onEditClick={contractId ? undefined : () => setPanel('details')}
              />
            </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke**

On `/certificates`, a read-only parties table (Wolthers / Seller / Importer / End Client / QC Client + contract refs) now appears below the quadrants. Its edit affordance opens the same "Edit details" panel.

- [ ] **Step 5: Commit**

```bash
git add src/components/certificates/cert-editor/certificate-edit-overlay.tsx
git commit -m "feat(cert-editor): read-only parties card below the quadrants" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Actions menu (`⋯`) — ported handlers + dialogs

**Files:**
- Create: `src/components/certificates/cert-editor/use-sample-actions.ts`
- Create: `src/components/certificates/cert-editor/sample-actions.tsx`
- Modify: `src/components/certificates/cert-editor/certificate-edit-overlay.tsx` (mount `<SampleActionsMenu>` in the topbar)

**Interfaces:**
- Consumes: `CertSample`; `/api/samples/[id]/quality-assessment`, `/api/samples/bulk/print-labels`, `/api/samples/[id]/certificate`, `/api/samples/[id]` (DELETE), `/api/certificates?sample_id=`, `/api/certificates/send-email`; `ApprovalSendView({ sampleId, open, onClose, onSent? })`; `trackingNumberToSlug` from `@/lib/utils`.
- Produces: `useSampleActions({ sample, contractId, onSampleUpdated, reload, onClose })` returning state + handlers; `SampleActionsMenu` (the `⋯` dropdown + all its dialogs).

- [ ] **Step 1: Create the actions hook**

Create `src/components/certificates/cert-editor/use-sample-actions.ts`. The handler bodies are ported verbatim from `sample-detail-modal.tsx` (QR `425-512`, print `514-545`, export `547-587`, delete `590-624`, generate `626-653`, download `655-683`, view `685-704`, close-preview `706-713`, send-email `715-756`), with three substitutions: `loadSampleDetails(sample.id)` → `reload()`, `onOpenChange(false)` → `onClose()`, and `sample` is the non-null `CertSample` passed in.

```ts
'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { trackingNumberToSlug } from '@/lib/utils'
import type { CertSample } from './use-cert-editor'

/** Plain-text tracking numbers pass through; legacy JSON tracking numbers unwrap to `.pattern`. */
function parseTrackingNumber(trackingNumber: string): string {
  try {
    if (trackingNumber.startsWith('{')) {
      const parsed = JSON.parse(trackingNumber)
      return parsed.pattern || trackingNumber
    }
    return trackingNumber
  } catch {
    return trackingNumber
  }
}

export function useSampleActions({
  sample,
  contractId,
  onSampleUpdated,
  reload,
  onClose,
}: {
  sample: CertSample
  contractId?: string | null
  onSampleUpdated?: () => void
  reload: () => void
  onClose: () => void
}) {
  const { toast } = useToast()

  // Certificate preview
  const [showCertificateModal, setShowCertificateModal] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  // Email
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState({ exporter: true, importer: true, roaster: true })
  // QR
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [generatingQr, setGeneratingQr] = useState(false)
  // Misc action flags
  const [printingLabel, setPrintingLabel] = useState(false)
  const [downloadingCertificate, setDownloadingCertificate] = useState(false)
  const [generatingCertificate, setGeneratingCertificate] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [showApprovalSend, setShowApprovalSend] = useState(false)

  const handleShowQrCode = async () => {
    setShowQrModal(true)
    setGeneratingQr(true)
    try {
      const QRCode = await import('qrcode')
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
      const certUrl = `${baseUrl}/certificate/${trackingNumberToSlug(sample.tracking_number)}`
      const lines: string[] = [sample.tracking_number]

      const res = await fetch(`/api/samples/${sample.id}/quality-assessment`)
      if (res.ok) {
        const data = await res.json()
        const gb = data.assessment?.green_bean_data
        if (gb) {
          const defects = gb.defects
          const primary = defects?.total_primary ?? defects?.primary ?? null
          const secondary = defects?.total_secondary ?? defects?.secondary ?? null
          const total = defects?.total ?? (primary != null && secondary != null ? primary + secondary : null)
          if (total != null) {
            let defLine = `Def: ${total}`
            if (primary != null && secondary != null) defLine += ` (${primary}p|${secondary}s)`
            lines.push(defLine)
          }
          const screenSizes = gb.screen_sizes as Record<string, number> | undefined
          if (screenSizes) {
            const numbered: Array<{ num: number; pct: number }> = []
            let panPct = 0
            for (const [key, pct] of Object.entries(screenSizes)) {
              if (pct === 0) continue
              if (/^(pan|fundo|bottom)$/i.test(key)) panPct += pct
              else {
                const num = parseInt(key.replace(/\D/g, ''))
                if (!isNaN(num)) numbered.push({ num, pct })
              }
            }
            numbered.sort((a, b) => b.num - a.num)
            const groups: Array<{ label: string; pct: number }> = []
            let i = 0
            while (i < numbered.length) {
              let j = i
              let groupPct = numbered[i].pct
              while (j + 1 < numbered.length && numbered[j].num - numbered[j + 1].num === 1) {
                j++
                groupPct += numbered[j].pct
              }
              if (i === j) groups.push({ label: String(numbered[i].num), pct: groupPct })
              else if (j - i === 1) groups.push({ label: `${numbered[i].num}/${numbered[j].num}`, pct: groupPct })
              else groups.push({ label: `${numbered[j].num}-${numbered[i].num}`, pct: groupPct })
              i = j + 1
            }
            if (panPct > 0) groups.push({ label: 'Pan', pct: panPct })
            if (groups.length > 0) lines.push(groups.map((g) => `${g.label}:${Math.round(g.pct)}%`).join(' '))
          }
        }
      }
      lines.push(certUrl)
      const dataUrl = await QRCode.toDataURL(lines.join('\n'), { width: 256, margin: 2 })
      setQrCodeDataUrl(dataUrl)
    } catch (error) {
      console.error('Error generating QR code:', error)
    } finally {
      setGeneratingQr(false)
    }
  }

  const handleDownloadQrCode = () => {
    if (!qrCodeDataUrl) return
    const a = document.createElement('a')
    a.href = qrCodeDataUrl
    a.download = `${parseTrackingNumber(sample.tracking_number)}-qr.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handlePrintLabel = async () => {
    try {
      setPrintingLabel(true)
      const response = await fetch('/api/samples/bulk/print-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: [sample.id] }),
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to generate label')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const printWindow = window.open(url)
      if (printWindow) printWindow.onload = () => printWindow.print()
      setTimeout(() => window.URL.revokeObjectURL(url), 60000)
    } catch (error) {
      console.error('Error printing label:', error)
      toast({ title: 'Print failed', description: error instanceof Error ? error.message : 'Failed to print label', variant: 'destructive' })
    } finally {
      setPrintingLabel(false)
    }
  }

  const handleExport = () => {
    const exportData = {
      tracking_number: parseTrackingNumber(sample.tracking_number),
      origin: sample.origin,
      quality: sample.quality_name,
      processing_method: sample.processing_method,
      sample_type: sample.sample_type,
      status: sample.status,
      workflow_stage: sample.workflow_stage,
      bag_count: sample.bag_count,
      bag_type: sample.bag_type,
      bag_weight_kg: sample.bag_weight_kg,
      bags_quantity_mt: sample.bags_quantity_mt,
      equivalent_60kg_bags: sample.equivalent_60kg_bags,
      exporter: sample.exporter_name,
      importer: sample.importer_name,
      roaster: sample.roaster_name,
      wolthers_contract_nr: sample.wolthers_contract_nr,
      ico_number: sample.ico_number,
      container_nr: sample.container_nr,
      storage_position: sample.storage_position,
      created_at: sample.created_at,
      certificate_number: sample.certificate_number,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${parseTrackingNumber(sample.tracking_number)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const handleDownloadCertificate = async () => {
    try {
      setDownloadingCertificate(true)
      const response = await fetch(`/api/samples/${sample.id}/certificate${contractId ? `?contract_id=${contractId}` : ''}`)
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to download certificate')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${parseTrackingNumber(sample.tracking_number)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading certificate:', error)
      toast({ title: 'Download failed', description: error instanceof Error ? error.message : 'Failed to download certificate', variant: 'destructive' })
    } finally {
      setDownloadingCertificate(false)
    }
  }

  const handleGenerateCertificate = async () => {
    try {
      setGeneratingCertificate(true)
      const createRes = await fetch(`/api/samples/${sample.id}/certificate`, { method: 'POST' })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to create certificate')
      }
      await handleDownloadCertificate()
      reload()
      onSampleUpdated?.()
    } catch (error) {
      console.error('Error generating certificate:', error)
      toast({ title: 'Generate failed', description: error instanceof Error ? error.message : 'Failed to generate certificate', variant: 'destructive' })
    } finally {
      setGeneratingCertificate(false)
    }
  }

  const handleViewCertificate = async () => {
    setShowCertificateModal(true)
    setPreviewLoading(true)
    setPreviewPdfUrl(null)
    try {
      const response = await fetch(`/api/samples/${sample.id}/certificate${contractId ? `?contract_id=${contractId}` : ''}`)
      if (response.ok) {
        const blob = await response.blob()
        setPreviewPdfUrl(window.URL.createObjectURL(blob))
      }
    } catch (error) {
      console.error('Error loading certificate preview:', error)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleClosePreview = () => {
    if (previewPdfUrl) window.URL.revokeObjectURL(previewPdfUrl)
    setShowCertificateModal(false)
    setPreviewPdfUrl(null)
    setPreviewLoading(false)
  }

  const handleSendEmail = async () => {
    if (!emailRecipients.exporter && !emailRecipients.importer && !emailRecipients.roaster) {
      toast({ title: 'Select a recipient', description: 'Please select at least one recipient type', variant: 'destructive' })
      return
    }
    try {
      setSendingEmail(true)
      const certRes = await fetch(`/api/certificates?sample_id=${sample.id}`)
      const certData = await certRes.json()
      if (!certRes.ok || !certData.certificates?.length) {
        toast({ title: 'Certificate not found', variant: 'destructive' })
        return
      }
      const response = await fetch('/api/certificates/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateIds: [certData.certificates[0].id], recipients: emailRecipients }),
      })
      const data = await response.json()
      if (response.ok) {
        toast({ title: 'Email sent', description: `Sent to ${data.successful} recipient(s)` })
        setShowEmailDialog(false)
      } else {
        toast({ title: 'Send failed', description: data.error, variant: 'destructive' })
      }
    } catch (error) {
      console.error('Error sending email:', error)
      toast({ title: 'Send failed', variant: 'destructive' })
    } finally {
      setSendingEmail(false)
    }
  }

  const confirmDelete = async () => {
    setDeleteOpen(false)
    try {
      setDeleting(true)
      const response = await fetch(`/api/samples/${sample.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to delete sample')
      const data = await response.json()
      toast({ title: 'Sample deleted', description: data.message || 'Sample deleted successfully' })
      onClose()
      onSampleUpdated?.()
    } catch (error) {
      console.error('Error deleting sample:', error)
      toast({ title: 'Delete failed', description: error instanceof Error ? error.message : 'Failed to delete sample', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return {
    // preview
    showCertificateModal, previewLoading, previewPdfUrl, handleViewCertificate, handleClosePreview,
    // email
    showEmailDialog, setShowEmailDialog, sendingEmail, emailRecipients, setEmailRecipients, handleSendEmail,
    // qr
    showQrModal, setShowQrModal, qrCodeDataUrl, generatingQr, handleShowQrCode, handleDownloadQrCode,
    // certificate
    downloadingCertificate, handleDownloadCertificate, generatingCertificate, handleGenerateCertificate,
    // print / export
    printingLabel, handlePrintLabel, handleExport,
    // delete
    deleteOpen, setDeleteOpen, deleting, confirmDelete,
    // approval send
    showApprovalSend, setShowApprovalSend,
    // helper
    parseTrackingNumber,
  }
}
```

- [ ] **Step 2: Create the menu + dialogs component**

Create `src/components/certificates/cert-editor/sample-actions.tsx`:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  MoreHorizontal, QrCode, Printer, Download, Eye, Award, Mail, Trash2, Loader2, FileText,
} from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { ApprovalSendView } from '@/components/samples/approval-send-view'
import type { CertSample } from './use-cert-editor'
import { useSampleActions } from './use-sample-actions'

export function SampleActionsMenu({
  sample,
  contractId,
  onSampleUpdated,
  reload,
  onClose,
}: {
  sample: CertSample
  contractId?: string | null
  onSampleUpdated?: () => void
  reload: () => void
  onClose: () => void
}) {
  const { profile } = useAuth()
  const a = useSampleActions({ sample, contractId, onSampleUpdated, reload, onClose })

  const hasCert = !!sample.certificate_id
  const canGenerate = !hasCert && ['certified', 'rejected', 'review'].includes(sample.workflow_stage || '')
  const canSendApproval = (sample.status === 'approved' || sample.status === 'rejected') && !!sample.wolthers_contract_nr
  const canDelete = profile?.is_global_admin === true || profile?.qc_role === 'global_admin'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8" title="Actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={a.handleShowQrCode}>
            <QrCode className="mr-2 h-4 w-4" /> QR Code
          </DropdownMenuItem>
          <DropdownMenuItem onClick={a.handlePrintLabel} disabled={a.printingLabel}>
            <Printer className="mr-2 h-4 w-4" /> Print Label
          </DropdownMenuItem>
          <DropdownMenuItem onClick={a.handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </DropdownMenuItem>
          {hasCert ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={a.handleViewCertificate}>
                <Eye className="mr-2 h-4 w-4" /> View Certificate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={a.handleDownloadCertificate} disabled={a.downloadingCertificate}>
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </DropdownMenuItem>
            </>
          ) : null}
          {canGenerate ? (
            <DropdownMenuItem onClick={a.handleGenerateCertificate} disabled={a.generatingCertificate}>
              <Award className="mr-2 h-4 w-4" /> Generate Cert
            </DropdownMenuItem>
          ) : null}
          {canSendApproval ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => a.setShowApprovalSend(true)}>
                <Mail className="mr-2 h-4 w-4" /> Send approval email
              </DropdownMenuItem>
            </>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => a.setDeleteOpen(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Certificate preview */}
      <Dialog open={a.showCertificateModal} onOpenChange={(o) => !o && a.handleClosePreview()}>
        <DialogContent className="sm:max-w-[1100px] max-h-[95vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Certificate {a.parseTrackingNumber(sample.tracking_number)}
            </DialogTitle>
            <DialogDescription>
              {sample.origin ? <span>Origin: {sample.origin}</span> : null}
              {sample.quality_name ? <span className="ml-4">Quality: {sample.quality_name}</span> : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-[75vh] overflow-hidden rounded-lg bg-muted">
            {a.previewLoading ? (
              <div className="flex h-[75vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : a.previewPdfUrl ? (
              <iframe src={a.previewPdfUrl} className="h-[75vh] w-full border-0" title="Certificate Preview" />
            ) : (
              <div className="flex h-[75vh] items-center justify-center text-muted-foreground">Unable to load certificate preview</div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button variant="outline" onClick={a.handleDownloadCertificate} disabled={a.downloadingCertificate}>
              {a.downloadingCertificate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Download
            </Button>
            <Button variant="outline" onClick={() => a.setShowEmailDialog(true)}>
              <Mail className="mr-2 h-4 w-4" /> Send Email
            </Button>
            <Button variant="default" onClick={a.handleClosePreview}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email dialog */}
      <Dialog open={a.showEmailDialog} onOpenChange={a.setShowEmailDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Send Certificate via Email</DialogTitle>
            <DialogDescription>Send certificate to selected recipients.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {(['exporter', 'importer', 'roaster'] as const).map((role) => (
              <div key={role} className="flex items-center space-x-3">
                <Checkbox
                  id={`cert-email-${role}`}
                  checked={a.emailRecipients[role]}
                  onCheckedChange={(checked) => a.setEmailRecipients((prev) => ({ ...prev, [role]: !!checked }))}
                />
                <label htmlFor={`cert-email-${role}`} className="text-sm font-medium capitalize leading-none">{role}</label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => a.setShowEmailDialog(false)}>Cancel</Button>
            <Button onClick={a.handleSendEmail} disabled={a.sendingEmail}>
              {a.sendingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />} Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR modal */}
      <Dialog open={a.showQrModal} onOpenChange={a.setShowQrModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Sample QR Code</DialogTitle>
            <DialogDescription>{a.parseTrackingNumber(sample.tracking_number)}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4 py-6">
            {a.generatingQr ? (
              <div className="flex h-64 w-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : a.qrCodeDataUrl ? (
              <img src={a.qrCodeDataUrl} alt="Sample QR Code" className="h-64 w-64 rounded-lg border" />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center text-muted-foreground">Failed to generate QR code</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={a.handleDownloadQrCode} disabled={!a.qrCodeDataUrl}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
            <Button variant="default" onClick={() => a.setShowQrModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={a.deleteOpen} onOpenChange={a.setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sample</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete sample{' '}
              <span className="font-medium text-foreground">{a.parseTrackingNumber(sample.tracking_number)}</span>?
              This permanently removes the sample, its quality assessments, certificates and activity logs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={a.confirmDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approval send */}
      <ApprovalSendView sampleId={sample.id} open={a.showApprovalSend} onClose={() => a.setShowApprovalSend(false)} />
    </>
  )
}
```

- [ ] **Step 3: Mount the menu in the overlay topbar**

In `certificate-edit-overlay.tsx`, import the menu:

```tsx
import { SampleActionsMenu } from './sample-actions'
```

In the topbar's right-hand action group (the `<div className="flex items-center gap-2">` at line 117), add the menu as the first child, before the "Unsaved changes" span:

```tsx
        <div className="flex items-center gap-2">
          {sample ? (
            <SampleActionsMenu
              sample={sample}
              contractId={contractId}
              onSampleUpdated={onSampleUpdated}
              reload={ed.reload}
              onClose={() => onOpenChange(false)}
            />
          ) : null}
          {dirty ? <span className="mr-1 text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span> : null}
          {/* …existing Cancel + Save buttons… */}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual smoke**

On `/certificates`, the topbar shows a `⋯` button. Verify: QR Code opens + downloads; Print Label opens the print window; Export downloads JSON; for a sample with a certificate, View/Download appear and work; Send approval email opens the approval view for an approved sample with a contract #; Delete appears only for a global admin and removes the sample (closing the overlay + refetching the list).

- [ ] **Step 6: Commit**

```bash
git add src/components/certificates/cert-editor/use-sample-actions.ts src/components/certificates/cert-editor/sample-actions.tsx src/components/certificates/cert-editor/certificate-edit-overlay.tsx
git commit -m "feat(cert-editor): topbar actions menu (QR, print, export, cert, email, delete)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: "Other" sample mode (hide quadrants, show AWB/courier + recipients)

**Files:**
- Create: `src/components/certificates/cert-editor/other-sections.tsx`
- Modify: `src/components/certificates/cert-editor/certificate-edit-overlay.tsx` (conditional body)

**Interfaces:**
- Consumes: `OtherSampleRecipientsPanel({ sampleId, recipients, onChange })` from `@/components/samples/other-sample-recipients-panel`; `CertSample.sample_category | awb_number | courier_name | is_quick_look | sample_recipients`.
- Produces: `OtherSections({ sample, onRecipientsChange })`.

- [ ] **Step 1: Create the Other-sections component**

Create `src/components/certificates/cert-editor/other-sections.tsx`:

```tsx
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { OtherSampleRecipientsPanel } from '@/components/samples/other-sample-recipients-panel'
import type { CertSample } from './use-cert-editor'

export function OtherSections({ sample, onRecipientsChange }: { sample: CertSample; onRecipientsChange: () => void }) {
  const showLogistics = sample.awb_number || sample.courier_name || sample.is_quick_look
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {showLogistics ? (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">AWB</div>
                <div className="font-medium">{sample.awb_number || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Courier</div>
                <div className="font-medium">{sample.courier_name || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Inspection mode</div>
                <div className="font-medium">{sample.is_quick_look ? 'Quick look' : 'Full SCA'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <OtherSampleRecipientsPanel
        sampleId={sample.id}
        recipients={(sample.sample_recipients as any) || []}
        onChange={onRecipientsChange}
      />
    </div>
  )
}
```

- [ ] **Step 2: Branch the overlay body on sample category**

In `certificate-edit-overlay.tsx`, import:

```tsx
import { OtherSections } from './other-sections'
```

Wrap the quadrant grid in a category check. Replace the quadrant grid `<div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">…</div>` with:

```tsx
            {sample.sample_category === 'other' ? (
              <OtherSections sample={sample} onRecipientsChange={ed.reload} />
            ) : (
              <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
                {/* …existing DefectsQuadrant / ScreenQuadrant / PhysicalQuadrant / CuppingQuadrant… */}
              </div>
            )}
```

(The read-only parties card added in Task 6 stays below this block — it renders for both categories.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke**

Temporarily open an "Other" sample id through the overlay (full wiring lands in Task 9). The quality quadrants are hidden; the AWB/Courier/Inspection card (when present) and the recipients panel show; the parties card still renders below.

- [ ] **Step 5: Commit**

```bash
git add src/components/certificates/cert-editor/other-sections.tsx src/components/certificates/cert-editor/certificate-edit-overlay.tsx
git commit -m "feat(cert-editor): Other-sample mode (hide quadrants, show AWB/courier + recipients)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Rewire callers, delete the old modal, final verification

**Files:**
- Modify: `src/app/samples/qc/page.tsx:16` (import) and `:2240-2253` (render)
- Modify: `src/app/samples/other/page.tsx:16` (import) and `:258-266` (render)
- Modify: `src/app/certificates/page.tsx` (import name — optional, alias already works)
- Delete: `src/components/samples/sample-detail-modal.tsx`
- Delete: `src/components/samples/cupping-grading-section.tsx` (only the modal imported it — confirm with grep)

**Interfaces:**
- Consumes: `SampleDetailOverlay` (Task 4) with the same props the modal exposed (`open`, `onOpenChange`, `sampleId`, `contractId`, `onSampleUpdated`, `startInEditMode`).
- Produces: the unified view live at all three entry points; `SampleDetailModal` removed.

- [ ] **Step 1: Rewire the QC samples page**

In `src/app/samples/qc/page.tsx`, change the import on line 16 from:

```tsx
import { SampleDetailModal } from '@/components/samples/sample-detail-modal'
```

to:

```tsx
import { SampleDetailOverlay } from '@/components/certificates/cert-editor'
```

Change the render block (lines 2240-2253) — only the component name changes; props are identical:

```tsx
      <SampleDetailOverlay
        open={!!detailSampleId}
        onOpenChange={(open) => {
          if (!open) {
            setDetailSampleId(null)
            setDetailContractId(null)
            setDetailStartInEditMode(false)
          }
        }}
        sampleId={detailSampleId}
        contractId={detailContractId}
        onSampleUpdated={loadSamples}
        startInEditMode={detailStartInEditMode}
      />
```

- [ ] **Step 2: Rewire the Other samples page**

In `src/app/samples/other/page.tsx`, change the import on line 16 to `import { SampleDetailOverlay } from '@/components/certificates/cert-editor'` and rename the component in the render (lines 258-266) from `<SampleDetailModal … />` to `<SampleDetailOverlay … />` (props unchanged: `open`, `onOpenChange`, `sampleId`, `onSampleUpdated`).

- [ ] **Step 3: Tidy the certificates page import (optional but preferred)**

In `src/app/certificates/page.tsx`, change the import from `CertificateEditOverlay` to `SampleDetailOverlay` and rename the JSX usage to match (the alias keeps the old name working, but prefer the new name for clarity). Leave the props as-is.

- [ ] **Step 4: Typecheck before deleting anything**

Run: `npx tsc --noEmit`
Expected: no errors. If `tsc` flags a field the overlay reads but `CertSample` lacks, add it to the `CertSample` interface (Task 3).

- [ ] **Step 5: Confirm the modal and cupping section are now orphaned**

Run:
```bash
grep -rln "SampleDetailModal" src | grep -v "sample-detail-modal.tsx"
grep -rln "CuppingGradingSection\|cupping-grading-section" src | grep -v "cupping-grading-section.tsx"
```
Expected: both print nothing (no remaining callers).

- [ ] **Step 6: Delete the dead files**

```bash
git rm src/components/samples/sample-detail-modal.tsx src/components/samples/cupping-grading-section.tsx
```

- [ ] **Step 7: Full typecheck + test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` clean; the full vitest suite green (the pre-existing count plus the 5 new `sortDefectsForDisplay` tests).

- [ ] **Step 8: Manual smoke across all entry points**

`npm run dev`, then verify on a real Dunkin SS sample (e.g. SAN-00111/26):
- `/samples/qc` row click → fullscreen quadrant view (not the old modal); strip shows Container + ICO #; clean/uniform chips correct; defect bars ordered primary→secondary, highest→lowest; parties card read-only; `⋯` actions all fire.
- Context-menu "Edit" on a QC row opens straight into the "Edit details" panel.
- A sub-contract row (sets `contractId`) opens with parties read-only.
- `/samples/other` row click → quadrants hidden; AWB/courier + recipients shown.
- `/certificates` row edit still opens the same view and saves.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(samples): open unified SampleDetailOverlay everywhere; retire SampleDetailModal" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes (for the implementer)

- **`/certificates` never breaks:** Tasks 1-8 keep the `CertificateEditOverlay` name resolvable (Task 4 adds the alias); only Task 9 swaps callers.
- **Shared refinements reach both surfaces:** the defect sort (Task 1) and clean/uniform chips (Task 2) live in the shared quadrant components, so `/certificates` gets them too — intended.
- **The `⋯` menu also appears on `/certificates`** (it's in the shared overlay). That's the intended unification. If you later want it hidden there, add an optional `showActions` prop to `SampleDetailOverlay` defaulting to `true` and pass `false` from the certificates page — do **not** fork the component.
- **Open item from the spec:** confirm whether the old modal changed the *displayed tracking number* for sub-contracts beyond locking parties. Reading `sample-detail-modal.tsx`, `contractId` only (a) appended `?contract_id=` to the sample + certificate fetches and (b) forced the parties table read-only — both reproduced here. No tracking-number swap existed, so none is added.

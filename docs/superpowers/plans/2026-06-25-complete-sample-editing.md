# Complete Sample Editing + Header Attributes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Crop / Processing / Certifications in a compact line under a shortened info strip on the `SampleDetailOverlay`, and complete the "Edit details" panel so every PATCH-supported commodity/logistics field is editable (including ones left blank at intake) — with certifications pullable from the linked sys contract.

**Architecture:** Pure UI + edit-wiring on the existing cert-editor overlay (`src/components/certificates/cert-editor/`). All target columns already exist on `samples` and are in the `/api/samples/[id]` PATCH allowlist. One new read-only endpoint resolves a sample's linked sys `contracts` row and returns its normalized certifications. No DB migration.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Recharts, Vitest (jsdom). Shared Supabase (WAQC reads the sys `contracts` table directly).

## Global Constraints

- Font **Inter**; **no emojis in the UI** — lucide-react icons only.
- Validation/accent colors from the existing palette; cards `rounded-2xl`. Light + dark support.
- Keep files under ~2000 lines; the certifications editor is its own file.
- **No mock data**; all data from existing `/api/samples/*` + the shared `contracts` table.
- Typecheck: `npx tsc --noEmit` (must be clean). Tests: `npx vitest run` (single file: `npx vitest run <path>`).
- Every commit message ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Trunk-based: commit directly to `main`. Do **not** push unless the user asks.
- The working tree has unrelated uncommitted changes — every task stages ONLY its own paths (never `git add -A`).
- `/certificates` and `/samples` (which both render this overlay) must keep working after every task — all changes are additive until the final UI task.
- Canonical certifications vocabulary (`CERTIFICATIONS` in `src/components/samples/intake/constants.ts`): `Rainforest Alliance`, `Fair Trade`, `FLO Fair Trade`, `Organic`, `EUDR`. `PROCESSING_METHODS`: `Natural, Washed, Honey, Semi-Washed, Wet Hulled, Anaerobic, Carbonic Maceration, Other`.
- `wolthers_contract_nr` is already editable inside `SupplyChainEditTable` (line ~396) — do NOT add a second control for it.

---

### Task 1: Extract `normalizeCertifications` helper (TDD)

**Files:**
- Modify: `src/lib/contract-intake-mapping.ts` (extract the inline cert block into an exported pure function; call it from the existing mapping)
- Test: `src/lib/contract-intake-mapping.test.ts` (append a `describe` block — file already exists)

**Interfaces:**
- Produces: `normalizeCertifications(raw: unknown): string[]` — maps contract short codes to the canonical 5, dedupes, drops unknowns, returns `[]` for non-arrays.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/contract-intake-mapping.test.ts` (add `normalizeCertifications` to the existing import from `'./contract-intake-mapping'`):

```ts
describe('normalizeCertifications', () => {
  it('maps short codes to canonical names', () => {
    expect(normalizeCertifications(['ra', 'ft', 'flo', 'organic', 'eudr'])).toEqual(
      ['Rainforest Alliance', 'Fair Trade', 'FLO Fair Trade', 'Organic', 'EUDR'],
    )
  })
  it('normalizes hyphens/spaces/case', () => {
    expect(normalizeCertifications(['Fair-Trade', 'fair trade', 'RFA'])).toEqual(['Fair Trade', 'Rainforest Alliance'])
  })
  it('passes through already-canonical values', () => {
    expect(normalizeCertifications(['Organic', 'EUDR'])).toEqual(['Organic', 'EUDR'])
  })
  it('drops unknown codes', () => {
    expect(normalizeCertifications(['organic', 'totally-made-up'])).toEqual(['Organic'])
  })
  it('returns [] for a non-array', () => {
    expect(normalizeCertifications(null)).toEqual([])
    expect(normalizeCertifications('organic')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/contract-intake-mapping.test.ts`
Expected: FAIL — `normalizeCertifications is not exported` / not a function.

- [ ] **Step 3: Implement the helper and call it from the mapping**

In `src/lib/contract-intake-mapping.ts`, add this exported function at module scope (e.g. just below the imports/interfaces, before the main mapping function):

```ts
/**
 * Normalize a contract's raw `certifications` (jsonb short codes) to WAQC's
 * canonical vocabulary. Pure. Shared by the intake mapping and the
 * /api/samples/[id]/contract-certifications endpoint.
 */
export function normalizeCertifications(raw: unknown): string[] {
  const knownCerts = ['Rainforest Alliance', 'Fair Trade', 'FLO Fair Trade', 'Organic', 'EUDR']
  const certMap: Record<string, string> = {
    ra: 'Rainforest Alliance', rainforest: 'Rainforest Alliance', rainforest_alliance: 'Rainforest Alliance', rfa: 'Rainforest Alliance',
    ft: 'Fair Trade', fairtrade: 'Fair Trade', fair_trade: 'Fair Trade',
    flo: 'FLO Fair Trade',
    organic: 'Organic', org: 'Organic',
    eudr: 'EUDR', eu_deforestation: 'EUDR',
  }
  if (!Array.isArray(raw)) return []
  const mapped = (raw as unknown[])
    .filter((x): x is string => typeof x === 'string')
    .map((s) => certMap[s.toLowerCase().replace(/[-\s]/g, '_')] ?? s)
    .filter((s) => knownCerts.includes(s))
  return [...new Set(mapped)]
}
```

Then find the existing inline certifications block in the mapping function (the `const knownCerts = [...]` / `const certMap = {...}` / `if (Array.isArray(c.certifications)) { ... set('certifications', unique) }` block, ~line 205-228) and REPLACE it entirely with:

```ts
  // Certifications — normalized via the shared helper (see normalizeCertifications).
  const certs = normalizeCertifications(c.certifications)
  if (certs.length > 0) set('certifications', certs)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/contract-intake-mapping.test.ts`
Expected: PASS (existing tests + 5 new).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contract-intake-mapping.ts src/lib/contract-intake-mapping.test.ts
git commit -m "refactor(contracts): extract normalizeCertifications helper (DRY)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `contract-certifications` endpoint

**Files:**
- Create: `src/app/api/samples/[id]/contract-certifications/route.ts`

**Interfaces:**
- Consumes: `normalizeCertifications` from `@/lib/contract-intake-mapping` (Task 1).
- Produces: `GET /api/samples/[id]/contract-certifications` → `{ certifications: string[], contract_number: string | null, matched: boolean }`.

- [ ] **Step 1: Create the route**

Create `src/app/api/samples/[id]/contract-certifications/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { normalizeCertifications } from '@/lib/contract-intake-mapping'

/**
 * GET /api/samples/[id]/contract-certifications
 * Resolve the sample's linked sys contract(s) by contract_number = wolthers_contract_nr
 * and return the UNION of their normalized certifications (contract_number is not unique).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sampleId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: sample, error: sErr } = await supabase
      .from('samples')
      .select('wolthers_contract_nr')
      .eq('id', sampleId)
      .single()
    if (sErr || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    const contractNumber = ((sample as any).wolthers_contract_nr || '').trim()
    if (!contractNumber) {
      return NextResponse.json({ certifications: [], contract_number: null, matched: false })
    }

    const { data: contracts, error: cErr } = await (supabase as any)
      .from('contracts')
      .select('certifications')
      .eq('contract_number', contractNumber)
    if (cErr) {
      console.error('[contract-certifications] query error:', cErr)
      return NextResponse.json({ error: 'Failed to load contract certifications' }, { status: 500 })
    }

    const union = new Set<string>()
    for (const row of contracts || []) {
      for (const cert of normalizeCertifications((row as any).certifications)) union.add(cert)
    }

    return NextResponse.json({
      certifications: [...union],
      contract_number: contractNumber,
      matched: (contracts || []).length > 0,
    })
  } catch (error: any) {
    console.error('Error in GET /api/samples/[id]/contract-certifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/samples/[id]/contract-certifications/route.ts
git commit -m "feat(api): contract-certifications endpoint (pull certs from linked sys contract)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Widen the data hook for the new fields

**Files:**
- Modify: `src/components/certificates/cert-editor/use-cert-editor.ts` (`COMMERCIAL_FIELDS` + `CertSample`)

**Interfaces:**
- Produces: `draft.sample` now seeds + saves `crop_year`, `certifications`, `shipment_month`, `supplier`; `CertSample` exposes them.

- [ ] **Step 1: Add the four fields to `COMMERCIAL_FIELDS`**

In `use-cert-editor.ts`, in the `COMMERCIAL_FIELDS` array, add `'crop_year', 'certifications', 'shipment_month', 'supplier'`. Place them right after `'micro_origin',`:

```ts
  'supplier_contract_nr', 'ico_number', 'container_nr', 'processing_method', 'micro_origin',
  'crop_year', 'certifications', 'shipment_month', 'supplier',
```

(`container_nr`, `ico_number`, `wolthers_contract_nr` are already present — do not duplicate.)

- [ ] **Step 2: Add the fields to the `CertSample` interface**

In the `CertSample` interface, add (anywhere before the `[key: string]: any` index signature):

```ts
  crop_year?: string
  certifications?: string[]
  shipment_month?: string
  supplier?: string
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (`certifications` is an array; the hook's `JSON.stringify` dirty-tracking + PATCH diff already handle arrays.)

- [ ] **Step 4: Commit**

```bash
git add src/components/certificates/cert-editor/use-cert-editor.ts
git commit -m "feat(cert-editor): seed/save crop_year, certifications, shipment_month, supplier" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Compact the info strip

**Files:**
- Modify: `src/components/certificates/cert-editor/info-strip.tsx` (`InfoStripBand` tile markup)

**Interfaces:** none changed.

- [ ] **Step 1: Remove the reserved "Edit" hint line and tighten padding**

In `InfoStripBand`, the tile `<button>` currently is:

```tsx
        <button
          key={t.label}
          onClick={onEdit}
          className="group flex flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        >
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</span>
          <span className="text-sm font-medium text-foreground">{t.value}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
            <Pencil className="h-3 w-3" /> Edit
          </span>
        </button>
```

Replace it with (drop the hint `<span>`, `py-3 → py-2`, drop the now-unused `group`):

```tsx
        <button
          key={t.label}
          onClick={onEdit}
          className="flex flex-col items-start gap-0.5 px-4 py-2 text-left transition-colors hover:bg-muted/40"
        >
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</span>
          <span className="text-sm font-medium text-foreground">{t.value}</span>
        </button>
```

- [ ] **Step 2: Drop the now-unused `Pencil` import if unused**

Check the file for other `Pencil` usages (`grep -n "Pencil" src/components/certificates/cert-editor/info-strip.tsx`). After this change there should be none → change the import line `import { Lock, Pencil } from 'lucide-react'` to `import { Lock } from 'lucide-react'`. (If Task 7 has already added a `Pencil` usage when this runs out of order, leave the import.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual smoke**

`/certificates` or `/samples/qc`: the info strip is visibly shorter (about half height); hover still highlights a tile; clicking still opens Edit details.

- [ ] **Step 5: Commit**

```bash
git add src/components/certificates/cert-editor/info-strip.tsx
git commit -m "style(cert-editor): compact info-strip tiles (drop reserved hint line, py-2)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Attributes line (Crop · Processing · Certifications)

**Files:**
- Modify: `src/components/certificates/cert-editor/info-strip.tsx` (add `AttributesLine` export)
- Modify: `src/components/certificates/cert-editor/certificate-edit-overlay.tsx` (render it after `InfoStripBand`)

**Interfaces:**
- Produces: `AttributesLine({ sample: CertSample, draftSample: Record<string, any>, onEdit: () => void })`.

- [ ] **Step 1: Add the `AttributesLine` component**

In `info-strip.tsx`, add after `InfoStripBand`:

```tsx
/** Compact attributes band under the strip: crop · processing · certifications. Click opens the edit panel. */
export function AttributesLine({
  sample,
  draftSample,
  onEdit,
}: {
  sample: CertSample
  draftSample: Record<string, any>
  onEdit: () => void
}) {
  const crop = draftSample.crop_year ?? sample.crop_year
  const processing = draftSample.processing_method ?? sample.processing_method
  const certs: string[] = Array.isArray(draftSample.certifications)
    ? draftSample.certifications
    : Array.isArray(sample.certifications)
      ? sample.certifications
      : []
  return (
    <button
      onClick={onEdit}
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-left transition-colors hover:bg-muted/40"
    >
      <span className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Crop</span>
        <span className="text-sm font-medium text-foreground">{crop || '—'}</span>
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Processing</span>
        <span className="text-sm font-medium text-foreground">{processing || '—'}</span>
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="flex flex-wrap items-center gap-1">
        {certs.length ? (
          certs.map((c) => (
            <span key={c} className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground">
              {c}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-muted-foreground">No certifications</span>
        )}
      </span>
    </button>
  )
}
```

- [ ] **Step 2: Render it in the overlay**

In `certificate-edit-overlay.tsx`:
- Change the import on line 9 to include `AttributesLine`: `import { InfoStripBand, AttributesLine, DetailsEditPanel } from './info-strip'`.
- Immediately after the `<InfoStripBand … />` line (~174), add:

```tsx
          <AttributesLine sample={sample} draftSample={draft.sample} onEdit={() => setPanel('details')} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual smoke**

The attributes line shows under the strip with Crop / Processing values and certification badges (or "No certifications"); clicking it opens Edit details.

- [ ] **Step 5: Commit**

```bash
git add src/components/certificates/cert-editor/info-strip.tsx src/components/certificates/cert-editor/certificate-edit-overlay.tsx
git commit -m "feat(cert-editor): attributes line (crop · processing · certifications) under the strip" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Certifications editor field

**Files:**
- Create: `src/components/certificates/cert-editor/certifications-field.tsx`

**Interfaces:**
- Consumes: `GET /api/samples/[id]/contract-certifications` (Task 2); `CERTIFICATIONS` from `@/components/samples/intake/constants`.
- Produces: `CertificationsField({ sampleId: string, value: string[], onChange: (next: string[]) => void })`.

- [ ] **Step 1: Create the component**

Create `src/components/certificates/cert-editor/certifications-field.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, X, Download } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { CERTIFICATIONS } from '@/components/samples/intake/constants'

/** Certifications editor: pull-from-sys-contract + canonical toggle chips + custom add/remove. */
export function CertificationsField({
  sampleId,
  value,
  onChange,
}: {
  sampleId: string
  value: string[]
  onChange: (next: string[]) => void
}) {
  const { toast } = useToast()
  const [pulling, setPulling] = useState(false)
  const [custom, setCustom] = useState('')

  const selected = Array.isArray(value) ? value : []
  const toggle = (cert: string) =>
    onChange(selected.includes(cert) ? selected.filter((c) => c !== cert) : [...selected, cert])
  const remove = (cert: string) => onChange(selected.filter((c) => c !== cert))
  const addCustom = () => {
    const v = custom.trim()
    if (v && !selected.includes(v)) onChange([...selected, v])
    setCustom('')
  }

  const pull = async () => {
    setPulling(true)
    try {
      const res = await fetch(`/api/samples/${sampleId}/contract-certifications`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to pull')
      if (!data.matched) {
        toast({ title: 'No linked contract', description: 'No sys contract matched this sample’s Wolthers contract #.' })
      } else if (!data.certifications?.length) {
        toast({ title: 'No certifications', description: 'The linked contract has no certifications.' })
      } else {
        onChange(data.certifications)
        toast({ title: 'Pulled from contract', description: `${data.certifications.length} certification(s) loaded.` })
      }
    } catch (e) {
      toast({ title: 'Pull failed', description: e instanceof Error ? e.message : 'Could not pull certifications', variant: 'destructive' })
    } finally {
      setPulling(false)
    }
  }

  const customCerts = selected.filter((c) => !CERTIFICATIONS.includes(c))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">Certifications</label>
        <Button type="button" variant="outline" size="sm" className="h-7" onClick={pull} disabled={pulling}>
          {pulling ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
          Pull from contract
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CERTIFICATIONS.map((cert) => {
          const on = selected.includes(cert)
          return (
            <button
              type="button"
              key={cert}
              onClick={() => toggle(cert)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'}`}
            >
              {cert}
            </button>
          )
        })}
      </div>
      {customCerts.length ? (
        <div className="flex flex-wrap gap-1.5">
          {customCerts.map((cert) => (
            <span key={cert} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-foreground">
              {cert}
              <button type="button" onClick={() => remove(cert)} aria-label={`Remove ${cert}`} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="Add custom certification"
          className="h-8"
        />
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={addCustom}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/certificates/cert-editor/certifications-field.tsx
git commit -m "feat(cert-editor): certifications editor (pull-from-contract + chips + custom)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Complete the "Edit details" panel

**Files:**
- Modify: `src/components/certificates/cert-editor/info-strip.tsx` (`DetailsEditPanel` body + imports)

**Interfaces:**
- Consumes: `CertificationsField` (Task 6); `PROCESSING_METHODS` from intake constants; `draftSample`/`form` fields seeded by Task 3.

- [ ] **Step 1: Add imports**

At the top of `info-strip.tsx`, add:

```tsx
import { PROCESSING_METHODS } from '@/components/samples/intake/constants'
import { CertificationsField } from './certifications-field'
```

- [ ] **Step 2: Replace the `DetailsEditPanel` body**

Replace the entire `<div className="space-y-6"> … </div>` block inside `DetailsEditPanel`'s `return` (currently the Supply chain group + Commodity grid + Quantity group) with the following. It keeps Supply chain + Quantity, upgrades Processing to a dropdown, adds Crop year + Supplier to Commodity, adds a Certifications block, and adds a Logistics group (Container, ICO #, Shipment month, Warehouse location):

```tsx
      <div className="space-y-6">
        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Supply chain</div>
          <SupplyChainEditTable sample={sample as any} isEditMode formData={form} onFormChange={set} />
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            Commodity
            {lockedQuality ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                <Lock className="h-3 w-3" />
                {lockedReason || 'Locked after certification'}
              </span>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Sample type">
              <Select value={(form.sample_type || '').toString()} onValueChange={(v) => set('sample_type', v)} disabled={lockedQuality}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const cur = (form.sample_type || '').toString()
                    const opts = [...SAMPLE_TYPES]
                    if (cur && !opts.some((t) => t.value === cur)) {
                      opts.push({ value: cur, label: cur.charAt(0).toUpperCase() + cur.slice(1) })
                    }
                    return opts
                  })().map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Origin">
              <Input value={form.origin ?? ''} onChange={(e) => set('origin', e.target.value)} disabled={lockedQuality} className="h-9" />
            </Field>
            <Field label="Micro origin">
              <Input value={form.micro_origin ?? ''} onChange={(e) => set('micro_origin', e.target.value)} disabled={lockedQuality} className="h-9" />
            </Field>
            <Field label="Quality">
              <Select value={form.quality_spec_id || ''} onValueChange={(v) => set('quality_spec_id', v)} disabled={lockedQuality}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent>
                  {qualityOptions.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.custom_name}
                      {q.quality_code ? ` (${q.quality_code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Processing">
              <Select value={(form.processing_method || '').toString()} onValueChange={(v) => set('processing_method', v)} disabled={lockedQuality}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select processing" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const cur = (form.processing_method || '').toString()
                    const opts = [...PROCESSING_METHODS]
                    if (cur && !opts.includes(cur)) opts.push(cur)
                    return opts
                  })().map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Crop year">
              <Input value={form.crop_year ?? ''} onChange={(e) => set('crop_year', e.target.value)} placeholder="e.g. 25/26" className="h-9" />
            </Field>
            <Field label="Exporter sample #">
              <Input value={form.exporter_sample_number ?? ''} onChange={(e) => set('exporter_sample_number', e.target.value)} className="h-9" />
            </Field>
            <Field label="Supplier (farm / coop)">
              <Input value={form.supplier ?? ''} onChange={(e) => set('supplier', e.target.value)} className="h-9" />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Certifications</div>
          <CertificationsField
            sampleId={sample.id}
            value={Array.isArray(form.certifications) ? form.certifications : []}
            onChange={(next) => set('certifications', next)}
          />
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Logistics</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Container #">
              <Input value={form.container_nr ?? ''} onChange={(e) => set('container_nr', e.target.value)} className="h-9 font-mono" />
            </Field>
            <Field label="ICO #">
              <Input value={form.ico_number ?? ''} onChange={(e) => set('ico_number', e.target.value)} className="h-9 font-mono" />
            </Field>
            <Field label="Shipment month">
              <Input type="month" value={form.shipment_month ?? ''} onChange={(e) => set('shipment_month', e.target.value)} className="h-9" />
            </Field>
            <Field label="Warehouse location">
              <Input value={form.storage_position ?? ''} onChange={(e) => set('storage_position', e.target.value)} placeholder="e.g. A1-B2" className="h-9" />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-foreground">Quantity</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Bag count">
              <Input type="number" min="0" inputMode="numeric" value={form.bag_count ?? ''} onChange={(e) => set('bag_count', e.target.value === '' ? null : parseInt(e.target.value, 10) || 0)} className="h-9" />
            </Field>
            <Field label="Bag weight (kg)">
              <Input type="number" min="0" step="0.1" inputMode="decimal" value={form.bag_weight_kg ?? ''} onChange={(e) => set('bag_weight_kg', e.target.value === '' ? null : parseFloat(e.target.value) || 0)} className="h-9" />
            </Field>
            <Field label="Bag type">
              <Select value={form.bag_type || ''} onValueChange={(v) => set('bag_type', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select bag type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BAG_TYPES).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual smoke**

Open Edit details on a sample. Confirm: Processing is a dropdown (current value preserved if non-standard); Crop year, Supplier, Container #, ICO #, Shipment month, Warehouse location are all editable and fillable when blank; the Certifications block toggles chips, "Pull from contract" loads certs for a sample whose Wolthers contract # matches a sys contract, custom add/remove works; Save persists (reopen to confirm) and the attributes line + strip reflect the changes.

- [ ] **Step 5: Commit**

```bash
git add src/components/certificates/cert-editor/info-strip.tsx
git commit -m "feat(cert-editor): complete edit panel — processing dropdown, crop, certifications, container/ICO, shipment month, supplier" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec deviations (intentional):** `wolthers_contract_nr` is NOT given a new control — it is already editable inside `SupplyChainEditTable` (the spec flagged this check). All other in-scope fields are covered.
- **Shared surface:** these changes land in the cert-editor overlay, so `/certificates` and `/samples` (qc + other) all gain them — intended. Quality-lock (`lockedQuality`) continues to disable only the quality-sensitive commodity fields (origin, micro origin, quality, processing); the new commercial/logistics fields stay editable any time, matching prior behavior.
- **No migration; no allowlist change** — `crop_year`, `certifications`, `shipment_month`, `supplier`, `container_nr`, `ico_number` are all already in the PATCH `allowedFields`.
- **Out of scope (per user):** AWB / courier / quick-look, notes, arrival date, hide-exporter-on-label, PSS link — would each need an allowlist entry.

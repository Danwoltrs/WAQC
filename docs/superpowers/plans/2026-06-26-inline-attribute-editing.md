# Inline Attribute Editing + Addable Pickers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every value on the sample header (the attributes line and the info-strip tiles) editable in place via a hover-pencil popover, with Crop year as an auto-generated picker (May rollover) and Processing as an addable picker — instead of every click opening the center "Edit details" panel.

**Architecture:** Pure UI on the existing cert-editor overlay (`src/components/certificates/cert-editor/`). A reusable `InlineEdit` popover wraps each value; field editors reuse existing controls. Inline edits write into the overlay's single lifted draft (`ed.setSampleField`) and are persisted by the existing topbar Save — no new save path, no per-field network calls. One new read-only endpoint returns distinct processing methods already in use. No DB migration.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui (Popover, Input, Button, Select), lucide-react, Vitest (jsdom) + @testing-library/react. Shared Supabase.

## Global Constraints

- Font **Inter**; **no emojis in the UI** — lucide-react icons only (the `·` middot and `—` em-dash are allowed).
- Validation/accent colors from the existing palette; light + dark support.
- Keep files under ~2000 lines.
- **No mock data.**
- Typecheck: `npx tsc --noEmit` (must be clean). Tests: `npx vitest run` (single file: `npx vitest run <path>`). Component tests use `@testing-library/react` (`render`, `screen`, `fireEvent`) per `src/components/portal/portal-top-nav.test.tsx`; jsdom + `vitest.setup.ts` provide jest-dom matchers.
- Every commit message ends with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Trunk-based: commit directly to `main`. Do **not** push unless the user asks.
- The working tree has unrelated uncommitted changes (a certificates override route, an override migration, partner-portal handoff docs) — every task stages ONLY its own paths (never `git add -A`).
- `/certificates` and `/samples` (qc + other) all render this overlay and must keep working after every task — changes are additive until the wiring tasks (6, 7), which update component + overlay together so each task compiles.
- The overlay exposes the lifted-draft setter as `ed.setSampleField(field, value)` (`use-cert-editor.ts:478`). Inline editors call it; the existing topbar Save persists.
- Quality-lock no longer gates these fields (`LOCK_SENSITIVE_FIELDS` is empty) — do NOT add any `disabled`/lock gating to the inline editors.
- `PROCESSING_METHODS` (`src/components/samples/intake/constants.ts`): `Natural, Washed, Honey, Semi-Washed, Wet Hulled, Anaerobic, Carbonic Maceration, Other`.

---

### Task 1: Crop-year + processing option helpers (TDD)

**Files:**
- Create: `src/components/certificates/cert-editor/vocab-options.ts`
- Test: `src/components/certificates/cert-editor/vocab-options.test.ts`

**Interfaces:**
- Produces: `cropYearOptions(now: Date, currentValue?: string | null): string[]` — newest-first `YY/YY` list (latest + previous 3); latest rolls to the new crop every May; appends `currentValue` if missing.
- Produces: `mergeProcessingOptions(base: readonly string[], distinct: readonly string[], currentValue?: string | null): string[]` — base first, then distinct-not-in-base alphabetically, then `currentValue` if missing; deduped.

- [ ] **Step 1: Write the failing test**

Create `src/components/certificates/cert-editor/vocab-options.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cropYearOptions, mergeProcessingOptions } from './vocab-options'

describe('cropYearOptions', () => {
  it('after May shows the new crop year as latest', () => {
    // June 2026 (month index 5 >= 4 = May)
    expect(cropYearOptions(new Date(2026, 5, 26))).toEqual(['26/27', '25/26', '24/25', '23/24'])
  })
  it('before May keeps the prior crop as latest', () => {
    // April 2026 (month index 3 < 4)
    expect(cropYearOptions(new Date(2026, 3, 15))).toEqual(['25/26', '24/25', '23/24', '22/23'])
  })
  it('rolls over in May of the next year', () => {
    expect(cropYearOptions(new Date(2027, 4, 1))).toEqual(['27/28', '26/27', '25/26', '24/25'])
  })
  it('pads single-digit years', () => {
    expect(cropYearOptions(new Date(2009, 5, 1))).toEqual(['09/10', '08/09', '07/08', '06/07'])
  })
  it('appends a current value older than the window', () => {
    expect(cropYearOptions(new Date(2026, 5, 26), '20/21')).toEqual(['26/27', '25/26', '24/25', '23/24', '20/21'])
  })
  it('does not duplicate a current value already in the window', () => {
    expect(cropYearOptions(new Date(2026, 5, 26), '25/26')).toEqual(['26/27', '25/26', '24/25', '23/24'])
  })
})

describe('mergeProcessingOptions', () => {
  it('keeps base order, appends distinct extras alphabetically', () => {
    expect(mergeProcessingOptions(['Natural', 'Washed'], ['Honey', 'Natural'])).toEqual(['Natural', 'Washed', 'Honey'])
  })
  it('appends a current value not present', () => {
    expect(mergeProcessingOptions(['Natural'], [], 'Anaerobic')).toEqual(['Natural', 'Anaerobic'])
  })
  it('dedupes a current value already present', () => {
    expect(mergeProcessingOptions(['Natural', 'Washed'], ['Washed'], 'Natural')).toEqual(['Natural', 'Washed'])
  })
  it('ignores blank values', () => {
    expect(mergeProcessingOptions(['Natural'], ['', '  '], '')).toEqual(['Natural'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/certificates/cert-editor/vocab-options.test.ts`
Expected: FAIL — `cropYearOptions is not a function` / not exported.

- [ ] **Step 3: Implement the helpers**

Create `src/components/certificates/cert-editor/vocab-options.ts`:

```ts
const pad = (n: number) => String(((n % 100) + 100) % 100).padStart(2, '0')

/**
 * Crop-year options, newest first: the latest crop plus the previous three.
 * The latest rolls to the new crop every May (month index 4), e.g. from May 2026
 * the latest is "26/27" (the crop physically starting July). The sample's own
 * stored value is appended if it falls outside the window. Pure.
 */
export function cropYearOptions(now: Date, currentValue?: string | null): string[] {
  const year = now.getFullYear()
  const latestStart = now.getMonth() >= 4 ? year : year - 1
  const opts: string[] = []
  for (let s = latestStart; s >= latestStart - 3; s--) opts.push(`${pad(s)}/${pad(s + 1)}`)
  const cur = (currentValue || '').trim()
  if (cur && !opts.includes(cur)) opts.push(cur)
  return opts
}

/**
 * Processing options: canonical base first, then values seen in data (distinct)
 * that aren't canonical, sorted; then the sample's current value if still missing.
 * Deduped. Pure.
 */
export function mergeProcessingOptions(
  base: readonly string[],
  distinct: readonly string[],
  currentValue?: string | null,
): string[] {
  const out: string[] = [...base]
  const extras = distinct
    .map((d) => (d || '').trim())
    .filter((d) => d && !out.includes(d))
    .sort((a, b) => a.localeCompare(b))
  for (const e of extras) if (!out.includes(e)) out.push(e)
  const cur = (currentValue || '').trim()
  if (cur && !out.includes(cur)) out.push(cur)
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/certificates/cert-editor/vocab-options.test.ts`
Expected: PASS (10 assertions).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/certificates/cert-editor/vocab-options.ts src/components/certificates/cert-editor/vocab-options.test.ts
git commit -m "feat(cert-editor): crop-year + processing option helpers (TDD)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Vocabularies endpoint (distinct processing methods)

**Files:**
- Create: `src/app/api/samples/vocabularies/route.ts`

**Interfaces:**
- Produces: `GET /api/samples/vocabularies` → `{ processing_methods: string[] }` (distinct non-blank, sorted).

- [ ] **Step 1: Create the route**

Create `src/app/api/samples/vocabularies/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/samples/vocabularies
 * Distinct, non-blank processing methods already saved across samples — so a
 * value added via the Processing picker's "+ add new" shows up as a choice later.
 * (Crop year is date-generated client-side and needs no endpoint.)
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('samples')
      .select('processing_method')
      .not('processing_method', 'is', null)
    if (error) {
      console.error('[vocabularies] query error:', error)
      return NextResponse.json({ error: 'Failed to load vocabularies' }, { status: 500 })
    }

    const set = new Set<string>()
    for (const row of data || []) {
      const v = ((row as any).processing_method || '').trim()
      if (v) set.add(v)
    }
    const processing_methods = [...set].sort((a, b) => a.localeCompare(b))
    return NextResponse.json({ processing_methods })
  } catch (error: any) {
    console.error('Error in GET /api/samples/vocabularies:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/samples/vocabularies/route.ts
git commit -m "feat(api): samples/vocabularies endpoint (distinct processing methods)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `AddableSelect` component

**Files:**
- Create: `src/components/certificates/cert-editor/addable-select.tsx`
- Test: `src/components/certificates/cert-editor/addable-select.test.tsx`

**Interfaces:**
- Produces: `AddableSelect({ value, options, onChange, allowAdd?, addLabel? })`. Renders a plain option list (the current value is always present); when `allowAdd`, a "+ add new" row reveals an input that commits a typed value via `onChange`. This is the popover BODY — it does not own a popover.

- [ ] **Step 1: Write the failing test**

Create `src/components/certificates/cert-editor/addable-select.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddableSelect } from './addable-select'

describe('AddableSelect', () => {
  it('renders options and selecting one calls onChange', () => {
    const onChange = vi.fn()
    render(<AddableSelect value="Washed" options={['Natural', 'Washed']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Natural' }))
    expect(onChange).toHaveBeenCalledWith('Natural')
  })

  it('always includes the current value even if not in options', () => {
    render(<AddableSelect value="Funky" options={['Natural']} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Funky' })).toBeInTheDocument()
  })

  it('with allowAdd, adding a custom value calls onChange', () => {
    const onChange = vi.fn()
    render(<AddableSelect value="" options={['Natural']} onChange={onChange} allowAdd addLabel="Add processing method" />)
    fireEvent.click(screen.getByRole('button', { name: /Add processing method/ }))
    const input = screen.getByPlaceholderText('Add processing method')
    fireEvent.change(input, { target: { value: 'Yeast Inoculated' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('Yeast Inoculated')
  })

  it('without allowAdd, shows no add row', () => {
    render(<AddableSelect value="25/26" options={['26/27', '25/26']} onChange={() => {}} />)
    expect(screen.queryByText(/Add /)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/certificates/cert-editor/addable-select.test.tsx`
Expected: FAIL — cannot find module `./addable-select`.

- [ ] **Step 3: Implement the component**

Create `src/components/certificates/cert-editor/addable-select.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, Plus } from 'lucide-react'

/** Option list + optional "+ add new" row. The body of an InlineEdit popover. */
export function AddableSelect({
  value,
  options,
  onChange,
  allowAdd = false,
  addLabel = 'Add new',
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  allowAdd?: boolean
  addLabel?: string
}) {
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')
  const list = value && !options.includes(value) ? [...options, value] : options

  const submit = () => {
    const v = custom.trim()
    if (v) onChange(v)
    setCustom('')
    setAdding(false)
  }

  return (
    <div className="flex max-h-64 w-56 flex-col gap-0.5 overflow-y-auto">
      {list.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 ${
            opt === value ? 'font-medium text-foreground' : 'text-muted-foreground'
          }`}
        >
          {opt}
          {opt === value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
        </button>
      ))}
      {allowAdd ? (
        adding ? (
          <div className="flex items-center gap-1 px-1 py-1">
            <Input
              autoFocus
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={addLabel}
              className="h-7 text-sm"
            />
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={submit}>
              Add
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-0.5 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-muted/60"
          >
            <Plus className="h-3.5 w-3.5" /> {addLabel}
          </button>
        )
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/certificates/cert-editor/addable-select.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/certificates/cert-editor/addable-select.tsx src/components/certificates/cert-editor/addable-select.test.tsx
git commit -m "feat(cert-editor): AddableSelect (option list + optional add-new row)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `InlineEdit` popover wrapper

**Files:**
- Create: `src/components/certificates/cert-editor/inline-edit.tsx`

**Interfaces:**
- Consumes: `@/components/ui/popover`.
- Produces: `InlineEdit({ display, children, className?, contentClassName? })` — `display` is the read value; a `Pencil` shows on hover; clicking opens a popover whose body is `children(close)`. `children` is a render-prop receiving a `close()` to call after a single-value commit.

> No unit test: this is a thin Radix-Popover wrapper; Radix popovers are unreliable to drive in jsdom. Typecheck-gated; verified in the manual smoke of Tasks 6–7.

- [ ] **Step 1: Create the component**

Create `src/components/certificates/cert-editor/inline-edit.tsx`:

```tsx
'use client'

import { ReactNode, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Pencil } from 'lucide-react'

/** Inline editor: hover shows a pencil; click opens a popover with the field's control. */
export function InlineEdit({
  display,
  children,
  className,
  contentClassName,
}: {
  display: ReactNode
  /** Editor body; call close() after a single-value commit to dismiss the popover. */
  children: (close: () => void) => ReactNode
  className?: string
  contentClassName?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`group inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/40 ${className || ''}`}
        >
          {display}
          <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={`w-auto p-1 ${contentClassName || ''}`}>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/certificates/cert-editor/inline-edit.tsx
git commit -m "feat(cert-editor): InlineEdit hover-pencil popover wrapper" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Crop-year + processing field wrappers

**Files:**
- Create: `src/components/certificates/cert-editor/crop-year-field.tsx`
- Create: `src/components/certificates/cert-editor/processing-field.tsx`

**Interfaces:**
- Consumes: `AddableSelect` (Task 3); `cropYearOptions` / `mergeProcessingOptions` (Task 1); `PROCESSING_METHODS`.
- Produces: `CropYearField({ value, onChange })`; `ProcessingField({ value, distinct, onChange })`.

> Thin wrappers over already-tested logic — typecheck-gated.

- [ ] **Step 1: Create `crop-year-field.tsx`**

```tsx
'use client'

import { AddableSelect } from './addable-select'
import { cropYearOptions } from './vocab-options'

/** Crop-year picker: date-generated options (May rollover), no add-new. */
export function CropYearField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = cropYearOptions(new Date(), value)
  return <AddableSelect value={value} options={options} onChange={onChange} allowAdd={false} />
}
```

- [ ] **Step 2: Create `processing-field.tsx`**

```tsx
'use client'

import { AddableSelect } from './addable-select'
import { mergeProcessingOptions } from './vocab-options'
import { PROCESSING_METHODS } from '@/components/samples/intake/constants'

/** Processing picker: canonical + distinct-from-data options, with "+ add new". */
export function ProcessingField({
  value,
  distinct,
  onChange,
}: {
  value: string
  distinct: string[]
  onChange: (v: string) => void
}) {
  const options = mergeProcessingOptions([...PROCESSING_METHODS], distinct, value)
  return (
    <AddableSelect value={value} options={options} onChange={onChange} allowAdd addLabel="Add processing method" />
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/certificates/cert-editor/crop-year-field.tsx src/components/certificates/cert-editor/processing-field.tsx
git commit -m "feat(cert-editor): CropYearField + ProcessingField pickers" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Vocab hook + inline-editable AttributesLine + overlay wiring

**Files:**
- Create: `src/components/certificates/cert-editor/use-sample-vocabularies.ts`
- Modify: `src/components/certificates/cert-editor/info-strip.tsx` (rewrite `AttributesLine`; add imports)
- Modify: `src/components/certificates/cert-editor/certificate-edit-overlay.tsx` (vocab fetch; new `AttributesLine` props)

**Interfaces:**
- Consumes: `InlineEdit` (T4), `CropYearField`/`ProcessingField` (T5), `CertificationsField` (existing), `GET /api/samples/vocabularies` (T2), `ed.setSampleField` (`use-cert-editor.ts:478`).
- Produces: `useSampleVocabularies(open: boolean): { processingMethods: string[] }`. `AttributesLine({ sample, draftSample, onFieldChange, distinctProcessing, onEditAll })`.

- [ ] **Step 1: Create the vocab hook**

Create `src/components/certificates/cert-editor/use-sample-vocabularies.ts`:

```ts
import { useEffect, useState } from 'react'

/** Fetch distinct processing methods once the overlay opens. Non-fatal on failure. */
export function useSampleVocabularies(open: boolean): { processingMethods: string[] } {
  const [processingMethods, setProcessingMethods] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    let active = true
    fetch('/api/samples/vocabularies')
      .then((r) => (r.ok ? r.json() : { processing_methods: [] }))
      .then((d) => {
        if (active) setProcessingMethods(Array.isArray(d.processing_methods) ? d.processing_methods : [])
      })
      .catch(() => {
        if (active) setProcessingMethods([])
      })
    return () => {
      active = false
    }
  }, [open])
  return { processingMethods }
}
```

- [ ] **Step 2: Add imports to `info-strip.tsx`**

At the top of `info-strip.tsx`, add:

```tsx
import { InlineEdit } from './inline-edit'
import { CropYearField } from './crop-year-field'
import { ProcessingField } from './processing-field'
```

- [ ] **Step 3: Rewrite `AttributesLine` in `info-strip.tsx`**

Replace the entire existing `AttributesLine` function (the `export function AttributesLine({ sample, draftSample, onEdit }) { ... }` block) with:

```tsx
/** Compact attributes band under the strip: crop · processing · certifications, each inline-editable. */
export function AttributesLine({
  sample,
  draftSample,
  onFieldChange,
  distinctProcessing,
  onEditAll,
}: {
  sample: CertSample
  draftSample: Record<string, any>
  onFieldChange: (field: string, value: any) => void
  distinctProcessing: string[]
  onEditAll: () => void
}) {
  const crop = ((draftSample.crop_year ?? sample.crop_year) || '') as string
  const processing = ((draftSample.processing_method ?? sample.processing_method) || '') as string
  const certs: string[] = Array.isArray(draftSample.certifications)
    ? draftSample.certifications
    : Array.isArray(sample.certifications)
      ? sample.certifications
      : []

  const labelCls = 'text-[11px] uppercase tracking-wide text-muted-foreground'
  const valueCls = 'text-sm font-medium text-foreground'

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
      <InlineEdit
        display={
          <span className="flex items-center gap-1.5">
            <span className={labelCls}>Crop</span>
            <span className={valueCls}>{crop || '—'}</span>
          </span>
        }
      >
        {(close) => (
          <CropYearField
            value={crop}
            onChange={(v) => {
              onFieldChange('crop_year', v)
              close()
            }}
          />
        )}
      </InlineEdit>

      <span className="text-muted-foreground">·</span>

      <InlineEdit
        display={
          <span className="flex items-center gap-1.5">
            <span className={labelCls}>Processing</span>
            <span className={valueCls}>{processing || '—'}</span>
          </span>
        }
      >
        {(close) => (
          <ProcessingField
            value={processing}
            distinct={distinctProcessing}
            onChange={(v) => {
              onFieldChange('processing_method', v)
              close()
            }}
          />
        )}
      </InlineEdit>

      <span className="text-muted-foreground">·</span>

      <InlineEdit
        contentClassName="w-72 p-3"
        display={
          <span className="flex flex-wrap items-center gap-1">
            {certs.length ? (
              certs.map((c, i) => (
                <span
                  key={`${c}-${i}`}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {c}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground">No certifications</span>
            )}
          </span>
        }
      >
        {() => (
          <CertificationsField
            sampleId={sample.id}
            value={certs}
            onChange={(next) => onFieldChange('certifications', next)}
          />
        )}
      </InlineEdit>

      <button
        type="button"
        onClick={onEditAll}
        className="ml-auto text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        Edit all details
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Wire the overlay**

In `certificate-edit-overlay.tsx`:
- Add the import near the other local imports: `import { useSampleVocabularies } from './use-sample-vocabularies'`.
- After `const ed = useCertEditor(sampleId, open, contractId)` (line ~57), add: `const { processingMethods } = useSampleVocabularies(open)`.
- Replace the `<AttributesLine ... />` render (line ~175) with:

```tsx
          <AttributesLine
            sample={sample}
            draftSample={draft.sample}
            onFieldChange={ed.setSampleField}
            distinctProcessing={processingMethods}
            onEditAll={() => setPanel('details')}
          />
```

(Leave the `<InfoStripBand ... onEdit={() => setPanel('details')} />` line unchanged — Task 7 handles it.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Manual smoke**

`/certificates` or `/samples/qc`: hovering the attributes line shows pencils; clicking Crop opens a popover with the year picker (latest `26/27`), Processing opens the picker with "+ add new", Certifications opens the chips editor; selecting updates the value live; "Edit all details" (right side) opens the full panel.

- [ ] **Step 7: Commit**

```bash
git add src/components/certificates/cert-editor/use-sample-vocabularies.ts src/components/certificates/cert-editor/info-strip.tsx src/components/certificates/cert-editor/certificate-edit-overlay.tsx
git commit -m "feat(cert-editor): inline-editable attributes line (crop picker, processing add-new, certs)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Inline-editable info-strip tiles

**Files:**
- Modify: `src/components/certificates/cert-editor/info-strip.tsx` (rewrite `InfoStripBand`; add small tile editors)
- Modify: `src/components/certificates/cert-editor/certificate-edit-overlay.tsx` (new `InfoStripBand` props)

**Interfaces:**
- Consumes: `InlineEdit` (T4), `ed.setSampleField`.
- Produces: `InfoStripBand({ sample, draftSample, onFieldChange })` — each tile inline-editable; Quantity edits bag count + weight together.

- [ ] **Step 1: Add tile-editor helpers to `info-strip.tsx`**

Add these helper components in `info-strip.tsx` (e.g. just above `InfoStripBand`). They reuse the existing `Input` import and the module-level `BAG_TYPES`:

```tsx
/** Single-line text editor for a tile; commits on Enter or blur. */
function InlineTextEditor({
  value,
  onCommit,
  mono,
}: {
  value: string
  onCommit: (v: string) => void
  mono?: boolean
}) {
  const [v, setV] = useState(value)
  return (
    <Input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(v)
        }
      }}
      onBlur={() => onCommit(v)}
      className={`h-8 w-48 ${mono ? 'font-mono' : ''}`}
    />
  )
}

/** Bag-type option list (value → label). */
function BagTypeEditor({ onSelect }: { onSelect: (value: string) => void }) {
  return (
    <div className="flex w-48 flex-col gap-0.5">
      {Object.entries(BAG_TYPES).map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onSelect(val)}
          className="rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Quantity editor: bag count + weight; stays open while typing. */
function QuantityEditor({
  draftSample,
  sample,
  onFieldChange,
}: {
  draftSample: Record<string, any>
  sample: CertSample
  onFieldChange: (field: string, value: any) => void
}) {
  const count = draftSample.bag_count ?? sample.bag_count ?? sample.bags ?? ''
  const weight = draftSample.bag_weight_kg ?? sample.bag_weight_kg ?? ''
  return (
    <div className="flex w-56 flex-col gap-2 p-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Bag count</label>
        <Input
          type="number"
          min="0"
          inputMode="numeric"
          value={count}
          onChange={(e) => onFieldChange('bag_count', e.target.value === '' ? null : parseInt(e.target.value, 10) || 0)}
          className="h-8"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Bag weight (kg)</label>
        <Input
          type="number"
          min="0"
          step="0.1"
          inputMode="decimal"
          value={weight}
          onChange={(e) => onFieldChange('bag_weight_kg', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
          className="h-8"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `InfoStripBand` in `info-strip.tsx`**

Replace the entire existing `InfoStripBand` function with the following. Each tile carries an `edit` render-prop; the tile value is wrapped in `InlineEdit`:

```tsx
/** Details band beneath the topbar — each tile is inline-editable. */
export function InfoStripBand({
  sample,
  draftSample,
  onFieldChange,
}: {
  sample: CertSample
  draftSample: Record<string, any>
  onFieldChange: (field: string, value: any) => void
}) {
  const bagCount = draftSample.bag_count ?? sample.bag_count ?? sample.bags
  const bagWeight = draftSample.bag_weight_kg ?? sample.bag_weight_kg
  const isPSS = ((draftSample.sample_type ?? sample.sample_type) || '').toLowerCase() === 'pss'

  type Tile = { label: string; value: React.ReactNode; edit: (close: () => void) => React.ReactNode }
  const tiles: Tile[] = [
    {
      label: 'Wolthers ref',
      value: draftSample.wolthers_contract_nr || sample.wolthers_contract_nr || '—',
      edit: (close) => (
        <InlineTextEditor
          value={(draftSample.wolthers_contract_nr ?? sample.wolthers_contract_nr ?? '') as string}
          onCommit={(v) => {
            onFieldChange('wolthers_contract_nr', v)
            close()
          }}
        />
      ),
    },
    {
      label: 'Seller ref',
      value: draftSample.seller_contract_nr || sample.seller_contract_nr || '—',
      edit: (close) => (
        <InlineTextEditor
          value={(draftSample.seller_contract_nr ?? sample.seller_contract_nr ?? '') as string}
          onCommit={(v) => {
            onFieldChange('seller_contract_nr', v)
            close()
          }}
        />
      ),
    },
    {
      label: 'Quantity',
      value: bagCount ? `${bagCount} × ${bagWeight ?? '—'} kg` : '—',
      edit: () => <QuantityEditor draftSample={draftSample} sample={sample} onFieldChange={onFieldChange} />,
    },
    {
      label: 'Bag type',
      value: bagTypeLabel(draftSample.bag_type ?? sample.bag_type),
      edit: (close) => (
        <BagTypeEditor
          onSelect={(v) => {
            onFieldChange('bag_type', v)
            close()
          }}
        />
      ),
    },
  ]
  if (isPSS) {
    tiles.push({
      label: 'Exporter sample #',
      value: draftSample.exporter_sample_number || sample.exporter_sample_number || '—',
      edit: (close) => (
        <InlineTextEditor
          value={(draftSample.exporter_sample_number ?? sample.exporter_sample_number ?? '') as string}
          onCommit={(v) => {
            onFieldChange('exporter_sample_number', v)
            close()
          }}
        />
      ),
    })
  } else {
    tiles.push({
      label: 'Container',
      value: draftSample.container_nr || sample.container_nr || '—',
      edit: (close) => (
        <InlineTextEditor
          value={(draftSample.container_nr ?? sample.container_nr ?? '') as string}
          mono
          onCommit={(v) => {
            onFieldChange('container_nr', v)
            close()
          }}
        />
      ),
    })
    tiles.push({
      label: 'ICO #',
      value: draftSample.ico_number || sample.ico_number || '—',
      edit: (close) => (
        <InlineTextEditor
          value={(draftSample.ico_number ?? sample.ico_number ?? '') as string}
          mono
          onCommit={(v) => {
            onFieldChange('ico_number', v)
            close()
          }}
        />
      ),
    })
  }

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col items-start gap-0.5 px-4 py-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</span>
          <InlineEdit
            display={<span className="text-sm font-medium text-foreground">{t.value}</span>}
          >
            {t.edit}
          </InlineEdit>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Update the overlay's `InfoStripBand` render**

In `certificate-edit-overlay.tsx`, replace the `<InfoStripBand ... />` line with:

```tsx
          <InfoStripBand sample={sample} draftSample={draft.sample} onFieldChange={ed.setSampleField} />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all pass (existing + the new vocab-options and AddableSelect tests).

- [ ] **Step 6: Manual smoke**

Hover a tile → pencil appears; click → popover edits that field (text tiles commit on Enter/blur; Bag type lists options; Quantity edits count + weight and the tile shows `count × weight kg`); changes are live; topbar Save persists; reopen confirms.

- [ ] **Step 7: Commit**

```bash
git add src/components/certificates/cert-editor/info-strip.tsx src/components/certificates/cert-editor/certificate-edit-overlay.tsx
git commit -m "feat(cert-editor): inline-editable info-strip tiles (text, bag type, quantity)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** crop picker (May rollover, no add-new) = T1+T5; processing add-new + persisted-by-usage = T1+T2+T5; InlineEdit pattern = T4; attributes line inline = T6; strip tiles inline + Quantity 2-field + "Edit all details" button = T6 (button) + T7 (tiles); vocab endpoint/hook = T2/T6; single-draft save (no per-field PATCH) = all editors call `ed.setSampleField`, topbar Save unchanged. Full panel retained via the button.
- **Save semantics:** every inline editor calls `onFieldChange → ed.setSampleField`, updating the lifted draft; the existing topbar Save sends one PATCH. `saveCommercial` already recomputes `bags_quantity_mt`/`equivalent_60kg_bags` when `bag_count`/`bag_weight_kg` change, so the Quantity editor needs no extra handling.
- **Compiles after every task:** T6 changes `AttributesLine` + its overlay render together; T7 changes `InfoStripBand` + its overlay render together. Intermediate states typecheck.
- **No migration; no PATCH allowlist change** — all edited fields already accepted.
- **Quality-lock:** intentionally no lock gating (LOCK_SENSITIVE_FIELDS is empty; only grading/cupping freeze, elsewhere).
- **Out of scope:** inline-editing the supply-chain parties table (stays in the panel), vocab admin table, per-origin crop boundaries.

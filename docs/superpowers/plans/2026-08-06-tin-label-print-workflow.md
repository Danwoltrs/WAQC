# Tin Label Print Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get tin labels off the screen and onto tins — full-width cut guides, a print modal instead of a download, and a one-click "print today's unprinted" batch backed by a print-tracking stamp.

**Architecture:** Two pure modules gain the new logic (`sleeve-label-data.ts` for trade-name resolution, a new `tin-label-batch.ts` for the Santos day boundary), both unit-tested without a database. Two thin API routes expose the batch. The existing size dialog becomes a two-step size → preview → print flow, and the QC page gets one button that drives it.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@react-pdf/renderer`, Supabase, shadcn/ui dialogs, vitest (jsdom, globals, colocated `*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-08-06-tin-label-print-workflow-design.md`

## Global Constraints

- Cut guides span the **full page width**, with a rule above the first label as well as below every label.
- The label's internal 165mm layout, field set, and the 2.5cm variant are unchanged.
- Five 40mm labels must still fit A4 landscape (5 × 113.39pt = 566.95pt of 595.28pt).
- The modal has **Print only** — no download button, no `link.click()` save path.
- "Today" means the calendar day in `America/Sao_Paulo`, using the existing `LABEL_TIME_ZONE` constant from `src/lib/sleeve-label-data.ts`. Never a second timezone constant.
- A sample is stamped printed **when Print is pressed**, never at PDF generation.
- `mark-printed` re-applies the `workflow_stage IN ('certified','rejected')` gate server-side; it never trusts the request body's ids alone.
- Company names on the label resolve `fantasy_name || name`, applied to **Seller, Client and Roaster**.
- Legal names are unchanged everywhere outside the tin label.
- Migrations live in `database/migrations/`. Daniel applies them himself — never run one.
- Run tests with `npx vitest run <path>`. **Never `npm test`** — watch mode, hangs.
- The repo may carry unrelated uncommitted changes and concurrent commits from other sessions. Stage only your own files; never `git add -A`.

---

### Task 1: Full-width cut guides

**Files:**
- Modify: `src/components/pdf/tin-sleeve-label.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new exports. `TinSleeveLabelData` and `TinSleeveLabelDocument` keep their current signatures.

There is no unit test here — react-pdf output is not meaningfully unit-testable. Verification is a typecheck plus a generated PDF.

- [ ] **Step 1: Split the row from the label**

In `createStyles`, replace the `labelContainer` style with two styles. `labelContainer` loses its border and keeps everything else; a new `labelRow` carries the full-width dashed rule:

```ts
    // The dashed rule lives on a full-page-width row so a guillotine has an
    // edge-to-edge line to register against. The 165mm label sits centred
    // inside it.
    labelRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'center',
      borderBottom: '0.3pt dashed #BBBBBB',
    },
    labelRowFirst: {
      borderTop: '0.3pt dashed #BBBBBB',
    },
    labelContainer: {
      width: 165 * MM,
      height: labelHeight,
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 3 * MM,
      paddingBottom: 3 * MM,
      paddingLeft: 3 * MM,
      paddingRight: 4 * MM,
    },
```

Note `labelContainer` no longer has `borderBottom`. Leaving it there would double-rule every cut.

- [ ] **Step 2: Wrap each label in its row**

In the render, wrap the existing `<View style={styles.labelContainer}>` in the new row. The `key` moves to the outer element:

```tsx
            <View
              key={index}
              style={index === 0 ? [styles.labelRow, styles.labelRowFirst] : styles.labelRow}
            >
              <View style={styles.labelContainer}>
                <Image src={label.logo_url} style={styles.logo} />
                {label.qr_code && <Image src={label.qr_code} style={styles.qrCode} />}

                <View style={styles.body}>
                  {/* everything currently inside labelContainer, unchanged */}
                </View>
              </View>
            </View>
```

Move the existing children across verbatim — the headline, the two `<Text>` lines and the foot. Do not re-indent-and-retype them from memory; cut and paste so nothing drifts.

- [ ] **Step 3: Remove the now-redundant page centering**

`styles.page` currently has `alignItems: 'center'`, which is what centred the 165mm container. Remove that line. The row is full width and centres its own child via `justifyContent: 'center'`, and a `width: '100%'` child inside a cross-axis-centering parent can shrink-wrap in react-pdf's flex implementation — which would pull the dashed rule back in from the edges, undoing this whole task.

`styles.page` becomes:

```ts
    page: {
      flexDirection: 'column',
      backgroundColor: '#FFFFFF',
      padding: 0,
    },
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep tin-sleeve-label`
Expected: no output.

- [ ] **Step 5: Verify the rendered sheet**

Generate a 4cm sheet from the running app and confirm: a dashed rule above the first label, one below each label, every rule spanning the full sheet width, and still five labels on one page with none clipped.

- [ ] **Step 6: Commit**

```bash
git add src/components/pdf/tin-sleeve-label.tsx
git commit -m "feat(labels): cut guides span the full sheet width

The dashed rule moves from the 165mm label onto a full-width row, with a
rule above the first label too, so a guillotine has an edge-to-edge
register at every cut."
```

---

### Task 2: Trade names on the label

**Files:**
- Modify: `src/lib/sleeve-label-data.ts`
- Modify: `src/lib/sleeve-label-data.test.ts`
- Modify: `src/app/api/samples/bulk/print-tin-sleeves/route.tsx`
- Modify: `src/app/api/samples/[id]/print-tin-sleeve/route.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `resolveCompanyName(company: CompanyNameLike | null | undefined): string | null` and `interface CompanyNameLike { name?: string | null; fantasy_name?: string | null }`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/sleeve-label-data.test.ts`. Import `resolveCompanyName` and `type CompanyNameLike` alongside the existing imports, then add this describe block:

```ts
describe('resolveCompanyName', () => {
  it('prefers the trade name', () => {
    expect(resolveCompanyName({ name: 'Syngenta AVC SA', fantasy_name: 'Syngenta' })).toBe('Syngenta')
  })

  it('falls back to the legal name when there is no trade name', () => {
    expect(resolveCompanyName({ name: 'Blaser Trading AG', fantasy_name: null })).toBe('Blaser Trading AG')
  })

  it('treats a blank trade name as absent', () => {
    expect(resolveCompanyName({ name: 'Cocatrel', fantasy_name: '   ' })).toBe('Cocatrel')
  })

  it('returns null when the company is missing entirely', () => {
    expect(resolveCompanyName(null)).toBeNull()
    expect(resolveCompanyName(undefined)).toBeNull()
  })

  it('returns null when neither name is set', () => {
    expect(resolveCompanyName({ name: null, fantasy_name: null })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/sleeve-label-data.test.ts`
Expected: FAIL — `resolveCompanyName is not a function` (or an import error).

- [ ] **Step 3: Write the implementation**

Add to `src/lib/sleeve-label-data.ts`, next to `resolveQualityName`:

```ts
export interface CompanyNameLike {
  name?: string | null
  fantasy_name?: string | null
}

/**
 * The name to print for a counterparty.
 *
 * Labels carry the trade name (nome fantasia) — nobody in the trade says
 * "Syngenta AVC SA". The legal name is the fallback, and stays authoritative
 * everywhere else: certificates, contracts, correspondence.
 */
export function resolveCompanyName(company: CompanyNameLike | null | undefined): string | null {
  if (!company) return null
  const trade = (company.fantasy_name || '').trim()
  if (trade) return trade
  return (company.name || '').trim() || null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/sleeve-label-data.test.ts`
Expected: PASS. The file's existing tests must all still pass.

- [ ] **Step 5: Add `fantasy_name` to the bulk route's joins**

In `src/app/api/samples/bulk/print-tin-sleeves/route.tsx`, change the four company joins in the `.select(...)` from `(name)` to `(name, fantasy_name)`:

```
        exporter:companies!samples_exporter_id_fkey(name, fantasy_name),
        seller:companies!samples_seller_id_fkey(name, fantasy_name),
        client:companies!samples_client_id_fkey(name, fantasy_name),
        roaster:companies!samples_roaster_id_fkey(name, fantasy_name),
```

- [ ] **Step 6: Use the helper in the bulk route**

Add `resolveCompanyName` to the existing import from `@/lib/sleeve-label-data`, then replace the three name expressions in the `buildSleeveLabelFields({...})` call:

```tsx
          sellerName: resolveCompanyName(sample.seller) || resolveCompanyName(sample.exporter),
          ...
          clientName: resolveCompanyName(sample.client),
          ...
          roasterName: resolveCompanyName(sample.roaster),
```

Keep every other argument exactly as it is.

- [ ] **Step 7: Do the same in the single-sample route**

In `src/app/api/samples/[id]/print-tin-sleeve/route.tsx`, apply the identical join change from Step 5 and the identical helper usage from Step 6, with one difference — this route honours `hide_exporter_on_label`, so its seller line is:

```tsx
      sellerName: s.hide_exporter_on_label
        ? null
        : (resolveCompanyName(s.seller) || resolveCompanyName(s.exporter)),
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "print-tin-sleeve|sleeve-label-data"`
Expected: no output.

Run: `npx vitest run src/lib/sleeve-label-data.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sleeve-label-data.ts src/lib/sleeve-label-data.test.ts \
  src/app/api/samples/bulk/print-tin-sleeves/route.tsx \
  "src/app/api/samples/[id]/print-tin-sleeve/route.tsx"
git commit -m "feat(labels): print trade names rather than legal names

Seller, Client and Roaster resolve fantasy_name with a fallback to the
legal name. Legal names stay authoritative on certificates and contracts."
```

---

### Task 3: Print-tracking column and the Santos day boundary

**Files:**
- Create: `database/migrations/20260806000000_add_tin_label_printed_at.sql`
- Create: `src/lib/tin-label-batch.ts`
- Test: `src/lib/tin-label-batch.test.ts`

**Interfaces:**
- Consumes: `LABEL_TIME_ZONE` — a module-private const at `src/lib/sleeve-label-data.ts:54` (`const LABEL_TIME_ZONE = 'America/Sao_Paulo'`). Add `export` to that existing line as part of this task. Do NOT declare a second copy in the new module: a label and the filter that selected it must never disagree about what day it is, and two constants is how that starts.
- Produces: `santosDayRangeUtc(now: Date): { startUtc: Date; endUtc: Date }`.

**Do not apply the migration.** Daniel applies migrations himself. Write the file and stop.

- [ ] **Step 1: Write the migration file**

Create `database/migrations/20260806000000_add_tin_label_printed_at.sql`:

```sql
-- Track when a sample's tin sleeve label was last printed.
--
-- Stamped when the operator presses Print in the label modal, not when the PDF
-- is generated, so previewing a batch does not consume it. Nullable with no
-- default: every existing sample reads as never printed, which is correct —
-- no new-format label has been printed yet.
--
-- Mirrors samples.cards_printed_at (20251127000000_add_sample_scan_tracking).

ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS tin_label_printed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_samples_tin_label_printed_at
  ON samples(tin_label_printed_at)
  WHERE tin_label_printed_at IS NOT NULL;

COMMENT ON COLUMN samples.tin_label_printed_at IS
  'When the tin sleeve label was last printed. NULL = never printed. Reprinting overwrites it; there is no print history.';
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/tin-label-batch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { santosDayRangeUtc } from './tin-label-batch'

describe('santosDayRangeUtc', () => {
  it('spans Santos midnight to Santos midnight, expressed in UTC', () => {
    // Santos is UTC-3, so 6 Aug 00:00 local is 6 Aug 03:00 UTC.
    const { startUtc, endUtc } = santosDayRangeUtc(new Date('2026-08-06T12:00:00.000Z'))
    expect(startUtc.toISOString()).toBe('2026-08-06T03:00:00.000Z')
    expect(endUtc.toISOString()).toBe('2026-08-07T03:00:00.000Z')
  })

  it('treats the small hours UTC as the previous Santos day', () => {
    // 02:00 UTC on 6 Aug is 23:00 on 5 Aug in Santos.
    const { startUtc, endUtc } = santosDayRangeUtc(new Date('2026-08-06T02:00:00.000Z'))
    expect(startUtc.toISOString()).toBe('2026-08-05T03:00:00.000Z')
    expect(endUtc.toISOString()).toBe('2026-08-06T03:00:00.000Z')
  })

  it('is exactly 24 hours wide', () => {
    const { startUtc, endUtc } = santosDayRangeUtc(new Date('2026-01-15T09:30:00.000Z'))
    expect(endUtc.getTime() - startUtc.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('is a pure function of its argument', () => {
    const a = santosDayRangeUtc(new Date('2026-08-06T12:00:00.000Z'))
    const b = santosDayRangeUtc(new Date('2026-08-06T12:00:00.000Z'))
    expect(a.startUtc.toISOString()).toBe(b.startUtc.toISOString())
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/tin-label-batch.test.ts`
Expected: FAIL — `Failed to resolve import "./tin-label-batch"`.

- [ ] **Step 4: Export the timezone constant**

In `src/lib/sleeve-label-data.ts`, add `export` to the existing declaration:

```ts
export const LABEL_TIME_ZONE = 'America/Sao_Paulo'
```

Do not change its value or its doc comment.

- [ ] **Step 5: Write the implementation**

Create `src/lib/tin-label-batch.ts`:

```ts
import { LABEL_TIME_ZONE } from '@/lib/sleeve-label-data'

/**
 * How far the label timezone is from UTC at a given instant, in milliseconds.
 * Positive east of UTC. Derived from Intl rather than hardcoded so the value
 * stays correct if Brazil ever reinstates DST.
 */
function zoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LABEL_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const v = (type: string) => Number(parts.find(p => p.type === type)!.value)
  // hourCycle can yield 24 for midnight in some runtimes; normalise it.
  const local = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'), v('second'))
  return local - instant.getTime()
}

/**
 * The UTC instants bounding the laboratory's calendar day containing `now`.
 *
 * "Today's samples" has to mean today in Santos, not today in UTC — a
 * certificate issued at 21:00 local is already tomorrow in UTC and would drop
 * out of the batch the operator is standing there waiting for. Returning UTC
 * instants keeps the database query a plain range scan on an indexed column
 * rather than a per-row timezone conversion.
 *
 * Takes `now` as an argument so it stays pure and testable — the module never
 * reads an ambient clock.
 */
export function santosDayRangeUtc(now: Date): { startUtc: Date; endUtc: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LABEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const v = (type: string) => Number(parts.find(p => p.type === type)!.value)
  const midnightAsIfUtc = new Date(Date.UTC(v('year'), v('month') - 1, v('day')))
  const startUtc = new Date(midnightAsIfUtc.getTime() - zoneOffsetMs(midnightAsIfUtc))
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000)

  return { startUtc, endUtc }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/tin-label-batch.test.ts`
Expected: PASS, 4 tests.

Also confirm nothing else broke: `npx vitest run src/lib/sleeve-label-data.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add database/migrations/20260806000000_add_tin_label_printed_at.sql \
  src/lib/tin-label-batch.ts src/lib/tin-label-batch.test.ts src/lib/sleeve-label-data.ts
git commit -m "feat(labels): add tin_label_printed_at and the Santos day boundary

The batch filter needs today in Santos, not today in UTC — a certificate
issued at 21:00 local is already tomorrow in UTC. Returns UTC instants so
the query stays a range scan."
```

---

### Task 4: Batch endpoints

**Files:**
- Create: `src/app/api/samples/tin-labels/pending-today/route.ts`
- Create: `src/app/api/samples/tin-labels/mark-printed/route.ts`

**Interfaces:**
- Consumes: `santosDayRangeUtc(now: Date): { startUtc: Date; endUtc: Date }` (Task 3); `samples.tin_label_printed_at` (Task 3's migration).
- Produces:
  - `GET /api/samples/tin-labels/pending-today` → `{ sample_ids: string[], count: number }`
  - `POST /api/samples/tin-labels/mark-printed`, body `{ sample_ids: string[] }` → `{ marked: number }`

There is no route-level test suite in this repo; tests are colocated pure-function tests under `src/lib/`. Do not build a Supabase mock harness. Verification is a typecheck plus a manual call.

**If the migration has not been applied yet**, these routes will fail at runtime with `column samples.tin_label_printed_at does not exist`. That is expected — they still typecheck, and Daniel applies the migration. Do not work around it.

- [ ] **Step 1: Write the pending-today route**

Create `src/app/api/samples/tin-labels/pending-today/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { santosDayRangeUtc } from '@/lib/tin-label-batch'

const PRINTABLE_STAGES = ['certified', 'rejected']

/**
 * GET /api/samples/tin-labels/pending-today
 *
 * Samples certified today (Santos time) whose tin label has not been printed.
 * Drives both the button's badge and the batch it prints, so the two can never
 * disagree.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { startUtc, endUtc } = santosDayRangeUtc(new Date())

    // Mother certificates issued today. Sub-contract certificates share their
    // mother's sample and would only produce duplicate ids.
    const { data: certRows, error: certError } = await supabase
      .from('certificates')
      .select('sample_id')
      .is('sample_contract_id', null)
      .not('certificate_number', 'is', null)
      .gte('created_at', startUtc.toISOString())
      .lt('created_at', endUtc.toISOString())

    if (certError) {
      console.error('Error fetching today\'s certificates:', certError)
      return NextResponse.json({
        error: 'Failed to fetch certificates',
        details: certError.message || String(certError),
      }, { status: 500 })
    }

    const candidateIds = Array.from(new Set((certRows || []).map(r => r.sample_id).filter(Boolean)))
    if (candidateIds.length === 0) {
      return NextResponse.json({ sample_ids: [], count: 0 })
    }

    const { data: samples, error: sampleError } = await supabase
      .from('samples')
      .select('id')
      .in('id', candidateIds)
      .in('workflow_stage', PRINTABLE_STAGES)
      .is('tin_label_printed_at', null)
      .is('deleted_at', null)

    if (sampleError) {
      console.error('Error fetching unprinted samples:', sampleError)
      return NextResponse.json({
        error: 'Failed to fetch samples',
        details: sampleError.message || String(sampleError),
      }, { status: 500 })
    }

    const sampleIds = (samples || []).map(s => s.id)
    return NextResponse.json({ sample_ids: sampleIds, count: sampleIds.length })
  } catch (error) {
    console.error('Error in GET /api/samples/tin-labels/pending-today:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
```

- [ ] **Step 2: Write the mark-printed route**

Create `src/app/api/samples/tin-labels/mark-printed/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const PRINTABLE_STAGES = ['certified', 'rejected']

/**
 * POST /api/samples/tin-labels/mark-printed
 * Body: { sample_ids: string[] }
 *
 * Stamps tin_label_printed_at. Called when the operator presses Print, not when
 * the PDF is generated, so previewing a batch does not consume it.
 *
 * The certified/rejected gate is re-applied here rather than trusted from the
 * request body: a crafted call must not be able to mark arbitrary samples as
 * printed and hide them from the next batch.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sample_ids } = body

    if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
      return NextResponse.json({ error: 'sample_ids array is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('samples')
      .update({ tin_label_printed_at: new Date().toISOString() })
      .in('id', sample_ids)
      .in('workflow_stage', PRINTABLE_STAGES)
      .is('deleted_at', null)
      .select('id')

    if (error) {
      console.error('Error marking tin labels printed:', error)
      return NextResponse.json({
        error: 'Failed to mark labels printed',
        details: error.message || String(error),
      }, { status: 500 })
    }

    return NextResponse.json({ marked: (data || []).length })
  } catch (error) {
    console.error('Error in POST /api/samples/tin-labels/mark-printed:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "tin-labels"`
Expected: no output.

If `tin_label_printed_at` is not yet in `src/lib/database.types.ts`, the Supabase client's generated types will reject it. If that happens, cast the update payload exactly as the existing routes cast unmapped columns — search the repo for `as any` on a `.update(` call and follow that pattern. Note it in your report; the types are regenerated separately.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/samples/tin-labels
git commit -m "feat(labels): endpoints for today's unprinted batch

pending-today supplies both the badge count and the batch, so they cannot
disagree. mark-printed re-applies the certification gate rather than
trusting the request body."
```

---

### Task 5: Two-step print modal

**Files:**
- Modify: `src/components/samples/tin-label-size-dialog.tsx` (substantial rewrite)

**Interfaces:**
- Consumes: `POST /api/samples/bulk/print-tin-sleeves` (existing, returns a PDF blob and an `X-Skipped-Samples` header); `POST /api/samples/tin-labels/mark-printed` (Task 4).
- Produces: `TinLabelSizeDialog` keeps its existing props — `{ open, onOpenChange, sampleIds, onSuccess? }`. Task 6 relies on that signature being unchanged.

- [ ] **Step 1: Rewrite the component**

Replace the whole file:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'

export type TinLabelSize = '4cm' | '2.5cm'

interface TinLabelSizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sampleIds: string[]
  onSuccess?: () => void
}

/**
 * Size, then preview, then print.
 *
 * Labels are never downloaded — the lab prints them, and a Downloads folder of
 * near-identical PDFs helps nobody. Samples are stamped as printed only when
 * Print is pressed, so opening a preview to check something does not consume
 * the batch.
 */
export function TinLabelSizeDialog({
  open,
  onOpenChange,
  sampleIds,
  onSuccess,
}: TinLabelSizeDialogProps) {
  const [step, setStep] = useState<'size' | 'preview'>('size')
  const [selectedSize, setSelectedSize] = useState<TinLabelSize>('4cm')
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [printedIds, setPrintedIds] = useState<string[]>([])
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Reset to the size step whenever the dialog reopens, and release the blob
  // URL so a long session does not accumulate them.
  useEffect(() => {
    if (!open) {
      setStep('size')
      setPdfUrl(current => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setPrintedIds([])
    }
  }, [open])

  const handleGenerate = async () => {
    if (sampleIds.length === 0) {
      toast.error('No samples selected')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/samples/bulk/print-tin-sleeves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: sampleIds, size: selectedSize }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate tin labels')
      }

      const skipped = Number(response.headers.get('X-Skipped-Samples') || '0')
      if (skipped > 0) {
        toast.warning(
          `${skipped} sample${skipped === 1 ? '' : 's'} skipped — not certified yet, so there is no certificate number to print.`
        )
      }

      const blob = await response.blob()
      setPdfUrl(URL.createObjectURL(blob))
      setPrintedIds(sampleIds)
      setStep('preview')
    } catch (error) {
      console.error('Error generating tin labels:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate tin labels')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrint = async () => {
    const frame = iframeRef.current
    if (!frame?.contentWindow) {
      toast.error('The preview is still loading. Try again in a moment.')
      return
    }

    try {
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } catch (error) {
      console.error('Error opening the print dialog:', error)
      toast.error('Could not open the print dialog.')
      return
    }

    // The browser gives us no reliable signal that paper came out, so the
    // stamp goes on once the dialog has been opened. A jammed print is
    // recovered by selecting those rows and using Tin Label again.
    try {
      const response = await fetch('/api/samples/tin-labels/mark-printed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: printedIds }),
      })
      if (!response.ok) {
        toast.warning('Printed, but these samples were not marked as printed. They will appear in the next batch.')
      }
    } catch {
      toast.warning('Printed, but these samples were not marked as printed. They will appear in the next batch.')
    }

    onSuccess?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={step === 'preview' ? 'sm:max-w-3xl' : 'sm:max-w-[425px]'}>
        <DialogHeader>
          <DialogTitle>
            {step === 'size' ? 'Select tin label size' : 'Print tin labels'}
          </DialogTitle>
          <DialogDescription>
            {step === 'size'
              ? `Choose the label size for ${sampleIds.length} sample${sampleIds.length !== 1 ? 's' : ''}.`
              : `${printedIds.length} sample${printedIds.length !== 1 ? 's' : ''} at ${selectedSize}. Check the sheet, then print.`}
          </DialogDescription>
        </DialogHeader>

        {step === 'size' ? (
          <div className="py-6">
            <RadioGroup
              value={selectedSize}
              onValueChange={(value) => setSelectedSize(value as TinLabelSize)}
              className="space-y-4"
            >
              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="4cm" id="size-4cm" />
                <div className="flex-1">
                  <Label htmlFor="size-4cm" className="text-sm font-medium leading-none cursor-pointer">
                    4cm height (standard)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">For standard-sized tin containers</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors">
                <RadioGroupItem value="2.5cm" id="size-2.5cm" />
                <div className="flex-1">
                  <Label htmlFor="size-2.5cm" className="text-sm font-medium leading-none cursor-pointer">
                    2.5cm height (compact)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">For smaller tin containers</p>
                </div>
              </div>
            </RadioGroup>
          </div>
        ) : (
          <div className="h-[60vh] w-full overflow-hidden rounded-md border bg-muted">
            {pdfUrl && (
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                title="Tin label preview"
                className="h-full w-full"
              />
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          {step === 'size' ? (
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          ) : (
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep tin-label-size-dialog`
Expected: no output.

- [ ] **Step 3: Verify by hand**

With the dev server running, select certified samples on `/samples/qc` and use Tin Label. Confirm: the size step appears, Continue generates and shows the PDF inline, Print opens the browser print dialog, and the dialog closes afterwards. Confirm there is no Download button anywhere in the flow.

- [ ] **Step 4: Commit**

```bash
git add src/components/samples/tin-label-size-dialog.tsx
git commit -m "feat(labels): print labels from a preview modal instead of downloading

Size, then an inline PDF preview, then Print. Samples are stamped as
printed when Print is pressed, so opening a preview to check something
does not consume the batch."
```

---

### Task 6: Print today's unprinted

**Files:**
- Modify: `src/app/samples/qc/page.tsx`

**Interfaces:**
- Consumes: `GET /api/samples/tin-labels/pending-today` (Task 4); `TinLabelSizeDialog` with props `{ open, onOpenChange, sampleIds, onSuccess? }` (Task 5).
- Produces: nothing.

The QC page is large. Make minimal targeted edits; do not restructure it.

- [ ] **Step 1: Add the state and the fetch**

Near the existing `showTinLabelDialog` state (around line 203), add:

```tsx
  const [pendingTodayIds, setPendingTodayIds] = useState<string[]>([])
  const [tinLabelBatchIds, setTinLabelBatchIds] = useState<string[] | null>(null)
```

`tinLabelBatchIds` holds an explicit batch when the button drives the dialog; when it is `null` the dialog uses the current row selection, exactly as it does today.

Then add the fetch, placed with the page's other effects:

```tsx
  const refreshPendingToday = useCallback(async () => {
    try {
      const response = await fetch('/api/samples/tin-labels/pending-today')
      if (!response.ok) return
      const data = await response.json()
      setPendingTodayIds(Array.isArray(data.sample_ids) ? data.sample_ids : [])
    } catch {
      // A missing badge is not worth interrupting the page for.
      setPendingTodayIds([])
    }
  }, [])

  useEffect(() => {
    refreshPendingToday()
  }, [refreshPendingToday])
```

If `useCallback` is not already imported from `react` in this file, add it to the existing import.

- [ ] **Step 2: Add the button**

Next to the search `<Input>` (around line 1218), add:

```tsx
                  {pendingTodayIds.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTinLabelBatchIds(pendingTodayIds)
                        setShowTinLabelDialog(true)
                      }}
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Print today&apos;s unprinted · {pendingTodayIds.length}
                    </Button>
                  )}
```

`Printer` and `Button` are already imported in this file — confirm before assuming.

- [ ] **Step 3: Wire the dialog to the batch**

Find the `<TinLabelSizeDialog ... />` usage (around line 2074) and change its `sampleIds` and `onOpenChange`:

```tsx
      <TinLabelSizeDialog
        open={showTinLabelDialog}
        onOpenChange={(open) => {
          setShowTinLabelDialog(open)
          if (!open) setTinLabelBatchIds(null)
        }}
        sampleIds={tinLabelBatchIds ?? Array.from(selectedSamples)}
        onSuccess={() => {
          refreshPendingToday()
        }}
      />
```

Keep any other props the existing usage passes. If it already has an `onSuccess`, call the existing behaviour first and then `refreshPendingToday()` — do not drop it.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "qc/page"`
Expected: no output.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS. Report the totals.

- [ ] **Step 6: Verify by hand**

Requires the migration to have been applied. With samples certified today and unprinted, the button appears with a count. Clicking it opens the size step, then the preview, then prints. Afterwards the badge drops. With nothing pending, the button is absent entirely.

- [ ] **Step 7: Commit**

```bash
git add src/app/samples/qc/page.tsx
git commit -m "feat(labels): one button prints today's unprinted labels

Resolves the batch server-side and drives the same size/preview/print
dialog. Hidden when nothing is pending. The badge and the batch come from
one endpoint, so they cannot disagree."
```

---

## Manual verification before shipping

- [ ] Apply `database/migrations/20260806000000_add_tin_label_printed_at.sql` (Daniel).
- [ ] Print a 4cm sheet: dashed rules span the full width, one above the first label and one below each, five per page, none clipped.
- [ ] Cut a sheet on the guillotine — the rules should register edge to edge.
- [ ] Confirm Seller, Client and Roaster show trade names. Where a company has no `fantasy_name` the legal name still appears; that is a data gap, not a bug.
- [ ] Print a batch, then reopen the button — the printed samples must be gone from the count.
- [ ] Open the dialog, generate a preview, then Cancel. Those samples must still be in the next batch.
- [ ] Check the 2.5cm sheet still prints correctly after the row split.

## Follow-on

Part 2 of `2026-08-05-sleeve-label-and-mobile-certificate-design.md` — the mobile certificate page rebuild — remains outstanding and is unaffected by this plan.

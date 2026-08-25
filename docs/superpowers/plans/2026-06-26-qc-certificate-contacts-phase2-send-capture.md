# QC Certificate Contacts — Phase 2 (send-flow capture) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop silently dropping counterparties with no QC-certificate recipient at send time; instead surface every buyer and seller in both composers, and let the sender add an email inline (group or person) with an optional "save as a QC-cert recipient for this company" that persists via Phase 1's upsert before the email goes out.

**Architecture:** A single shared `RecipientCaptureForm` is mounted in both composers wherever a side's `to` list is empty. The batch queue's pure unit-builder (`buildBatchUnits`) stops skipping empty-recipient companies and instead emits them flagged `needsRecipients: true`; the single composer already renders both panels, so it only needs the company id surfaced so the form knows where to persist. "Save for future" reuses Phase 1's `POST /api/companies/[id]/qc-contacts` (service-role, staff-gated, set-union tag) — no new write path, no migration. Persisting happens before send so a failed save surfaces first; the existing `to.length > 0` server guards stay as the backstop.

**Tech Stack:** Next.js 14 App Router, TypeScript, React client components, Tailwind, Supabase (service-role for the reused write route), Vitest + @testing-library/react.

## Global Constraints

- **No emojis anywhere in the UI** (project rule).
- **No migration** — Phase 2 uses the same shared `contacts` table.
- **The set-union invariant is sacred:** persisting a recipient must go through `upsertQcRecipient` (which uses `addQcCertTag`) — never hand-roll `routing_purposes` writes; never clobber a contact's other SENDS tags.
- **Persist BEFORE send:** the "save for future" POST must succeed before the email address is accepted into `to`; a failed save shows inline and does NOT add the recipient.
- **Service-role routes stay staff-gated** with `isStaffSampleManager`. The reused `POST /api/companies/[id]/qc-contacts` already is — Phase 2 adds no new service-role route.
- **Send/dispatch routes are unchanged in how they send** — they still receive a final `to`/`cc` list and keep their `to.length > 0` guard.
- WAQC is a **single repo**. Tests: `npx vitest run <path>`. Types: `npx tsc --noEmit`. Push verified work to `main` → Vercel prod.
- Keep files under ~2000 lines; if a composer edit pushes one past that, flag a split.

---

### Task 1: `buildBatchUnits` emits empty-recipient companies (flagged) instead of skipping

**Files:**
- Modify: `src/lib/approval-notification/batch-send.ts` (the `BatchUnit` interface ~102-118; the `buildBatchUnits` company loop ~150-170)
- Test: `src/lib/approval-notification/batch-send.test.ts` (the `buildBatchUnits` describe block ~73-127)

**Interfaces:**
- Consumes: `PanelPrefill` (`{ greeting, to: RecipientChip[], cc: RecipientChip[] }`) from `./types`; `buildBatchApprovalSubject`/`buildBatchApprovalBody` from `./batch-approval-template`.
- Produces: `BatchUnit` now carries `needsRecipients: boolean`. Every (company, side) bucket yields a unit; a company with no resolvable TO recipient yields a unit with `to: []`, `needsRecipients: true`. Consumed by Task 3 (batch composer).

- [ ] **Step 1: Update the two existing `buildBatchUnits` tests that assert empties are skipped, and add a flag assertion**

In `src/lib/approval-notification/batch-send.test.ts`, replace the test at ~116-121 (`'skips a company with no resolvable TO recipient'`) and add a flag test. The `'skips a side with no company'` test (~123-127) stays unchanged (a null `companyId` still produces no bucket).

```ts
  it('emits a company with no resolvable TO recipient, flagged needsRecipients', () => {
    const noTo = new Map(panels)
    noTo.set('buyerA', panel('Alpha team', []))
    const units = buildBatchUnits(samples, new Map(), noTo, names)
    const alpha = units.find((u) => u.companyId === 'buyerA')
    expect(alpha).toBeDefined()
    expect(alpha!.to).toEqual([])
    expect(alpha!.needsRecipients).toBe(true)
    // It still carries its samples and a greeting so the composer can render it.
    expect(alpha!.samples.map((s) => s.sampleId)).toEqual(['s2'])
    expect(alpha!.greeting).toBe('Alpha team')
  })

  it('flags units with recipients as needsRecipients=false', () => {
    const units = buildBatchUnits(samples, new Map(), panels, names)
    expect(units.every((u) => u.needsRecipients === false)).toBe(true)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/approval-notification/batch-send.test.ts`
Expected: FAIL — `alpha` is `undefined` (currently skipped), and `needsRecipients` does not exist on `BatchUnit`.

- [ ] **Step 3: Add `needsRecipients` to the `BatchUnit` interface**

In `src/lib/approval-notification/batch-send.ts`, add the field to `BatchUnit` (after `noAttachments?`):

```ts
export interface BatchUnit {
  side: ApprovalSide
  companyId: string
  companyName: string
  greeting: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  samples: BatchUnitSample[]
  // Quality summary table (set in the queue for both sides). `body` becomes the
  // editable cover note; this table is rendered read-only and rebuilt at send.
  summaryText?: string
  summaryHtml?: string
  // True for seller units: certificates are NOT attached (sellers don't pay).
  noAttachments?: boolean
  // True when this (company, side) has no resolvable TO recipient. The unit is
  // still emitted so the composer surfaces it as a capture step; Send stays
  // blocked until the sender adds at least one recipient.
  needsRecipients: boolean
}
```

- [ ] **Step 4: Rewrite the company loop to emit empties flagged**

Replace the loop body at ~150-170 (the `const sideUnits` block, from `for (const [companyId, sampleLines] of bucket)` through the `sideUnits.sort(...)`):

```ts
    const sideUnits: BatchUnit[] = []
    for (const [companyId, sampleLines] of bucket) {
      const panel = panelsByCompany.get(companyId)
      const companyName = companyNameById.get(companyId) ?? companyId
      const to = panel ? panel.to.map((c) => c.email) : []
      const cc = panel ? panel.cc.map((c) => c.email) : []
      const greeting = panel?.greeting ?? `${companyName} team`
      const tmpl = { greeting, side, lines: sampleLines }
      sideUnits.push({
        side,
        companyId,
        companyName,
        greeting,
        to,
        cc,
        subject: buildBatchApprovalSubject(tmpl),
        body: buildBatchApprovalBody(tmpl),
        samples: sampleLines,
        needsRecipients: to.length === 0,
      })
    }
    sideUnits.sort((a, b) => a.companyName.localeCompare(b.companyName))
    units.push(...sideUnits)
```

Also update the doc comment above `buildBatchUnits` (~120-125): replace the sentence "Companies with no resolvable TO recipient are skipped." with "Companies with no resolvable TO recipient are still emitted, flagged `needsRecipients`, so the composer can capture one."

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/approval-notification/batch-send.test.ts`
Expected: PASS (all cases green, including the unchanged ordering/grouping/already-sent tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (If it flags any other constructor of `BatchUnit` missing `needsRecipients`, the only producer is `buildBatchUnits`; no other call sites build the object literal.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/approval-notification/batch-send.ts src/lib/approval-notification/batch-send.test.ts
git commit -m "feat(qc-contacts): surface empty-recipient batch units instead of skipping"
```

---

### Task 2: Shared `RecipientCaptureForm` component (group/person + save-for-future)

**Files:**
- Create: `src/components/samples/approval/recipient-capture.tsx`
- Test: `src/components/samples/approval/recipient-capture.test.tsx`

**Interfaces:**
- Consumes: `POST /api/companies/[id]/qc-contacts` (Phase 1; body `{ email, name?, isGroup }`, returns `{ contact }` or `{ error }` with a non-2xx status).
- Produces: `RecipientCaptureForm` with props `{ companyId: string | null; companyName: string; onAdd: (email: string) => void }`. On a successful add it calls `onAdd(email)` exactly once; when "save for future" is checked it POSTs first and only calls `onAdd` if the POST succeeds. Consumed by Task 3 (batch composer) and Task 5 (single composer).

- [ ] **Step 1: Write the failing tests**

Create `src/components/samples/approval/recipient-capture.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecipientCaptureForm } from './recipient-capture'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('RecipientCaptureForm', () => {
  it('adds an email ephemerally without POSTing when save-for-future is unchecked', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'one@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('one@ahold.nl'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs to qc-contacts then adds the email when save-for-future is checked', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ contact: { id: 'c9' } }) } as Response))
    vi.stubGlobal('fetch', fetchMock)
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'two@ahold.nl' } })
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('two@ahold.nl'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/companies/co1/qc-contacts')
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ email: 'two@ahold.nl', isGroup: false })
  })

  it('does NOT add the email when the save POST fails', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'That email already exists for this company.' }) } as Response))
    vi.stubGlobal('fetch', fetchMock)
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'dupe@ahold.nl' } })
    fireEvent.click(screen.getByLabelText(/save as a QC-certificate recipient/i))
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument())
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('rejects an invalid email without calling onAdd', () => {
    vi.stubGlobal('fetch', vi.fn())
    const onAdd = vi.fn()
    render(<RecipientCaptureForm companyId="co1" companyName="Ahold" onAdd={onAdd} />)
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('hides the save-for-future checkbox when there is no company', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<RecipientCaptureForm companyId={null} companyName="Unknown" onAdd={() => {}} />)
    expect(screen.queryByLabelText(/save as a QC-certificate recipient/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/samples/approval/recipient-capture.test.tsx`
Expected: FAIL — module `./recipient-capture` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/samples/approval/recipient-capture.tsx`:

```tsx
'use client'

import { useState } from 'react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  /** Company the recipient belongs to; null disables "save for future" (ephemeral only). */
  companyId: string | null
  companyName: string
  /** Called once with the email after a successful add (post-persist when saving). */
  onAdd: (email: string) => void
}

/**
 * Inline capture for a missing QC-certificate recipient, shared by the single and
 * batch send composers. Asks group-or-person and, when a company is known, offers
 * to persist the address as a QC-cert recipient for next time (Phase 1 upsert).
 * Persist happens BEFORE the email is accepted, so a failed save surfaces first.
 */
export function RecipientCaptureForm({ companyId, companyName, onAdd }: Props) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [saveForFuture, setSaveForFuture] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setEmail('')
    setName('')
    setIsGroup(false)
    setSaveForFuture(false)
    setError(null)
  }

  const add = async () => {
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    if (saveForFuture && companyId) {
      setBusy(true)
      try {
        const res = await fetch(`/api/companies/${companyId}/qc-contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: value, name: isGroup ? null : name.trim() || null, isGroup }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data?.error || 'Failed to save recipient.')
          return
        }
      } catch {
        setError('Failed to save recipient.')
        return
      } finally {
        setBusy(false)
      }
    }
    onAdd(value)
    reset()
  }

  return (
    <div className="rounded-[12px] border border-amber-400/50 bg-amber-50/50 p-3 dark:border-amber-400/30 dark:bg-amber-400/5">
      <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
        No QC-certificate recipient for {companyName}. Add an email or group inbox to send.
      </p>

      <div className="mb-2 inline-flex rounded-[10px] bg-black/5 p-1 dark:bg-white/10">
        <button
          type="button"
          onClick={() => setIsGroup(false)}
          className={`rounded-[7px] px-3 py-1 text-xs ${!isGroup ? 'bg-white font-medium shadow-sm dark:bg-[#2A2A2A]' : 'opacity-60'}`}
        >
          Person
        </button>
        <button
          type="button"
          onClick={() => setIsGroup(true)}
          className={`rounded-[7px] px-3 py-1 text-xs ${isGroup ? 'bg-white font-medium shadow-sm dark:bg-[#2A2A2A]' : 'opacity-60'}`}
        >
          Group inbox
        </button>
      </div>

      <input
        className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@company.com"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
      />

      {!isGroup && (
        <input
          className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional, for the greeting)"
        />
      )}

      {companyId && (
        <label className="mb-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={saveForFuture} onChange={(e) => setSaveForFuture(e.target.checked)} />
          Also save as a QC-certificate recipient for {companyName}.
        </label>
      )}

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      <button
        type="button"
        onClick={add}
        disabled={busy}
        className="rounded-lg bg-[#556b2f] px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Add recipient'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/samples/approval/recipient-capture.test.tsx`
Expected: PASS (all five cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/samples/approval/recipient-capture.tsx src/components/samples/approval/recipient-capture.test.tsx
git commit -m "feat(qc-contacts): shared recipient capture form (group/person + save-for-future)"
```

---

### Task 3: Wire the capture form into the batch composer

**Files:**
- Modify: `src/components/certificates/batch-approval-send-view.tsx` (the `QueueResponse` type ~18-21; the amber dead-end ~220-225; `sendAllRemaining` ~128-146)
- Test: `src/components/certificates/batch-approval-send-view.test.tsx` (new)

**Interfaces:**
- Consumes: `BatchUnit.needsRecipients` (Task 1); `RecipientCaptureForm` (Task 2); `patchCurrent({ to })` (existing local helper).
- Produces: a `needsRecipients` unit renders the capture form in the carousel; adding a recipient appends to `current.to`, which unlocks the existing Send button (`disabled={... current.to.length === 0}`). `sendAllRemaining` skips units that still have an empty `to`.

- [ ] **Step 1: Write the failing test**

Create `src/components/certificates/batch-approval-send-view.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BatchApprovalSendView } from './batch-approval-send-view'
import type { BatchUnit } from '@/lib/approval-notification/batch-send'

const emptyUnit: BatchUnit = {
  side: 'buyer', companyId: 'co1', companyName: 'Ahold', greeting: 'Ahold team',
  to: [], cc: ['qualitycontrol@wolthers.com'], subject: 'Subj', body: 'Body',
  samples: [{ sampleId: 's1', containerNr: 'C1', certNumber: 'CERT-1', contractNumber: '100/26', decision: 'approved', reason: null, reference: null, date: null }],
  needsRecipients: true,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/batch-send/queue')) {
      return { ok: true, json: async () => ({ units: [emptyUnit], skipped: { noContract: 0, noRecipients: 0 } }) } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  }))
})

describe('BatchApprovalSendView capture', () => {
  it('shows the capture form for a needsRecipients unit and unlocks Send after adding', async () => {
    render(<BatchApprovalSendView open range={{ from: '2026-06-01', to: '2026-06-30' }} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument())
    const send = screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'buyer@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /add recipient/i }))
    await waitFor(() => expect((screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement).disabled).toBe(false))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/certificates/batch-approval-send-view.test.tsx`
Expected: FAIL — there is no `name@company.com` input (today the empty case renders the amber dead-end text, not a form).

- [ ] **Step 3: Import the capture form and update the `QueueResponse` type**

At the top of `src/components/certificates/batch-approval-send-view.tsx`, add the import beside the existing ones:

```tsx
import { RecipientCaptureForm } from '@/components/samples/approval/recipient-capture'
```

(The `QueueResponse` interface needs no change — `units: BatchUnit[]` already carries `needsRecipients` after Task 1.)

- [ ] **Step 4: Replace the amber dead-end with the capture form**

Replace the block at ~220-225:

```tsx
                  {current.to.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No QC-certificate recipients are configured for {current.companyName}. Add a contact with the
                      &ldquo;QC certificates&rdquo; send-flag in sys.wolthers.com, or enter a recipient above.
                    </p>
                  )}
```

with:

```tsx
                  {current.to.length === 0 && (
                    <RecipientCaptureForm
                      companyId={current.companyId}
                      companyName={current.companyName}
                      onAdd={(email) => patchCurrent({ to: [...current.to, email] })}
                    />
                  )}
```

- [ ] **Step 5: Skip still-empty units in "Send all remaining"**

In `sendAllRemaining` (~128-146), guard against posting a unit that has no recipient (the batch-send route would reject it on the `to.length > 0` backstop). Replace the loop body start:

```tsx
    for (let i = index; i < units.length; i++) {
      const unit = units[i]
      setIndex(i)
      if (unit.to.length === 0) {
        // Can't send a unit with no recipient; leave it for manual capture.
        collected.push({ companyId: unit.companyId, side: unit.side, ok: false, failed: unit.samples.length })
        setResults((prev) => [...prev, collected[collected.length - 1]])
        continue
      }
      try {
```

(The rest of the loop body — the `try { const r = await postUnit(unit) ... }` — is unchanged.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/components/certificates/batch-approval-send-view.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/certificates/batch-approval-send-view.tsx src/components/certificates/batch-approval-send-view.test.tsx
git commit -m "feat(qc-contacts): batch composer captures missing recipients inline"
```

---

### Task 4: Surface `buyerId`/`sellerId` from the single-sample prefill route

**Files:**
- Modify: `src/lib/approval-notification/types.ts` (the `ApprovalPrefill` interface ~31-35)
- Modify: `src/app/api/samples/[id]/approval-recipients/route.ts` (the `payload` object ~110-128)

**Interfaces:**
- Consumes: `ctx.sellerId`/`ctx.buyerId` (already resolved by `resolveSampleContract`).
- Produces: `ApprovalPrefill` gains `sellerId: string | null` and `buyerId: string | null`. Consumed by Task 5 (single composer) so the capture form knows which company to persist to.

- [ ] **Step 1: Add the fields to `ApprovalPrefill`**

In `src/lib/approval-notification/types.ts`:

```ts
export interface ApprovalPrefill {
  sample: ApprovalSampleFields
  panels: { seller: PanelPrefill; buyer: PanelPrefill }
  certificateAvailable: boolean
  sellerId: string | null
  buyerId: string | null
}
```

- [ ] **Step 2: Populate them in the route payload**

In `src/app/api/samples/[id]/approval-recipients/route.ts`, extend the `payload` literal (~110-128) — add the two fields after `certificateAvailable`:

```ts
    certificateAvailable: !!cert,
    sellerId: ctx.sellerId,
    buyerId: ctx.buyerId,
  }
```

- [ ] **Step 3: Typecheck (this is the verification — pure type + literal change)**

Run: `npx tsc --noEmit`
Expected: PASS. `ctx` is the `resolveSampleContract` result and already exposes `buyerId`/`sellerId` (same shape used by `companies` lookup at ~66).

- [ ] **Step 4: Commit**

```bash
git add src/lib/approval-notification/types.ts src/app/api/samples/[id]/approval-recipients/route.ts
git commit -m "feat(qc-contacts): surface buyer/seller company ids in approval prefill"
```

---

### Task 5: Wire the capture form into the single-sample composer

**Files:**
- Modify: `src/components/samples/approval-send-view.tsx` (the `PanelWithSide` interface ~19-22; the `make` builder ~44-67; the panels render ~128-137)
- Test: `src/components/samples/approval-send-view.test.tsx` (new)

**Interfaces:**
- Consumes: `ApprovalPrefill.buyerId`/`sellerId` (Task 4); `RecipientCaptureForm` (Task 2).
- Produces: each panel carries its `companyId`; a panel with an empty `to` renders the capture form; adding a recipient appends to that panel's `to`, including that side in the existing "Send to both" POST (which already filters `to.length > 0`).

- [ ] **Step 1: Write the failing test**

Create `src/components/samples/approval-send-view.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApprovalSendView } from './approval-send-view'

const prefill = {
  sample: {
    trackingNumber: 'BR-1/26', sampleType: 'pss', status: 'approved', contractNumber: '100/26',
    sampleCode: null, awb: null, courier: null, sellerReference: null, buyerReference: null, comments: null,
  },
  panels: {
    seller: { greeting: 'Seller team', to: [{ email: 's@seller.com', name: null, nickname: null, isGroupMailbox: false }], cc: [] },
    buyer: { greeting: 'buyer team', to: [], cc: [] },
  },
  certificateAvailable: false,
  sellerId: 'sellerCo',
  buyerId: 'buyerCo',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/approval-recipients')) {
      return { ok: true, json: async () => prefill } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  }))
})

describe('ApprovalSendView capture', () => {
  it('shows the capture form for the empty buyer side and persists to its company', async () => {
    render(<ApprovalSendView sampleId="smp1" open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument())
    // Only the buyer side (empty) shows the capture form; the checkbox names the buyer.
    expect(screen.getByLabelText(/save as a QC-certificate recipient/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/samples/approval-send-view.test.tsx`
Expected: FAIL — no capture form is rendered for the empty buyer panel.

- [ ] **Step 3: Add `companyId` to `PanelWithSide` and the import**

In `src/components/samples/approval-send-view.tsx`, add the import:

```tsx
import { RecipientCaptureForm } from './approval/recipient-capture'
```

Extend the interface (~19-22):

```tsx
interface PanelWithSide extends PanelState {
  side: ApprovalSide
  subject: string
  companyId: string | null
}
```

- [ ] **Step 4: Populate `companyId` in `make`**

The `make` closure (~44-67) has access to `p` (the `ApprovalPrefill`). Add `companyId` to the returned object — change the `make` signature to read the id and include it:

```tsx
        const make = (side: ApprovalSide, title: string): PanelWithSide => {
          const panel = side === 'seller' ? p.panels.seller : p.panels.buyer
          const companyId = side === 'seller' ? p.sellerId : p.buyerId
          const tmplInput = {
            decision: fields.status,
            greeting: panel.greeting,
            contractNumber: fields.contractNumber,
            sellerReference: fields.sellerReference,
            buyerReference: fields.buyerReference,
            sampleType: fields.sampleType ?? 'pss',
            sampleCode: fields.sampleCode,
            trackingNumber: fields.trackingNumber,
            awb: fields.awb,
            courier: fields.courier,
            comments: fields.comments,
          }
          return {
            side,
            title,
            companyId,
            to: panel.to.map((c) => c.email),
            cc: panel.cc.map((c) => c.email),
            subject: buildSampleApprovedSubject(tmplInput),
            body: buildSampleApprovedBody(tmplInput),
          }
        }
```

- [ ] **Step 5: Render the capture form under an empty panel**

In the panels map (~128-137), render the capture form when a panel's `to` is empty. Replace the `panels.map(...)` block:

```tsx
            {panels.map((p, i) => (
              <div key={p.side} className="space-y-2">
                <RecipientPanel
                  title={p.title}
                  to={p.to}
                  cc={p.cc}
                  body={p.body}
                  onChange={(next) => updatePanel(i, next)}
                />
                {p.to.length === 0 && (
                  <RecipientCaptureForm
                    companyId={p.companyId}
                    companyName={p.title}
                    onAdd={(email) => updatePanel(i, { ...p, to: [...p.to, email] })}
                  />
                )}
              </div>
            ))}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/components/samples/approval-send-view.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/samples/approval-send-view.tsx src/components/samples/approval-send-view.test.tsx
git commit -m "feat(qc-contacts): single composer captures missing recipients inline"
```

---

### Task 6: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all prior tests plus the new `recipient-capture`, `batch-approval-send-view`, `approval-send-view`, and the updated `batch-send` tests. (One unrelated network-dependent test may be transiently flaky per the handoff; everything else green.)

- [ ] **Step 2: Final typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Hand back for visual QA**

Do not push without Daniel's go-ahead. Report: tests + typecheck green; ask Daniel to QA both composers (light/dark) with a real no-recipient company — the batch "Send unsent certificates" path and the single-sample Approval—Send — confirming group-vs-person, save-for-future persistence (recipient appears on the company's Contacts tab afterward), and that ephemeral (unchecked) sends do not persist.

---

## Self-Review

**Spec coverage (§3 of the design doc):**
- "Stop silently dropping companies" → Task 1 (`buildBatchUnits` emits empties).
- Batch: `buildBatchUnits` no longer `continue`s; queue stops bucketing into `skipped.noRecipients` → Task 1 makes empties covered units, so the queue's `noRecipients` counter naturally reports 0 with no route logic change (verified by reasoning + Task 6). The batch composer renders `needsRecipients` units blocked-until-added → Task 3.
- Single: empty side shows the capture form; `approval-recipients` surfaces `buyerId`/`sellerId` → Tasks 4 + 5.
- Inline capture form: group/person toggle, optional person name, "save for future" → POST to qc-contacts (checked) or ephemeral (unchecked) → Task 2.
- Persist before send; send routes unchanged → enforced in Task 2 (POST gates `onAdd`); send routes untouched.
- Same shared table, no migration, staff-gated reuse → Global Constraints; reuses Phase 1 POST.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every code step shows full code.

**Type consistency:** `needsRecipients: boolean` defined in Task 1 and read in Task 3. `RecipientCaptureForm` props `{ companyId, companyName, onAdd }` defined in Task 2 and used identically in Tasks 3 and 5. `ApprovalPrefill.sellerId/buyerId` added in Task 4 and read in Task 5's `make`. `BatchUnit.companyId` already existed (used unchanged). The `BatchUnitSample` shape in the Task 3 test mirrors `BatchUnitLine & { sampleId }` (`containerNr/certNumber/contractNumber/decision/reason/reference/date`).

**Note on a deliberate non-change:** the batch queue route (`queue/route.ts`) needs no edit — once `buildBatchUnits` emits empty units, the existing `covered`/`noRecipients` loop counts them as covered and reports 0. This is intentional, not an omission; the dead-but-harmless `skipped.noRecipients` summary line only renders when `units.length === 0`, which no longer coincides with an empty-recipient company.

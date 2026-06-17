# Approval/Rejection Email — Resolve Contract by Number — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make approving/rejecting a sample that carries a wolthers contract number auto-open the pre-filled approval-email composer (recipients from the shared contacts book, references, cupping reasons, certificate-with-graphs), by resolving the contract via its number instead of the never-populated `samples.contract_id`.

**Architecture:** A single shared resolver finds the `contracts` row by `contract_id` (if ever set) or by `contract_number = samples.wolthers_contract_nr`. Both server routes (`approval-recipients`, `notify-approval`) call it, replacing the dead `!s.contract_id` 400 gate. Separately, the email body template gains a `Comments:` block sourced from `quality_assessments.cupping_comments`/`grading_comments`. No new UI — the existing `ApprovalSendView` composer and its auto-open trigger start working once the gate passes.

**Tech Stack:** Next.js 14 App Router (TypeScript), Supabase (service-role admin client), Vitest (colocated `*.test.ts`, pure-function tests, no DB mocking — mirror `shipment-sample-writeback.test.ts`).

## Global Constraints

- Files stay under ~2000 lines; no emojis in UI.
- Tests: `npx vitest run <path>` for a single file; `npx vitest run` for all. Test files colocated next to source as `<name>.test.ts`.
- Supabase admin client is created via the existing `admin()` helper in each route (service role). Do not change auth/RLS.
- `contracts` columns available: `id`, `contract_number`, `buyer_id`, `seller_id`, `buyer_reference`, `seller_reference`.
- Comments source: `quality_assessments` table, `.eq('sample_id', <id>)`, most recent row (`order created_at desc limit 1`), columns `cupping_comments`, `grading_comments`.
- Commit after each task. This repo is trunk-based on `main` (sole developer) — commit directly to `main`.

---

### Task 1: Contract resolver helper

**Files:**
- Create: `src/lib/approval-notification/contract-resolver.ts`
- Test: `src/lib/approval-notification/contract-resolver.test.ts`

**Interfaces:**
- Produces:
  - `interface SampleContractKeys { contract_id: string | null; wolthers_contract_nr: string | null }`
  - `interface ContractContext { contractId: string; buyerId: string | null; sellerId: string | null; buyerReference: string | null; sellerReference: string | null; contractNumber: string | null }`
  - `contractLookup(sample: SampleContractKeys): { column: 'id' | 'contract_number'; value: string } | null`
  - `pickContract<T extends { id: string }>(rows: T[]): T | null`
  - `resolveSampleContract(admin: SupabaseClient, sample: SampleContractKeys): Promise<ContractContext | null>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/approval-notification/contract-resolver.test.ts
import { describe, it, expect } from 'vitest'
import { contractLookup, pickContract } from './contract-resolver'

describe('contractLookup', () => {
  it('prefers contract_id when present', () => {
    expect(contractLookup({ contract_id: 'k1', wolthers_contract_nr: '41423/25' }))
      .toEqual({ column: 'id', value: 'k1' })
  })
  it('falls back to the wolthers number when contract_id is null', () => {
    expect(contractLookup({ contract_id: null, wolthers_contract_nr: '41423/25' }))
      .toEqual({ column: 'contract_number', value: '41423/25' })
  })
  it('matches a number with a QC suffix verbatim', () => {
    expect(contractLookup({ contract_id: null, wolthers_contract_nr: '42066/26QC' }))
      .toEqual({ column: 'contract_number', value: '42066/26QC' })
  })
  it('returns null when there is no contract reference at all', () => {
    expect(contractLookup({ contract_id: null, wolthers_contract_nr: null })).toBeNull()
  })
})

describe('pickContract', () => {
  it('returns null for no rows', () => {
    expect(pickContract([])).toBeNull()
  })
  it('returns the only row', () => {
    expect(pickContract([{ id: 'a' }])).toEqual({ id: 'a' })
  })
  it('deterministically picks the lexically-greatest id on multiple matches', () => {
    expect(pickContract([{ id: 'a' }, { id: 'c' }, { id: 'b' }])).toEqual({ id: 'c' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/approval-notification/contract-resolver.test.ts`
Expected: FAIL — cannot resolve `./contract-resolver` (module/exports not found).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/approval-notification/contract-resolver.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SampleContractKeys {
  contract_id: string | null
  wolthers_contract_nr: string | null
}

export interface ContractContext {
  contractId: string
  buyerId: string | null
  sellerId: string | null
  buyerReference: string | null
  sellerReference: string | null
  contractNumber: string | null
}

export interface ContractLookup {
  column: 'id' | 'contract_number'
  value: string
}

/** Decide how to find the contract: by FK if set, else by the wolthers number. */
export function contractLookup(sample: SampleContractKeys): ContractLookup | null {
  if (sample.contract_id) return { column: 'id', value: sample.contract_id }
  if (sample.wolthers_contract_nr) {
    return { column: 'contract_number', value: sample.wolthers_contract_nr }
  }
  return null
}

/** Deterministically pick one contract when a number match returns several. */
export function pickContract<T extends { id: string }>(rows: T[]): T | null {
  if (rows.length === 0) return null
  if (rows.length === 1) return rows[0]
  return [...rows].sort((a, b) => String(b.id).localeCompare(String(a.id)))[0]
}

interface ContractRow {
  id: string
  contract_number: string | null
  buyer_id: string | null
  seller_id: string | null
  buyer_reference: string | null
  seller_reference: string | null
}

/** Resolve full contract context for a sample, or null when there is no contract. */
export async function resolveSampleContract(
  admin: SupabaseClient,
  sample: SampleContractKeys,
): Promise<ContractContext | null> {
  const lookup = contractLookup(sample)
  if (!lookup) return null
  const { data } = await admin
    .from('contracts')
    .select('id, contract_number, buyer_id, seller_id, buyer_reference, seller_reference')
    .eq(lookup.column, lookup.value)
  const row = pickContract((data ?? []) as ContractRow[])
  if (!row) return null
  return {
    contractId: row.id,
    buyerId: row.buyer_id ?? null,
    sellerId: row.seller_id ?? null,
    buyerReference: row.buyer_reference ?? null,
    sellerReference: row.seller_reference ?? null,
    contractNumber: row.contract_number ?? null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/approval-notification/contract-resolver.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/approval-notification/contract-resolver.ts src/lib/approval-notification/contract-resolver.test.ts
git commit -m "feat(approval): contract resolver — resolve by wolthers number, not dead contract_id"
```

---

### Task 2: Add `Comments:` block to the email body template

**Files:**
- Modify: `src/lib/approval-notification/types.ts` (add `comments` to `ApprovalSampleFields`)
- Modify: `src/lib/approval-notification/sample-approved-template.ts`
- Test: `src/lib/approval-notification/sample-approved-template.test.ts` (append cases)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `SampleApprovedInput` gains `comments: string | null`; `buildSampleApprovedBody` appends a `Comments:` block when comments are non-empty. `ApprovalSampleFields` gains `comments: string | null`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/approval-notification/sample-approved-template.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSampleApprovedBody } from './sample-approved-template'

const base = {
  greeting: 'Paulo',
  contractNumber: '41535/26',
  sellerReference: '38378/2026',
  buyerReference: '106328',
  sampleType: 'pss',
  sampleCode: 'PSS',
  trackingNumber: 'SAN-00047/26',
  awb: null,
  courier: null,
}

describe('buildSampleApprovedBody — comments', () => {
  it('appends a Comments block when comments are present', () => {
    const body = buildSampleApprovedBody({ ...base, decision: 'approved', comments: 'Clean cup, sweet.' })
    expect(body).toContain('Comments:')
    expect(body).toContain('Clean cup, sweet.')
  })
  it('includes comments on a rejection too', () => {
    const body = buildSampleApprovedBody({ ...base, decision: 'rejected', comments: 'Phenol detected.' })
    expect(body).toContain('Comments:')
    expect(body).toContain('Phenol detected.')
  })
  it('omits the Comments block when comments are null or blank', () => {
    expect(buildSampleApprovedBody({ ...base, decision: 'approved', comments: null })).not.toContain('Comments:')
    expect(buildSampleApprovedBody({ ...base, decision: 'approved', comments: '   ' })).not.toContain('Comments:')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/approval-notification/sample-approved-template.test.ts`
Expected: FAIL — body has no `Comments:` text, and TS complains `comments` is missing on `SampleApprovedInput`.

- [ ] **Step 3: Write the implementation**

In `src/lib/approval-notification/sample-approved-template.ts`, add `comments` to the interface:

```ts
export interface SampleApprovedInput {
  decision: ApprovalDecision
  greeting: string
  contractNumber: string | null
  sellerReference: string | null
  buyerReference: string | null
  sampleType: string
  sampleCode: string | null
  trackingNumber: string
  awb: string | null
  courier: string | null
  comments: string | null
}
```

In `buildSampleApprovedBody`, insert the block immediately before the `Best regards` push:

```ts
  if (input.awb) {
    lines.push(`AWB: ${input.awb}${input.courier ? ` · ${input.courier}` : ''}`)
  }
  if (input.comments && input.comments.trim()) {
    lines.push('', 'Comments:', input.comments.trim())
  }
  lines.push('', 'Best regards,', 'Wolthers & Associates')
```

In `src/lib/approval-notification/types.ts`, add `comments` to `ApprovalSampleFields`:

```ts
export interface ApprovalSampleFields {
  trackingNumber: string
  sampleType: string
  status: ApprovalDecision
  contractNumber: string | null
  sampleCode: string | null
  awb: string | null
  courier: string | null
  sellerReference: string | null
  buyerReference: string | null
  comments: string | null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/approval-notification/sample-approved-template.test.ts`
Expected: PASS (existing cases + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/approval-notification/sample-approved-template.ts src/lib/approval-notification/sample-approved-template.test.ts src/lib/approval-notification/types.ts
git commit -m "feat(approval): email body includes a Comments block (approve + reject)"
```

---

### Task 3: Wire `approval-recipients` to the resolver + emit comments

**Files:**
- Modify: `src/app/api/samples/[id]/approval-recipients/route.ts`

**Interfaces:**
- Consumes: `resolveSampleContract` + `ContractContext` (Task 1); `ApprovalSampleFields.comments` (Task 2).
- Produces: route returns 200 + `ApprovalPrefill` (with `sample.comments`) for any sample whose `wolthers_contract_nr` matches a `contracts` row; 400 only when no contract resolves.

- [ ] **Step 1: Update the sample select to include the number**

Change the sample query (currently `.select('id, tracking_number, status, contract_id, sample_type')`) to:

```ts
  const { data: sample, error } = await supabase
    .from('samples')
    .select('id, tracking_number, status, contract_id, wolthers_contract_nr, sample_type')
    .eq('id', id)
    .single()
  if (error || !sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
```

- [ ] **Step 2: Replace the dead `contract_id` gate + the contracts fetch with the resolver**

Add the import at the top:

```ts
import { resolveSampleContract } from '@/lib/approval-notification/contract-resolver'
```

Replace the block that currently runs from `const s = sample as any` through the `const c = (contract ?? {}) as any` line with:

```ts
  const s = sample as any
  const ctx = await resolveSampleContract(supabase, s)
  if (!ctx) {
    return NextResponse.json({ error: 'Sample is not contract-linked' }, { status: 400 })
  }
  if (s.status !== 'approved' && s.status !== 'rejected') {
    return NextResponse.json({ error: 'Sample is not approved/rejected' }, { status: 400 })
  }

  // Most-recent cupping/grading comments for the body's Comments block.
  const { data: qa } = await supabase
    .from('quality_assessments')
    .select('cupping_comments, grading_comments')
    .eq('sample_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const comments =
    [ (qa as any)?.cupping_comments, (qa as any)?.grading_comments ]
      .filter((x) => x && String(x).trim())
      .join('\n') || null
```

- [ ] **Step 3: Replace every downstream `c.*` / `s.contract_id` reference with `ctx.*`**

- Companies fetch: `.in('id', [c.buyer_id, c.seller_id].filter(Boolean))` → `.in('id', [ctx.buyerId, ctx.sellerId].filter(Boolean))`
- Contacts fetch: same `.in('company_id', [ctx.buyerId, ctx.sellerId].filter(Boolean))`
- shipment_samples fetch: `.eq('contract_id', s.contract_id)` → `.eq('contract_id', ctx.contractId)`
- In `nameOf`, the `c.buyer_id`/`c.seller_id` arguments to `resolvePanel` become `ctx.buyerId`/`ctx.sellerId`.
- In the payload, map fields from `ctx`:

```ts
  const payload: ApprovalPrefill = {
    sample: {
      trackingNumber: s.tracking_number,
      sampleType: s.sample_type ?? 'pss',
      status: s.status,
      contractNumber: ctx.contractNumber,
      sampleCode: (ss as any)?.sample_code ?? null,
      awb: (ss as any)?.tracking_number ?? null,
      courier: (ss as any)?.courier_company ?? null,
      sellerReference: ctx.sellerReference,
      buyerReference: ctx.buyerReference,
      comments,
    },
    panels: {
      seller: resolvePanel(rows, ctx.sellerId, nameOf(ctx.sellerId), QC_MAILBOX),
      buyer: resolvePanel(rows, ctx.buyerId, nameOf(ctx.buyerId), QC_MAILBOX),
    },
    certificateAvailable: !!cert,
  }
  return NextResponse.json(payload)
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). In particular, `ApprovalPrefill.sample.comments` is now required and supplied.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/samples/[id]/approval-recipients/route.ts"
git commit -m "fix(approval): resolve recipients by wolthers contract number + emit cupping comments"
```

---

### Task 4: Wire `notify-approval` to the resolver

**Files:**
- Modify: `src/app/api/samples/[id]/notify-approval/route.ts`

**Interfaces:**
- Consumes: `resolveSampleContract` (Task 1).
- Produces: route sends + annexes cert + writes back to `shipment_samples` for number-only samples (no longer 400s on null `contract_id`).

- [ ] **Step 1: Add the import**

```ts
import { resolveSampleContract } from '@/lib/approval-notification/contract-resolver'
```

- [ ] **Step 2: Include the number in the sample select**

Change `.select('id, tracking_number, status, contract_id, buyer_contract_nr')` to:

```ts
    .select('id, tracking_number, status, contract_id, wolthers_contract_nr, buyer_contract_nr')
```

- [ ] **Step 3: Replace the gate + contract fetch with the resolver**

Replace the block:

```ts
  if (!s.contract_id) {
    return NextResponse.json({ error: 'Sample is not contract-linked' }, { status: 400 })
  }
  const decision = s.status as ApprovalDecision
  const tracking = s.tracking_number as string
  const contractId = s.contract_id as string

  const { data: contract } = await supabase
    .from('contracts')
    .select('buyer_id, seller_id')
    .eq('id', contractId)
    .single()
```

with:

```ts
  const ctx = await resolveSampleContract(supabase, s)
  if (!ctx) {
    return NextResponse.json({ error: 'Sample is not contract-linked' }, { status: 400 })
  }
  const decision = s.status as ApprovalDecision
  const tracking = s.tracking_number as string
  const contractId = ctx.contractId
  const contract = { buyer_id: ctx.buyerId, seller_id: ctx.sellerId }
```

(Keeping the local `contract` shape means downstream `contract.buyer_id`/`contract.seller_id` references — e.g. in the writeback insert path — need no further edits.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Verify no remaining reference to the removed `.single()` `contract` variable type breaks (the new `contract` is a plain object).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/samples/[id]/notify-approval/route.ts"
git commit -m "fix(approval): notify-approval resolves contract by number for cert annex + sys writeback"
```

---

### Task 5: Pass comments into the composer template input

**Files:**
- Modify: `src/components/samples/approval-send-view.tsx`

**Interfaces:**
- Consumes: `ApprovalSampleFields.comments` (Task 2), prefill `comments` (Task 3), `SampleApprovedInput.comments` (Task 2).

- [ ] **Step 1: Add `comments` to the template input**

In the `make` function's `tmplInput`, add the field (right after `courier`):

```ts
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
```

- [ ] **Step 2: Typecheck + run the full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — types align, all existing tests plus the new resolver/template tests are green.

- [ ] **Step 3: Commit**

```bash
git add src/components/samples/approval-send-view.tsx
git commit -m "feat(approval): composer body shows cupping comments from prefill"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (verification task). Use the dev server / a real sample.

This task has no code; it confirms the wired feature behaves end-to-end before declaring done. Use the `superpowers:verification-before-completion` discipline — evidence, not assertions.

- [ ] **Step 1: Approve a real number-only sample**

On qc.wolthers.com (dev or prod per your call), approve a sample that has a `wolthers_contract_nr` but null `contract_id` (e.g. one of the recent `SAN-000xx`). Expected: the `ApprovalSendView` composer opens automatically (it previously did not).

- [ ] **Step 2: Inspect the pre-filled composer**

Confirm: SELLER + BUYER panels have recipients drawn from the shared contacts book; subject/body show the contract number and seller/buyer refs; the body shows a `Comments:` block when the cupping had comments; the certificate preview/attach is available.

- [ ] **Step 3: Send and confirm side effects**

Send. Confirm: email goes out on behalf of the cupper (QC mailbox); `shipment_samples` row for the contract flips to `approved`/`rejected` with `approved_by`/`approved_date`/`certificate_url`; the cert is annexed to the contract's documents.

Verification query (paste-and-run):

```sql
select waqc_ref, status, approved_by, approved_date, certificate_url
from shipment_samples
where contract_id = '<resolved contract id for the tested sample>'
order by approved_date desc nulls last
limit 5;
```

- [ ] **Step 4: Repeat for a rejection**

Reject a number-only sample. Confirm the body's `Comments:` block carries the rejection reasoning and the cert attaches.

- [ ] **Step 5: Confirm the no-contract case still no-ops**

Approve a sample with `wolthers_contract_nr = NULL`. Expected: no composer opens, approval completes normally (no error toast). This proves the resolver's null path is correct.

---

## Self-Review notes

- **Spec coverage:** §1 resolver → Tasks 1,3,4. §2 trigger/UX (no new UI) → unblocked by Tasks 3–4, verified in Task 6. §3 graphs → already present (verified Task 6 step 2–3); §3 reasons → Tasks 2,3,5. §4 write-back/contacts → consequence of Tasks 3–4, verified Task 6 step 3. §5 hardening (intake sets `contract_id`) → intentionally deferred (optional, not required; resolution-by-number covers existing data).
- **Edge cases:** QC-suffix number (Task 1 test), multiple-contract match (Task 1 `pickContract` deterministic), no-contract (Task 1 + Task 6 step 5).
- **Type consistency:** `comments` added to both `ApprovalSampleFields` (Task 2) and supplied by the route (Task 3) and consumed by the composer (Task 5); `SampleApprovedInput.comments` (Task 2) matches `tmplInput.comments` (Task 5). Resolver `ContractContext` field names (`buyerId`/`sellerId`/`contractId`/`buyerReference`/`sellerReference`/`contractNumber`) are used verbatim in Tasks 3–4.

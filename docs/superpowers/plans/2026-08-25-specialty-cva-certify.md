# Specialty CVA Certify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a specialty (CVA) lot be certified from the CVA journey, via its own finalize route sitting on a pipeline shared with the commodity route.

**Architecture:** The 747-line `POST /api/cupping/finalize` is split: everything that is not protocol-specific (permission gate, stage transitions, sys write-back, certificate mint, session close) moves into `src/lib/cupping/`, and both the commodity route and a new `POST /api/cupping/cva/finalize` call it. The specialty decision — CVA score against `quality_templates.cva_min_score`, with a recorded override — lives in pure functions. `compliance.ts` is not touched.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service-role clients in routes), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-25-specialty-cva-certify-design.md`

## Global Constraints

- **Files stay under ~2000 lines** (up to ~2200 acceptable). `finalize/route.ts` is 747 today and shrinks here; `certificate-data.ts` is ~1730 and must not grow much — put new logic in `src/lib/cupping/`, not in it.
- **No mock data anywhere**, per `CLAUDE.md`. Tests use fixtures; the app never does.
- **No emojis in the UI.**
- **Migrations are pasted as SQL and applied by Daniel** — never run them. Write the file, print the SQL, stop.
- **WAQC migrations live in `database/migrations/`**, NOT `supabase/migrations/`.
- **Two protocols share `cupping_sessions` and `cupping_scores`.** Every commodity-side query must keep using `excludeCvaSessions` / `excludeCvaScores` from `src/lib/cupping-protocol-scope.ts`. Never widen those without reading that file's header.
- **The repo has no route tests, by convention.** Pure functions get unit tests; DB-touching lib functions get a hand-rolled fake Supabase client (see `src/lib/compliance.characterization.test.ts:17-31` for the established shape). Route handlers stay thin and untested. Do not introduce a route-testing framework.
- **Existing suite is 1035 tests and must stay green** after every task.
- **`isSpecialty` in `certificate-data.ts:1071` is a template-*name* heuristic** (`includes('sca')`, `includes('coe')`…) and is unrelated to CVA. The CVA branch keys off `template.methodology === 'cva'`. Do not conflate them.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/cupping/finalize-gate.ts` (new) | Pure. Permission + membership + minimum-cupper gate. |
| `src/lib/cupping/finalize-pipeline.ts` (new) | DB-touching. Stage transitions, seller comment, sys write-back, certificate mint, session close. |
| `src/lib/cupping/cva-verdict.ts` (new) | Pure. Cup verdict from score vs mark vs override; override validation; cup integrity from `cups`. |
| `src/lib/cupping/cva-rail.ts` (new) | Pure. 8 CVA section impressions → `CuppingAttribute[]` on a 1–9 scale. |
| `src/app/api/cupping/finalize/route.ts` (modify) | Commodity decision logic + the pipeline. Behaviour unchanged. |
| `src/app/api/cupping/cva/finalize/route.ts` (new) | Specialty decision logic + the same pipeline. |
| `src/app/api/cupping/cva/[id]/route.ts` (modify) | Adds `can_finalize` to the GET payload. |
| `src/components/cupping/cva/CertifyStep.tsx` (new) | The Certify step's UI. |
| `src/components/cupping/cva/CvaJourney.tsx` (modify) | Mounts the step; extends the step list from 10 to 11. |
| `src/lib/certificate-data.ts` (modify) | CVA branch: rail from the assessment, persisted score and mark. |
| `database/migrations/20260825000000_cva_certify_fields.sql` (new) | Seven columns on `quality_assessments`. |

Tasks 1–5 are the extraction and change no behaviour. Tasks 6–12 build the specialty path on top. **Tasks 1–5 must land before 9.**

---

### Task 1: Extract the finalize gate as a pure function

The permission and cupper-count checks at `finalize/route.ts:93-131` are pure logic wrapped around a DB count. Pulling the count out leaves something fully testable — and the CVA route needs the same rule with a different count (CVA rows instead of commodity rows).

**Files:**
- Create: `src/lib/cupping/finalize-gate.ts`
- Test: `src/lib/cupping/finalize-gate.test.ts`
- Modify: `src/app/api/cupping/finalize/route.ts:93-131`

**Interfaces:**
- Consumes: nothing.
- Produces: `assertCanFinalize(args: FinalizeGateInput): FinalizeGate`, plus the `FinalizeActor`, `FinalizeSession`, `FinalizeGateInput` and `FinalizeGate` types below.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cupping/finalize-gate.test.ts
import { describe, it, expect } from 'vitest'
import { assertCanFinalize } from './finalize-gate'

const session = {
  id: 'sess-1',
  sample_ids: ['s1', 's2'],
  cupper_ids: ['c1', 'c2'],
  master_cupper_id: null,
  min_cuppers_required: 2,
  allow_single_cupper: false,
}
const cupper = { id: 'c1' }
const admin = { id: 'x', is_global_admin: true }

describe('assertCanFinalize', () => {
  it('lets a cupper assigned to the session finalize', () => {
    const out = assertCanFinalize({ session, sampleId: 's1', actor: cupper, completedCupperIds: ['c1', 'c2'] })
    expect(out).toEqual({ ok: true, assignedCupperIds: ['c1', 'c2'], isSingleCupperSession: false })
  })

  it('refuses a sample that is not in the session', () => {
    const out = assertCanFinalize({ session, sampleId: 'other', actor: cupper, completedCupperIds: ['c1', 'c2'] })
    expect(out).toEqual({ ok: false, status: 400, error: 'Sample is not part of this session' })
  })

  it('refuses someone with no standing in the session', () => {
    const out = assertCanFinalize({
      session, sampleId: 's1', actor: { id: 'nobody' }, completedCupperIds: ['c1', 'c2'],
    })
    expect(out).toEqual({
      ok: false, status: 403, error: 'You do not have permission to finalize this session',
    })
  })

  it('lets a global admin finalize a session they are not assigned to', () => {
    const out = assertCanFinalize({ session, sampleId: 's1', actor: admin, completedCupperIds: ['c1', 'c2'] })
    expect(out.ok).toBe(true)
  })

  it('refuses when too few assigned cuppers have scored', () => {
    const out = assertCanFinalize({ session, sampleId: 's1', actor: cupper, completedCupperIds: ['c1'] })
    expect(out).toEqual({
      ok: false,
      status: 400,
      error: 'Cannot finalize: only 1 of 2 required cuppers have completed their scores',
    })
  })

  it('relaxes the minimum to one for a single-cupper session', () => {
    const solo = { ...session, cupper_ids: ['c1'] }
    const out = assertCanFinalize({ session: solo, sampleId: 's1', actor: cupper, completedCupperIds: ['c1'] })
    expect(out).toEqual({ ok: true, assignedCupperIds: ['c1'], isSingleCupperSession: true })
  })

  it('relaxes the minimum when the session opts in explicitly', () => {
    const opted = { ...session, allow_single_cupper: true }
    const out = assertCanFinalize({ session: opted, sampleId: 's1', actor: cupper, completedCupperIds: ['c1'] })
    expect(out.ok).toBe(true)
  })

  it('counts each cupper once even when duplicate rows exist', () => {
    const out = assertCanFinalize({
      session, sampleId: 's1', actor: cupper, completedCupperIds: ['c1', 'c1', 'c2'],
    })
    expect(out.ok).toBe(true)
  })

  it('deduplicates the assigned roster before counting', () => {
    const dup = { ...session, cupper_ids: ['c1', 'c1'] }
    const out = assertCanFinalize({ session: dup, sampleId: 's1', actor: cupper, completedCupperIds: ['c1'] })
    expect(out).toEqual({ ok: true, assignedCupperIds: ['c1'], isSingleCupperSession: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cupping/finalize-gate.test.ts`
Expected: FAIL — `Failed to resolve import "./finalize-gate"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/cupping/finalize-gate.ts
/**
 * Who may finalize a sample's cupping, and whether enough cuppers have scored it.
 *
 * Pure on purpose. The two protocols count "completed cuppers" differently — the
 * commodity route counts rows with no protocol, the CVA route counts its own —
 * so the count is an input rather than a query, and the rule itself is testable.
 *
 * Lifted verbatim from the commodity route's behaviour (finalize/route.ts:93-131
 * before the extraction). Changing any threshold here changes certification for
 * every lot, commodity and specialty alike.
 */

export interface FinalizeActor {
  id: string
  is_global_admin?: boolean | null
  is_master_cupper?: boolean | null
  is_q_grader?: boolean | null
  qc_role?: string | null
}

export interface FinalizeSession {
  id: string
  sample_ids: string[] | null
  cupper_ids: string[] | null
  master_cupper_id: string | null
  min_cuppers_required: number | null
  allow_single_cupper: boolean | null
}

export interface FinalizeGateInput {
  session: FinalizeSession
  sampleId: string
  actor: FinalizeActor
  /** Cuppers who have a score row for this sample, in this protocol. Duplicates fine. */
  completedCupperIds: string[]
}

export type FinalizeGate =
  | { ok: true; assignedCupperIds: string[]; isSingleCupperSession: boolean }
  | { ok: false; status: number; error: string }

export function assertCanFinalize({
  session,
  sampleId,
  actor,
  completedCupperIds,
}: FinalizeGateInput): FinalizeGate {
  if (!session.sample_ids?.includes(sampleId)) {
    return { ok: false, status: 400, error: 'Sample is not part of this session' }
  }

  const assignedCupperIds = Array.from(new Set(session.cupper_ids ?? []))

  const canFinalize =
    actor.is_global_admin === true ||
    actor.is_master_cupper === true ||
    actor.is_q_grader === true ||
    assignedCupperIds.includes(actor.id)

  if (!canFinalize) {
    return { ok: false, status: 403, error: 'You do not have permission to finalize this session' }
  }

  // A session with one assigned cupper cannot ever reach a two-cupper minimum,
  // so it relaxes automatically rather than deadlocking.
  const isSingleCupperSession = assignedCupperIds.length === 1
  const minCuppersRequired =
    session.allow_single_cupper || isSingleCupperSession ? 1 : session.min_cuppers_required || 2

  const completedCount = new Set(
    completedCupperIds.filter((id) => assignedCupperIds.includes(id)),
  ).size

  if (completedCount < minCuppersRequired) {
    return {
      ok: false,
      status: 400,
      error: `Cannot finalize: only ${completedCount} of ${minCuppersRequired} required cuppers have completed their scores`,
    }
  }

  return { ok: true, assignedCupperIds, isSingleCupperSession }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cupping/finalize-gate.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Rewire the commodity route onto it**

In `src/app/api/cupping/finalize/route.ts`, replace the block from `// Permission check: must be master cupper...` through the `completedCupperCount < minCuppersRequired` early return with:

```ts
    // Count how many assigned cuppers have completed scores for this sample.
    // Commodity rows only — a CVA row is a different protocol, not a second opinion.
    const { data: completedScores } = await excludeCvaScores(supabaseAdmin
      .from('cupping_scores')
      .select('cupper_id')
      .eq('sample_id', sample_id))

    const gate = assertCanFinalize({
      session: session as any,
      sampleId: sample_id,
      actor: profile as any,
      completedCupperIds: ((completedScores ?? []) as any[])
        .map((s) => s.cupper_id)
        .filter(Boolean),
    })
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }
    const { assignedCupperIds: uniqueCupperIdsList, isSingleCupperSession } = gate
```

Add the import: `import { assertCanFinalize } from '@/lib/cupping/finalize-gate'`.

Then fix the downstream references: the old code built `uniqueCupperIds` as a `Set` and `sessionCupperIds` from `session.cupper_ids`. Replace both with `uniqueCupperIdsList`. Search the file for `uniqueCupperIds` and `sessionCupperIds` and update every use.

Note the pre-existing `.eq('sample_id', sample_id)` previously also carried `.in('cupper_id', Array.from(uniqueCupperIds))`; the gate now does that filtering in memory, so dropping the `.in` is intentional and equivalent.

- [ ] **Step 6: Verify nothing else broke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: TSC clean; 1044 tests pass (1035 + 9).

- [ ] **Step 7: Commit**

```bash
git add src/lib/cupping/finalize-gate.ts src/lib/cupping/finalize-gate.test.ts src/app/api/cupping/finalize/route.ts
git commit -m "refactor(cupping): extract the finalize permission and cupper-count gate

Pure and tested, so the CVA route can apply the same rule with its own
completed-cupper count instead of a second copy of the logic."
```

---

### Task 2: Extract the decision-application phase

`finalize/route.ts:350-415` moves the sample through its workflow stages, persists the seller comment and pushes the decision to sys. None of it is protocol-specific.

**Files:**
- Create: `src/lib/cupping/finalize-pipeline.ts`
- Test: `src/lib/cupping/finalize-pipeline.test.ts`
- Modify: `src/app/api/cupping/finalize/route.ts:350-415`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `applyDecision(db, args: ApplyDecisionInput): Promise<void>` and the `FinalizeDecision` type.

- [ ] **Step 1: Write the failing test**

The fake client mirrors `src/lib/compliance.characterization.test.ts:17-31`, extended to record writes so the test can assert on them.

```ts
// src/lib/cupping/finalize-pipeline.test.ts
import { describe, it, expect, vi } from 'vitest'
import { applyDecision } from './finalize-pipeline'

vi.mock('@/lib/approval-notification/sys-decision-writeback', () => ({
  writeDecisionToShipmentSamples: vi.fn(async () => undefined),
}))

/** Records every update issued per table, and what it was filtered on. */
function fakeDb() {
  const writes: Array<{ table: string; values: Record<string, unknown>; id?: string }> = []
  const client = {
    writes,
    from(table: string) {
      let pending: Record<string, unknown> | null = null
      let id: string | undefined
      const chain: any = {
        update(values: Record<string, unknown>) { pending = values; return chain },
        eq(_col: string, value: string) { id = value; return chain },
        select() { return chain },
        single: async () => ({ data: null, error: null }),
        then(resolve: (v: { error: null }) => unknown) {
          if (pending) writes.push({ table, values: pending, id })
          return Promise.resolve({ error: null }).then(resolve)
        },
      }
      return chain
    },
  }
  return client
}

const base = {
  sampleId: 'smp-1',
  currentWorkflowStage: 'analysis',
  approverInitials: 'DW',
  sellerComment: null,
}

describe('applyDecision', () => {
  it('walks an analysis-stage sample through review before certifying it', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'approved' })
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['review', 'certified'])
  })

  it('marks a rejected sample rejected, not certified', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'rejected' })
    const last = db.writes.filter(w => w.table === 'samples').pop()
    expect(last!.values).toMatchObject({ workflow_stage: 'rejected', status: 'rejected' })
  })

  it('parks a pending sample in review and never certifies it', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'pending' })
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['review'])
  })

  it('does not re-enter review for a sample already there', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, currentWorkflowStage: 'review', decision: 'approved' })
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['certified'])
  })

  it('persists a seller comment only on approval', async () => {
    const approved = fakeDb()
    await applyDecision(approved as any, { ...base, decision: 'approved', sellerComment: 'lovely cup' })
    expect(approved.writes.some(w => w.values.seller_comment === 'lovely cup')).toBe(true)

    const rejected = fakeDb()
    await applyDecision(rejected as any, { ...base, decision: 'rejected', sellerComment: 'lovely cup' })
    expect(rejected.writes.some(w => 'seller_comment' in w.values)).toBe(false)
  })

  it('pushes the decision to sys once the sample is resolved', async () => {
    const { writeDecisionToShipmentSamples } = await import('@/lib/approval-notification/sys-decision-writeback')
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'approved' })
    expect(writeDecisionToShipmentSamples).toHaveBeenCalled()
  })

  it('does not push a pending decision to sys', async () => {
    const { writeDecisionToShipmentSamples } = await import('@/lib/approval-notification/sys-decision-writeback')
    vi.mocked(writeDecisionToShipmentSamples).mockClear()
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'pending' })
    expect(writeDecisionToShipmentSamples).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cupping/finalize-pipeline.test.ts`
Expected: FAIL — `Failed to resolve import "./finalize-pipeline"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/cupping/finalize-pipeline.ts` and move the logic from `finalize/route.ts:350-415` into it, preserving behaviour exactly:

```ts
// src/lib/cupping/finalize-pipeline.ts
/**
 * The parts of finalizing a cupping that do not depend on which protocol was
 * cupped. Both POST /api/cupping/finalize and POST /api/cupping/cva/finalize
 * call these, so the stage machine, the sys write-back and the certificate
 * mint exist exactly once.
 *
 * Extracted verbatim from the commodity route. If you change behaviour here you
 * are changing it for every lot Wolthers certifies — commodity and specialty.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'

export type FinalizeDecision = 'approved' | 'rejected' | 'pending'

export interface ApplyDecisionInput {
  sampleId: string
  decision: FinalizeDecision
  /** samples.workflow_stage as read before this call. */
  currentWorkflowStage: string | null
  approverInitials: string | null
  /** Seller-only note; persisted and pushed to sys on approval only. */
  sellerComment: string | null
}

export async function applyDecision(
  db: SupabaseClient,
  { sampleId, decision, currentWorkflowStage, approverInitials, sellerComment }: ApplyDecisionInput,
): Promise<void> {
  // Valid transitions are cupping/analysis → review → certified/rejected, so a
  // sample arriving from analysis passes through review rather than jumping.
  if (currentWorkflowStage === 'analysis' || currentWorkflowStage === 'cupping') {
    await (db as any).from('samples').update({ workflow_stage: 'review' }).eq('id', sampleId)
  }

  if (decision === 'pending') return

  const workflowStage = decision === 'approved' ? 'certified' : 'rejected'
  await (db as any)
    .from('samples')
    .update({ workflow_stage: workflowStage, status: decision })
    .eq('id', sampleId)

  if (decision === 'approved' && sellerComment) {
    // Guarded so a not-yet-applied migration never fails finalization.
    try {
      await (db as any).from('samples').update({ seller_comment: sellerComment }).eq('id', sampleId)
    } catch {
      // non-fatal
    }
  }

  await writeDecisionToShipmentSamples(
    db as any,
    sampleId,
    decision,
    approverInitials,
    decision === 'approved' ? sellerComment : null,
  )
}
```

Match `writeDecisionToShipmentSamples`'s real signature — read it in `src/lib/approval-notification/sys-decision-writeback.ts` and adjust the call rather than assuming these argument names.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cupping/finalize-pipeline.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Rewire the commodity route**

Replace `finalize/route.ts:350-415` with a call to `applyDecision`, passing `currentWorkflowStage` read just before it. Delete the moved code. Keep the surrounding variables (`decision`, `newWorkflowStage`) that later phases still read.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: TSC clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cupping/finalize-pipeline.ts src/lib/cupping/finalize-pipeline.test.ts src/app/api/cupping/finalize/route.ts
git commit -m "refactor(cupping): extract stage transitions and sys write-back from finalize"
```

---

### Task 3: Extract the certificate mint

`finalize/route.ts:417-641` mints the mother certificate and one per sub-contract, resolving the per-client validity window. It is the longest phase and the one that most needs to exist once.

**Files:**
- Modify: `src/lib/cupping/finalize-pipeline.ts`
- Modify: `src/lib/cupping/finalize-pipeline.test.ts`
- Modify: `src/app/api/cupping/finalize/route.ts:417-641`

**Interfaces:**
- Consumes: `FinalizeDecision` from Task 2.
- Produces: `mintCertificates(db, args: MintCertificatesInput): Promise<{ certificate: { id: string; certificate_number: string } | null }>`.

- [ ] **Step 1: Read the existing code completely before moving it**

Read `finalize/route.ts:417-641` end to end. It handles: the "Other Samples don't get certificates" skip, an existing-certificate short-circuit, the per-client `certificate_validity_months` lookup, the mother mint, and the sub-contract loop with its own client lookup. Do not summarise it from this plan — the plan does not reproduce 220 lines, and a partial move here mints wrong certificate numbers.

- [ ] **Step 2: Write the failing test**

Add to `src/lib/cupping/finalize-pipeline.test.ts`:

```ts
describe('mintCertificates', () => {
  it('mints nothing for a pending decision', async () => {
    const db = fakeDb()
    const out = await mintCertificates(db as any, {
      sample: { id: 'smp-1', client_id: 'c1', sample_category: null } as any,
      decision: 'pending',
      trackingNumber: 'SAN-1/26',
      isRejected: false,
    })
    expect(out.certificate).toBeNull()
    expect(db.writes.some(w => w.table === 'certificates')).toBe(false)
  })

  it('mints nothing for an Other Sample, which clients approve individually', async () => {
    const db = fakeDb()
    const out = await mintCertificates(db as any, {
      sample: { id: 'smp-1', client_id: 'c1', sample_category: 'other' } as any,
      decision: 'approved',
      trackingNumber: 'SAN-1/26',
      isRejected: false,
    })
    expect(out.certificate).toBeNull()
  })
})
```

Extend these once you have read the real code — in particular add a case asserting the existing-certificate short-circuit does not mint a second number, since a duplicate certificate number is the worst failure this code can produce.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/cupping/finalize-pipeline.test.ts`
Expected: FAIL — `mintCertificates is not exported`.

- [ ] **Step 4: Move the code**

Move `finalize/route.ts:417-641` into `mintCertificates` in `finalize-pipeline.ts`. Signature:

```ts
export interface MintCertificatesInput {
  sample: {
    id: string
    client_id: string | null
    sample_category: string | null
    quality_spec_id: string | null
    origin: string | null
  }
  decision: FinalizeDecision
  /** Reused as the certificate number — see the unified-numbering rule. */
  trackingNumber: string
  isRejected: boolean
}

export async function mintCertificates(
  db: SupabaseClient,
  input: MintCertificatesInput,
): Promise<{ certificate: { id: string; certificate_number: string } | null }>
```

A certificate REUSES the sample's `tracking_number` — it never generates a second number. If you find yourself calling `generate_certificate_number` here, stop and re-read `CLAUDE.md`'s unified-numbering section.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/cupping/finalize-pipeline.test.ts`
Expected: PASS.

- [ ] **Step 6: Rewire the commodity route and verify**

Replace the moved block with a `mintCertificates` call.

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cupping/finalize-pipeline.ts src/lib/cupping/finalize-pipeline.test.ts src/app/api/cupping/finalize/route.ts
git commit -m "refactor(cupping): extract the certificate mint from finalize"
```

---

### Task 4: Extract session close, master-cupper backfill and audit

`finalize/route.ts:643-715`.

**Files:**
- Modify: `src/lib/cupping/finalize-pipeline.ts`
- Modify: `src/lib/cupping/finalize-pipeline.test.ts`
- Modify: `src/app/api/cupping/finalize/route.ts:643-715`

**Interfaces:**
- Produces: `closeSessionIfComplete(db, args: CloseSessionInput): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
describe('closeSessionIfComplete', () => {
  it('backfills the validating cupper as master when none was designated', async () => {
    const db = fakeDb()
    await closeSessionIfComplete(db as any, {
      session: { id: 'sess-1', sample_ids: ['s1'], master_cupper_id: null } as any,
      sampleId: 's1',
      validatedByCupperId: 'c1',
      actorId: 'c1',
      decision: 'approved',
      notes: null,
    })
    expect(db.writes.some(w =>
      w.table === 'cupping_sessions' && w.values.master_cupper_id === 'c1')).toBe(true)
  })

  it('leaves a designated master cupper alone', async () => {
    const db = fakeDb()
    await closeSessionIfComplete(db as any, {
      session: { id: 'sess-1', sample_ids: ['s1'], master_cupper_id: 'boss' } as any,
      sampleId: 's1',
      validatedByCupperId: 'c1',
      actorId: 'c1',
      decision: 'approved',
      notes: null,
    })
    expect(db.writes.some(w => 'master_cupper_id' in w.values)).toBe(false)
  })
})
```

The master-cupper backfill matters: `certificate-data.ts` reads the master cupper's resolved defects as authoritative, so getting this wrong changes what certificates print.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cupping/finalize-pipeline.test.ts`
Expected: FAIL — `closeSessionIfComplete is not exported`.

- [ ] **Step 3: Move the code, run tests, rewire the route**

Move `643-715` into `closeSessionIfComplete`, including the "are all samples in this session finalized" query, the session status update, the audit-trail insert and `invalidateCertificatePdf`. Keep the PDF invalidation awaited — the comment at line 707 explains that returning before it clears lets the client's immediate fetch race and get the pre-finalize PDF.

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/lib/cupping/finalize-pipeline.ts src/lib/cupping/finalize-pipeline.test.ts src/app/api/cupping/finalize/route.ts
git commit -m "refactor(cupping): extract session close and audit from finalize"
```

---

### Task 5: Verify the extraction changed nothing

**Files:** none modified — this task is a gate.

- [ ] **Step 1: Confirm the route shrank and reads as decision logic only**

Run: `wc -l src/app/api/cupping/finalize/route.ts`
Expected: well under 400 lines. Read what remains: it should be auth, session load, sample load, the commodity decision, cup integrity, and four pipeline calls.

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: TSC clean, all tests pass, build succeeds.

- [ ] **Step 3: Smoke test against real data**

Finalize one real commodity sample on a local run against the production database, or ask Daniel to do it on a deploy preview. Confirm: the certificate number is minted once, the sample reaches `certified`, and sys `shipment_samples` shows the decision and initials. **This is the only end-to-end check the extraction gets — do not skip it.** Report the result explicitly rather than assuming.

- [ ] **Step 4: Commit if anything needed fixing**

```bash
git commit -am "fix(cupping): correct <what> found while verifying the finalize extraction"
```

---

### Task 6: Migration for the CVA certify fields

**Files:**
- Create: `database/migrations/20260825000000_cva_certify_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Persist what a specialty lot was judged against, at the moment it was judged.
--
-- The mark is copied rather than read live from quality_templates so that editing
-- a template later cannot retroactively change what an already-issued certificate
-- asserts. The four cva_override_* columns are written as a unit or not at all.

ALTER TABLE quality_assessments
  ADD COLUMN IF NOT EXISTS cva_score             numeric,
  ADD COLUMN IF NOT EXISTS cva_min_score         numeric,
  ADD COLUMN IF NOT EXISTS cva_passed            boolean,
  ADD COLUMN IF NOT EXISTS cva_override_decision text,
  ADD COLUMN IF NOT EXISTS cva_override_comment  text,
  ADD COLUMN IF NOT EXISTS cva_override_by       uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS cva_override_at       timestamptz;

ALTER TABLE quality_assessments
  DROP CONSTRAINT IF EXISTS quality_assessments_cva_override_decision_check;
ALTER TABLE quality_assessments
  ADD CONSTRAINT quality_assessments_cva_override_decision_check
  CHECK (cva_override_decision IS NULL OR cva_override_decision IN ('approved', 'rejected'));

COMMENT ON COLUMN quality_assessments.cva_min_score IS
  'The pass mark that applied when this lot was certified. Persisted rather than
   read live from quality_templates, so a later template edit cannot change what
   an issued certificate asserts.';
```

- [ ] **Step 2: Hand the SQL to Daniel**

Print the SQL in chat and ask him to apply it. **Do not run it.** Wait for confirmation before Task 9, which writes to these columns.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/20260825000000_cva_certify_fields.sql
git commit -m "feat(qc): migration for specialty CVA certify fields"
```

---

### Task 7: The CVA verdict, as pure functions

**Files:**
- Create: `src/lib/cupping/cva-verdict.ts`
- Test: `src/lib/cupping/cva-verdict.test.ts`

**Interfaces:**
- Consumes: `CvaAssessment` from `@/types/cva`, `computeAssessmentScore` from `@/lib/cva/scoring`.
- Produces: `decideCvaVerdict`, `overrideError`, `cvaCupIntegrity`, and the `CvaOverride` / `CvaVerdict` types.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cupping/cva-verdict.test.ts
import { describe, it, expect } from 'vitest'
import { decideCvaVerdict, overrideError, cvaCupIntegrity } from './cva-verdict'

describe('decideCvaVerdict', () => {
  it('passes a cup at the mark', () => {
    expect(decideCvaVerdict({ cvaScore: 84, cvaMinScore: 84 })).toEqual({
      cupPassed: true, source: 'auto', reason: 'CVA score 84 meets the 84 pass mark',
    })
  })

  it('passes a cup above the mark', () => {
    expect(decideCvaVerdict({ cvaScore: 88.75, cvaMinScore: 84 }).cupPassed).toBe(true)
  })

  it('fails a cup below the mark', () => {
    expect(decideCvaVerdict({ cvaScore: 83.75, cvaMinScore: 84 })).toEqual({
      cupPassed: false, source: 'auto', reason: 'CVA score 83.75 is below the 84 pass mark',
    })
  })

  it('cannot judge a cup with no score', () => {
    expect(decideCvaVerdict({ cvaScore: null, cvaMinScore: 84 })).toEqual({
      cupPassed: null, source: 'auto', reason: 'No CVA score recorded for this sample',
    })
  })

  it('cannot judge a cup with no pass mark on the template', () => {
    expect(decideCvaVerdict({ cvaScore: 88.75, cvaMinScore: null })).toEqual({
      cupPassed: null, source: 'auto', reason: 'This quality has no CVA pass mark set',
    })
  })

  it('lets an override approve a cup that failed the mark', () => {
    expect(decideCvaVerdict({
      cvaScore: 83.75,
      cvaMinScore: 84,
      override: { decision: 'approved', comment: 'right coffee for this buyer' },
    })).toEqual({
      cupPassed: true, source: 'override', reason: 'right coffee for this buyer',
    })
  })

  it('lets an override reject a cup that passed the mark', () => {
    expect(decideCvaVerdict({
      cvaScore: 90,
      cvaMinScore: 84,
      override: { decision: 'rejected', comment: 'phenolic on the second table' },
    }).cupPassed).toBe(false)
  })

  it('lets an override decide a cup that could not be judged at all', () => {
    expect(decideCvaVerdict({
      cvaScore: null,
      cvaMinScore: null,
      override: { decision: 'approved', comment: 'cupped on paper, entered late' },
    }).cupPassed).toBe(true)
  })
})

describe('overrideError', () => {
  it('accepts a well-formed override', () => {
    expect(overrideError({ decision: 'approved', comment: 'because' })).toBeNull()
  })

  it('accepts an absent override', () => {
    expect(overrideError(null)).toBeNull()
    expect(overrideError(undefined)).toBeNull()
  })

  it('requires a comment', () => {
    expect(overrideError({ decision: 'approved', comment: '' }))
      .toBe('An override comment is required')
    expect(overrideError({ decision: 'approved', comment: '   ' }))
      .toBe('An override comment is required')
  })

  it('requires a valid decision', () => {
    expect(overrideError({ decision: 'maybe', comment: 'because' }))
      .toBe('Override decision must be "approved" or "rejected"')
  })
})

describe('cvaCupIntegrity', () => {
  const empty = { sections: {}, cups: { non_uniform: [], defective: [] } }

  it('is clean and uniform when no cup was flagged', () => {
    expect(cvaCupIntegrity(empty)).toEqual({ cleanCup: true, uniformCup: true })
  })

  it('is not uniform when a cup was flagged non-uniform', () => {
    expect(cvaCupIntegrity({ ...empty, cups: { non_uniform: [3], defective: [] } }))
      .toEqual({ cleanCup: true, uniformCup: false })
  })

  it('is not clean when a cup was flagged defective', () => {
    expect(cvaCupIntegrity({
      ...empty,
      cups: { non_uniform: [], defective: [{ cup: 2, type: 'phenolic' }] },
    })).toEqual({ cleanCup: false, uniformCup: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cupping/cva-verdict.test.ts`
Expected: FAIL — `Failed to resolve import "./cva-verdict"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/cupping/cva-verdict.ts
/**
 * The cup half of a specialty lot's certification decision.
 *
 * Pure. The green-bean half stays in compliance.ts and is combined by the route:
 * a lot is certified only when BOTH pass. An override speaks to the cup only —
 * a lot failing on screen size is not rescued by overriding its cup.
 */
import type { CvaAssessment } from '@/types/cva'
import { computeAssessmentScore } from '@/lib/cva/scoring'

export interface CvaOverride {
  decision: 'approved' | 'rejected'
  comment: string
}

export interface CvaVerdict {
  /** null when the cup cannot be judged at all — not the same as failing. */
  cupPassed: boolean | null
  source: 'auto' | 'override'
  reason: string
}

export function decideCvaVerdict({
  cvaScore,
  cvaMinScore,
  override,
}: {
  cvaScore: number | null
  cvaMinScore: number | null
  override?: CvaOverride | null
}): CvaVerdict {
  if (override) {
    return {
      cupPassed: override.decision === 'approved',
      source: 'override',
      reason: override.comment,
    }
  }
  if (cvaScore == null) {
    return { cupPassed: null, source: 'auto', reason: 'No CVA score recorded for this sample' }
  }
  if (cvaMinScore == null) {
    return { cupPassed: null, source: 'auto', reason: 'This quality has no CVA pass mark set' }
  }
  return cvaScore >= cvaMinScore
    ? { cupPassed: true, source: 'auto', reason: `CVA score ${cvaScore} meets the ${cvaMinScore} pass mark` }
    : { cupPassed: false, source: 'auto', reason: `CVA score ${cvaScore} is below the ${cvaMinScore} pass mark` }
}

/** Validation message for a submitted override, or null when it is acceptable. */
export function overrideError(override: unknown): string | null {
  if (override === null || override === undefined) return null
  const o = override as Partial<CvaOverride>
  if (o.decision !== 'approved' && o.decision !== 'rejected') {
    return 'Override decision must be "approved" or "rejected"'
  }
  if (typeof o.comment !== 'string' || o.comment.trim() === '') {
    return 'An override comment is required'
  }
  return null
}

/**
 * Cup integrity for a specialty lot.
 *
 * CVA records which cups were non-uniform and which were defective, rather than
 * the commodity taint/fault counts. A lot is uniform when no cup was flagged
 * non-uniform, and clean when none was flagged defective.
 */
export function cvaCupIntegrity(
  assessment: Pick<CvaAssessment, 'sections' | 'cups'>,
): { cleanCup: boolean; uniformCup: boolean } {
  const { u, d } = computeAssessmentScore(assessment)
  return { cleanCup: d === 0, uniformCup: u === 0 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cupping/cva-verdict.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cupping/cva-verdict.ts src/lib/cupping/cva-verdict.test.ts
git commit -m "feat(qc): pure CVA cup verdict, override validation and cup integrity"
```

---

### Task 8: The CVA attribute rail

**Files:**
- Create: `src/lib/cupping/cva-rail.ts`
- Test: `src/lib/cupping/cva-rail.test.ts`

**Interfaces:**
- Consumes: `CVA_SECTIONS` from `@/lib/cva/sections`, `effectiveImpression` from `@/lib/cva/scoring`, `CuppingAttribute` from `@/lib/certificate-data`.
- Produces: `cvaAttributeRail(assessment): CuppingAttribute[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cupping/cva-rail.test.ts
import { describe, it, expect } from 'vitest'
import { cvaAttributeRail } from './cva-rail'

describe('cvaAttributeRail', () => {
  it('renders one rail entry per scored section, on the 1-9 impression scale', () => {
    const rail = cvaAttributeRail({ sections: { fragrance: { impression: 7 } } })
    expect(rail).toEqual([
      { name: 'Fragrance', score: 7, allowedMin: null, allowedMax: null, scaleMin: 1, scaleMax: 9 },
    ])
  })

  it('prefers the cooled-final impression, which is what actually scores', () => {
    const rail = cvaAttributeRail({ sections: { flavor: { impression: 6, impression_final: 8 } } })
    expect(rail[0]).toMatchObject({ name: 'Flavor', score: 8 })
  })

  it('keeps sections in SCA tasting order, not object order', () => {
    const rail = cvaAttributeRail({
      sections: { overall: { impression: 8 }, fragrance: { impression: 7 } },
    })
    expect(rail.map(a => a.name)).toEqual(['Fragrance', 'Overall'])
  })

  it('omits sections the cupper never scored rather than showing them as zero', () => {
    const rail = cvaAttributeRail({ sections: { acidity: { impression: 6 }, aroma: {} } })
    expect(rail.map(a => a.name)).toEqual(['Acidity'])
  })

  it('returns nothing for an assessment with no sections at all', () => {
    expect(cvaAttributeRail({ sections: {} })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cupping/cva-rail.test.ts`
Expected: FAIL — `Failed to resolve import "./cva-rail"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/cupping/cva-rail.ts
/**
 * The 8 CVA affective sections, shaped as the certificate's attribute rail.
 *
 * A specialty lot has no commodity attribute rows, so without this its
 * certificate prints an empty rail and an empty spider. The impressions are on
 * SCA's 1-9 scale, NOT the quality spec's commodity scale — passing the spec
 * scale here would misdraw the spider.
 *
 * An unscored section is omitted rather than rendered as zero: "not assessed"
 * and "assessed as the worst possible" are different claims to put on a
 * certificate.
 */
import { CVA_SECTIONS } from '@/lib/cva/sections'
import { effectiveImpression } from '@/lib/cva/scoring'
import type { CvaAssessment } from '@/types/cva'
import type { CuppingAttribute } from '@/lib/certificate-data'

export const CVA_IMPRESSION_SCALE_MIN = 1
export const CVA_IMPRESSION_SCALE_MAX = 9

export function cvaAttributeRail(
  assessment: Pick<CvaAssessment, 'sections'>,
): CuppingAttribute[] {
  const rail: CuppingAttribute[] = []
  for (const section of CVA_SECTIONS) {
    const score = effectiveImpression(assessment.sections?.[section.key])
    if (score == null) continue
    rail.push({
      name: section.label,
      score,
      allowedMin: null,
      allowedMax: null,
      scaleMin: CVA_IMPRESSION_SCALE_MIN,
      scaleMax: CVA_IMPRESSION_SCALE_MAX,
    })
  }
  return rail
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cupping/cva-rail.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cupping/cva-rail.ts src/lib/cupping/cva-rail.test.ts
git commit -m "feat(qc): map CVA section impressions onto the certificate attribute rail"
```

---

### Task 9: The specialty finalize route

**Blocked on:** Tasks 1–5 (the pipeline) and Task 6 (the migration must be applied).

**Files:**
- Create: `src/app/api/cupping/cva/finalize/route.ts`

**Interfaces:**
- Consumes: `assertCanFinalize` (Task 1); `applyDecision`, `mintCertificates`, `closeSessionIfComplete` (Tasks 2–4); `decideCvaVerdict`, `overrideError`, `cvaCupIntegrity` (Task 7); `evaluateQualityCompliance` from `@/lib/compliance`.
- Produces: `POST /api/cupping/cva/finalize`, body `{ session_id, sample_id, override?: { decision, comment }, seller_comment? }`, responding `{ decision, cupPassed, reason, certificate: { certificate_number } | null, message }`.

- [ ] **Step 1: Confirm the migration is applied**

Ask Daniel to confirm, or check directly that `quality_assessments.cva_score` exists. Writing to a missing column fails the whole finalize.

- [ ] **Step 2: Write the route**

Mirror the commodity route's shape. The order matters:

1. Auth; load profile.
2. Load the session; require `session_type === 'cva'` — reject a commodity session with 400 `'Not a CVA session'`, so the two routes cannot be crossed.
3. Load the CVA score row: `cupping_scores` where `session_id`, `sample_id`, `protocol = 'cva'`, newest by `updated_at`. Take `cva_score` and parse `scores` as the `CvaAssessment`.
4. Gate: `assertCanFinalize({ session, sampleId, actor: profile, completedCupperIds: <cuppers with a CVA row for this sample> })`.
5. `overrideError(body.override)` — return 400 with the message if non-null.
6. `decideCvaVerdict({ cvaScore, cvaMinScore, override })` where `cvaMinScore` comes from the template via `client_qualities.template_id → quality_templates.cva_min_score`.
7. Green bean: `evaluateQualityCompliance(db, sample_id, sample.quality_spec_id, assignedCupperIds)`, and check whether a `quality_assessments` row with `green_bean_data` exists.
8. Combine: `approved` only when `verdict.cupPassed === true` **and** compliance passed **and** grading data exists. `rejected` when `verdict.cupPassed === false` or compliance failed. Otherwise `pending`. Note `cupPassed === null` must never certify.
9. Persist to `quality_assessments`: `cva_score`, `cva_min_score`, `cva_passed`, `clean_cup` / `uniform_cup` from `cvaCupIntegrity`, and the four `cva_override_*` columns when an override was supplied. Update the newest row for the sample; insert one if none exists.
10. `applyDecision` → `mintCertificates` → `closeSessionIfComplete`.
11. Respond with the decision, the reason, and the certificate number when one was minted.

Keep the route thin — every branch above that could hold logic already has a tested pure function. If you find yourself writing an `if` on scores or marks here, it belongs in `cva-verdict.ts` with a test.

- [ ] **Step 3: Verify it compiles and the suite is green**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all clean.

- [ ] **Step 4: Exercise it against real data**

The Blaser lot `SAN-00612/26` (PSS `032/26`) sits in CVA session `9552995f-ca39-45d8-adaf-492b687fe04e` with `cva_score` 88.75 against a mark of 84, and has **no** `quality_assessments` row. So the expected result is `pending` — cup approved, awaiting grading — and **no certificate**. If it mints one, the two-part gate is wrong; stop and fix before going further.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cupping/cva/finalize/route.ts
git commit -m "feat(qc): certify a specialty lot from its own CVA finalize route"
```

---

### Task 10: Tell the journey who may certify

**Files:**
- Modify: `src/app/api/cupping/cva/[id]/route.ts` (GET response)
- Modify: `src/hooks/useCvaSession.ts`

**Interfaces:**
- Produces: `can_finalize: boolean` on the GET payload; `canFinalize` on the `useCvaSession` return.

- [ ] **Step 1: Add `can_finalize` to the GET response**

Load the caller's profile and compute it with the same rule `assertCanFinalize` uses — global admin, master cupper, Q-grader, or a cupper assigned to the session. Import the predicate rather than restating it; if `assertCanFinalize` does not expose the permission half separately, extract `canActorFinalize(session, actor): boolean` from it in `finalize-gate.ts`, with its own test, and have both call that.

- [ ] **Step 2: Surface it on the hook**

Add `canFinalize` to `useCvaSession`'s state, hydrated from `data.can_finalize` alongside the roster.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cupping/cva/[id]/route.ts src/hooks/useCvaSession.ts src/lib/cupping/finalize-gate.ts src/lib/cupping/finalize-gate.test.ts
git commit -m "feat(qc): tell the CVA journey whether the viewer may certify"
```

---

### Task 11: The Certify step

**Files:**
- Create: `src/components/cupping/cva/CertifyStep.tsx`
- Test: `src/components/cupping/cva/CertifyStep.test.tsx`
- Modify: `src/components/cupping/cva/CvaJourney.tsx`

**Interfaces:**
- Consumes: `canFinalize` (Task 10), `POST /api/cupping/cva/finalize` (Task 9).
- Produces: `<CertifyStep>` with props `{ reference, score, minScore, canFinalize, onCertify }`.

- [ ] **Step 1: Write the failing test**

Follow the existing component-test shape in `src/components/cupping/cva/SectionScreen.test.tsx`.

```tsx
// src/components/cupping/cva/CertifyStep.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CertifyStep } from './CertifyStep'

const base = {
  reference: '032/26',
  score: 88.75,
  minScore: 84,
  canFinalize: true,
  onCertify: vi.fn(),
}

describe('CertifyStep', () => {
  it('shows the score against the mark and that the cup passes', () => {
    render(<CertifyStep {...base} />)
    expect(screen.getByText(/88\.75/)).toBeInTheDocument()
    expect(screen.getByText(/84/)).toBeInTheDocument()
    expect(screen.getByText(/passes/i)).toBeInTheDocument()
  })

  it('says the cup falls short when the score is below the mark', () => {
    render(<CertifyStep {...base} score={83.75} />)
    expect(screen.getByText(/below/i)).toBeInTheDocument()
  })

  it('hides both actions from someone who may not certify', () => {
    render(<CertifyStep {...base} canFinalize={false} />)
    expect(screen.queryByRole('button', { name: /certify/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /override/i })).toBeNull()
  })

  it('certifies with no override when the primary action is used', () => {
    const onCertify = vi.fn()
    render(<CertifyStep {...base} onCertify={onCertify} />)
    fireEvent.click(screen.getByRole('button', { name: /certify/i }))
    expect(onCertify).toHaveBeenCalledWith(null)
  })

  it('will not submit an override without a comment', () => {
    const onCertify = vi.fn()
    render(<CertifyStep {...base} onCertify={onCertify} />)
    fireEvent.click(screen.getByRole('button', { name: /override/i }))
    fireEvent.click(screen.getByRole('button', { name: /reject this lot/i }))
    expect(onCertify).not.toHaveBeenCalled()
    expect(screen.getByText(/comment is required/i)).toBeInTheDocument()
  })

  it('submits an override with its comment', () => {
    const onCertify = vi.fn()
    render(<CertifyStep {...base} onCertify={onCertify} />)
    fireEvent.click(screen.getByRole('button', { name: /override/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'right coffee for this buyer' } })
    fireEvent.click(screen.getByRole('button', { name: /reject this lot/i }))
    expect(onCertify).toHaveBeenCalledWith({
      decision: 'rejected',
      comment: 'right coffee for this buyer',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/cupping/cva/CertifyStep.test.tsx`
Expected: FAIL — cannot resolve `./CertifyStep`.

- [ ] **Step 3: Build the component**

Match the journey's existing visual language — read `ScoreSummary.tsx` first and reuse its accent variables, radii and type scale. No emojis. The primary action reads **Certify**; the secondary opens a comment field with **Approve this lot** / **Reject this lot**.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/cupping/cva/CertifyStep.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Mount it in the journey**

In `CvaJourney.tsx`: add a `certify` entry after `score` in the `steps` memo, render `<CertifyStep>` at `step === 10`, and update `const last = steps.length - 1` consumers. The `requires_descriptors` soft gate currently fires on entering the score step — leave that behaviour alone.

Wire `onCertify` to POST `/api/cupping/cva/finalize`, then surface the response's `message` as a toast. Remove the "arrives in Phase 5" line from `ScoreSummary.tsx` only if the certificate part of that sentence is now untrue; the flavor path, AI highlights and whiskey-style label are still Phase 5, so reword rather than delete.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run && npm run build`

- [ ] **Step 7: Commit**

```bash
git add src/components/cupping/cva/CertifyStep.tsx src/components/cupping/cva/CertifyStep.test.tsx src/components/cupping/cva/CvaJourney.tsx src/components/cupping/cva/ScoreSummary.tsx
git commit -m "feat(qc): add the Certify step to the specialty CVA journey"
```

---

### Task 12: Print the CVA assessment on the certificate

**Files:**
- Modify: `src/lib/certificate-data.ts`

**Interfaces:**
- Consumes: `cvaAttributeRail` (Task 8), the persisted `cva_score` / `cva_min_score` / `cva_passed` (Task 6).

- [ ] **Step 1: Find the branch point**

`certificate-data.ts:715-735` calls `processCuppingScores`. The CVA branch goes beside it: when the sample's template has `methodology === 'cva'`, build the rail from the CVA assessment instead.

Do **not** reuse the `isSpecialty` flag at line 1071 — it is a template-name heuristic (`includes('sca')`, `includes('coe')`) that has nothing to do with the CVA protocol.

- [ ] **Step 2: Read the CVA assessment**

The commodity score query excludes CVA rows (correctly). Add a separate small read for the newest `protocol = 'cva'` row for the sample, and parse its `scores` as `CvaAssessment`.

- [ ] **Step 3: Build the CVA cupping data**

Populate `CuppingData` with `attributes: cvaAttributeRail(assessment)`, the overall from the persisted `cva_score`, and `clean_cup` / `uniform_cup` from the persisted assessment columns. Read the mark from `quality_assessments.cva_min_score`, **not** live from the template — the certificate must assert the mark that applied on the day.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run && npm run build`

Then render the real certificate for a certified specialty lot and confirm the rail shows 8 named sections on a 1–9 spider, with the 0–100 score leading and no attributes named `version`, `score`, `u` or `d`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/certificate-data.ts
git commit -m "feat(qc): render the CVA assessment on a specialty certificate"
```

---

## Deviation from the spec

The spec's Testing section calls for "Route tests for `/api/cupping/cva/finalize`". The repo has **no route tests at all** — all 91 test files cover pure functions or lib functions driven through a hand-rolled fake Supabase client, and `compliance.characterization.test.ts:9-14` records that as a deliberate choice ("adding one would invite route tests that mock the database instead of extracting the logic").

This plan follows the repo instead: every decision the route makes lives in a tested pure function (`assertCanFinalize`, `decideCvaVerdict`, `overrideError`, `cvaCupIntegrity`, `cvaAttributeRail`), the DB-touching pipeline is characterized with a fake client, and the routes stay thin shells verified by the real-data checks in Tasks 5 and 9.

The spec's intent — that certification logic is covered before it ships — is met. Its literal instruction is not.

Similarly, the spec asks for characterization tests "before moving any code". A Next route handler cannot be characterized in place under this convention, so each extraction task instead writes the characterization test against the function it is about to create, runs it red, then moves the code. That is test-first and it does characterize; it just cannot precede the extraction entirely.

## Self-review

**Spec coverage.** Decision 1 (auto-decide plus recorded override) → Tasks 6, 7, 9. Decision 2 (two-part gate) → Task 9 step 2.8. Decision 3 (sections as rail, score leading) → Tasks 8, 12. Decision 4 (parallel route over a shared pipeline) → Tasks 1–5, 9. Decision 5 (override at certify time, existing route retained) → Tasks 7, 9, 11; the existing `/api/certificates/[id]/override` is untouched, which is what "retained" means. Migration → Task 6. Certify step → Task 11. `u`/`d` → `clean_cup`/`uniform_cup` → Task 7.

**Gap found and closed:** Task 10 was missing on the first pass — the spec says the Certify step only renders for someone permitted to use it, which needs `can_finalize` on the GET payload. Added.

**Type consistency.** `FinalizeDecision` is `'approved' | 'rejected' | 'pending'` in Tasks 2, 3 and 9. `CvaVerdict.cupPassed` is `boolean | null` in Tasks 7 and 9, and Task 9 step 2.8 states explicitly that `null` never certifies. `CuppingAttribute` in Task 8 matches the existing shape at `certificate-data.ts:50-57`, including the optional `scaleMin` / `scaleMax`.

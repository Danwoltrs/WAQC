# CVA Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Specialty (CVA) lots get a shared cupping session, so their cuppers can be compared on a new Panel step between Score and Certify, and the two-cupper minimum finally applies to them.

**Architecture:** The roster session created at assignment (`session_type 'cva'`, `status 'setup'`) stops being inert: the CVA journey binds it instead of minting a session per cupper. The multi-cupper machinery in `cva/finalize` — session-scoped score rows, `pickAuthoritativeCvaRow`, the count gate — is already written and simply starts receiving real input. A new pure module computes spread/outliers, a new route serves the panel behind a server-side blind gate, and a migration folds existing per-cupper sessions into rosters.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres, service-role in API routes), vitest, shadcn/ui, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-01-cva-cupper-panel-design.md`

## Global Constraints

- No emojis in the UI. No mock data. Files stay under ~2000 lines (~2200 max).
- Trunk-based: commit to `main`. **Do not push** until Daniel has applied the Task 7 migration and confirmed — Vercel auto-deploys `main`, and the new code binds rosters that the migration must already have populated.
- Migrations live in `database/migrations/` and are **pasted for Daniel to apply**. Never apply one yourself, never run one via CLI or MCP.
- Claim migration numbers against what is on disk (`ls database/migrations | tail -1`), not against this plan. Latest on disk when this plan was written: `20260828000002`.
- Specialty is a property of the **quality** (`quality_templates.methodology = 'cva'`), never of the sample row.
- `parseCvaNumber` (`src/lib/cupping/cva-cupping-data.ts:54`) is the only parser for `cva_score`. `Number('') === 0` is a printable zero and must never become a score.
- A lot's cupping hangs off its lab unit: resolve through `resolveLabSourceId` (`src/lib/sample-group.ts:126`) before touching sessions or scores, so a contract sibling reports the row it points at.
- **Baseline, measured 2026-09-01 on `2d5bbf0`: `npx tsc --noEmit` 0 errors; `npx vitest run` 121 files / 1458 tests passing.** Quote before-and-after counts in every commit. There is no `npm run typecheck` or `npm run verify` in this repo.
- **The fake Supabase client in route tests accepts any column name** — a route test cannot catch a column typo. Column names are only ever proven by the migration and by Daniel applying it.

## File map

| File | Responsibility |
|---|---|
| `src/lib/cupping/cva-panel.ts` | **create** — pure spread/mean/outlier maths. No I/O. |
| `src/lib/cupping/cva-panel.test.ts` | **create** — its unit tests. |
| `database/migrations/20260901000000_cva_score_spread_max.sql` | **create** — the per-template threshold column. |
| `src/app/api/cupping/cva/panel/route.ts` | **create** — the panel read, blind gate, master-cupper resolution. |
| `src/app/api/cupping/cva/panel/route.test.ts` | **create** — blind-gate and shaping tests. |
| `src/lib/cupping/finalize-gate.ts` | **modify** — drop the roster refusal; keep the count gate. |
| `src/lib/cupping/finalize-gate.test.ts` | **modify** — add the empty-session test that replaces it. |
| `src/app/api/cupping/cva/finalize/route.ts` | **modify** — drop the roster refusal. |
| `src/app/api/cupping/cva/[id]/route.ts` | **modify** — `loadSession` stops refusing rosters. |
| `src/lib/cupping-protocol-scope.ts` | **modify** — remove `ROSTER_SESSION_STATUS` / `excludeRosterSessions`. |
| `src/lib/cupping/roster.ts` | **unchanged** — `isRosterSession` stays; it still backs `pickRosterSession`. |
| `src/app/api/cupping/cva/session/route.ts` | **modify** — bind the roster instead of minting per cupper. |
| `src/app/api/notifications/samples-assigned/route.ts` | **modify** — real `min_cuppers_required` on the roster. |
| `src/components/cupping/cva/PanelStep.tsx` | **create** — the new step's UI. |
| `src/components/cupping/cva/PanelStep.test.tsx` | **create** — its render tests. |
| `src/components/cupping/cva/CvaJourney.tsx` | **modify** — insert the step; Certify moves 10 → 11. |
| `database/migrations/20260901000001_cva_adopt_roster_sessions.sql` | **create** — fold journey sessions into rosters. |

---

### Task 1: The panel maths

Pure module first: it has no dependencies, and every later task consumes its types.

**Files:**
- Create: `src/lib/cupping/cva-panel.ts`
- Test: `src/lib/cupping/cva-panel.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PanelScore`, `PanelStats`, `panelStats(scores: PanelScore[], threshold: number): PanelStats`, `DEFAULT_SPREAD_MAX = 3`.

- [ ] **Step 0: Record the baseline**

```bash
npx tsc --noEmit; echo "tsc exit=$?"
npx vitest run 2>&1 | tail -5
```

Write the two counts down. Every later step compares against them.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/cupping/cva-panel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { panelStats, DEFAULT_SPREAD_MAX } from './cva-panel'

const s = (cupper_id: string, cva_score: number | null) => ({ cupper_id, cva_score })

describe('panelStats', () => {
  it('averages the recorded scores and measures their spread', () => {
    const out = panelStats([s('a', 86.25), s('b', 84), s('c', 87.75)], 3)
    expect(out.mean).toBe(86)
    expect(out.spread).toBe(3.75)
  })

  it('flags a spread wider than the threshold and names the furthest cupper', () => {
    const out = panelStats([s('a', 86.25), s('b', 84), s('c', 87.75)], 3)
    expect(out.flagged).toBe(true)
    expect(out.outliers).toEqual(['b'])
  })

  it('does not flag a spread exactly on the threshold', () => {
    const out = panelStats([s('a', 84), s('b', 87)], 3)
    expect(out.spread).toBe(3)
    expect(out.flagged).toBe(false)
    expect(out.outliers).toEqual([])
  })

  it('ignores cuppers who opened the lot but recorded no score', () => {
    const out = panelStats([s('a', 86), s('b', null), s('c', 88)], 3)
    expect(out.recorded).toBe(2)
    expect(out.mean).toBe(87)
    expect(out.spread).toBe(2)
  })

  it('treats a single recorded score as no spread at all', () => {
    const out = panelStats([s('a', 86), s('b', null)], 3)
    expect(out).toMatchObject({ recorded: 1, mean: 86, spread: 0, flagged: false, outliers: [] })
  })

  it('survives a panel where nobody has scored yet', () => {
    const out = panelStats([s('a', null), s('b', null)], 3)
    expect(out).toMatchObject({ recorded: 0, mean: null, spread: 0, flagged: false, outliers: [] })
  })

  it('names every cupper tied at the furthest distance from the mean', () => {
    const out = panelStats([s('a', 80), s('b', 90), s('c', 85)], 3)
    expect(out.mean).toBe(85)
    expect(out.outliers.sort()).toEqual(['a', 'b'])
  })

  it('defaults the threshold to three points', () => {
    expect(DEFAULT_SPREAD_MAX).toBe(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/cupping/cva-panel.test.ts`
Expected: FAIL — `Failed to resolve import "./cva-panel"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/cupping/cva-panel.ts`:

```ts
/**
 * How far apart a specialty panel's cuppers are on one lot.
 *
 * Pure on purpose: the threshold and the score rows are inputs, so the rule
 * is testable without a database and the panel route stays thin. The commodity
 * side computes its own discrepancies inside scores/aggregate against
 * per-attribute increments; this is the CVA equivalent and deliberately works
 * on the single 0-100 score, which is the number that decides pass/fail.
 */

/** The spread, in CVA points, a panel may show before it is worth a second look. */
export const DEFAULT_SPREAD_MAX = 3

export interface PanelScore {
  cupper_id: string
  /** null = opened the lot but recorded nothing. Never 0 for "unscored". */
  cva_score: number | null
}

export interface PanelStats {
  /** How many cuppers actually recorded a score. */
  recorded: number
  /** Mean of the recorded scores; null when nobody has scored. */
  mean: number | null
  /** max - min over the recorded scores; 0 below two of them. */
  spread: number
  flagged: boolean
  /** Cuppers furthest from the mean, only when flagged. Ties are all named. */
  outliers: string[]
}

export function panelStats(scores: PanelScore[], threshold: number): PanelStats {
  // A null score is "not recorded", not zero — counting it would drag the mean
  // toward nothing and invent a spread out of somebody's unfinished work.
  const recorded = scores.filter(
    (s): s is PanelScore & { cva_score: number } =>
      typeof s.cva_score === 'number' && Number.isFinite(s.cva_score),
  )

  if (recorded.length === 0) {
    return { recorded: 0, mean: null, spread: 0, flagged: false, outliers: [] }
  }

  const values = recorded.map((s) => s.cva_score)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const spread = recorded.length < 2 ? 0 : Math.max(...values) - Math.min(...values)
  const flagged = spread > threshold

  // Only worth naming somebody when the panel actually disagrees.
  let outliers: string[] = []
  if (flagged) {
    const distances = recorded.map((s) => Math.abs(s.cva_score - mean))
    const furthest = Math.max(...distances)
    outliers = recorded.filter((_, i) => distances[i] === furthest).map((s) => s.cupper_id)
  }

  return { recorded: recorded.length, mean, spread, flagged, outliers }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/cupping/cva-panel.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cupping/cva-panel.ts src/lib/cupping/cva-panel.test.ts
git commit -m "feat(cva): panel spread and outlier maths"
```

---

### Task 2: The per-template spread threshold

**Files:**
- Create: `database/migrations/20260901000000_cva_score_spread_max.sql`

**Interfaces:**
- Produces: `quality_templates.cva_score_spread_max NUMERIC NULL`, read by Task 3.

- [ ] **Step 1: Confirm the migration number is free**

```bash
ls database/migrations | tail -3
```

If anything `20260901000000` already exists, bump this file and Task 7's to the next free pair and keep them adjacent.

- [ ] **Step 2: Write the migration**

Create `database/migrations/20260901000000_cva_score_spread_max.sql`:

```sql
-- How far apart a specialty panel's cuppers may be, per quality template.
-- NULL = use the application default (3 points, DEFAULT_SPREAD_MAX in
-- src/lib/cupping/cva-panel.ts). Additive and nullable: existing rows and
-- currently deployed code are unaffected.
ALTER TABLE quality_templates
  ADD COLUMN IF NOT EXISTS cva_score_spread_max NUMERIC NULL;

COMMENT ON COLUMN quality_templates.cva_score_spread_max IS
  'Max acceptable max-min spread of CVA scores across a panel before the Panel step flags it. NULL = application default.';
```

- [ ] **Step 3: Hand it to Daniel**

Paste the SQL in a message: "This one is additive and safe to apply now — it does not depend on the rest of the branch." Record in the final hand-over (Task 8) whether he has applied it.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/20260901000000_cva_score_spread_max.sql
git commit -m "feat(db): per-template CVA panel spread threshold"
```

---

### Task 3: The panel route

**Files:**
- Create: `src/app/api/cupping/cva/panel/route.ts`
- Test: `src/app/api/cupping/cva/panel/route.test.ts`

**Interfaces:**
- Consumes: `panelStats`, `PanelScore`, `DEFAULT_SPREAD_MAX` (Task 1); `parseCvaNumber` from `@/lib/cupping/cva-cupping-data`; `resolveLabSourceId` from `@/lib/sample-group`; `computeAssessmentScore` from `@/lib/cva/scoring`.
- Produces: `GET /api/cupping/cva/panel?session_id=&sample_id=` returning the `PanelResponse` shape below, consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/cupping/cva/panel/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

/**
 * The blind rule is the point of this route: a cupper who has not finished
 * their own eight sections must not learn what anybody else scored. It is
 * enforced here, server-side, because a component-level gate is not a gate.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => state.db }))
vi.mock('@/lib/sample-group', () => ({ resolveLabSourceId: async (_db: any, id: string) => id }))

import { GET } from './route'

const complete = {
  sections: {
    fragrance: { impression: 7 }, aroma: { impression: 7 }, flavor: { impression: 7 },
    aftertaste: { impression: 7 }, acidity: { impression: 7 }, sweetness: { impression: 7 },
    mouthfeel: { impression: 7 }, overall: { impression: 7 },
  },
  cups: { non_uniform: [], defective: [] },
}
const partial = { sections: { fragrance: { impression: 7 } }, cups: { non_uniform: [], defective: [] } }

function fakeDb({ me, rows, session, profiles }: any) {
  const client: any = {
    auth: { getUser: async () => ({ data: { user: { id: me } }, error: null }) },
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        single: async () => ({
          data: table === 'cupping_sessions' ? session : null,
          error: null,
        }),
        then: undefined,
      }
      if (table === 'cupping_scores') return Object.assign(chain, { order: async () => ({ data: rows, error: null }) })
      if (table === 'profiles') return Object.assign(chain, { in: async () => ({ data: profiles, error: null }) })
      return chain
    },
  }
  return client
}

const get = () =>
  GET(new Request('http://localhost/api/cupping/cva/panel?session_id=sess-1&sample_id=lot-1') as any)

const session = {
  id: 'sess-1', session_type: 'cva', status: 'setup',
  sample_ids: ['lot-1'], cupper_ids: ['me', 'other'], guest_cuppers: [{ id: 'g1', name: 'Ana Guest' }],
  master_cupper_id: null,
}
const profiles = [
  { id: 'me', full_name: 'Me Myself', is_master_cupper: false },
  { id: 'other', full_name: 'A. Silva', is_master_cupper: true },
]

describe('GET /api/cupping/cva/panel', () => {
  it('withholds every other cupper while my own assessment is incomplete', async () => {
    state.db = fakeDb({
      me: 'me', session, profiles,
      rows: [
        { cupper_id: 'me', cva_score: 70, scores: partial },
        { cupper_id: 'other', cva_score: 84, scores: complete },
      ],
    })
    const body = await (await get()).json()
    expect(body.blind).toBe(true)
    expect(body.cuppers.map((c: any) => c.cupper_id)).toEqual(['me'])
    expect(body.mean).toBeNull()
  })

  it('reveals the whole panel once my eight sections are done', async () => {
    state.db = fakeDb({
      me: 'me', session, profiles,
      rows: [
        { cupper_id: 'me', cva_score: 86.25, scores: complete },
        { cupper_id: 'other', cva_score: 84, scores: complete },
      ],
    })
    const body = await (await get()).json()
    expect(body.blind).toBe(false)
    expect(body.cuppers.map((c: any) => c.cupper_id).sort()).toEqual(['me', 'other'])
    expect(body.spread).toBe(2.25)
  })

  it('marks the assigned master cupper as authoritative when the session names none', async () => {
    state.db = fakeDb({
      me: 'me', session, profiles,
      rows: [
        { cupper_id: 'me', cva_score: 86.25, scores: complete },
        { cupper_id: 'other', cva_score: 84, scores: complete },
      ],
    })
    const body = await (await get()).json()
    expect(body.authoritative_cupper_id).toBe('other')
    expect(body.cuppers.find((c: any) => c.cupper_id === 'other').is_master).toBe(true)
  })

  it('lists guests so the paper cards get reconciled, and never scores them', async () => {
    state.db = fakeDb({
      me: 'me', session, profiles,
      rows: [{ cupper_id: 'me', cva_score: 86.25, scores: complete }],
    })
    const body = await (await get()).json()
    expect(body.guests).toEqual([{ id: 'g1', name: 'Ana Guest' }])
  })

  it('refuses a sample the session does not hold', async () => {
    state.db = fakeDb({
      me: 'me', session: { ...session, sample_ids: ['someone-else'] }, profiles,
      rows: [{ cupper_id: 'me', cva_score: 86.25, scores: complete }],
    })
    expect((await get()).status).toBe(400)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/cupping/cva/panel/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the route**

Create `src/app/api/cupping/cva/panel/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { panelStats, DEFAULT_SPREAD_MAX, type PanelScore } from '@/lib/cupping/cva-panel'
import { parseCvaNumber } from '@/lib/cupping/cva-cupping-data'
import { computeAssessmentScore } from '@/lib/cva/scoring'
import { resolveLabSourceId } from '@/lib/sample-group'
import { CVA_PROTOCOL } from '@/lib/cupping-protocol-scope'
import type { CvaAssessment } from '@/types/cva'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * GET /api/cupping/cva/panel?session_id=&sample_id=
 *
 * Everybody's CVA score for one lot in one session, with the spread between
 * them — the specialty answer to the commodity scores/aggregate route.
 *
 * BLIND: a caller whose own eight sections are not all rated gets their own
 * row and nothing else. Anchoring to a colleague's number is exactly what a
 * panel exists to prevent, so the rule lives here rather than in the step that
 * renders it.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')
    const sampleId = searchParams.get('sample_id')
    if (!sessionId || !sampleId) {
      return NextResponse.json({ error: 'session_id and sample_id are required' }, { status: 400 })
    }

    const { data: session } = await admin
      .from('cupping_sessions')
      .select('id, sample_ids, cupper_ids, guest_cuppers, master_cupper_id')
      .eq('id', sessionId)
      .single()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Sessions and scores hang off the lab unit; a contract sibling reports the
    // cupping of the row it points at.
    const labId = await resolveLabSourceId(admin, sampleId)
    if (!((session as any).sample_ids ?? []).includes(labId)) {
      return NextResponse.json({ error: 'Sample is not part of this session' }, { status: 400 })
    }

    const { data: scoreRows } = await (admin as any)
      .from('cupping_scores')
      .select('cupper_id, cva_score, scores')
      .eq('session_id', sessionId)
      .eq('sample_id', labId)
      .eq('protocol', CVA_PROTOCOL)
      .order('updated_at', { ascending: false })

    // Newest row wins per cupper: autosave rewrites in place, but a legacy
    // duplicate would otherwise appear as two people.
    const byCupper = new Map<string, any>()
    for (const row of (scoreRows ?? []) as any[]) {
      if (row.cupper_id && !byCupper.has(row.cupper_id)) byCupper.set(row.cupper_id, row)
    }

    const isComplete = (row: any): boolean => {
      const a = row?.scores as CvaAssessment | undefined
      if (!a || typeof a !== 'object') return false
      return computeAssessmentScore(a).complete
    }

    const mine = byCupper.get(user.id)
    const blind = !isComplete(mine)

    const cupperIds = Array.from(byCupper.keys())
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, is_master_cupper')
      .in('id', cupperIds.length > 0 ? cupperIds : ['00000000-0000-0000-0000-000000000000'])

    const profileById = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]))

    // The certificate asserts the master cupper's reading; the session's own
    // designation wins, else whichever assigned cupper carries the flag. Same
    // rule scores/aggregate applies, and the same id pickAuthoritativeCvaRow
    // consumes — so the Panel and the certificate can never name different
    // people as authoritative.
    const authoritativeCupperId: string | null =
      ((session as any).master_cupper_id as string | null) ??
      (((profiles ?? []) as any[]).find((p) => p.is_master_cupper === true)?.id ?? null)

    const visibleIds = blind ? cupperIds.filter((id) => id === user.id) : cupperIds

    const cuppers = visibleIds.map((id) => {
      const row = byCupper.get(id)
      const assessment = (row?.scores ?? null) as CvaAssessment | null
      return {
        cupper_id: id,
        full_name: profileById.get(id)?.full_name ?? 'Unknown cupper',
        cva_score: parseCvaNumber(row?.cva_score),
        sections: assessment?.sections ?? null,
        is_master: id === authoritativeCupperId,
        is_you: id === user.id,
        complete: isComplete(row),
      }
    })

    // The threshold travels with the quality, like the pass mark does.
    let threshold = DEFAULT_SPREAD_MAX
    const { data: sample } = await admin
      .from('samples')
      .select('quality_spec_id')
      .eq('id', labId)
      .single()
    if ((sample as any)?.quality_spec_id) {
      const { data: spec } = await admin
        .from('client_qualities')
        .select('template:quality_templates(cva_score_spread_max)')
        .eq('id', (sample as any).quality_spec_id)
        .single()
      const configured = parseCvaNumber((spec as any)?.template?.cva_score_spread_max)
      if (configured != null) threshold = configured
    }

    // Statistics describe the WHOLE panel, so they are withheld entirely while
    // blind — a mean and a spread would leak the very numbers being withheld.
    const stats = blind
      ? { recorded: 0, mean: null, spread: 0, flagged: false, outliers: [] as string[] }
      : panelStats(
          cuppers.map((c): PanelScore => ({ cupper_id: c.cupper_id, cva_score: c.cva_score })),
          threshold,
        )

    return NextResponse.json({
      blind,
      cuppers,
      guests: ((session as any).guest_cuppers ?? []) as { id: string; name: string }[],
      threshold,
      authoritative_cupper_id: authoritativeCupperId,
      ...stats,
    })
  } catch (error) {
    console.error('GET /api/cupping/cva/panel', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Check `CVA_PROTOCOL` is exported where the import expects**

```bash
grep -n "CVA_PROTOCOL" src/lib/cupping-protocol-scope.ts
```

If it lives elsewhere, fix the import rather than re-declaring the constant.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/cupping/cva/panel/route.test.ts`
Expected: PASS, 5 tests. If the fake db chain does not satisfy a query you wrote, extend the fake — do not weaken the route.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors, same as baseline.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cupping/cva/panel/route.ts src/app/api/cupping/cva/panel/route.test.ts
git commit -m "feat(cva): panel route, blind until your own sections are done"
```

---

### Task 4: Retire the three roster refusals

**This is the riskiest task in the plan.** These guards were added on 2026-08-30 after a branch review found `cva/[id]`'s slug resolver would bind a roster. They are safe to remove only because the count gate refuses a session with no scores on its own. **Prove that first (Step 1), then delete.**

Do this task *before* Task 5. On its own it changes nothing a user can reach: rosters become openable, but nothing binds them yet.

**Files:**
- Modify: `src/lib/cupping/finalize-gate.ts`, `src/lib/cupping/finalize-gate.test.ts`
- Modify: `src/app/api/cupping/cva/finalize/route.ts:110-116`
- Modify: `src/app/api/cupping/cva/[id]/route.ts:81`
- Modify: `src/lib/cupping-protocol-scope.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `isRosterSession` keeps its definition in `roster.ts` and loses three callers; `ROSTER_SESSION_STATUS` and `excludeRosterSessions` cease to exist.

- [ ] **Step 1: Write the test that replaces the guard**

Append to `src/lib/cupping/finalize-gate.test.ts`:

```ts
describe('a session nobody has cupped', () => {
  // This is the safety net that lets the roster guard go: a roster holds no
  // score rows, so the count gate refuses it on its own merits and says
  // something more useful than "not a journey session".
  const roster = {
    id: 'roster-1',
    sample_ids: ['s1'],
    cupper_ids: ['c1', 'c2'],
    master_cupper_id: null,
    min_cuppers_required: 2,
    allow_single_cupper: false,
    session_type: 'cva',
    status: 'setup',
  }

  it('cannot be finalized, however it is typed', () => {
    const out = assertCanFinalize({
      session: roster, sampleId: 's1', actor: { id: 'c1' }, completedCupperIds: [],
    })
    expect(out).toEqual({
      ok: false, status: 400,
      error: 'Cannot finalize: only 0 of 2 required cuppers have completed their scores',
    })
  })

  it('cannot be finalized by an admin either', () => {
    const out = assertCanFinalize({
      session: roster, sampleId: 's1', actor: { id: 'x', is_global_admin: true }, completedCupperIds: [],
    })
    expect(out.ok).toBe(false)
  })

  it('finalizes normally once its cuppers have scored', () => {
    const out = assertCanFinalize({
      session: roster, sampleId: 's1', actor: { id: 'c1' }, completedCupperIds: ['c1', 'c2'],
    })
    expect(out.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run it — the third case must fail**

Run: `npx vitest run src/lib/cupping/finalize-gate.test.ts`
Expected: the first two PASS (the roster guard catches them, for the wrong reason), the third FAILS with `Not a CVA journey session (roster)`. That failure is the proof the guard is now in the way.

- [ ] **Step 3: Remove the guard from the gate**

In `src/lib/cupping/finalize-gate.ts`, delete the `isRosterSession` import and this block:

```ts
  // A roster ('cva' + 'setup') records who is assigned and holds no scores.
  // Its min_cuppers_required of 1 would relax the count gate below, so a lot
  // could be certified off a session that was never cupped. Both routes select
  // `*`, so the two marker columns are always here to check.
  if (isRosterSession(session)) {
    return { ok: false, status: 400, error: 'Not a CVA journey session (roster)' }
  }
```

Leave `session_type` and `status` on the `FinalizeSession` interface but retarget the comment, since the fields are still selected:

```ts
  /** Selected by both finalize routes; retained for logging and future rules. */
  session_type?: string | null
  status?: string | null
```

- [ ] **Step 4: Run the gate tests**

Run: `npx vitest run src/lib/cupping/finalize-gate.test.ts`
Expected: PASS, all three new cases included.

- [ ] **Step 5: Remove the guard from the finalize route**

In `src/app/api/cupping/cva/finalize/route.ts`, delete the `isRosterSession` import and the block at ~line 110:

```ts
    // And it must refuse a ROSTER, which is 'cva' typed and passes the check
    // above: a roster records who is assigned (see lib/cupping/roster.ts) and
    // ...
    if (isRosterSession(session as any)) {
      return NextResponse.json({ error: 'Not a CVA journey session (roster)' }, { status: 400 })
    }
```

The `session_type !== 'cva'` check just above it **stays** — that one refuses a commodity session, which is still wrong here.

- [ ] **Step 6: Let `loadSession` open a roster**

In `src/app/api/cupping/cva/[id]/route.ts`, delete the `isRosterSession` import and line 81:

```ts
  if (isRosterSession(session as any)) return null
```

Then update the `excludeRosterSessions` call at ~line 55 — the slug resolver may now resolve to a roster, which is the whole point. **Read the current query first** and unwrap it in place: the edit is to delete the `excludeRosterSessions(...)` wrapper and keep the query it wraps, byte for byte. It looks roughly like this, but the live filters are authoritative:

```ts
    const { data: sessions } = await admin
      .from('cupping_sessions')
      .select('id, sample_ids, created_at')
      .eq('session_type', CVA_SESSION_TYPE)
      .order('created_at', { ascending: false })
      .limit(50)
```

Only the roster exclusion goes. If you find yourself changing a `select` list or a filter, stop — that is not this edit.

- [ ] **Step 7: Delete the now-unused scope helpers**

In `src/lib/cupping-protocol-scope.ts`, remove `ROSTER_SESSION_STATUS` and `excludeRosterSessions`. Then prove nothing still calls them:

```bash
grep -rn "excludeRosterSessions\|ROSTER_SESSION_STATUS" src/ || echo "clean"
```

Expected: `clean`. `isRosterSession` in `roster.ts` must still be referenced by `pickRosterSession`, `sample-assignments` and `roster.test.ts` — check that too:

```bash
grep -rn "isRosterSession" src/ | grep -v "\.test\."
```

Expected: `roster.ts` (definition + `pickRosterSession`) and `sample-assignments/route.ts`. Nothing else.

- [ ] **Step 8: Full suite and type-check**

```bash
npx tsc --noEmit; echo "tsc exit=$?"
npx vitest run 2>&1 | tail -5
```

Expected: 0 tsc errors; test count is baseline + 3. Any test asserting `'Not a CVA journey session (roster)'` will now fail — those assertions are obsolete and should be replaced by the count-gate message, not restored.

- [ ] **Step 9: Commit**

```bash
git add src/lib/cupping/finalize-gate.ts src/lib/cupping/finalize-gate.test.ts \
        src/app/api/cupping/cva/finalize/route.ts \
        "src/app/api/cupping/cva/[id]/route.ts" \
        src/lib/cupping-protocol-scope.ts
git commit -m "refactor(cva): the count gate refuses an uncupped session, so the roster guards go"
```

---

### Task 5: The journey binds the roster

**Files:**
- Modify: `src/app/api/cupping/cva/session/route.ts`
- Modify: `src/app/api/notifications/samples-assigned/route.ts:333-334`
- Test: `src/app/api/cupping/cva/session/route.test.ts` (create)

**Interfaces:**
- Consumes: the guards removed in Task 4.
- Produces: `POST /api/cupping/cva/session` returns a roster's id when one holds the lot and lists the caller.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/cupping/cva/session/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

/**
 * The journey used to mint a session per cupper, which is why a specialty lot's
 * cuppers could never be compared and why its two-cupper minimum collapsed to
 * one. It now binds the roster written at assignment.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => state.db }))

import { POST } from './route'

function fakeDb({ me, sessions }: { me: string; sessions: any[] }) {
  const inserted: any[] = []
  const client: any = {
    inserted,
    auth: { getUser: async () => ({ data: { user: { id: me } }, error: null }) },
    from(table: string) {
      let pending: any = null
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        overlaps: () => chain,
        order: () => chain,
        limit: async () => ({ data: table === 'cupping_sessions' ? sessions : [], error: null }),
        insert(values: any) { pending = values; return chain },
        single: async () => {
          if (pending) {
            const row = { id: 'new-session', ...pending }
            inserted.push(row)
            return { data: row, error: null }
          }
          return { data: { laboratory_id: 'lab-1' }, error: null }
        },
      }
      return chain
    },
  }
  return client
}

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/cupping/cva/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as any)

const roster = {
  id: 'roster-1', session_type: 'cva', status: 'setup',
  sample_ids: ['lot-1', 'lot-2'], cupper_ids: ['me', 'other'],
}

describe('POST /api/cupping/cva/session', () => {
  it('binds the roster that holds this lot', async () => {
    state.db = fakeDb({ me: 'me', sessions: [roster] })
    const body = await (await post({ sample_ids: ['lot-1'] })).json()
    expect(body.session_id).toBe('roster-1')
    expect(state.db.inserted).toHaveLength(0)
  })

  it('binds the roster even though it holds more lots than were asked for', async () => {
    state.db = fakeDb({ me: 'me', sessions: [roster] })
    const body = await (await post({ sample_ids: ['lot-2'] })).json()
    expect(body.session_id).toBe('roster-1')
  })

  it('does not put a cupper on a roster they were never assigned to', async () => {
    state.db = fakeDb({ me: 'stranger', sessions: [roster] })
    const body = await (await post({ sample_ids: ['lot-1'] })).json()
    expect(body.session_id).toBe('new-session')
  })

  it('mints a session when the lot has no roster', async () => {
    state.db = fakeDb({ me: 'me', sessions: [] })
    const body = await (await post({ sample_id: 'lot-9' })).json()
    expect(body.session_id).toBe('new-session')
    expect(state.db.inserted[0]).toMatchObject({ session_type: 'cva', status: 'setup', cupper_ids: ['me'] })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/cupping/cva/session/route.test.ts`
Expected: FAIL — the route matches on `created_by` and an exact sample set, so it mints instead of binding.

- [ ] **Step 3: Replace the lookup**

In `src/app/api/cupping/cva/session/route.ts`, delete the `sameSet` helper and replace the candidate query, the `match` line and the insert with:

```ts
    // Bind the ROSTER written at assignment (lib/cupping/roster.ts): one
    // session per lot, shared by everybody cupping it. Until 2026-09-01 this
    // route minted a session per cupper, which is why a specialty lot's
    // cuppers could never be compared and why assertCanFinalize's
    // isSingleCupperSession always fired, collapsing the two-cupper minimum
    // to one.
    //
    // Matching is "the roster that holds this lot", not an exact sample-set
    // match: a roster accumulates sample_ids as more lots are assigned to the
    // same panel, so an exact match would miss it the moment a second lot
    // joined.
    const { data: candidates } = await admin
      .from('cupping_sessions')
      .select('id, sample_ids, cupper_ids')
      .eq('session_type', 'cva')
      .eq('status', 'setup')
      .overlaps('sample_ids', ids)
      .order('created_at', { ascending: false })
      .limit(50)

    // Somebody opening a lot they were never assigned is not silently added to
    // another panel — they get their own session, as before.
    const roster = (candidates ?? []).find((c: any) =>
      ((c.cupper_ids ?? []) as string[]).includes(user.id),
    )
    if (roster) {
      return NextResponse.json({ session_id: (roster as any).id })
    }

    // Carry the first sample's lab onto the session when available.
    const { data: sample } = await admin
      .from('samples')
      .select('laboratory_id')
      .eq('id', ids[0])
      .single()

    // Born 'setup', like a roster: a lot cupped without a prior assignment
    // still ends up with the one shared session everything else now expects.
    const { data: created, error } = await admin
      .from('cupping_sessions')
      .insert({
        session_type: 'cva',
        status: 'setup',
        created_by: user.id,
        participants: [user.id],
        cupper_ids: [user.id],
        sample_ids: ids,
        laboratory_id: (sample as any)?.laboratory_id ?? null,
        min_cuppers_required: 1,
        allow_single_cupper: true,
      } as any)
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({ session_id: created.id })
```

Delete the long comment above the old query about reusing a `'completed'` session — the roster is never completed, so it no longer applies.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/cupping/cva/session/route.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Make the roster's minimum real**

In `src/app/api/notifications/samples-assigned/route.ts`, in the roster **insert** (~line 333), replace:

```ts
            min_cuppers_required: 1,
            allow_single_cupper: true,
```

with:

```ts
            // A roster is now the journey's real session, so its minimum
            // actually gates certification — the same expression the commodity
            // session above uses. A one-cupper panel still certifies on one.
            min_cuppers_required: Math.min(merged.cupper_ids.length, 2),
            allow_single_cupper: merged.cupper_ids.length === 1,
```

In the roster **update** branch (~line 302), add the same two fields to the `.update({...})` object so a panel that grows from one cupper to two starts requiring two:

```ts
            min_cuppers_required: Math.min(merged.cupper_ids.length, 2),
            allow_single_cupper: merged.cupper_ids.length === 1,
```

- [ ] **Step 6: Full suite and type-check**

```bash
npx tsc --noEmit; echo "tsc exit=$?"
npx vitest run 2>&1 | tail -5
```

Expected: 0 tsc errors; baseline + 7 tests. Existing tests asserting that the journey mints a per-cupper session are now obsolete — update them to the roster behaviour rather than reverting the route.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cupping/cva/session/route.ts src/app/api/cupping/cva/session/route.test.ts \
        src/app/api/notifications/samples-assigned/route.ts
git commit -m "feat(cva): the journey binds the shared roster; its cupper minimum applies"
```

---

### Task 6: The Panel step

**Files:**
- Create: `src/components/cupping/cva/PanelStep.tsx`
- Test: `src/components/cupping/cva/PanelStep.test.tsx`
- Modify: `src/components/cupping/cva/CvaJourney.tsx`

**Interfaces:**
- Consumes: `GET /api/cupping/cva/panel` (Task 3).
- Produces: `<PanelStep sessionId sampleId reference />`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/cupping/cva/PanelStep.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PanelStep } from './PanelStep'

const panel = (over: Record<string, unknown> = {}) => ({
  blind: false,
  cuppers: [
    { cupper_id: 'me', full_name: 'Me Myself', cva_score: 86.25, is_master: false, is_you: true, complete: true, sections: null },
    { cupper_id: 'o', full_name: 'A. Silva', cva_score: 84, is_master: true, is_you: false, complete: true, sections: null },
  ],
  guests: [],
  mean: 85.125, spread: 2.25, threshold: 3, flagged: false, outliers: [],
  authoritative_cupper_id: 'o',
  ...over,
})

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => panel() })) as any
})

describe('PanelStep', () => {
  it('shows every cupper once the panel is revealed', async () => {
    render(<PanelStep sessionId="s1" sampleId="lot-1" reference="ABC-1" />)
    expect(await screen.findByText('A. Silva')).toBeInTheDocument()
    expect(screen.getByText('86.25')).toBeInTheDocument()
  })

  it('says whose reading the certificate will assert', async () => {
    render(<PanelStep sessionId="s1" sampleId="lot-1" reference="ABC-1" />)
    expect(await screen.findByText(/authoritative/i)).toBeInTheDocument()
  })

  it('withholds the panel and explains why while blind', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => panel({ blind: true, cuppers: [], mean: null, spread: 0 }),
    })) as any
    render(<PanelStep sessionId="s1" sampleId="lot-1" reference="ABC-1" />)
    expect(await screen.findByText(/rate all eight sections/i)).toBeInTheDocument()
    expect(screen.queryByText('A. Silva')).not.toBeInTheDocument()
  })

  it('calls out a panel that disagrees by more than the threshold', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => panel({ spread: 4.5, flagged: true, outliers: ['o'] }),
    })) as any
    render(<PanelStep sessionId="s1" sampleId="lot-1" reference="ABC-1" />)
    expect(await screen.findByText(/wider than/i)).toBeInTheDocument()
  })

  it('lists guests as unrecorded so their paper cards get reconciled', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => panel({ guests: [{ id: 'g1', name: 'Ana Guest' }] }),
    })) as any
    render(<PanelStep sessionId="s1" sampleId="lot-1" reference="ABC-1" />)
    expect(await screen.findByText('Ana Guest')).toBeInTheDocument()
    expect(screen.getByText(/not recorded/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/cupping/cva/PanelStep.test.tsx`
Expected: FAIL — `Failed to resolve import "./PanelStep"`.

- [ ] **Step 3: Write the component**

Create `src/components/cupping/cva/PanelStep.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

interface PanelCupper {
  cupper_id: string
  full_name: string
  cva_score: number | null
  is_master: boolean
  is_you: boolean
  complete: boolean
  sections: Record<string, unknown> | null
}

interface PanelData {
  blind: boolean
  cuppers: PanelCupper[]
  guests: { id: string; name: string }[]
  recorded: number
  mean: number | null
  spread: number
  threshold: number
  flagged: boolean
  outliers: string[]
  authoritative_cupper_id: string | null
}

interface Props {
  sessionId: string
  sampleId: string
  reference: string
}

const fmt = (n: number | null) => (n == null ? '—' : Number(n.toFixed(2)).toString())

/**
 * Everybody's score for this lot, once you have finished your own.
 *
 * The blind rule is enforced server-side; this component only renders what the
 * route was willing to send. Do not add a client-side reveal.
 */
export function PanelStep({ sessionId, sampleId, reference }: Props) {
  const [data, setData] = useState<PanelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/cupping/cva/panel?session_id=${encodeURIComponent(sessionId)}&sample_id=${encodeURIComponent(sampleId)}`,
        )
        const body = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(body?.error ?? 'Could not load the panel'); return }
        setData(body as PanelData)
      } catch {
        if (!cancelled) setError('Could not load the panel')
      }
    })()
    return () => { cancelled = true }
  }, [sessionId, sampleId])

  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading the panel…</p>
  }

  if (data.blind) {
    return (
      <div className="flex w-full max-w-[780px] flex-col items-center gap-3 text-center">
        <div className="text-[clamp(48px,12vw,96px)] font-extrabold leading-none tracking-tighter text-muted-foreground">—</div>
        <p className="text-sm text-muted-foreground">
          Rate all eight sections to see how the rest of the panel scored {reference}.
        </p>
        <p className="text-xs text-muted-foreground">
          Scores stay hidden until yours is complete, so nobody anchors to anybody else.
        </p>
      </div>
    )
  }

  const ordered = [...data.cuppers].sort((a, b) => (b.cva_score ?? -1) - (a.cva_score ?? -1))

  return (
    <div className="flex w-full max-w-[780px] flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Panel · {ordered.length} cupper{ordered.length === 1 ? '' : 's'}</h2>
        <span className="text-xs text-muted-foreground">{reference}</span>
      </div>

      <ul className="flex flex-col gap-2">
        {ordered.map((c) => (
          <li
            key={c.cupper_id}
            className="flex items-center justify-between rounded-[14px] border border-border px-4 py-3"
          >
            <span className="flex items-center gap-2 text-sm">
              <span className={c.is_you ? 'font-semibold' : undefined}>{c.full_name}</span>
              {c.is_you && <span className="text-xs text-muted-foreground">you</span>}
              {c.is_master && <span className="text-xs text-muted-foreground">authoritative</span>}
              {data.outliers.includes(c.cupper_id) && (
                <span className="text-xs text-muted-foreground">furthest from the mean</span>
              )}
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {c.complete ? fmt(c.cva_score) : 'in progress'}
            </span>
          </li>
        ))}
        {data.guests.map((g) => (
          <li
            key={g.id}
            className="flex items-center justify-between rounded-[14px] border border-dashed border-border px-4 py-3"
          >
            <span className="text-sm">
              {g.name} <span className="text-xs text-muted-foreground">guest</span>
            </span>
            <span className="text-xs text-muted-foreground">not recorded — see the paper card</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>mean {fmt(data.mean)}</span>
        <span>spread {fmt(data.spread)}</span>
        <span>threshold {fmt(data.threshold)}</span>
      </div>

      {data.flagged && (
        <p className="text-sm">
          This panel is wider than the {fmt(data.threshold)}-point threshold. Talk it through before certifying.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/cupping/cva/PanelStep.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Insert the step into the journey**

In `src/components/cupping/cva/CvaJourney.tsx`:

Import it beside the other step components (~line 18):

```ts
import { PanelStep } from './PanelStep'
```

In the `steps` array (~line 149), insert a `panel` entry **between** `score` and `certify`:

```ts
      {
        key: 'panel',
        label: 'Panel',
        accent: SCORE_ACCENT,
        done: live.complete,
        value: null,
      },
```

Update the footer label (~line 270) — Score no longer leads straight to Certify:

```ts
    : step === SCORE_STEP ? 'Compare the panel'
```

Renumber the two render blocks. `{step === 10 && (<CertifyStep …>)}` becomes `{step === 11 && (…)}`, and a new block goes between it and the Score block:

```tsx
          {step === 10 && (
            <PanelStep
              // Keyed by sample for the same reason CertifyStep is: step is
              // tracked per-sample, so switching tabs while both sit on this
              // step would otherwise not remount and would show the previous
              // lot's panel.
              key={activeId}
              sessionId={resolvedSessionId ?? ''}
              sampleId={activeId}
              reference={activeMeta?.reference ?? ''}
            />
          )}
```

Fix the stale comment inside `CertifyStep`'s block, which says "two tabs can both sit at step 10" — it is step 11 now.

`SCORE_STEP` stays `9`, and `last` is derived from `steps.length`, so neither needs touching. Verify no other literal step index exists:

```bash
grep -n "step === 9\|step === 10\|step === 11\|setStep(1[01])" src/components/cupping/cva/CvaJourney.tsx
```

Every hit must be accounted for by the edits above.

- [ ] **Step 6: Update the journey's own tests**

Run: `npx vitest run src/components/cupping/cva/CvaJourney.test.tsx`

Any test that drives the journey to Certify by step index needs the new number. Update the indices; do not renumber the journey back to suit the tests. `CvaJourney.test.tsx` will need `global.fetch` to answer the panel route — return `{ blind: true, cuppers: [], guests: [], mean: null, spread: 0, threshold: 3, flagged: false, outliers: [], authoritative_cupper_id: null }` for any URL containing `/cva/panel`.

- [ ] **Step 7: Look at it**

Run `npm run dev`, open a specialty lot with two cuppers, and confirm: blind before your eighth section, revealed after, guest rows dashed and marked unrecorded, Certify still reachable and still working. A screenshot in the commit message is not required, but do not skip the look — the tests cannot see layout.

- [ ] **Step 8: Full suite and type-check**

```bash
npx tsc --noEmit; echo "tsc exit=$?"
npx vitest run 2>&1 | tail -5
```

Expected: 0 tsc errors; baseline + 12 tests.

- [ ] **Step 9: Commit**

```bash
git add src/components/cupping/cva/PanelStep.tsx src/components/cupping/cva/PanelStep.test.tsx \
        src/components/cupping/cva/CvaJourney.tsx src/components/cupping/cva/CvaJourney.test.tsx
git commit -m "feat(cva): Panel step between Score and Certify"
```

---

### Task 7: Fold existing sessions into rosters

**Files:**
- Create: `database/migrations/20260901000001_cva_adopt_roster_sessions.sql`

**Interfaces:**
- Consumes: nothing in code.
- Produces: every specialty lot's CVA score rows sit on one `'cva'` + `'setup'` session.

**Known limitation, state it rather than hide it.** Part 2 groups roster-less
sessions by exact `sample_ids` equality. Per-cupper sessions for the same lot
normally *do* share an identical array — the journey built them from the same
request — but two cuppers who opened overlapping-yet-different sample sets will
not group, and each keeps its own promoted session. Verification query B
catches exactly this case (a lot whose scores span more than one session). If
B returns rows, they need a hand-written merge; do not loosen part 2 to an
overlap match without re-checking it, because `&&` would merge genuinely
separate panels that happen to share one lot.

- [ ] **Step 1: Write the migration**

Create `database/migrations/20260901000001_cva_adopt_roster_sessions.sql`:

```sql
-- Fold the CVA journey's per-cupper sessions into one shared session per lot.
--
-- Until 2026-09-01 /api/cupping/cva/session minted a session per cupper, so a
-- specialty lot's scores were scattered across as many sessions as it had
-- cuppers. The journey now binds the ROSTER written at assignment
-- ('cva' + 'setup'). This moves the history onto that model.
--
-- Re-runnable: every statement is idempotent, and a second run finds nothing
-- left to move.
--
-- NOTE: this migration does NOT self-verify. The Supabase SQL runner
-- autocommits, so a temp table declared ON COMMIT DROP disappears mid-run.
-- Run the verification queries at the bottom separately, afterwards.

-- 1. Lots that already have a roster: move their journey sessions' scores onto
--    it and absorb those sessions' owners into its cupper list.
WITH rosters AS (
  SELECT id, sample_ids
  FROM cupping_sessions
  WHERE session_type = 'cva' AND status = 'setup'
),
journey AS (
  SELECT s.id, s.created_by, s.cupper_ids, r.id AS roster_id
  FROM cupping_sessions s
  JOIN rosters r ON s.sample_ids && r.sample_ids
  WHERE s.session_type = 'cva'
    AND s.status <> 'setup'
)
UPDATE cupping_scores sc
SET session_id = j.roster_id
FROM journey j
WHERE sc.session_id = j.id;

WITH rosters AS (
  SELECT id, sample_ids FROM cupping_sessions
  WHERE session_type = 'cva' AND status = 'setup'
),
absorbed AS (
  SELECT r.id AS roster_id,
         array_agg(DISTINCT c) AS cuppers
  FROM cupping_sessions s
  JOIN rosters r ON s.sample_ids && r.sample_ids
  CROSS JOIN LATERAL unnest(
    COALESCE(s.cupper_ids, ARRAY[]::uuid[]) || COALESCE(ARRAY[s.created_by], ARRAY[]::uuid[])
  ) AS c
  WHERE s.session_type = 'cva' AND s.status <> 'setup' AND c IS NOT NULL
  GROUP BY r.id
)
UPDATE cupping_sessions r
SET cupper_ids = (
      SELECT array_agg(DISTINCT x)
      FROM unnest(COALESCE(r.cupper_ids, ARRAY[]::uuid[]) || a.cuppers) AS x
    ),
    participants = (
      SELECT array_agg(DISTINCT x)
      FROM unnest(COALESCE(r.cupper_ids, ARRAY[]::uuid[]) || a.cuppers) AS x
    )
FROM absorbed a
WHERE r.id = a.roster_id;

-- 2. Lots cupped before rosters existed (pre-2026-08-30): promote the OLDEST
--    journey session in place and pull its siblings' scores onto it.
WITH orphan AS (
  SELECT s.*,
         row_number() OVER (PARTITION BY s.sample_ids ORDER BY s.created_at) AS rn
  FROM cupping_sessions s
  WHERE s.session_type = 'cva'
    AND s.status <> 'setup'
    AND NOT EXISTS (
      SELECT 1 FROM cupping_sessions r
      WHERE r.session_type = 'cva' AND r.status = 'setup'
        AND r.sample_ids && s.sample_ids
    )
),
promoted AS (
  SELECT id, sample_ids FROM orphan WHERE rn = 1
)
UPDATE cupping_scores sc
SET session_id = p.id
FROM promoted p
JOIN cupping_sessions s
  ON s.session_type = 'cva' AND s.status <> 'setup' AND s.sample_ids = p.sample_ids
WHERE sc.session_id = s.id;

WITH orphan AS (
  SELECT s.id, s.sample_ids, s.created_at,
         row_number() OVER (PARTITION BY s.sample_ids ORDER BY s.created_at) AS rn
  FROM cupping_sessions s
  WHERE s.session_type = 'cva'
    AND s.status <> 'setup'
    AND NOT EXISTS (
      SELECT 1 FROM cupping_sessions r
      WHERE r.session_type = 'cva' AND r.status = 'setup'
        AND r.sample_ids && s.sample_ids
    )
),
promoted AS (SELECT id, sample_ids FROM orphan WHERE rn = 1),
crew AS (
  SELECT p.id AS keep_id, array_agg(DISTINCT c) AS cuppers
  FROM promoted p
  JOIN cupping_sessions s ON s.session_type = 'cva' AND s.sample_ids = p.sample_ids
  CROSS JOIN LATERAL unnest(
    COALESCE(s.cupper_ids, ARRAY[]::uuid[]) || COALESCE(ARRAY[s.created_by], ARRAY[]::uuid[])
  ) AS c
  WHERE c IS NOT NULL
  GROUP BY p.id
)
UPDATE cupping_sessions s
SET status = 'setup',
    cupper_ids = crew.cuppers,
    participants = crew.cuppers
FROM crew
WHERE s.id = crew.keep_id;

-- 3. Delete the journey sessions that are now empty.
--
--    NOT tidiness: load-cva-certificate-inputs.ts scopes to the NEWEST session
--    holding the lot, so a surviving empty journey session would shadow the
--    roster and render a certificate with no assessment at all.
DELETE FROM cupping_sessions s
WHERE s.session_type = 'cva'
  AND s.status <> 'setup'
  AND NOT EXISTS (SELECT 1 FROM cupping_scores sc WHERE sc.session_id = s.id);

-- 4. Bring every roster's cupper minimum in line with the code
--    (samples-assigned now writes Math.min(cuppers, 2)).
UPDATE cupping_sessions
SET min_cuppers_required = LEAST(COALESCE(array_length(cupper_ids, 1), 1), 2),
    allow_single_cupper  = (COALESCE(array_length(cupper_ids, 1), 1) = 1)
WHERE session_type = 'cva' AND status = 'setup';
```

- [ ] **Step 2: Write the verification queries**

Append to the same file, commented out, so they travel with the migration but do not run inside it:

```sql
-- ---------------------------------------------------------------------------
-- Run these SEPARATELY, after applying. Supabase's SQL editor hides NOTICE
-- output, so these return rows rather than raising.
--
-- A. Journey sessions that still hold scores. Expected: 0 rows. Any row here
--    is a lot whose scores could not be moved — investigate, do not re-run.
-- SELECT s.id, s.status, s.sample_ids, count(sc.id) AS scores
-- FROM cupping_sessions s
-- JOIN cupping_scores sc ON sc.session_id = s.id
-- WHERE s.session_type = 'cva' AND s.status <> 'setup'
-- GROUP BY s.id;
--
-- B. Lots whose scores are split across more than one session. Expected: 0.
-- SELECT sc.sample_id, count(DISTINCT sc.session_id) AS sessions
-- FROM cupping_scores sc
-- WHERE sc.protocol = 'cva'
-- GROUP BY sc.sample_id
-- HAVING count(DISTINCT sc.session_id) > 1;
--
-- C. The shape of the result: rosters, their cuppers, their score counts.
-- SELECT s.id, array_length(s.cupper_ids, 1) AS cuppers,
--        s.min_cuppers_required, count(sc.id) AS scores
-- FROM cupping_sessions s
-- LEFT JOIN cupping_scores sc ON sc.session_id = s.id
-- WHERE s.session_type = 'cva' AND s.status = 'setup'
-- GROUP BY s.id ORDER BY scores DESC;
```

- [ ] **Step 3: Commit**

```bash
git add database/migrations/20260901000001_cva_adopt_roster_sessions.sql
git commit -m "feat(db): fold per-cupper CVA sessions into shared rosters"
```

- [ ] **Step 4: Hand it to Daniel — do not push**

Paste the whole migration plus query A, B and C. Say plainly: apply this, run A and B (both must return 0 rows), then confirm — the branch pushes only after that, because the deployed code binds rosters and will hit "0 of 2 required cuppers" on any lot whose scores have not moved.

---

### Task 8: Verify, document, hand over

- [ ] **Step 1: Full verification with counts**

```bash
npx tsc --noEmit; echo "tsc exit=$?"
npx vitest run 2>&1 | tail -8
npm run lint 2>&1 | tail -5
```

Record: tsc errors before (0) and after; test files/tests before (121/1458) and after. State them plainly — if anything regressed, say so rather than rounding it off.

- [ ] **Step 2: Update the spec's status line**

Add at the top of `docs/superpowers/specs/2026-09-01-cva-cupper-panel-design.md`:

```markdown
> **Implemented** 2026-09-01 by `../plans/2026-09-01-cva-cupper-panel.md`.
> Migrations `20260901000000` and `20260901000001` must be applied before the
> code is deployed.
```

- [ ] **Step 3: Log the decision**

Append to `~/wolthers-vault/01-projects/waqc/decisions.md`:

```markdown
### 2026-09-01 — Specialty lots share one cupping session; the Panel step compares cuppers

The CVA journey minted a session per cupper, so specialty lots could never be
compared and `assertCanFinalize`'s single-cupper relaxation always fired —
one cupper could certify any specialty lot. The journey now binds the roster
session written at assignment, a Panel step between Score and Certify shows
every cupper's score with its spread, and the two-cupper minimum applies.
Cuppers are blind until their own eight sections are complete, enforced in the
route rather than the component.

The three guards that refused a roster were removed: the count gate refuses an
uncupped session on its own, and a roster is now the session everything wants.
`isRosterSession` survives as a preference for `pickRosterSession`.

Full SCA calibration sessions remain unbuilt; this shared session is their
foundation.
```

- [ ] **Step 4: Commit the docs**

```bash
git add docs/superpowers/specs/2026-09-01-cva-cupper-panel-design.md
git commit -m "docs: CVA Panel shipped; spec marked implemented"
```

The vault lives in a different repo — commit it there separately if it is tracked.

- [ ] **Step 5: Push only after Daniel confirms both migrations**

Both `20260901000000` (threshold column) and `20260901000001` (adoption) must be applied, and verification queries A and B must both return 0 rows. Only then:

```bash
git push origin main
```

Then smoke-test on prod: open a specialty lot assigned to two cuppers, confirm the Panel is blind until the eighth section, that both cuppers appear after, that the master cupper is marked authoritative, and that Certify still reaches a decision. Confirm a lot cupped *before* this change still certifies — that is what the migration bought.

---

## Notes for whoever executes this

- **Task 4 is the one to slow down on.** If the empty-session test in Step 1 does not fail at Step 2 in exactly the way described, stop: the guard is doing something you have not understood yet, and deleting it blind is how a roster gets certified.
- Tasks 1–3 touch nothing that exists and can be reviewed independently. Tasks 4 and 5 must land in that order; Task 5 before Task 4 leaves the journey unable to open the session it just bound.
- The repo has **no** `npm run typecheck` and **no** `npm run verify`. Use `npx tsc --noEmit` and `npx vitest run`.
- `src/app/samples/qc/page.tsx` (2306 lines) and `src/app/cupping/page.tsx` are frequently co-edited by Daniel. Stage only the paths you changed; never `git add -A`; never `git stash` in this tree.

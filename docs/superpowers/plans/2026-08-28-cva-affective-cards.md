# SCA-104 Affective Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Specialty (CVA) lots print from the QC page as SCA-104 Affective cards — one card per sample per cupper (staff and guests), commodity-card size, in the same print run as the commodity cards, with an optional per-cupper QR — and guests are stored on the cupping session.

**Architecture:** A new react-pdf card *face* (`CvaAffectiveCardFace`) is rendered by the two existing card documents (A6 thermal, A4 8-up) whenever `card.is_cva`, replacing the separate SCA-103 Descriptive document. A pure helper expands specialty cards per cupper and builds the QR payload. Guests live in a new `cupping_sessions.guest_cuppers` JSONB column; specialty lots, which have had no session since `72b4e2b`, get a **roster session** (`session_type 'cva'`, `status 'setup'`) at assignment, and the CVA journey is told to ignore `'setup'` sessions so the two never collide.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@react-pdf/renderer`, `qrcode`, Supabase (Postgres, service-role in API routes), vitest + testing-library, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-28-cva-affective-cards-design.md`

## Global Constraints

- No emojis in the UI. No mock data. Files stay under ~2000 lines (`src/app/samples/qc/page.tsx` is already 2306 — touch it minimally; its split is a separate job).
- Trunk-based: commit to `main`. **Do not push** until Daniel confirms the migration is applied (Vercel auto-deploys `main`; the new code reads `guest_cuppers`).
- Migrations live in `database/migrations/` and are pasted for Daniel to apply. Never apply one yourself.
- Specialty is a property of the **quality** (`quality_templates.methodology = 'cva'`), never of the sample row. Never fall back to page rows that lack it.
- QR payload for specialty cards uses the prefix `WAQC-CVA` (never `WAQC:`).
- Roster session = `session_type = 'cva' AND status = 'setup'`. Journey sessions are born `'active'`.
- Guest names: trimmed, max 60 chars, case-insensitive dedupe. Guest ids minted with `crypto.randomUUID()` (global on Node 22 and in browsers).
- Tests: `npm test` (vitest), `npx tsc --noEmit`, `npx eslint src`. Record the before-counts once at the start (Task 1, Step 0) and quote before/after in the final commit.
- Card fit is verified by rendering a PDF and **looking at it** (Task 3). Cards use react-pdf's default Helvetica in production too (only certificates register Inter), so the test render is faithful.
- Commit messages: `type(scope): message`, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File map

| File | Responsibility |
|---|---|
| `database/migrations/20260828000002_cupping_session_guest_cuppers.sql` | new `guest_cuppers` column |
| `src/lib/database.types.ts` | `cupping_sessions.guest_cuppers: Json` in Row/Insert/Update |
| `src/lib/cupping/roster.ts` (+ `.test.ts`) | guest normalisation, roster merge, roster-session pick — pure |
| `src/lib/cupping/cva-cards.ts` (+ `.test.ts`) | per-cupper expansion, QR payload, unique sample ids — pure |
| `src/components/pdf/cva-affective-card.tsx` (+ `.test.tsx`) | the Affective card face, both sizes |
| `src/components/pdf/thermal-cupping-card.tsx` | `ThermalCuppingCardData` additions; A6 doc renders the face for `is_cva` |
| `src/components/pdf/thermal-cupping-card-a4.tsx` | A4 doc renders the face for `is_cva` |
| `src/lib/sample-visibility.ts` (+ `.test.ts`) | `showCvaQr` setting, defaults merged over stored |
| `src/app/api/notifications/samples-assigned/route.ts` | guests on commodity sessions; roster session for specialty lots |
| `src/app/api/cupping/session-cuppers/route.ts` | returns guests; prefers the roster |
| `src/app/api/cupping/sample-assignments/route.ts` | returns guests; rosters shadow journey sessions |
| `src/app/api/cupping/cva/session/route.ts` | ignores `'setup'` sessions |
| `src/components/samples/assign-cuppers-dialog.tsx` (+ `.test.tsx`) | guest name input + chips |
| `src/components/cupping/print-cupping-cards-dialog.tsx` | no Descriptive doc; expansion; QR toggle; guests; fails closed |
| `src/app/samples/qc/page.tsx` | passes guests through (a handful of lines) |

---

### Task 1: Migration + roster helpers

**Files:**
- Create: `database/migrations/20260828000002_cupping_session_guest_cuppers.sql`
- Create: `src/lib/cupping/roster.ts`
- Test: `src/lib/cupping/roster.test.ts`

**Interfaces:**
- Produces: `GuestCupper { id: string; name: string }`, `RosterSessionRow`, `GUEST_NAME_MAX = 60`, `normalizeGuestNames(names: unknown): string[]`, `mergeGuests(existing, names, mintId?): GuestCupper[]`, `mergeRoster(existing: RosterSessionRow | null, incoming: { cupper_ids: string[]; guest_names: string[]; sample_ids: string[] }, mintId?): { cupper_ids; guest_cuppers; sample_ids }`, `isRosterSession(s): boolean`, `pickRosterSession<T extends RosterSessionRow>(sessions: T[], sampleIds: string[]): T | null`.

- [ ] **Step 0: Record the baseline**

Run: `npm test 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | tail -3 && npx eslint src 2>&1 | tail -3`
Note the test/file counts and the tsc/eslint error counts. They are quoted in the final commit.

- [ ] **Step 1: Write the migration**

```sql
-- Guest cuppers: visitors with no profile who still cup with the lab.
-- Printed on cupping cards by name; nothing is scored against them yet
-- (cupping_scores.cupper_id is an FK to profiles).
ALTER TABLE cupping_sessions
  ADD COLUMN IF NOT EXISTS guest_cuppers JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN cupping_sessions.guest_cuppers IS
  'Guest cuppers with no profile: [{"id": uuid, "name": text}]. Printed on cards; no scores are recorded against them yet.';
```

- [ ] **Step 1b: Teach the generated types the column**

The server client is `createServerClient<Database>`, so a typed `.select('… guest_cuppers …')` fails `tsc` until `src/lib/database.types.ts` knows the column. In the `cupping_sessions` block (starts near line 5546): after `cupper_ids: Json | null` in `Row` add `guest_cuppers: Json`; after `cupper_ids?: Json | null` in `Insert` add `guest_cuppers?: Json`; after `cupper_ids?: Json | null` in `Update` add `guest_cuppers?: Json`. (Three insertions, one per block — `grep -n "cupper_ids" src/lib/database.types.ts` shows all three lines.)

- [ ] **Step 2: Write the failing tests**

`src/lib/cupping/roster.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  isRosterSession,
  mergeGuests,
  mergeRoster,
  normalizeGuestNames,
  pickRosterSession,
} from './roster'

/** Deterministic id minter: guest-1, guest-2, … */
const mint = () => {
  let n = 0
  return () => `guest-${++n}`
}

describe('normalizeGuestNames', () => {
  it('trims, drops blanks and non-strings, dedupes case-insensitively keeping the first spelling', () => {
    expect(normalizeGuestNames(['  Maria ', '', 'maria', 42, null, 'João'])).toEqual(['Maria', 'João'])
  })

  it('caps a name at 60 characters', () => {
    expect(normalizeGuestNames(['x'.repeat(80)])[0]).toHaveLength(60)
  })

  it('returns [] for a non-array', () => {
    expect(normalizeGuestNames(undefined)).toEqual([])
    expect(normalizeGuestNames('Maria')).toEqual([])
  })
})

describe('mergeGuests', () => {
  it('keeps the id of a guest whose name is still on the list and mints ids for new names', () => {
    const existing = [{ id: 'g-old', name: 'Maria' }]
    expect(mergeGuests(existing, ['maria', 'Pedro'], mint())).toEqual([
      { id: 'g-old', name: 'Maria' },
      { id: 'guest-1', name: 'Pedro' },
    ])
  })

  it('drops a guest that is no longer on the list', () => {
    expect(mergeGuests([{ id: 'g-old', name: 'Maria' }], [], mint())).toEqual([])
  })

  it('ignores malformed existing entries', () => {
    expect(mergeGuests([{ id: 1, name: 'Bad' } as any, null as any], ['Ana'], mint())).toEqual([
      { id: 'guest-1', name: 'Ana' },
    ])
  })
})

describe('mergeRoster', () => {
  it('replaces staff, resolves guests against the existing ones, unions samples', () => {
    const existing = {
      id: 's1',
      cupper_ids: ['a', 'b'],
      guest_cuppers: [{ id: 'g1', name: 'Maria' }],
      sample_ids: ['x'],
    }
    const merged = mergeRoster(
      existing,
      { cupper_ids: ['b', 'c', 'b'], guest_names: ['Maria', 'Pedro'], sample_ids: ['y', 'x'] },
      mint(),
    )
    expect(merged.cupper_ids).toEqual(['b', 'c'])
    expect(merged.guest_cuppers).toEqual([
      { id: 'g1', name: 'Maria' },
      { id: 'guest-1', name: 'Pedro' },
    ])
    expect(merged.sample_ids).toEqual(['x', 'y'])
  })

  it('builds a fresh roster when there is no session', () => {
    const merged = mergeRoster(null, { cupper_ids: ['a'], guest_names: ['Ana'], sample_ids: ['x'] }, mint())
    expect(merged).toEqual({
      cupper_ids: ['a'],
      guest_cuppers: [{ id: 'guest-1', name: 'Ana' }],
      sample_ids: ['x'],
    })
  })
})

describe('pickRosterSession', () => {
  const journey = { id: 'j', session_type: 'cva', status: 'active', sample_ids: ['x'] }
  const roster = { id: 'r', session_type: 'cva', status: 'setup', sample_ids: ['x', 'y'] }
  const commodity = { id: 'c', session_type: 'regular', status: 'active', sample_ids: ['z'] }

  it('prefers a roster over a newer journey session holding the same sample', () => {
    expect(pickRosterSession([journey, roster], ['x'])?.id).toBe('r')
  })

  it('falls back to the first (newest) session holding any of the samples', () => {
    expect(pickRosterSession([journey, commodity], ['z'])?.id).toBe('c')
    expect(pickRosterSession([journey, commodity], ['x', 'z'])?.id).toBe('j')
  })

  it('returns null when nothing holds the samples', () => {
    expect(pickRosterSession([journey], ['q'])).toBeNull()
    expect(pickRosterSession([], ['q'])).toBeNull()
  })

  it('isRosterSession is cva + setup only', () => {
    expect(isRosterSession(roster)).toBe(true)
    expect(isRosterSession(journey)).toBe(false)
    expect(isRosterSession({ session_type: 'regular', status: 'setup' })).toBe(false)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/cupping/roster.test.ts`
Expected: FAIL — `Cannot find module './roster'`.

- [ ] **Step 4: Write the implementation**

`src/lib/cupping/roster.ts`:

```ts
/**
 * Cupping rosters: who is on a session, staff and guests.
 *
 * Staff cuppers are profile ids in `cupping_sessions.cupper_ids`. Guests have
 * no profile; they live in `cupping_sessions.guest_cuppers` as
 * `[{ id, name }]` (ids minted server-side) so they can be printed on cards
 * and, later, compared. Nothing is scored against a guest yet —
 * `cupping_scores.cupper_id` is an FK to `profiles`.
 *
 * Specialty lots have had no session at all since 72b4e2b (the CVA journey
 * mints per-cupper sessions lazily, born 'active'), so their assignment now
 * creates a ROSTER session: `session_type 'cva'`, `status 'setup'`. That
 * status is what tells a roster apart from a journey session; the journey's
 * reuse query skips it.
 */
export interface GuestCupper {
  id: string
  name: string
}

export interface RosterSessionRow {
  id: string
  session_type?: string | null
  status?: string | null
  cupper_ids?: string[] | null
  guest_cuppers?: GuestCupper[] | null
  sample_ids?: string[] | null
}

export const GUEST_NAME_MAX = 60

const nameKey = (name: string) => name.trim().toLowerCase()

const mintUuid = () => globalThis.crypto.randomUUID()

/** Trim, drop blanks and non-strings, cap length, dedupe case-insensitively (first spelling wins). */
export function normalizeGuestNames(names: unknown): string[] {
  if (!Array.isArray(names)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    if (typeof raw !== 'string') continue
    const name = raw.trim().slice(0, GUEST_NAME_MAX)
    if (!name) continue
    const key = nameKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/**
 * The incoming name list is definitive. A name already on the session keeps
 * its id (and its stored spelling); a new name gets a fresh id; a name that
 * is gone is dropped.
 */
export function mergeGuests(
  existing: GuestCupper[] | null | undefined,
  names: unknown,
  mintId: () => string = mintUuid,
): GuestCupper[] {
  const kept = (existing ?? []).filter(
    (g): g is GuestCupper => !!g && typeof g.id === 'string' && typeof g.name === 'string',
  )
  const byKey = new Map(kept.map((g) => [nameKey(g.name), g]))
  return normalizeGuestNames(names).map((name) => byKey.get(nameKey(name)) ?? { id: mintId(), name })
}

export interface RosterInput {
  cupper_ids: string[]
  guest_names: string[]
  sample_ids: string[]
}

export interface RosterMerge {
  cupper_ids: string[]
  guest_cuppers: GuestCupper[]
  sample_ids: string[]
}

/**
 * The assign dialog's roster is definitive for staff and guests (the user
 * sees the full list and unticks to remove — same rule as the commodity
 * session); samples accumulate.
 */
export function mergeRoster(
  existing: RosterSessionRow | null,
  incoming: RosterInput,
  mintId: () => string = mintUuid,
): RosterMerge {
  return {
    cupper_ids: [...new Set(incoming.cupper_ids)],
    guest_cuppers: mergeGuests(existing?.guest_cuppers, incoming.guest_names, mintId),
    sample_ids: [...new Set([...(existing?.sample_ids ?? []), ...incoming.sample_ids])],
  }
}

export function isRosterSession(s: Pick<RosterSessionRow, 'session_type' | 'status'>): boolean {
  return s.session_type === 'cva' && s.status === 'setup'
}

/**
 * Among sessions (newest first) holding any of `sampleIds`, prefer a roster —
 * it is the one that knows everybody — else the first match.
 */
export function pickRosterSession<T extends RosterSessionRow>(sessions: T[], sampleIds: string[]): T | null {
  const wanted = new Set(sampleIds)
  const holding = sessions.filter((s) => (s.sample_ids ?? []).some((id) => wanted.has(id)))
  return holding.find(isRosterSession) ?? holding[0] ?? null
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/cupping/roster.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add database/migrations/20260828000002_cupping_session_guest_cuppers.sql src/lib/database.types.ts src/lib/cupping/roster.ts src/lib/cupping/roster.test.ts
git commit -m "feat(cupping): guest cuppers column and roster helpers

Specialty lots have had no session since 72b4e2b, so nothing could carry a
guest or a reprint's names. mergeRoster/pickRosterSession are the pure core
of the roster session the assignment route creates next.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Per-cupper card expansion + card data fields

**Files:**
- Modify: `src/components/pdf/thermal-cupping-card.tsx:82-105` (the `ThermalCuppingCardData` interface)
- Create: `src/lib/cupping/cva-cards.ts`
- Test: `src/lib/cupping/cva-cards.test.ts`

**Interfaces:**
- Consumes: `GuestCupper` from Task 1.
- Produces: on `ThermalCuppingCardData`: `template_id?: string`, `cupper_name?: string`, `cupper_key?: string` (and the existing `is_cva?: boolean`). From `cva-cards.ts`: `CardRoster { cuppers: { id: string; full_name: string }[]; guests: GuestCupper[] }`, `ExpandedCard { card: ThermalCuppingCardData; qr_payload: string | null }`, `CVA_QR_PREFIX = 'WAQC-CVA'`, `ANON_CUPPER_KEY = 'anon'`, `guestKey(id): string`, `cvaQrPayload(card, cupperKey): string`, `expandCvaCards(cards, roster, { qr: boolean; blankCopies: number }): ExpandedCard[]`, `uniqueSampleIds(cards): string[]`.

- [ ] **Step 1: Extend the card data type**

In `src/components/pdf/thermal-cupping-card.tsx`, replace the line

```ts
  is_cva?: boolean // Specialty CVA sample — prints on the SCA Descriptive Form instead
```

with

```ts
  is_cva?: boolean // Specialty CVA sample — prints on the SCA Affective card face
  template_id?: string // Quality template id, carried into the specialty QR payload
  cupper_name?: string // Specialty cards are one per cupper: the name printed on the card
  cupper_key?: string // Who the card is for: profile uuid, `g:<uuid>` for a guest, 'anon' for a blank copy
```

- [ ] **Step 2: Write the failing tests**

`src/lib/cupping/cva-cards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cvaQrPayload, expandCvaCards, guestKey, uniqueSampleIds } from './cva-cards'
import type { ThermalCuppingCardData } from '@/components/pdf/thermal-cupping-card'

function card(id: string, is_cva: boolean): ThermalCuppingCardData {
  return {
    sample_id: id,
    sample_number: `SAN-${id}`,
    tracking_number: `SAN-${id}/26`,
    template_id: `tpl-${id}`,
    template_name: 'T',
    template_scale_info: '1-9',
    attributes: [],
    num_cuppers: 2,
    qr_code: 'data:qr',
    is_cva,
  }
}

const roster = {
  cuppers: [
    { id: 'u1', full_name: 'Anderson Silva' },
    { id: 'u2', full_name: 'Bia Costa' },
  ],
  guests: [{ id: 'g1', name: 'Maria' }],
}

describe('expandCvaCards', () => {
  it('passes commodity cards through untouched, and first', () => {
    const commodity = card('b', false)
    const out = expandCvaCards([card('a', true), commodity], roster, { qr: true, blankCopies: 5 })
    expect(out[0].card).toBe(commodity)
    expect(out[0].qr_payload).toBeNull()
    expect(out).toHaveLength(1 + 3)
  })

  it('makes one specialty card per cupper per sample; stacks contiguous, staff then guests', () => {
    const out = expandCvaCards([card('a', true), card('b', true)], roster, { qr: true, blankCopies: 5 })
    expect(out.map((e) => [e.card.cupper_key, e.card.sample_id])).toEqual([
      ['u1', 'a'], ['u1', 'b'],
      ['u2', 'a'], ['u2', 'b'],
      ['g:g1', 'a'], ['g:g1', 'b'],
    ])
    expect(out[0].card.cupper_name).toBe('Anderson Silva')
    expect(out[4].card.cupper_name).toBe('Maria')
  })

  it('encodes sample, tracking, template and cupper in the QR payload', () => {
    const out = expandCvaCards([card('a', true)], roster, { qr: true, blankCopies: 5 })
    expect(out[0].qr_payload).toBe('WAQC-CVA:a:SAN-a/26:tpl-a:u1')
    expect(out[2].qr_payload).toBe('WAQC-CVA:a:SAN-a/26:tpl-a:g:g1')
    expect(out.every((e) => e.card.qr_code === '')).toBe(true) // filled in by the caller
  })

  it('drops the QR when switched off', () => {
    const out = expandCvaCards([card('a', true)], roster, { qr: false, blankCopies: 5 })
    expect(out.every((e) => e.qr_payload === null && e.card.qr_code === '')).toBe(true)
  })

  it('prints blank copies when nobody is on the roster', () => {
    const out = expandCvaCards([card('a', true)], { cuppers: [], guests: [] }, { qr: true, blankCopies: 3 })
    expect(out).toHaveLength(3)
    expect(out.map((e) => e.card.cupper_name)).toEqual([undefined, undefined, undefined])
    expect(out[0].qr_payload).toBe('WAQC-CVA:a:SAN-a/26:tpl-a:anon')
  })

  it('never prints zero copies', () => {
    expect(expandCvaCards([card('a', true)], { cuppers: [], guests: [] }, { qr: false, blankCopies: 0 })).toHaveLength(1)
  })
})

describe('helpers', () => {
  it('uniqueSampleIds collapses the per-cupper copies', () => {
    expect(uniqueSampleIds([{ sample_id: 'a' }, { sample_id: 'a' }, { sample_id: 'b' }])).toEqual(['a', 'b'])
  })

  it('guestKey and cvaQrPayload', () => {
    expect(guestKey('g1')).toBe('g:g1')
    expect(cvaQrPayload({ sample_id: 's', tracking_number: 't/26', template_id: undefined }, 'anon')).toBe(
      'WAQC-CVA:s:t/26::anon',
    )
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/cupping/cva-cards.test.ts`
Expected: FAIL — `Cannot find module './cva-cards'`.

- [ ] **Step 4: Write the implementation**

`src/lib/cupping/cva-cards.ts`:

```ts
import type { ThermalCuppingCardData } from '@/components/pdf/thermal-cupping-card'
import type { GuestCupper } from './roster'

export interface CardRoster {
  cuppers: { id: string; full_name: string }[]
  guests: GuestCupper[]
}

export interface ExpandedCard {
  card: ThermalCuppingCardData
  /** QR content to encode for this card; null when the card keeps (or lacks) a QR of its own. */
  qr_payload: string | null
}

export const CVA_QR_PREFIX = 'WAQC-CVA'
export const ANON_CUPPER_KEY = 'anon'

export const guestKey = (guestId: string) => `g:${guestId}`

/**
 * Payload of a specialty card's QR. The prefix is deliberately NOT `WAQC:`:
 * the commodity OCR scanner (`ocr/process-card`) parses only that prefix and
 * would take the trailing cupper uuid for a template id, mangle the tracking
 * number and write a COMMODITY score against a specialty lot. Nothing reads
 * this prefix yet; it is here so a scanned card attributes itself to sample
 * + cupper when something does.
 */
export function cvaQrPayload(
  card: Pick<ThermalCuppingCardData, 'sample_id' | 'tracking_number' | 'template_id'>,
  cupperKey: string,
): string {
  return `${CVA_QR_PREFIX}:${card.sample_id}:${card.tracking_number}:${card.template_id ?? ''}:${cupperKey}`
}

interface Recipient {
  key: string
  name?: string
}

function recipients(roster: CardRoster, blankCopies: number): Recipient[] {
  const staff = roster.cuppers.map((c) => ({ key: c.id, name: c.full_name }))
  const guests = roster.guests.map((g) => ({ key: guestKey(g.id), name: g.name }))
  const named = [...staff, ...guests]
  if (named.length > 0) return named
  return Array.from({ length: Math.max(1, blankCopies) }, () => ({ key: ANON_CUPPER_KEY }))
}

/**
 * Commodity cards pass through first, in input order (one per sample, all
 * cuppers on it). Specialty cards are expanded one per (cupper, sample) — the
 * Affective form is single-cupper by construction — with each cupper's stack
 * contiguous, staff in roster order then guests, so a printed pile can be
 * handed over per person. With nobody on the roster, `blankCopies` unnamed
 * sets print. `qr_code` is left empty here; the caller encodes `qr_payload`.
 */
export function expandCvaCards(
  cards: ThermalCuppingCardData[],
  roster: CardRoster,
  opts: { qr: boolean; blankCopies: number },
): ExpandedCard[] {
  const commodity: ExpandedCard[] = cards.filter((c) => !c.is_cva).map((card) => ({ card, qr_payload: null }))
  const specialty = cards.filter((c) => c.is_cva)
  if (specialty.length === 0) return commodity

  const expanded: ExpandedCard[] = []
  for (const who of recipients(roster, opts.blankCopies)) {
    for (const base of specialty) {
      const card: ThermalCuppingCardData = { ...base, cupper_key: who.key, cupper_name: who.name, qr_code: '' }
      expanded.push({ card, qr_payload: opts.qr ? cvaQrPayload(base, who.key) : null })
    }
  }
  return [...commodity, ...expanded]
}

/** The stage advance and the printed stamp are per sample; several cards now share one. */
export function uniqueSampleIds(cards: Pick<ThermalCuppingCardData, 'sample_id'>[]): string[] {
  return [...new Set(cards.map((c) => c.sample_id).filter(Boolean))]
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/cupping/cva-cards.test.ts && npx tsc --noEmit 2>&1 | tail -3`
Expected: PASS, 8 tests; tsc error count unchanged from the baseline.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cupping/cva-cards.ts src/lib/cupping/cva-cards.test.ts src/components/pdf/thermal-cupping-card.tsx
git commit -m "feat(cupping): expand specialty cards per cupper with a WAQC-CVA QR payload

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: The Affective card face, wired into both card documents

**Files:**
- Create: `src/components/pdf/cva-affective-card.tsx`
- Modify: `src/components/pdf/thermal-cupping-card-a4.tsx:336-460` (the per-card render)
- Modify: `src/components/pdf/thermal-cupping-card.tsx:107-118` (styles) and `:325-435` (the per-card render)
- Test: `src/components/pdf/cva-affective-card.test.tsx`

**Interfaces:**
- Consumes: `ThermalCuppingCardData` with `is_cva`, `cupper_name`, `qr_code` (`''` = none) from Task 2.
- Produces: `CvaAffectiveCardFace: React.FC<{ card: ThermalCuppingCardData; variant: 'a4' | 'a6'; show_quality: boolean; show_buyer: boolean; show_exporter: boolean }>`, `AFFECTIVE_ATTRIBUTES`.

- [ ] **Step 1: Write the failing tests**

`src/components/pdf/cva-affective-card.test.tsx`:

```tsx
// @vitest-environment node
import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStream } from '@react-pdf/renderer'
import { ThermalCuppingCardA4Document } from './thermal-cupping-card-a4'
import { ThermalCuppingCardDocument, type ThermalCuppingCardData } from './thermal-cupping-card'
import { AFFECTIVE_ATTRIBUTES } from './cva-affective-card'

/** 1x1 transparent PNG — an Image slot needs a real source. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function card(n: number, is_cva: boolean, qr = true): ThermalCuppingCardData {
  return {
    sample_id: `s${n}`,
    sample_number: `SAN-0000${n}/26`,
    tracking_number: `SAN-0000${n}/26`,
    sample_type: 'pss',
    wolthers_contract_nr: `4500${n}/26`,
    print_date: '30 AUG 2026',
    exporter_sample_number: `EXP-${n}`,
    quality_name: 'Specialty 86+',
    buyer_name: 'Blaser Trading',
    exporter_name: 'Cocatrel',
    lab_name: 'Santos',
    template_id: 'tpl-1',
    template_name: 'CVA',
    template_scale_info: '1-9',
    attributes: ['Frag', 'Arom', 'Body'],
    num_cuppers: 3,
    cuppers: ['Anderson', 'Bia', 'Maria'],
    qr_code: qr ? PIXEL : '',
    is_cva,
    cupper_name: is_cva ? 'Anderson Silva' : undefined,
    cupper_key: is_cva ? 'u1' : undefined,
  }
}

async function render(doc: React.ReactElement): Promise<string> {
  const stream = await renderToStream(doc)
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('latin1')
}

/** Count page objects ("/Type /Page" but not "/Type /Pages"). */
function pageCount(pdf: string): number {
  return (pdf.match(/\/Type\s*\/Page(?!s)/g) || []).length
}

const common = { show_quality: true, show_buyer: true, show_supplier: true, show_exporter: true }

describe('specialty Affective cards inside the commodity documents', () => {
  it('lists the eight SCA-104 attributes in form order', () => {
    expect(AFFECTIVE_ATTRIBUTES).toEqual([
      'Fragrance', 'Aroma', 'Flavor', 'Aftertaste', 'Acidity', 'Sweetness', 'Mouthfeel', 'Overall',
    ])
  })

  it('A4: eight mixed cards fill one sheet, nine spill to a second', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => card(i + 1, i % 2 === 0))
    expect(pageCount(await render(<ThermalCuppingCardA4Document cards={eight} {...common} />))).toBe(1)
    expect(
      pageCount(await render(<ThermalCuppingCardA4Document cards={[...eight, card(9, true)]} {...common} />)),
    ).toBe(2)
  })

  it('A6 thermal: one page per card, specialty or not', async () => {
    const cards = [card(1, true), card(2, false), card(3, true)]
    expect(pageCount(await render(<ThermalCuppingCardDocument cards={cards} {...common} />))).toBe(3)
  })

  it('renders a specialty card with no QR and no cupper name', async () => {
    const blank = { ...card(1, true, false), cupper_name: undefined }
    expect(pageCount(await render(<ThermalCuppingCardA4Document cards={[blank]} {...common} />))).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/pdf/cva-affective-card.test.tsx`
Expected: FAIL — `Cannot find module './cva-affective-card'`.

- [ ] **Step 3: Write the card face**

`src/components/pdf/cva-affective-card.tsx`:

```tsx
import React from 'react'
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ThermalCuppingCardData } from './thermal-cupping-card'

/**
 * SCA Coffee Value Assessment — Affective Form (SCA-104 §7.2, Version 2,
 * June 2024) as a cupping CARD: the 1–9 impression-of-quality scales for
 * Fragrance, Aroma, Flavor, Aftertaste, Acidity, Sweetness, Mouthfeel and
 * Overall with a FINAL box each, the non-uniform / defective cup boxes and
 * the Moldy / Phenolic / Potato defects, at the size of the commodity card
 * so a mixed batch prints and cuts as one stack. The form is single-cupper
 * by construction, so it is one card per sample per cupper, name pre-filled.
 *
 * Wolthers adaptations of the SCA form (which may be reproduced "without
 * modification"): sample metadata in the header, the cupper's name, a QR
 * code attributing the card to sample + cupper, and the card size. The SCA
 * copyright line is kept. This is the same call the Descriptive component
 * (`cva-descriptive-card.tsx`) documented for its own adaptations.
 */

export const AFFECTIVE_ATTRIBUTES = [
  'Fragrance',
  'Aroma',
  'Flavor',
  'Aftertaste',
  'Acidity',
  'Sweetness',
  'Mouthfeel',
  'Overall',
] as const

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const FIVE_BOXES = [1, 2, 3, 4, 5] as const
const DEFECTS = ['Moldy', 'Phenolic', 'Potato'] as const
const LEGEND =
  '1 Extremely low  ·  2 Very low  ·  3 Moderately low  ·  4 Slightly low  ·  5 Neither high nor low  ·  6 Slightly high  ·  7 Moderately high  ·  8 Very high  ·  9 Extremely high'

export type AffectiveCardVariant = 'a4' | 'a6'

const INNER_BORDER = '0.5pt solid #000000'
const INNER_BORDER_LIGHT = '0.5pt solid #CCCCCC'
const RING = '0.6pt solid #000000'

/**
 * One style set per card size. The A4 8-up card is ~290×194pt inside its cut
 * border; the A6 thermal card ~404×282pt. Everything scales by `s` so the
 * two faces are the same drawing; the Notes area takes the leftover height.
 */
function makeStyles(variant: AffectiveCardVariant) {
  const s = variant === 'a6' ? 1.3 : 1
  const ring = 9 * s
  return StyleSheet.create({
    card: { flexDirection: 'column', height: '100%', fontSize: 6 * s, color: '#000000' },
    header: { flexDirection: 'row', borderBottom: INNER_BORDER, padding: 2 * s },
    qr: { width: 40 * s, height: 40 * s, marginRight: 3 * s },
    headerMain: { flex: 1, flexDirection: 'column' },
    headerSide: { width: 82 * s, alignItems: 'flex-end' },
    company: { fontSize: 6 * s, fontWeight: 'bold', marginBottom: 1 },
    sampleNumber: { fontSize: 7 * s, fontWeight: 'bold', marginBottom: 1 },
    infoRow: { fontSize: 5.5 * s, color: '#333333', marginBottom: 0.5 },
    infoLabel: { fontWeight: 'bold' },
    quality: { fontSize: 7 * s, fontWeight: 'bold', marginTop: 'auto' },
    contractNr: { fontSize: 6.5 * s, fontWeight: 'bold', textAlign: 'right' },
    printDate: { fontSize: 6 * s, fontWeight: 'bold', textAlign: 'right', marginTop: 1 },
    formTag: { fontSize: 4.5 * s, color: '#555555', textAlign: 'right', marginTop: 'auto', letterSpacing: 0.3 },
    cupper: { fontSize: 6.5 * s, fontWeight: 'bold', textAlign: 'right', marginTop: 1 },
    legend: {
      fontSize: 4 * s,
      color: '#333333',
      paddingHorizontal: 2 * s,
      paddingVertical: 1 * s,
      borderBottom: INNER_BORDER_LIGHT,
    },
    scales: { paddingHorizontal: 2 * s, paddingTop: 1 * s },
    scaleRow: { flexDirection: 'row', alignItems: 'center', height: 13 * s },
    scaleName: { width: 42 * s, fontSize: 6.5 * s, fontWeight: 'bold' },
    circles: { flexDirection: 'row', alignItems: 'center' },
    circle: {
      width: ring,
      height: ring,
      borderRadius: ring / 2,
      border: RING,
      marginRight: 4 * s,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleText: { fontSize: 5 * s },
    finalBox: {
      width: 26 * s,
      height: ring,
      border: RING,
      borderRadius: ring / 2,
      marginLeft: 4 * s,
      alignItems: 'center',
      justifyContent: 'center',
    },
    finalText: { fontSize: 4 * s, letterSpacing: 0.4, color: '#555555' },
    footer: { borderTop: INNER_BORDER, paddingHorizontal: 2 * s, paddingTop: 1.5 * s, flex: 1 },
    cupsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 1.5 * s },
    cupsLabel: { fontSize: 4.5 * s, fontWeight: 'bold', marginRight: 2 * s },
    box: { width: 5.5 * s, height: 5.5 * s, border: '0.5pt solid #000000', marginRight: 1.5 * s },
    defectItem: { flexDirection: 'row', alignItems: 'center', marginRight: 4 * s },
    defectLabel: { fontSize: 4.5 * s },
    spacer: { width: 8 * s },
    notes: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
    notesLabel: { fontSize: 4.5 * s, fontWeight: 'bold', marginRight: 2 * s },
    notesLine: { flex: 1, borderBottom: INNER_BORDER_LIGHT, minHeight: 7 * s },
    copyright: { fontSize: 3.5 * s, color: '#777777', paddingHorizontal: 2 * s, paddingBottom: 1 * s },
  })
}

const STYLES: Record<AffectiveCardVariant, ReturnType<typeof makeStyles>> = {
  a4: makeStyles('a4'),
  a6: makeStyles('a6'),
}

/** Same identifier rule as the commodity faces: exporter sample nr → lab nr; SS = ICO + container. */
function sampleIdentifier(card: ThermalCuppingCardData): string {
  if (card.sample_type === 'ss') {
    return [card.ico_number || card.sample_number || card.tracking_number, card.container_nr]
      .filter(Boolean)
      .join('  |  ')
  }
  return card.exporter_sample_number || card.sample_number || card.tracking_number || 'Unknown'
}

export interface CvaAffectiveCardFaceProps {
  card: ThermalCuppingCardData
  variant: AffectiveCardVariant
  show_quality: boolean
  show_buyer: boolean
  show_exporter: boolean
}

export const CvaAffectiveCardFace: React.FC<CvaAffectiveCardFaceProps> = ({
  card,
  variant,
  show_quality,
  show_buyer,
  show_exporter,
}) => {
  const st = STYLES[variant]
  const contracts = [card.wolthers_contract_nr, ...(card.sibling_contract_nrs || [])].filter(Boolean) as string[]

  return (
    <View style={st.card}>
      <View style={st.header}>
        {card.qr_code ? <Image src={card.qr_code} style={st.qr} /> : null}
        <View style={st.headerMain}>
          <Text style={st.company}>WOLTHERS & ASSOCIATES</Text>
          <Text style={st.sampleNumber}>
            {card.sample_type ? card.sample_type.toUpperCase() : 'TYPE'}: {sampleIdentifier(card)}
          </Text>
          {show_buyer && card.buyer_name ? (
            <Text style={st.infoRow}>
              <Text style={st.infoLabel}>Importer:</Text> {card.buyer_name}
            </Text>
          ) : null}
          {show_exporter && card.exporter_name ? (
            <Text style={st.infoRow}>
              <Text style={st.infoLabel}>Exporter:</Text> {card.exporter_name}
            </Text>
          ) : null}
          {card.sample_type === 'ss' && card.exporter_sample_number ? (
            <Text style={st.infoRow}>
              <Text style={st.infoLabel}>Exp. Sample #:</Text> {card.exporter_sample_number}
            </Text>
          ) : null}
          {show_quality && card.quality_name ? <Text style={st.quality}>{card.quality_name}</Text> : null}
        </View>
        <View style={st.headerSide}>
          {contracts.length <= 3 ? (
            contracts.map((nr, i) => (
              <Text key={i} style={st.contractNr}>
                {nr}
              </Text>
            ))
          ) : (
            <Text style={st.contractNr}>
              {contracts.length} contracts: {contracts[0]} - {contracts[contracts.length - 1]}
            </Text>
          )}
          {card.print_date ? <Text style={st.printDate}>{card.print_date}</Text> : null}
          <Text style={st.formTag}>SCA CVA · AFFECTIVE</Text>
          <Text style={st.cupper}>Cupper: {card.cupper_name || '________________'}</Text>
        </View>
      </View>

      <Text style={st.legend}>{LEGEND}</Text>

      <View style={st.scales}>
        {AFFECTIVE_ATTRIBUTES.map((name) => (
          <View key={name} style={st.scaleRow}>
            <Text style={st.scaleName}>{name}</Text>
            <View style={st.circles}>
              {SCALE.map((n) => (
                <View key={n} style={st.circle}>
                  <Text style={st.circleText}>{n}</Text>
                </View>
              ))}
              <View style={st.finalBox}>
                <Text style={st.finalText}>FINAL</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={st.footer}>
        <View style={st.cupsRow}>
          <Text style={st.cupsLabel}>NON-UNIFORM CUPS</Text>
          {FIVE_BOXES.map((n) => (
            <View key={`nu-${n}`} style={st.box} />
          ))}
          <View style={st.spacer} />
          <Text style={st.cupsLabel}>DEFECTIVE CUPS</Text>
          {FIVE_BOXES.map((n) => (
            <View key={`df-${n}`} style={st.box} />
          ))}
          <View style={st.spacer} />
          <Text style={st.cupsLabel}>DEFECT:</Text>
          {DEFECTS.map((d) => (
            <View key={d} style={st.defectItem}>
              <View style={st.box} />
              <Text style={st.defectLabel}>{d}</Text>
            </View>
          ))}
        </View>
        <View style={st.notes}>
          <Text style={st.notesLabel}>Notes</Text>
          <View style={st.notesLine} />
        </View>
      </View>

      <Text style={st.copyright}>
        SCA Affective Form, Version 2 (June 2024), © 2024 Specialty Coffee Association. Wolthers card
        adaptation. sca.coffee/value-assessment
      </Text>
    </View>
  )
}
```

- [ ] **Step 4: Render the face from the A4 document**

In `src/components/pdf/thermal-cupping-card-a4.tsx`:

Add the import after the existing `import { ThermalCuppingCardData } from './thermal-cupping-card'` line:

```tsx
import { CvaAffectiveCardFace } from './cva-affective-card'
```

Replace the opening of the per-card render

```tsx
            <View key={cardIndex} style={styles.cardContainer}>
              <View style={styles.card}>
                {/* Header: QR Code + Sample Info */}
                <View style={styles.header}>
```

with

```tsx
            <View key={cardIndex} style={styles.cardContainer}>
              <View style={styles.card}>
                {/* Specialty lots print the SCA Affective face at the same card size */}
                {card.is_cva ? (
                  <CvaAffectiveCardFace
                    card={card}
                    variant="a4"
                    show_quality={show_quality}
                    show_buyer={show_buyer}
                    show_exporter={show_exporter}
                  />
                ) : (
                <>
                {/* Header: QR Code + Sample Info */}
                <View style={styles.header}>
```

and the closing

```tsx
                  <Text style={styles.defectLabel}>FAULTS:</Text>
                  <View style={styles.defectSpace} />
                </View>
              </View>
            </View>
          ))}
```

with

```tsx
                  <Text style={styles.defectLabel}>FAULTS:</Text>
                  <View style={styles.defectSpace} />
                </View>
                </>
                )}
              </View>
            </View>
          ))}
```

- [ ] **Step 5: Render the face from the A6 thermal document**

In `src/components/pdf/thermal-cupping-card.tsx`:

Add, after the `@react-pdf/renderer` import block:

```tsx
import { CvaAffectiveCardFace } from './cva-affective-card'
```

In `styles`, after the `card` entry (`border: CUT_BORDER, marginBottom: '8pt'`), add:

```ts
  // A specialty card fills the A6 page so the face's flex layout has a height to work with.
  cardCva: {
    border: CUT_BORDER,
    height: '100%',
  },
```

Replace the opening of the per-card render

```tsx
        <Page key={cardIndex} size="A6" orientation="landscape" style={styles.page}>
          <View style={styles.card}>
            {/* Header: QR Code + Sample Info */}
            <View style={styles.header}>
```

with

```tsx
        <Page key={cardIndex} size="A6" orientation="landscape" style={styles.page}>
          <View style={card.is_cva ? styles.cardCva : styles.card}>
            {card.is_cva ? (
              <CvaAffectiveCardFace
                card={card}
                variant="a6"
                show_quality={show_quality}
                show_buyer={show_buyer}
                show_exporter={show_exporter}
              />
            ) : (
            <>
            {/* Header: QR Code + Sample Info */}
            <View style={styles.header}>
```

and the closing

```tsx
              <Text style={styles.defectLabel}>FAULTS:</Text>
              <View style={styles.defectSpace} />
            </View>
          </View>
        </Page>
```

with

```tsx
              <Text style={styles.defectLabel}>FAULTS:</Text>
              <View style={styles.defectSpace} />
            </View>
            </>
            )}
          </View>
        </Page>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/pdf/cva-affective-card.test.tsx && npx tsc --noEmit 2>&1 | tail -3`
Expected: PASS, 4 tests; tsc unchanged from baseline.

- [ ] **Step 7: Look at the card**

Create a **temporary** file `src/components/pdf/cva-affective-card.visual.test.tsx` (never committed):

```tsx
// @vitest-environment node
import React from 'react'
import { it } from 'vitest'
import { renderToFile } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { ThermalCuppingCardA4Document } from './thermal-cupping-card-a4'
import { ThermalCuppingCardDocument, type ThermalCuppingCardData } from './thermal-cupping-card'

const OUT = process.env.CARD_PREVIEW_DIR!

function card(n: number, is_cva: boolean, qr: string): ThermalCuppingCardData {
  return {
    sample_id: `s${n}`, sample_number: `SAN-0076${n}/26`, tracking_number: `SAN-0076${n}/26`, sample_type: 'pss',
    wolthers_contract_nr: `4531${n}/26`, sibling_contract_nrs: n === 1 ? ['45320/26', '45321/26'] : undefined,
    print_date: '30 AUG 2026', exporter_sample_number: `EXP-${n}`, quality_name: 'Specialty 86+ Natural',
    buyer_name: 'Blaser Trading AG', exporter_name: 'Cocatrel Cooperativa', lab_name: 'Santos',
    template_id: 'tpl-1', template_name: 'CVA', template_scale_info: '1-9',
    attributes: ['Frag', 'Arom', 'Body', 'Acid', 'Swet', 'Bal', 'Fin'], num_cuppers: 4,
    cuppers: ['Anderson', 'Bia', 'Maria', 'Pedro'], qr_code: qr, is_cva,
    cupper_name: is_cva ? 'Anderson Silva' : undefined, cupper_key: is_cva ? 'u1' : undefined,
  }
}

it('writes preview PDFs', async () => {
  const qr = await QRCode.toDataURL('WAQC-CVA:s1:SAN-00761/26:tpl-1:u1', { width: 250, margin: 2, errorCorrectionLevel: 'H' })
  const cards = Array.from({ length: 8 }, (_, i) => card(i + 1, i % 2 === 0, qr))
  const common = { show_quality: true, show_buyer: true, show_supplier: true, show_exporter: true }
  await renderToFile(<ThermalCuppingCardA4Document cards={cards} {...common} />, `${OUT}/affective-a4.pdf`)
  await renderToFile(<ThermalCuppingCardDocument cards={[cards[0], { ...cards[0], qr_code: '', cupper_name: undefined }]} {...common} />, `${OUT}/affective-a6.pdf`)
})
```

Run: `CARD_PREVIEW_DIR=<scratchpad dir> npx vitest run src/components/pdf/cva-affective-card.visual.test.tsx`
Then open both PDFs with the Read tool (it renders pages as images).

Acceptance, per card: nothing crosses the cut border; the header, the legend, all eight scale rows with nine rings and a FINAL pill, the cups/defects row and the Notes line are all visible and not overlapping; the legend is at most two lines and not clipped; the QR is square and readable; the specialty card without a QR still lays out. If anything overflows, reduce `scaleRow` height / `ring` in `makeStyles` and re-run. When satisfied: `rm src/components/pdf/cva-affective-card.visual.test.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/components/pdf/cva-affective-card.tsx src/components/pdf/cva-affective-card.test.tsx src/components/pdf/thermal-cupping-card.tsx src/components/pdf/thermal-cupping-card-a4.tsx
git commit -m "feat(cupping-cards): SCA-104 Affective face for specialty lots, at commodity card size

Rendered by both card documents whenever card.is_cva, so a mixed batch
prints and cuts as one stack. Adaptations of the SCA form documented in the
component header, as the Descriptive component did.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Assignment route — guests on sessions, roster session for specialty lots

**Files:**
- Modify: `src/app/api/notifications/samples-assigned/route.ts`

**Interfaces:**
- Consumes: `normalizeGuestNames`, `mergeGuests`, `mergeRoster`, `pickRosterSession`, `GuestCupper` from Task 1.
- Produces: request body accepts `guest_cuppers?: string[]`; every success response gains `guest_cuppers: GuestCupper[]` (the ids as stored, so the print dialog can key QRs) and `roster_session_id: string | null`.

- [ ] **Step 1: Imports and body parsing**

Replace

```ts
import { cvaSampleIds, excludeCvaSessions } from '@/lib/cupping-protocol-scope'
```

with

```ts
import { cvaSampleIds, excludeCvaSessions } from '@/lib/cupping-protocol-scope'
import {
  mergeGuests,
  mergeRoster,
  normalizeGuestNames,
  pickRosterSession,
  type GuestCupper,
} from '@/lib/cupping/roster'
```

Update the doc comment line ` * Body: { cupper_ids: string[], sample_ids: string[], session_id?: string }` to

```ts
 * Body: { cupper_ids: string[], sample_ids: string[], session_id?: string, guest_cuppers?: string[] }
 * Guests (names, no profile) are stored on the session touched; specialty lots
 * get a roster session (session_type 'cva', status 'setup') — see lib/cupping/roster.ts.
```

After `const { cupper_ids, sample_ids, session_id } = body` add:

```ts
    const guestNames = normalizeGuestNames(body.guest_cuppers)
    // Whatever session is written last decides the ids the caller gets back.
    let responseGuests: GuestCupper[] = []
```

- [ ] **Step 2: Guests on the commodity session**

Change the commodity session select from `.select('id, cupper_ids, sample_ids')` to `.select('id, cupper_ids, guest_cuppers, sample_ids')`.

In the `matchingSession && !session_id` branch, before `const { error: updateError } = await dbClient`, add:

```ts
      const guestCuppers = mergeGuests(matchingSession.guest_cuppers, guestNames)
      responseGuests = guestCuppers
```

and add `guest_cuppers: guestCuppers,` to that `.update({ ... })` object (after `sample_ids: mergedSampleIds,`).

In the `!finalSessionId && needsCommoditySession` insert branch, before `const { data: newSession, error: sessionError }`, add:

```ts
      const guestCuppers = mergeGuests([], guestNames)
      responseGuests = guestCuppers
```

and add `guest_cuppers: guestCuppers,` to the `.insert({ ... })` object (after `participants: cupper_ids, // Required NOT NULL field - same as cupper_ids`).

In the `else if (finalSessionId)` branch, change `.select('cupper_ids, sample_ids')` to `.select('cupper_ids, guest_cuppers, sample_ids')`, and inside `if (existingSession) {` before `await dbClient`, add:

```ts
        const guestCuppers = mergeGuests(existingSession.guest_cuppers, guestNames)
        responseGuests = guestCuppers
```

and add `guest_cuppers: guestCuppers,` to that `.update({ ... })` (after `sample_ids: mergedSampleIds,`).

- [ ] **Step 3: The roster session**

Immediately before the comment `// CRITICAL: Move samples to 'analysis' workflow stage so they appear in /cupping page.` insert:

```ts
    // Specialty lots get a ROSTER session: who is cupping them, staff and
    // guests, so their cards carry names (a reprint has had none since
    // 72b4e2b — the CVA journey's own sessions are per cupper and born
    // 'active'). `status 'setup'` is what marks a roster; the journey's reuse
    // query skips that status, so the two can never collide.
    let rosterSessionId: string | null = null
    if (specialtySampleIds.length > 0) {
      const { data: rosters, error: rosterQueryError } = await dbClient
        .from('cupping_sessions')
        .select('id, session_type, status, cupper_ids, guest_cuppers, sample_ids')
        .eq('session_type', 'cva')
        .eq('status', 'setup')
        .order('created_at', { ascending: false })
      if (rosterQueryError) {
        console.error('Failed to query specialty rosters:', rosterQueryError)
        return NextResponse.json({
          error: 'Failed to query specialty rosters',
          details: rosterQueryError.message,
        }, { status: 500 })
      }

      const existingRoster = pickRosterSession(rosters ?? [], specialtySampleIds)
      const merged = mergeRoster(existingRoster, {
        cupper_ids,
        guest_names: guestNames,
        sample_ids: specialtySampleIds,
      })
      responseGuests = merged.guest_cuppers

      if (existingRoster) {
        const { error: rosterUpdateError } = await dbClient
          .from('cupping_sessions')
          .update({
            cupper_ids: merged.cupper_ids,
            participants: merged.cupper_ids,
            guest_cuppers: merged.guest_cuppers,
            sample_ids: merged.sample_ids,
          })
          .eq('id', existingRoster.id)
        if (rosterUpdateError) {
          console.error('Failed to update specialty roster:', rosterUpdateError)
          return NextResponse.json({
            error: 'Failed to update specialty roster',
            details: rosterUpdateError.message,
          }, { status: 500 })
        }
        rosterSessionId = existingRoster.id
      } else {
        const { data: roster, error: rosterInsertError } = await dbClient
          .from('cupping_sessions')
          .insert({
            session_type: 'cva',
            status: 'setup',
            sample_ids: merged.sample_ids,
            cupper_ids: merged.cupper_ids,
            participants: merged.cupper_ids,
            guest_cuppers: merged.guest_cuppers,
            session_date: new Date().toISOString(),
            laboratory_id: profile?.laboratory_id,
            created_by: user.id,
            min_cuppers_required: 1,
            allow_single_cupper: true,
          })
          .select('id')
          .single()
        if (rosterInsertError) {
          console.error('Failed to create specialty roster:', rosterInsertError)
          return NextResponse.json({
            error: 'Failed to create specialty roster',
            details: rosterInsertError.message,
          }, { status: 500 })
        }
        rosterSessionId = roster.id
      }
      console.log(`Specialty roster ${rosterSessionId}: ${merged.cupper_ids.length} cupper(s), ${merged.guest_cuppers.length} guest(s), ${merged.sample_ids.length} lot(s)`)
    }
```

- [ ] **Step 4: Return the guests**

Add these two lines to each of the three success `NextResponse.json({ ... })` objects at the end of the handler (the "Cuppers already assigned", the 207 "Partially successful", and the final success one), after `specialty_sample_ids: specialtySampleIds,`:

```ts
        guest_cuppers: responseGuests,
        roster_session_id: rosterSessionId,
```

- [ ] **Step 5: Type-check and run the suite**

Run: `npx tsc --noEmit 2>&1 | tail -3 && npm test 2>&1 | tail -4`
Expected: tsc unchanged from baseline; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/notifications/samples-assigned/route.ts
git commit -m "feat(cupping): store guest cuppers on assignment; roster session for specialty lots

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Reading the roster back; the journey ignores rosters

**Files:**
- Modify: `src/app/api/cupping/session-cuppers/route.ts`
- Modify: `src/app/api/cupping/sample-assignments/route.ts`
- Modify: `src/app/api/cupping/cva/session/route.ts:44-50`

**Interfaces:**
- Consumes: `pickRosterSession`, `isRosterSession`, `RosterSessionRow`, `GuestCupper` from Task 1.
- Produces: `GET /api/cupping/session-cuppers` → `{ cuppers: {id, full_name, email}[] (roster order), guests: GuestCupper[], session_id?: string }`. `POST /api/cupping/sample-assignments` → each `assignments[sampleId]` gains `guests: GuestCupper[]`.

- [ ] **Step 1: session-cuppers returns guests and prefers the roster**

Replace the whole body of the `try` block in `src/app/api/cupping/session-cuppers/route.ts` (from `const supabase = await createClient()` down to the final `return NextResponse.json({ cuppers: ..., session_id: ... })`) with:

```ts
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sampleIds = request.nextUrl.searchParams.getAll('sample_ids')
    if (sampleIds.length === 0) {
      return NextResponse.json({ cuppers: [], guests: [] })
    }

    const { data: sessions, error: sessionsError } = await supabase
      .from('cupping_sessions')
      .select('id, session_type, status, cupper_ids, guest_cuppers, sample_ids')
      .in('status', ['setup', 'active', 'review', 'completed'])
      .order('created_at', { ascending: false })

    if (sessionsError || !sessions) {
      return NextResponse.json({ cuppers: [], guests: [] })
    }

    // A roster (specialty lots: 'cva' + 'setup') wins over the newer per-cupper
    // journey sessions holding the same lot — it is the one that knows everybody.
    // The generated row types say Json for the jsonb columns; the roster helper wants them shaped.
    const matching = pickRosterSession(sessions as unknown as RosterSessionRow[], sampleIds)
    if (!matching) {
      return NextResponse.json({ cuppers: [], guests: [] })
    }

    const cupperIds = (matching.cupper_ids ?? []) as string[]
    const guests: GuestCupper[] = Array.isArray(matching.guest_cuppers) ? matching.guest_cuppers : []

    let cuppers: { id: string; full_name: string; email: string }[] = []
    if (cupperIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', cupperIds)
      if (profilesError) {
        return NextResponse.json({ cuppers: [], guests, session_id: matching.id })
      }
      // Roster order, not the database's: the printed stacks follow it.
      const order = new Map(cupperIds.map((id, i) => [id, i]))
      cuppers = [...(profiles ?? [])].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    }

    return NextResponse.json({ cuppers, guests, session_id: matching.id })
```

and add the import at the top:

```ts
import { pickRosterSession, type GuestCupper, type RosterSessionRow } from '@/lib/cupping/roster'
```

Update the route's doc comment to: `Returns the cuppers (roster order) and guests on the session holding the given samples; a specialty roster is preferred over journey sessions.`

- [ ] **Step 2: sample-assignments includes guests and lets rosters shadow journey sessions**

In `src/app/api/cupping/sample-assignments/route.ts`:

Add the import:

```ts
import { isRosterSession, type GuestCupper } from '@/lib/cupping/roster'
```

Change `.select('id, cupper_ids, sample_ids, status')` to `.select('id, session_type, status, cupper_ids, guest_cuppers, sample_ids')`.

Replace

```ts
    const sampleSessionMap: Record<string, { sessionId: string; cupperIds: string[] }> = {}

    for (const session of sessions) {
      const sessionSampleIds = (session.sample_ids as string[]) || []
      const sessionCupperIds = (session.cupper_ids as string[]) || []

      for (const sampleId of sessionSampleIds) {
        if (sampleIds.includes(sampleId) && sessionCupperIds.length > 0) {
          // Use the most recent session (already ordered by created_at desc)
          if (!sampleSessionMap[sampleId]) {
            sampleSessionMap[sampleId] = {
              sessionId: session.id,
              cupperIds: sessionCupperIds,
            }
            sessionCupperIds.forEach(id => allCupperIds.add(id))
          }
        }
      }
    }
```

with

```ts
    const sampleSessionMap: Record<string, { sessionId: string; cupperIds: string[]; guests: GuestCupper[] }> = {}

    // Rosters (specialty lots, 'cva' + 'setup') carry the assignment; a newer
    // per-cupper journey session holding the same lot must not shadow them.
    const ordered = [...sessions.filter(isRosterSession), ...sessions.filter((s) => !isRosterSession(s))]

    for (const session of ordered) {
      const sessionSampleIds = (session.sample_ids as string[]) || []
      const sessionCupperIds = (session.cupper_ids as string[]) || []
      // jsonb comes back typed Json; it is written by mergeGuests so the shape holds
      const sessionGuests = (Array.isArray(session.guest_cuppers) ? session.guest_cuppers : []) as unknown as GuestCupper[]

      for (const sampleId of sessionSampleIds) {
        if (sampleIds.includes(sampleId) && (sessionCupperIds.length > 0 || sessionGuests.length > 0)) {
          // First hit wins: rosters first, then newest session (ordered by created_at desc)
          if (!sampleSessionMap[sampleId]) {
            sampleSessionMap[sampleId] = {
              sessionId: session.id,
              cupperIds: sessionCupperIds,
              guests: sessionGuests,
            }
            sessionCupperIds.forEach(id => allCupperIds.add(id))
          }
        }
      }
    }
```

Replace

```ts
    if (allCupperIds.size === 0) {
      return NextResponse.json({ assignments: {} })
    }

    // Fetch all cupper profiles in one query
    const { data: cupperProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', Array.from(allCupperIds))

    if (profilesError) {
      return NextResponse.json({ assignments: {} })
    }
```

with

```ts
    if (Object.keys(sampleSessionMap).length === 0) {
      return NextResponse.json({ assignments: {} })
    }

    // Fetch all cupper profiles in one query (a guests-only roster has none)
    let cupperProfiles: Array<{ id: string; full_name: string; email: string }> = []
    if (allCupperIds.size > 0) {
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(allCupperIds))
      if (profilesError) {
        return NextResponse.json({ assignments: {} })
      }
      cupperProfiles = data || []
    }
```

Change `const profileMap = new Map((cupperProfiles || []).map(p => [p.id, p]))` to `const profileMap = new Map(cupperProfiles.map(p => [p.id, p]))`.

In the `assignments` type add `guests: GuestCupper[]` after `session_id: string`, and in the builder add `guests: info.guests,` after `session_id: info.sessionId,`.

- [ ] **Step 3: The journey never reuses a roster**

In `src/app/api/cupping/cva/session/route.ts` replace

```ts
      .in('status', ['setup', 'active', 'review', 'completed'])
```

with

```ts
      // Never 'setup': that is a ROSTER (who is assigned, staff + guests,
      // written at assignment — lib/cupping/roster.ts). Reusing one would hand
      // this cupper a session whose cupper_ids feed the finalize gate.
      .in('status', ['active', 'review', 'completed'])
```

- [ ] **Step 4: Type-check and run the suite**

Run: `npx tsc --noEmit 2>&1 | tail -3 && npm test 2>&1 | tail -4`
Expected: tsc unchanged from baseline; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cupping/session-cuppers/route.ts src/app/api/cupping/sample-assignments/route.ts src/app/api/cupping/cva/session/route.ts
git commit -m "feat(cupping): read guests and rosters back; the CVA journey ignores roster sessions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Assign-cuppers dialog prompts for guests; QC page passes them through

**Files:**
- Modify: `src/components/samples/assign-cuppers-dialog.tsx`
- Test: `src/components/samples/assign-cuppers-dialog.test.tsx`
- Modify: `src/app/samples/qc/page.tsx` — state near `:270-284`, `loadSampleCupperMap` `:460`, the selection effect `:493-525`, `handleBulkPrintCuppingCards` `:627`, `handleSingleSampleAssign` `:658`, `handleSingleSampleReprintCards` `:675`, `handleCuppersAssigned` `:687-764`, the two dialogs `:2127-2151`

**Interfaces:**
- Consumes: `normalizeGuestNames`, `GuestCupper` from Task 1; the `guest_cuppers` response field from Task 4; `assignments[id].guests` from Task 5.
- Produces: `AssignCuppersDialog` props `onAssign: (cupperIds: string[], cuppers: Cupper[], guests: string[]) => void` and `existingGuests?: GuestCupper[]`. The QC page holds `assignedGuests: GuestCupper[]` and passes it to `PrintCuppingCardsDialog` as `assignedGuests` (prop added in Task 7).

- [ ] **Step 1: Write the failing test**

`src/components/samples/assign-cuppers-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AssignCuppersDialog } from './assign-cuppers-dialog'

const cupper = { id: 'u1', full_name: 'Anderson Silva', email: 'a@wolthers.com' }

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ cuppers: [cupper] }), { status: 200 })),
  )
})

describe('AssignCuppersDialog guests', () => {
  it('adds guests by name, ignores a duplicate, and hands them to onAssign', async () => {
    const onAssign = vi.fn()
    render(<AssignCuppersDialog open onOpenChange={() => {}} sampleCount={1} onAssign={onAssign} />)
    await waitFor(() => expect(screen.getByText('Anderson Silva')).toBeInTheDocument())

    const input = screen.getByPlaceholderText('Guest name')
    fireEvent.change(input, { target: { value: 'Maria' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: ' maria ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add guest' }))

    expect(screen.getAllByText('Maria')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Assign 1 Cupper/ }))
    expect(onAssign).toHaveBeenCalledWith(['u1'], [cupper], ['Maria'])
  })

  it('pre-fills existing guests when managing cuppers, and can remove one', async () => {
    const onAssign = vi.fn()
    render(
      <AssignCuppersDialog
        open
        onOpenChange={() => {}}
        sampleCount={1}
        onAssign={onAssign}
        existingCupperIds={['u1']}
        existingGuests={[{ id: 'g1', name: 'Pedro' }]}
      />,
    )
    await waitFor(() => expect(screen.getByText('Pedro')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pedro' }))
    expect(screen.queryByText('Pedro')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Update 1 Cupper/ }))
    expect(onAssign).toHaveBeenCalledWith(['u1'], [cupper], [])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/samples/assign-cuppers-dialog.test.tsx`
Expected: FAIL — `Unable to find an element with the placeholder text of: Guest name`.

- [ ] **Step 3: The guest section**

In `src/components/samples/assign-cuppers-dialog.tsx`:

Imports — replace `import { Users, CheckCircle2, Check } from 'lucide-react'` with

```tsx
import { Users, CheckCircle2, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { normalizeGuestNames, type GuestCupper } from '@/lib/cupping/roster'
```

Props — replace

```tsx
  onAssign: (cupperIds: string[], cuppers: Cupper[]) => void
  existingCupperIds?: string[]
}
```

with

```tsx
  onAssign: (cupperIds: string[], cuppers: Cupper[], guests: string[]) => void
  existingCupperIds?: string[]
  /** Guests already on the roster when managing cuppers; their chips are pre-filled. */
  existingGuests?: GuestCupper[]
}
```

and destructure `existingGuests,` in the component signature after `existingCupperIds,`.

State — after `const [loading, setLoading] = useState(false)` add:

```tsx
  // Guest cuppers: visitors without a login. Names only; ids are minted by
  // the assignment route. The list handed to onAssign is definitive.
  const [guestNames, setGuestNames] = useState<string[]>([])
  const [guestInput, setGuestInput] = useState('')
```

Replace the open effect

```tsx
  useEffect(() => {
    if (open) {
      loadCuppers()
    }
  }, [open])
```

with

```tsx
  useEffect(() => {
    if (open) {
      loadCuppers()
      setGuestNames((existingGuests ?? []).map((g) => g.name))
      setGuestInput('')
    }
  }, [open])

  const addGuest = () => {
    if (!guestInput.trim()) return
    setGuestNames((prev) => normalizeGuestNames([...prev, guestInput]))
    setGuestInput('')
  }

  const removeGuest = (name: string) => {
    setGuestNames((prev) => prev.filter((n) => n !== name))
  }
```

Replace `onAssign(Array.from(selectedCuppers), selectedCupperObjects)` with `onAssign(Array.from(selectedCuppers), selectedCupperObjects, guestNames)` and add `setGuestNames([])` on the next line.

UI — inside `<div className="space-y-4 py-4">`, after the cuppers table block (the `)}` that closes the `loading ? … : cuppers.length === 0 ? … : (…)` expression) and before `</div>`, add:

```tsx
          {/* Guest cuppers */}
          <div className="space-y-2">
            <Label htmlFor="guest-name" className="text-sm font-semibold">
              Guest cuppers
            </Label>
            <div className="flex gap-2">
              <Input
                id="guest-name"
                placeholder="Guest name"
                maxLength={60}
                value={guestInput}
                onChange={(e) => setGuestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addGuest()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                aria-label="Add guest"
                onClick={addGuest}
                disabled={!guestInput.trim()}
              >
                Add
              </Button>
            </div>
            {guestNames.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {guestNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => removeGuest(name)}
                      className="rounded-full p-0.5 hover:bg-accent"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Visitors without a login. Each guest gets their own cards; no scores are recorded for them.
            </p>
          </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/samples/assign-cuppers-dialog.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: QC page plumbing**

In `src/app/samples/qc/page.tsx`:

Import — after `import { canReprintCuppingCards } from '@/lib/cupping/reprint'` add:

```tsx
import type { GuestCupper } from '@/lib/cupping/roster'
```

State — after `const [cuppersAssigned, setCuppersAssigned] = useState(false)` add:

```tsx
  // Guests on the roster of the selected samples (printed on cards, no login)
  const [assignedGuests, setAssignedGuests] = useState<GuestCupper[]>([])
  const [existingGuests, setExistingGuests] = useState<GuestCupper[]>([])
```

In the `sampleCupperMap` state type add `guests?: GuestCupper[]` after `session_id: string`.

Selection effect (`useEffect(() => { if (selectedSamples.size === 0) { …`) — in the empty branch add `setAssignedGuests([])` and `setExistingGuests([])` after `setCuppersAssigned(false)`. In `fetchExistingCuppers`, replace

```tsx
          if (data.cuppers && data.cuppers.length > 0) {
            setExistingCupperIds(data.cuppers.map((c: any) => c.id))
            setAssignedCuppers(data.cuppers)
            setCuppersAssigned(true)
          } else {
            setExistingCupperIds([])
            setAssignedCuppers([])
            setCuppersAssigned(false)
          }
```

with

```tsx
          const guests: GuestCupper[] = Array.isArray(data.guests) ? data.guests : []
          setAssignedGuests(guests)
          setExistingGuests(guests)
          if (data.cuppers && data.cuppers.length > 0) {
            setExistingCupperIds(data.cuppers.map((c: any) => c.id))
            setAssignedCuppers(data.cuppers)
            setCuppersAssigned(true)
          } else {
            setExistingCupperIds([])
            setAssignedCuppers([])
            setCuppersAssigned(false)
          }
```

`handleBulkPrintCuppingCards` — replace

```tsx
    const allCuppers = Array.from(cupperMap.values())
    if (allCuppers.length > 0) {
      setAssignedCuppers(allCuppers)
      setCuppersAssigned(true)
    }
    setShowCuppingCardsDialog(true)
```

with

```tsx
    const guestMap = new Map<string, GuestCupper>()
    for (const sampleId of selectedSamples) {
      sampleCupperMap[sampleId]?.guests?.forEach(g => guestMap.set(g.id, g))
    }
    const allCuppers = Array.from(cupperMap.values())
    if (allCuppers.length > 0) {
      setAssignedCuppers(allCuppers)
      setCuppersAssigned(true)
    }
    setAssignedGuests(Array.from(guestMap.values()))
    setShowCuppingCardsDialog(true)
```

`handleSingleSampleAssign` — add `setExistingGuests(assignment.guests ?? [])` inside the `if (assignment) {` branch and `setExistingGuests([])` in its `else`.

`handleSingleSampleReprintCards` — after the line `const assignment = sampleCupperMap[sample.id]` add `setAssignedGuests(assignment?.guests ?? [])`.

`handleCuppersAssigned` — change the signature to

```tsx
  const handleCuppersAssigned = async (cupperIds: string[], cuppers: Array<{ id: string; full_name: string; email: string }>, guests: string[]) => {
```

add `guest_cuppers: guests,` to the POSTed body after `sample_ids: sampleIds,`; declare `let storedGuests: GuestCupper[] = []` next to `let assignSucceeded = false`; in the success branch after `console.log('Notifications sent:', data)` add `storedGuests = Array.isArray(data.guest_cuppers) ? data.guest_cuppers : []`; after the `if (!assignSucceeded) { … return }` block add `setAssignedGuests(storedGuests)`; and in the map update add `guests: storedGuests,` after `session_id: '', // Will be refreshed on next load`.

Dialogs — on `<PrintCuppingCardsDialog … />` add the prop `assignedGuests={assignedGuests}` after `assignedCuppers={assignedCuppers}`, and inside its `onSuccess` add `setAssignedGuests([])` after `setAssignedCuppers([])`. On `<AssignCuppersDialog … />` add `existingGuests={existingGuests}` after `existingCupperIds={existingCupperIds}`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: exactly one NEW error — `PrintCuppingCardsDialog` does not yet accept `assignedGuests` (fixed in Task 7). Nothing else new.

- [ ] **Step 7: Commit**

```bash
git add src/components/samples/assign-cuppers-dialog.tsx src/components/samples/assign-cuppers-dialog.test.tsx src/app/samples/qc/page.tsx
git commit -m "feat(cupping): guest cuppers in the assign dialog, carried through the QC page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Print dialog — Affective cards replace the Descriptive form; QR toggle; guests; fail closed

**Files:**
- Modify: `src/lib/sample-visibility.ts`
- Test: `src/lib/sample-visibility.test.ts`
- Modify: `src/components/cupping/print-cupping-cards-dialog.tsx`

**Interfaces:**
- Consumes: `expandCvaCards`, `uniqueSampleIds` (Task 2); `GuestCupper` (Task 1); `session-cuppers` `guests` (Task 5); `assignedGuests` prop from the QC page (Task 6).
- Produces: `PrintCuppingCardsDialogProps.assignedGuests?: GuestCupper[]`; `SampleVisibilitySettings.showCvaQr: boolean`.

- [ ] **Step 1: Write the failing visibility test**

`src/lib/sample-visibility.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { getVisibilitySettings, updateVisibilitySetting } from './sample-visibility'

describe('sample visibility settings', () => {
  beforeEach(() => localStorage.clear())

  it('defaults showCvaQr on', () => {
    expect(getVisibilitySettings().showCvaQr).toBe(true)
  })

  it('fills a key missing from an older stored object with its default', () => {
    localStorage.setItem(
      'sample-info-visibility',
      JSON.stringify({ showQuality: false, showBuyer: true, showSupplier: true, showExporter: true }),
    )
    const settings = getVisibilitySettings()
    expect(settings.showQuality).toBe(false)
    expect(settings.showCvaQr).toBe(true)
  })

  it('persists a toggle', () => {
    updateVisibilitySetting('showCvaQr', false)
    expect(getVisibilitySettings().showCvaQr).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/sample-visibility.test.ts`
Expected: FAIL — `showCvaQr` is `undefined`.

- [ ] **Step 3: Add the setting**

In `src/lib/sample-visibility.ts` add `showCvaQr: boolean` to the interface (after `showExporter: boolean`) with the comment `// QR code on specialty (CVA) cupping cards`, add `showCvaQr: true,` to `DEFAULT_SETTINGS`, and change the stored-read line `return JSON.parse(stored)` to

```ts
      // Defaults fill any key an older stored object lacks
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/sample-visibility.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: The dialog**

In `src/components/cupping/print-cupping-cards-dialog.tsx`:

**Imports.** Delete `import { CvaDescriptiveFormDocument } from '@/components/pdf/cva-descriptive-card'`. Add:

```tsx
import { expandCvaCards, uniqueSampleIds } from '@/lib/cupping/cva-cards'
import type { GuestCupper } from '@/lib/cupping/roster'
```

Add a module-level constant after the imports:

```tsx
// Shared by every QR on a card: large enough to scan off a cut card, highest
// error correction so a coffee ring does not kill it.
const QR_OPTIONS = { width: 250, margin: 2, errorCorrectionLevel: 'H' as const }
```

In the `Sample` interface change the comment on `methodology?: string` to `// 'cva' = specialty CVA — prints on the SCA Affective card face`.

**Props.** Add to `PrintCuppingCardsDialogProps` after `assignedCuppers?: Cupper[]`:

```tsx
  /** Guests on the roster, passed straight after assignment; else fetched with the cuppers. */
  assignedGuests?: GuestCupper[]
```

and destructure `assignedGuests = [],` after `assignedCuppers = [],`.

**State.** Delete the two lines

```tsx
  // CVA forms: one full set per cupper (name pre-filled) or a single blank set
  const [cvaCopies, setCvaCopies] = useState<'per-cupper' | 'single'>('per-cupper')
```

After `const [resolvedCuppers, setResolvedCuppers] = useState<Cupper[]>([])` add:

```tsx
  const [resolvedGuests, setResolvedGuests] = useState<GuestCupper[]>([])
  // Sample details failed to load. There is NO fallback to the rows the page
  // passed in: they carry no quality template, so a specialty lot would print
  // on commodity paper — the fail-open cvaSampleIds exists to stop.
  const [loadError, setLoadError] = useState<string | null>(null)
```

After `const effectiveCuppers = …` add:

```tsx
  const effectiveGuests = assignedGuests.length > 0 ? assignedGuests : resolvedGuests
  const rosterSize = effectiveCuppers.length + effectiveGuests.length
```

In the close-reset branch (`} else if (!open) {`) add `setResolvedGuests([])` and `setLoadError(null)` after `setResolvedCuppers([])`.

**loadFullSampleData.** Replace

```tsx
      } else {
        const errorText = await response.text()
        console.error('Failed to load sample details:', response.status, errorText)
        // Fallback to original samples if fetch fails
        setFullSamples(samples)
      }
    } catch (error) {
      console.error('Error loading sample details:', error)
      // Fallback to original samples if error occurs
      setFullSamples(samples)
    } finally {
```

with

```tsx
      } else {
        const errorText = await response.text()
        console.error('Failed to load sample details:', response.status, errorText)
        setLoadError(`Could not load sample details (${response.status}). Close and try again.`)
      }
    } catch (error) {
      console.error('Error loading sample details:', error)
      setLoadError(error instanceof Error ? error.message : 'Could not load sample details.')
    } finally {
```

**fetchCuppersFromSession.** After `if (data.cuppers && data.cuppers.length > 0) { setResolvedCuppers(data.cuppers) }` add:

```tsx
        setResolvedGuests(Array.isArray(data.guests) ? data.guests : [])
```

**generateCards.** Replace `const samplesToUse = fullSamples.length > 0 ? fullSamples : samples` with `const samplesToUse = fullSamples`. Replace the QR generation

```tsx
          const qrCodeDataUrl = await QRCode.toDataURL(qrContent, {
            width: 250,  // Slightly larger for better scanning
            margin: 2,   // More margin for edge detection
            errorCorrectionLevel: 'H',  // Highest error correction (30% damage tolerance)
          })
```

with

```tsx
          const qrCodeDataUrl = await QRCode.toDataURL(qrContent, QR_OPTIONS)
```

Replace, in the `cardData` object,

```tsx
            num_cuppers: effectiveCuppers.length > 0 ? effectiveCuppers.length : parseInt(numCuppers),
            cuppers: effectiveCuppers.length > 0 ? effectiveCuppers.map(c => c.full_name.split(' ')[0]) : undefined,
            qr_code: qrCodeDataUrl,
            is_cva: template?.methodology === 'cva',
```

with

```tsx
            // Commodity card rows: staff first names, then guests as typed
            num_cuppers: rosterSize > 0 ? rosterSize : parseInt(numCuppers),
            cuppers: rosterSize > 0
              ? [...effectiveCuppers.map(c => c.full_name.split(' ')[0]), ...effectiveGuests.map(g => g.name)]
              : undefined,
            qr_code: qrCodeDataUrl,
            template_id: templateId || undefined,
            is_cva: template?.methodology === 'cva',
```

Replace

```tsx
      if (cards.length === 0) {
        throw new Error('No cards were generated successfully')
      }

      setCardData(cards)
```

with

```tsx
      if (cards.length === 0) {
        throw new Error('No cards were generated successfully')
      }

      // Specialty lots: one Affective card per cupper (staff, then guests),
      // each with its own QR when the toggle is on. Commodity cards pass through.
      const expanded = expandCvaCards(
        cards,
        { cuppers: effectiveCuppers.map(c => ({ id: c.id, full_name: c.full_name })), guests: effectiveGuests },
        { qr: visibility.showCvaQr, blankCopies: parseInt(numCuppers) },
      )
      const finalCards = await Promise.all(
        expanded.map(async ({ card, qr_payload }) =>
          qr_payload ? { ...card, qr_code: await QRCode.toDataURL(qr_payload, QR_OPTIONS) } : card
        )
      )

      setCardData(finalCards)
```

**handlePrint.** Change the guard `if (loading || cuppersLoading || fullSamples.length === 0) {` to `if (loading || cuppersLoading || loadError || fullSamples.length === 0) {`.

**Counts.** Replace

```tsx
  const allCva = fullSamples.length > 0 && cvaSampleCount === fullSamples.length
```

with

```tsx
  const copiesPerSpecialtyLot = rosterSize > 0 ? rosterSize : parseInt(numCuppers)
  const specialtyCardCount = cvaSampleCount * copiesPerSpecialtyLot
  const predictedCardCount = fullSamples.length - cvaSampleCount + specialtyCardCount
```

**documents memo.** Replace the whole `useMemo` body (from `if (!isReadyForDownload || …` to the closing `}, [ … ])`) with:

```tsx
    if (!isReadyForDownload || !cardData || cardData.length === 0) {
      return []
    }

    // One document: specialty lots ride inside the commodity documents as
    // Affective card faces, so a mixed batch prints and cuts as one stack.
    const dateStamp = new Date().toISOString().split('T')[0]
    const docs: { key: string; fileName: string; count: number; label: string; document: React.ReactElement<any> }[] = [
      {
        key: 'cards',
        fileName: `cupping-cards-${outputFormat}-${dateStamp}.pdf`,
        count: cardData.length,
        label: `${cardData.length} Card${cardData.length !== 1 ? 's' : ''}`,
        document:
          outputFormat === 'thermal' ? (
            <ThermalCuppingCardDocument
              cards={cardData}
              show_quality={visibility.showQuality}
              show_buyer={visibility.showBuyer}
              show_supplier={visibility.showSupplier}
              show_exporter={visibility.showExporter}
            />
          ) : (
            <ThermalCuppingCardA4Document
              cards={cardData}
              show_quality={visibility.showQuality}
              show_buyer={visibility.showBuyer}
              show_supplier={visibility.showSupplier}
              show_exporter={visibility.showExporter}
            />
          ),
      },
    ]
    return docs
  }, [isReadyForDownload, cardData, outputFormat, visibility.showQuality, visibility.showBuyer, visibility.showSupplier, visibility.showExporter])
```

Update the comment above `activeDocFileName` to: `// The document names itself by output format so two formats saved on the same day do not collide.`

**handlePrinted.** Replace `const ids = cardData.map(c => c.sample_id)` with `const ids = uniqueSampleIds(cardData)` and add the comment above it: `// Per sample, not per card: a specialty lot now yields one card per cupper.`

**UI.** Under the Selected Samples list, after the `)}` that closes the `loading ? … : fullSamples.length > 0 ? … : (…)` expression, add:

```tsx
            {loadError && (
              <p className="text-sm text-destructive">{loadError}</p>
            )}
```

Change `{effectiveCuppers.length === 0 && (` (the Number of Cuppers block) to `{rosterSize === 0 && (`.

Change `{effectiveCuppers.length > 0 && (` (the Assigned Cuppers block) to `{rosterSize > 0 && (`, its label to

```tsx
              <Label className="text-sm font-semibold">
                Assigned Cuppers: {rosterSize}
              </Label>
```

and after the staff chips `.map(...)` add guest chips:

```tsx
                  {effectiveGuests.map((guest) => (
                    <span
                      key={guest.id}
                      className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                    >
                      {guest.name} (guest)
                    </span>
                  ))}
```

Replace the whole `{cvaSampleCount > 0 && ( … )}` block (the Descriptive note plus the two radios) with:

```tsx
          {/* Specialty lots print as SCA Affective cards, one per cupper, inside the same document */}
          {cvaSampleCount > 0 && (
            <div className="space-y-3 rounded-md border bg-muted/40 p-3">
              <p className="text-sm text-muted-foreground">
                {`${cvaSampleCount} specialty lot${cvaSampleCount !== 1 ? 's' : ''} print${cvaSampleCount === 1 ? 's' : ''} as SCA Affective cards, one per cupper — ${specialtyCardCount} card${specialtyCardCount !== 1 ? 's' : ''}.`}
              </p>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-cva-qr"
                  checked={visibility.showCvaQr}
                  disabled={isReadyForDownload}
                  onCheckedChange={() => toggleVisibility('showCvaQr')}
                />
                <label
                  htmlFor="show-cva-qr"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  QR code on specialty cards
                </label>
              </div>
            </div>
          )}
```

Remove the `{!allCva && (` wrapper and its matching `)}` around the Output Format block (the block itself stays; it now applies to every card).

Print button — change `disabled={isGenerating || loading || cuppersLoading}` to `disabled={isGenerating || loading || cuppersLoading || !!loadError}` and its final label branch from `` `Print ${samples.length} Card${samples.length !== 1 ? 's' : ''}` `` to `` `Print ${predictedCardCount} Card${predictedCardCount !== 1 ? 's' : ''}` ``.

Preview subtitle — change `` subtitle={`${samples.length} card${samples.length !== 1 ? 's' : ''} — review, then print. Saving is optional.`} `` to `` subtitle={`${cardData?.length ?? 0} card${(cardData?.length ?? 0) !== 1 ? 's' : ''} — review, then print. Saving is optional.`} ``.

- [ ] **Step 6: Type-check, lint, full suite**

Run: `npx tsc --noEmit 2>&1 | tail -3 && npx eslint src/components/cupping/print-cupping-cards-dialog.tsx src/lib/sample-visibility.ts && npm test 2>&1 | tail -4`
Expected: tsc back to the baseline count (the Task 6 error is gone); eslint clean on the two files; all tests pass. Confirm `grep -n "cva-descriptive-card" src -r` returns only the component itself.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sample-visibility.ts src/lib/sample-visibility.test.ts src/components/cupping/print-cupping-cards-dialog.tsx
git commit -m "feat(cupping-cards): specialty lots print as Affective cards per cupper; QR toggle; guests; fail closed

Replaces the SCA-103 Descriptive document. The dialog no longer falls back to
the page's rows when sample details fail to load — those carry no quality
template, so a specialty lot would have printed on commodity paper.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Verification, docs, deployment hand-over

**Files:**
- Modify: `docs/superpowers/handoffs/2026-08-28-cva-affective-form-handoff.md` (top note)
- Modify: `~/wolthers-vault/01-projects/waqc/decisions.md` (append)

- [ ] **Step 1: Full verification with counts**

Run: `npm test 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | tail -3 && npx eslint src 2>&1 | tail -3`
Expected: every test file passes; test count = baseline + 29 (12 roster + 8 cva-cards + 4 card + 2 dialog + 3 visibility); tsc and eslint counts equal the baseline. Quote all three in the next step's commit.

- [ ] **Step 2: Mark the old handoff superseded**

Insert as the first lines of `docs/superpowers/handoffs/2026-08-28-cva-affective-form-handoff.md`:

```markdown
> **Superseded 2026-08-30** by `../specs/2026-08-28-cva-affective-cards-design.md` and
> `../plans/2026-08-28-cva-affective-cards.md`. Two claims below were wrong when written:
> the Descriptive component WAS wired (`3468c4d`, via `print-cupping-cards-dialog.tsx`), and
> specialty lots have had no session at all since `72b4e2b`. Kept for the task history.
```

- [ ] **Step 3: Log the decision**

Append to `~/wolthers-vault/01-projects/waqc/decisions.md`, in the house format:

```markdown
### 2026-08-30 — Specialty lots print SCA-104 Affective CARDS per cupper; guests on the session via a roster session
**Decision:** Specialty (CVA) lots print from the QC page as SCA-104 Affective cards — one card per sample per cupper (staff, then guests), at the commodity card size, inside the same A6/A4 document as the commodity cards — replacing the SCA-103 Descriptive A4 form that `3468c4d` had wired. A per-cupper QR (`WAQC-CVA:sample:tracking:template:cupper`) is optional. Guests are stored on `cupping_sessions.guest_cuppers` (`[{id,name}]`, mig `20260828000002`); because specialty lots have had no session since `72b4e2b`, assignment now creates a **roster session** for them (`session_type 'cva'`, `status 'setup'`), and the CVA journey's reuse query skips `'setup'`. The print dialog fails closed when sample details do not load.
**Why:** Anderson wants the specialty form as a card that prints with the rest; the Affective form carries the 1–9 scales the CVA score is built from and is single-cupper by construction. Guests must be named on cards and, later, compared — the roster is the stepping stone (the journey's score model is already multi-cupper; only its session lookup is per-cupper).
**Rejected alternatives:** 2-up A4 Affective sheet as on SCA page 10 (Daniel: one sample per card); printing both Descriptive and Affective (descriptors are captured on screen); guests as ink only (no comparison later); a `WAQC:` QR prefix (the commodity OCR would write a commodity score against a specialty lot).
**Consequences:** Reprints of specialty cards get names back (they were blank since `72b4e2b`). `sample-assignments` shows specialty rosters on the tracker. Roster sessions are inert (`'setup'`, never completed, no scores). Follow-ups: the journey adopting the roster as a shared multi-cupper session (calibration/compare); guest score entry; refusing specialty samples in `scores/submit`; splitting `qc/page.tsx` (2306 lines).
```

- [ ] **Step 4: Commit the docs**

```bash
git add docs/superpowers/handoffs/2026-08-28-cva-affective-form-handoff.md
git commit -m "docs: supersede the Affective-form handoff; verification counts

tests <N> passed (<baseline> before), tsc <n> errors (baseline <n>), eslint <n> (baseline <n>)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(The vault file is outside this repo; commit it in the vault's own git if it has one: `cd ~/wolthers-vault && git add 01-projects/waqc/decisions.md && git commit -m "docs(waqc): Affective cards + guest roster decision"`.)

- [ ] **Step 5: Hand the migration to Daniel; push only after he applies it**

Paste the migration SQL (Task 1, Step 1) in the final message with: "Apply this, then say so and I push `main`." **Do not push before that.** When he confirms: `git push origin main`, then watch the Vercel deploy and smoke-test: assign a cupper + one guest to a specialty lot on the QC page → the print dialog shows the roster with the guest, "N specialty lots print as SCA Affective cards…", the preview shows Affective faces with names and QRs; toggle the QR off and regenerate; reprint the same lot from the row menu and confirm names are present.

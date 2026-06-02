# Specialty CVA Cupping — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation (scaffolding, data model, SCA scoring engine) and Phase 1 (the affective scoring journey) of the new Specialty CVA cupping screen, plus the ability to create a "specialty (CVA)" quality — so a cupper can run a real SCA CVA affective assessment end-to-end and get a live, standards-accurate 0–100 score.

**Architecture:** New immersive route `src/app/cupping/cva/[sessionId]` separate from the commodity `/cupping` table. Reuses `cupping_sessions` + `cupping_scores` (CVA payload in the existing `scores` JSONB, plus new `protocol`/`cva_score` columns). A `methodology` flag on `quality_templates` routes specialty samples here. Scoring is a pure, unit-tested function verified against the SCA Appendix 7.1 two-way table, used live on the client and re-verified server-side on autosave.

**Tech Stack:** Next.js 15.5.9 (App Router) · React 19 · TypeScript · Tailwind (`dark:` + ThemeProvider) · Supabase (anon client for auth, service-role client for writes) · Vitest + Testing Library (added in this plan — no test runner exists yet).

---

## Resolved decisions (from brainstorm + this planning session)

| # | Question | Decision |
|---|---|---|
| 1 | Methodology flag | `quality_templates.methodology` (`'commodity'` \| `'cva'`); sample inherits via `quality_spec → template`; mirrored as `session_type='cva'` on the cupping session. |
| 2 | Pass mark | **Per-quality** `quality_templates.cva_min_score` (default 84; e.g. one contract 82, another 84). SCA itself defines no pass mark — this is a Wolthers business rule. |
| 3 | Intensity granularity | **7 per-section intensities + 3 CATA boxes** (strict SCA-103). Locks the `describe.intensities` JSON shape now; UI is Phase 2. |
| 4 | Multi-cupper | Master cupper resolves on a divergence table mirroring the existing `cupping-validation-modal.tsx` (keep mine / average / match other). **Phase 4** — Phase 1 only stores one `cupping_scores` row per cupper. |
| 5 | Languages | Default **English** everywhere; cupper can switch PT/ES/EN (Phase 3 voice). |
| 6 | Voice | **Web Speech now, server transcription later.** Phase 3. |
| + | NEW — create specialty quality | Extend the existing quality editor so a user can create a CVA quality with a methodology flag, per-quality min score, and a "requires flavor notes" (`requires_descriptors`) toggle. |
| + | NEW — requires flavor notes | `quality_templates.requires_descriptors boolean` — some qualities require the descriptive (Describe) step, others don't. Stored now; enforced in Phase 2/4. |

**Carried to Phase 5 (not blocking):** AI highlights model = latest Claude Sonnet, cached on the assessment; AI-drafted tasting notes default to an internal draft staff polish before client delivery. Confirm at Phase 5.

---

## CVA payload shape (locked, v1)

Stored in `cupping_scores.scores` (JSONB). One row per cupper per (session, sample).

```jsonc
{
  "protocol": "cva",
  "version": 1,
  "roast": { "level": "medium", "agtron": 63 },
  "sections": {                         // 8 affective sections (Phase 1)
    "fragrance":  { "impression": 7, "impression_final": 8, "note": "" },
    "aroma":      { "impression": 7 },
    "flavor":     { "impression": 8 },
    "aftertaste": { "impression": 7 },
    "acidity":    { "impression": 7 },
    "sweetness":  { "impression": 7 },
    "mouthfeel":  { "impression": 7 },
    "overall":    { "impression": 7 }
  },
  "describe": {                         // Phase 2 — shape locked now (7 intensities, 3 CATA boxes)
    "intensities": { "fragrance": 0, "aroma": 0, "flavor": 0, "aftertaste": 0, "acidity": 0, "sweetness": 0, "mouthfeel": 0 },
    "aroma":             { "cata": [] },                       // ≤5 olfactory (fragrance + aroma)
    "flavor_aftertaste": { "cata": [], "main_tastes": [] },    // ≤5 olfactory + ≤2 main tastes
    "mouthfeel":         { "cata": [] },                       // ≤2 mouthfeel CATA
    "notes":             { "acidity": "", "sweetness": "" },   // freely elicited
    "voice":             {}                                    // Phase 3 transcripts
  },
  "cups": { "non_uniform": [], "defective": [] },              // Phase 4
  "score": 79.0, "u": 0, "d": 0,
  "highlights": null                                            // Phase 5
}
```

New DB columns: `cupping_scores.protocol text`, `cupping_scores.cva_score numeric(5,2)`, `quality_templates.methodology`, `quality_templates.cva_min_score`, `quality_templates.requires_descriptors`, plus enum value `session_type='cva'`.

---

## File map

```
MIGRATIONS (paste & apply — Daniel applies):
  database/migrations/20260602000000_cva_session_type_enum.sql      ALTER TYPE session_type ADD VALUE 'cva'
  database/migrations/20260602000001_cva_quality_and_cupping.sql    template + cupping_scores columns

TOOLING:
  package.json                       + vitest devDeps + test scripts
  vitest.config.ts                   jsdom env, @ alias
  vitest.setup.ts                    jest-dom matchers

CVA CORE LIB:
  src/lib/cva/sections.ts            8 sections, accent colors, 9-pt scale colors/labels
  src/lib/cva/scoring.ts             roundToQuarter, cvaScoreFromSum, effectiveImpression, computeAssessmentScore
  src/lib/cva/scoring.test.ts        SCA two-way table oracle + penalties + rounding
  src/types/cva.ts                   CvaAssessment payload types + createEmptyAssessment()

SPECIALTY QUALITY CREATION:
  src/components/quality/spec-editor/quality-spec-editor.tsx   + methodology / min-score / requires-notes fields
  src/app/api/quality-templates/route.ts                      POST accepts 3 new columns
  src/app/api/quality-templates/[id]/route.ts                 PATCH allowedFields += 3

AFFECTIVE JOURNEY (Phase 1):
  src/app/cupping/cva/page.tsx                    index: eligible CVA samples → Start
  src/app/cupping/cva/[sessionId]/page.tsx        journey host
  src/app/api/cupping/cva/eligible/route.ts       GET eligible CVA samples
  src/app/api/cupping/cva/session/route.ts        POST create/get CVA session for a sample
  src/app/api/cupping/cva/[id]/route.ts           GET/PUT assessment (cupping_scores upsert)
  src/hooks/useCvaAssessment.ts                   state + debounced autosave
  src/components/cupping/cva/CvaJourney.tsx        orchestrator (progress, nav, autosave, light/dark)
  src/components/cupping/cva/ProgressPath.tsx      tappable step path
  src/components/cupping/cva/RoastStep.tsx         roast tiles + Agtron
  src/components/cupping/cva/ImpressionScale.tsx   9-pt magnetic blocks + numeric + keys + cooling shift
  src/components/cupping/cva/ImpressionScale.test.tsx
  src/components/cupping/cva/SectionScreen.tsx     one affective section
  src/components/cupping/cva/LiveScore.tsx         running score chip
  src/components/cupping/cva/ScoreSummary.tsx      basic end screen (full Coffee Profile = Phase 5)
```

---

# PART A — Phase 0: Scaffolding

### Task 1: Database migrations (Daniel pastes & applies)

**Files:**
- Create: `database/migrations/20260602000000_cva_session_type_enum.sql`
- Create: `database/migrations/20260602000001_cva_quality_and_cupping.sql`

> Per Daniel's standing prefs ("I prefer pasting the SQL", "I will always apply migrations"), the agent **writes these files and hands the SQL to Daniel — it does NOT run psql / supabase db push**. The enum addition is a separate file because `ALTER TYPE ... ADD VALUE` must be committed before the value is usable.

- [ ] **Step 1: Write the enum migration**

`database/migrations/20260602000000_cva_session_type_enum.sql`:

```sql
-- CVA cupping: add 'cva' to the session_type enum.
-- Separate file: ALTER TYPE ADD VALUE must commit before the value is used elsewhere.
ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'cva';
```

- [ ] **Step 2: Write the columns migration**

`database/migrations/20260602000001_cva_quality_and_cupping.sql`:

```sql
-- CVA cupping: quality methodology + per-quality pass mark + descriptive requirement,
-- and CVA score columns on cupping_scores.

-- 1) Quality template: methodology routing + per-quality pass mark + requires-notes
ALTER TABLE quality_templates
  ADD COLUMN IF NOT EXISTS methodology text NOT NULL DEFAULT 'commodity',
  ADD COLUMN IF NOT EXISTS cva_min_score numeric(5,2) DEFAULT 84,
  ADD COLUMN IF NOT EXISTS requires_descriptors boolean NOT NULL DEFAULT false;

ALTER TABLE quality_templates
  DROP CONSTRAINT IF EXISTS quality_templates_methodology_check;
ALTER TABLE quality_templates
  ADD CONSTRAINT quality_templates_methodology_check
  CHECK (methodology IN ('commodity', 'cva'));

COMMENT ON COLUMN quality_templates.methodology IS
  'Grading methodology: commodity (legacy spreadsheet cupping) or cva (SCA 2024 Coffee Value Assessment). Routes the Cup action to the matching screen.';
COMMENT ON COLUMN quality_templates.cva_min_score IS
  'Per-quality minimum CVA 0-100 score to pass (e.g. 82, 84). Used by the CVA pass/fail check (Phase 4). NULL falls back to 84 in app code.';
COMMENT ON COLUMN quality_templates.requires_descriptors IS
  'If true, the CVA descriptive (Describe the cup) step is required for this quality before finalize. Phase 2/4 enforcement.';

-- 2) CVA score columns on cupping_scores (payload lives in the existing scores JSONB)
ALTER TABLE cupping_scores
  ADD COLUMN IF NOT EXISTS protocol text,
  ADD COLUMN IF NOT EXISTS cva_score numeric(5,2);

COMMENT ON COLUMN cupping_scores.protocol IS
  'Scoring protocol for this row: NULL/commodity for legacy, ''cva'' for SCA Coffee Value Assessment.';
COMMENT ON COLUMN cupping_scores.cva_score IS
  'Server-verified SCA CVA 0-100 cupping score (S = 0.65625*Σh + 52.75 − 2u − 4d, rounded 0.25).';
```

- [ ] **Step 3: Hand the SQL to Daniel and wait for confirmation it is applied**

Tell Daniel: "Two migration files written — paste & apply `20260602000000` first (enum), then `20260602000001` (columns)." Do not proceed to verification until he confirms.

- [ ] **Step 4: Verify after apply**

Daniel runs (or the agent asks Daniel to run) this read-only check and pastes the result:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'quality_templates' AND column_name IN ('methodology','cva_min_score','requires_descriptors')
UNION ALL
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'cupping_scores' AND column_name IN ('protocol','cva_score')
ORDER BY column_name;
```

Expected: 5 rows (cva_min_score, cva_score, methodology, protocol, requires_descriptors).

- [ ] **Step 5: Commit the migration files**

```bash
git add database/migrations/20260602000000_cva_session_type_enum.sql database/migrations/20260602000001_cva_quality_and_cupping.sql
git commit -m "feat(cva): migrations — session_type 'cva', quality methodology/min-score/requires-descriptors, cupping_scores protocol/cva_score"
```

---

### Task 2: Add Vitest test runner

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`

No test runner exists today. We add Vitest (jsdom) so `scoring.ts` and components are unit-tested.

- [ ] **Step 1: Install dev dependencies**

Run:

```bash
npm install -D vitest@^2.1.8 @vitejs/plugin-react@^4.3.4 jsdom@^25.0.1 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.3 @testing-library/user-event@^14.5.2
```

Expected: installs without error. (`@testing-library/react@16` supports React 19. If npm reports a peer conflict, re-run with `--legacy-peer-deps`.)

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Add scripts to `package.json`**

In the `"scripts"` block, add `test` and `test:run` alongside the existing `dev`/`build`/`start`/`lint`:

```json
    "test": "vitest",
    "test:run": "vitest run"
```

- [ ] **Step 5: Verify the runner works (smoke test)**

Run:

```bash
npx vitest run --reporter=basic
```

Expected: Vitest starts and reports `No test files found` (no `*.test.ts` yet) and exits 0. This confirms config loads.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts
git commit -m "chore(test): add Vitest + Testing Library (jsdom)"
```

---

### Task 3: CVA section constants

**Files:**
- Create: `src/lib/cva/sections.ts`

- [ ] **Step 1: Write `src/lib/cva/sections.ts`**

```ts
// SCA CVA affective sections + presentation constants.

export type CvaSectionKey =
  | 'fragrance' | 'aroma' | 'flavor' | 'aftertaste'
  | 'acidity' | 'sweetness' | 'mouthfeel' | 'overall'

export interface CvaSectionDef {
  key: CvaSectionKey
  label: string
  /** Brand-aligned ambient accent (Wolthers chart palette + tasteful extensions). Tunable. */
  accent: string
}

/** The 8 affective sections, in tasting order (SCA-104 §5.1). */
export const CVA_SECTIONS: CvaSectionDef[] = [
  { key: 'fragrance',  label: 'Fragrance',  accent: '#556b2f' },
  { key: 'aroma',      label: 'Aroma',      accent: '#a9a454' },
  { key: 'flavor',     label: 'Flavor',     accent: '#b07946' },
  { key: 'aftertaste', label: 'Aftertaste', accent: '#8c6239' },
  { key: 'acidity',    label: 'Acidity',    accent: '#445763' },
  { key: 'sweetness',  label: 'Sweetness',  accent: '#c9a84a' },
  { key: 'mouthfeel',  label: 'Mouthfeel',  accent: '#6b7280' },
  { key: 'overall',    label: 'Overall',    accent: '#151618' },
]

export const SECTION_KEYS: CvaSectionKey[] = CVA_SECTIONS.map((s) => s.key)

/** The 7 sections that carry a descriptive intensity (SCA-103 — no "overall" intensity). */
export const INTENSITY_KEYS = SECTION_KEYS.filter((k) => k !== 'overall') as Exclude<CvaSectionKey, 'overall'>[]

/** 9-point diverging impression scale: 1 (worst, red) → 5 (neutral gray) → 9 (best, green). */
export const IMPRESSION_COLORS: string[] = [
  '#b91c1c', '#dc2626', '#ef4444', '#f87171',
  '#9ca3af',
  '#86efac', '#4ade80', '#22c55e', '#16a34a',
]

/** SCA-104 §5.2 "Impression of Quality" rubric labels for scale points 1–9. */
export const IMPRESSION_LABELS: string[] = [
  'Extremely Low', 'Very Low', 'Moderately Low', 'Slightly Low',
  'Neither High nor Low',
  'Slightly High', 'Moderately High', 'Very High', 'Extremely High',
]
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/cva/sections.ts
git commit -m "feat(cva): section constants + 9-point scale colors/labels"
```

---

### Task 4: SCA CVA scoring engine (TDD against the two-way table)

**Files:**
- Create: `src/types/cva.ts` (types needed by scoring)
- Create: `src/lib/cva/scoring.ts`
- Test: `src/lib/cva/scoring.test.ts`

The scoring function is the heart of the feature. SCA-104 §5.5: `S = 0.65625·Σh + 52.75 − 2u − 4d`, rounded to nearest 0.25. The Appendix 7.1 two-way table is the exact oracle.

- [ ] **Step 1: Write the CVA types `src/types/cva.ts`**

```ts
import type { CvaSectionKey } from '@/lib/cva/sections'

export type RoastLevel = 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark'

export interface CvaSectionScore {
  impression?: number          // 1–9 initial impression
  impression_final?: number    // 1–9 cooled-final (this is what scores, if set)
  note?: string
}

export interface CvaDescribe {
  intensities: Record<Exclude<CvaSectionKey, 'overall'>, number>  // 7 sections, 0–15
  aroma: { cata: string[] }                                       // ≤5 olfactory (fragrance + aroma)
  flavor_aftertaste: { cata: string[]; main_tastes: string[] }    // ≤5 olfactory + ≤2 main tastes
  mouthfeel: { cata: string[] }                                   // ≤2 mouthfeel CATA
  notes: { acidity?: string; sweetness?: string }
  voice: Record<string, string>                                   // group → transcript (Phase 3)
}

export type CvaDefectType = 'moldy' | 'phenolic' | 'potato'

export interface CvaCups {
  non_uniform: number[]                                  // cup indices 1–5
  defective: { cup: number; type: CvaDefectType }[]
}

export interface CvaHighlights {
  narrative: string
  label: { nose: string; palate: string; finish: string; one_liner: string }
  lang: string
}

export interface CvaAssessment {
  protocol: 'cva'
  version: 1
  roast: { level?: RoastLevel; agtron?: number }
  sections: Partial<Record<CvaSectionKey, CvaSectionScore>>
  describe: CvaDescribe
  cups: CvaCups
  score: number
  u: number
  d: number
  highlights: CvaHighlights | null
}

export function createEmptyAssessment(): CvaAssessment {
  return {
    protocol: 'cva',
    version: 1,
    roast: {},
    sections: {},
    describe: {
      intensities: { fragrance: 0, aroma: 0, flavor: 0, aftertaste: 0, acidity: 0, sweetness: 0, mouthfeel: 0 },
      aroma: { cata: [] },
      flavor_aftertaste: { cata: [], main_tastes: [] },
      mouthfeel: { cata: [] },
      notes: {},
      voice: {},
    },
    cups: { non_uniform: [], defective: [] },
    score: 0,
    u: 0,
    d: 0,
    highlights: null,
  }
}
```

- [ ] **Step 2: Write the failing test `src/lib/cva/scoring.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { roundToQuarter, cvaScoreFromSum, effectiveImpression, computeAssessmentScore } from './scoring'
import { createEmptyAssessment } from '@/types/cva'

// SCA Standard 104-2024, Appendix 7.1 — Two-Way Table (Σ of 8 sections → score). The exact oracle.
const TWO_WAY: Record<number, number> = {
  8: 58.0, 9: 58.75, 10: 59.25, 11: 60.0, 12: 60.75, 13: 61.25, 14: 62.0, 15: 62.5,
  16: 63.25, 17: 64.0, 18: 64.5, 19: 65.25, 20: 66.0, 21: 66.5, 22: 67.25, 23: 67.75,
  24: 68.5, 25: 69.25, 26: 69.75, 27: 70.5, 28: 71.25, 29: 71.75, 30: 72.5, 31: 73.0,
  32: 73.75, 33: 74.5, 34: 75.0, 35: 75.75, 36: 76.5, 37: 77.0, 38: 77.75, 39: 78.25,
  40: 79.0, 41: 79.75, 42: 80.25, 43: 81.0, 44: 81.75, 45: 82.25, 46: 83.0, 47: 83.5,
  48: 84.25, 49: 85.0, 50: 85.5, 51: 86.25, 52: 87.0, 53: 87.5, 54: 88.25, 55: 88.75,
  56: 89.5, 57: 90.25, 58: 90.75, 59: 91.5, 60: 92.25, 61: 92.75, 62: 93.5, 63: 94.0,
  64: 94.75, 65: 95.5, 66: 96.0, 67: 96.75, 68: 97.5, 69: 98.0, 70: 98.75, 71: 99.25, 72: 100.0,
}

describe('roundToQuarter', () => {
  it('rounds to nearest 0.25', () => {
    expect(roundToQuarter(73.09375)).toBe(73.0)
    expect(roundToQuarter(83.59375)).toBe(83.5)
    expect(roundToQuarter(58.65625)).toBe(58.75)
    expect(roundToQuarter(60.625)).toBe(60.75) // half-up boundary
  })
})

describe('cvaScoreFromSum — matches the SCA two-way table for every sum 8..72', () => {
  for (const [sumStr, expected] of Object.entries(TWO_WAY)) {
    const sum = Number(sumStr)
    it(`Σ=${sum} → ${expected}`, () => {
      expect(cvaScoreFromSum(sum, 0, 0)).toBe(expected)
    })
  }
})

describe('cvaScoreFromSum — spec checkpoints', () => {
  it('all sections = 5 (Σ40) → 79.00', () => expect(cvaScoreFromSum(40, 0, 0)).toBe(79.0))
  it('all sections = 9 (Σ72) → 100.00', () => expect(cvaScoreFromSum(72, 0, 0)).toBe(100.0))
  it('Σ31 → 73.00', () => expect(cvaScoreFromSum(31, 0, 0)).toBe(73.0))
})

describe('cvaScoreFromSum — penalties', () => {
  it('−2 per non-uniform cup', () => expect(cvaScoreFromSum(72, 1, 0)).toBe(98.0))
  it('−4 per defective cup', () => expect(cvaScoreFromSum(72, 0, 1)).toBe(96.0))
  it('combined u=2, d=1', () => expect(cvaScoreFromSum(72, 2, 1)).toBe(92.0))
})

describe('effectiveImpression — final-if-shifted', () => {
  it('uses impression when no final', () => expect(effectiveImpression({ impression: 7 })).toBe(7))
  it('uses impression_final when set', () => expect(effectiveImpression({ impression: 7, impression_final: 8 })).toBe(8))
  it('null when empty', () => expect(effectiveImpression(undefined)).toBe(null))
})

describe('computeAssessmentScore', () => {
  it('reports partial progress', () => {
    const a = createEmptyAssessment()
    a.sections = { fragrance: { impression: 8 }, aroma: { impression: 8 } }
    const r = computeAssessmentScore(a)
    expect(r.count).toBe(2)
    expect(r.complete).toBe(false)
    expect(r.sum).toBe(16)
  })

  it('full all-8s with a cooled-final, one non-uniform + one defective', () => {
    const a = createEmptyAssessment()
    a.sections = {
      fragrance: { impression: 8 }, aroma: { impression: 8 }, flavor: { impression: 8 },
      aftertaste: { impression: 8 }, acidity: { impression: 7, impression_final: 8 },
      sweetness: { impression: 8 }, mouthfeel: { impression: 8 }, overall: { impression: 8 },
    }
    a.cups = { non_uniform: [3], defective: [{ cup: 5, type: 'phenolic' }] }
    const r = computeAssessmentScore(a)
    expect(r.complete).toBe(true)
    expect(r.sum).toBe(64)        // eight 8s (acidity uses final 8)
    expect(r.u).toBe(1)
    expect(r.d).toBe(1)
    // Σ64 → 94.75, minus 2 minus 4 = 88.75
    expect(r.score).toBe(88.75)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/cva/scoring.test.ts`
Expected: FAIL — `Failed to resolve import "./scoring"` (file not created yet).

- [ ] **Step 4: Write `src/lib/cva/scoring.ts`**

```ts
import { SECTION_KEYS } from './sections'
import type { CvaAssessment, CvaSectionScore } from '@/types/cva'

/** Round to nearest 0.25 (SCA CVA spec, §5.5). */
export function roundToQuarter(n: number): number {
  return Math.round(n * 4) / 4
}

/**
 * SCA CVA cupping score (SCA-104 §5.5):
 *   S = 0.65625·Σh + 52.75 − 2u − 4d, rounded to nearest 0.25.
 * @param sumH sum of the eight 9-point section impressions (final-if-shifted)
 * @param nonUniform number of non-uniform cups (u)
 * @param defective number of defective cups (d)
 */
export function cvaScoreFromSum(sumH: number, nonUniform = 0, defective = 0): number {
  return roundToQuarter(0.65625 * sumH + 52.75 - 2 * nonUniform - 4 * defective)
}

/** The impression that scores: the cooled "final" value if present, else the initial. */
export function effectiveImpression(section?: CvaSectionScore | null): number | null {
  if (!section) return null
  if (typeof section.impression_final === 'number') return section.impression_final
  if (typeof section.impression === 'number') return section.impression
  return null
}

export interface LiveScore {
  sum: number          // Σ of effective impressions over scored sections
  count: number        // how many of the 8 sections are scored
  complete: boolean    // all 8 scored
  u: number            // non-uniform cups
  d: number            // defective cups
  score: number        // CVA 0–100 from the current sum (provisional until complete)
}

/** Derive the live score from the assessment's sections + cups. */
export function computeAssessmentScore(a: Pick<CvaAssessment, 'sections' | 'cups'>): LiveScore {
  let sum = 0
  let count = 0
  for (const key of SECTION_KEYS) {
    const v = effectiveImpression(a.sections?.[key])
    if (v != null) {
      sum += v
      count += 1
    }
  }
  const u = a.cups?.non_uniform?.length ?? 0
  const d = a.cups?.defective?.length ?? 0
  return {
    sum,
    count,
    complete: count === SECTION_KEYS.length,
    u,
    d,
    score: cvaScoreFromSum(sum, u, d),
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/cva/scoring.test.ts`
Expected: PASS — all ~80 assertions green (65 table rows + checkpoints + penalties + compute).

- [ ] **Step 6: Commit**

```bash
git add src/types/cva.ts src/lib/cva/scoring.ts src/lib/cva/scoring.test.ts
git commit -m "feat(cva): SCA scoring engine + types, unit-tested vs Appendix 7.1 two-way table"
```

---

# PART B — Create a Specialty Quality

Lets a user create a CVA quality with a methodology flag, per-quality min score (82, 84…), and a "requires flavor notes" toggle. Extends the existing full-screen quality editor and its two API routes. (No new test runner work; verified by manual create + DB read.)

### Task 5: Accept the 3 new columns in the quality-template API

**Files:**
- Modify: `src/app/api/quality-templates/route.ts` (POST handler, `templateData` builder ~lines 131–169)
- Modify: `src/app/api/quality-templates/[id]/route.ts` (PATCH `allowedFields` ~lines 99–117)

- [ ] **Step 1: POST — accept methodology/cva_min_score/requires_descriptors**

In `src/app/api/quality-templates/route.ts`, inside the object that builds `templateData` for the insert (the block that sets `name_en`, `cupping_scale_type`, etc.), add these three fields (defaulting safely so existing commodity creates are unchanged):

```ts
    methodology: body.methodology === 'cva' ? 'cva' : 'commodity',
    cva_min_score: body.methodology === 'cva' ? (body.cva_min_score ?? 84) : null,
    requires_descriptors: body.methodology === 'cva' ? !!body.requires_descriptors : false,
```

If the insert is strictly typed and TypeScript complains the columns are unknown (types not regenerated yet), cast the insert payload: `.insert(templateData as any)`.

- [ ] **Step 2: PATCH — allow updating the 3 new columns**

In `src/app/api/quality-templates/[id]/route.ts`, add the three column names to the `allowedFields` array (the list that already contains `'parameters'`, `'cupping_scale_type'`, `'is_active'`, …):

```ts
  'methodology',
  'cva_min_score',
  'requires_descriptors',
```

- [ ] **Step 3: Verify the routes still compile**

Run: `npx tsc --noEmit` (or `npm run build` if tsc isn't wired standalone)
Expected: no new type errors from these files. (If `cva_min_score`/`methodology` raise "not assignable", confirm the `as any` cast on the insert and that allowedFields is `string[]`.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/quality-templates/route.ts src/app/api/quality-templates/[id]/route.ts
git commit -m "feat(quality): API accepts methodology/cva_min_score/requires_descriptors"
```

---

### Task 6: Methodology fields in the quality editor

**Files:**
- Modify: `src/components/quality/spec-editor/quality-spec-editor.tsx` (BasicInformation section ~lines 377–460; save payload ~lines 195–226; component state near the other `useState`s ~lines 130–195)

- [ ] **Step 1: Add editor state**

Near the other field state declarations (where `name`, `description`, `isActive`, `sharing` are defined), add:

```tsx
  const [methodology, setMethodology] = useState<'commodity' | 'cva'>(
    ((template as any)?.methodology === 'cva' ? 'cva' : 'commodity')
  )
  const [cvaMinScore, setCvaMinScore] = useState<number>(
    Number((template as any)?.cva_min_score ?? 84)
  )
  const [requiresDescriptors, setRequiresDescriptors] = useState<boolean>(
    !!(template as any)?.requires_descriptors
  )
```

- [ ] **Step 2: Render the fields in BasicInformation**

In the BasicInformation section JSX (right after the "Template sharing" field block), add — matching the existing label/input styling used elsewhere in this file:

```tsx
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Methodology</label>
          <select
            value={methodology}
            onChange={(e) => setMethodology(e.target.value === 'cva' ? 'cva' : 'commodity')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="commodity">Commodity (standard cupping)</option>
            <option value="cva">Specialty — SCA CVA 2024</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Specialty qualities open the immersive CVA tasting journey and score 0–100 on the SCA 2024 standard.
          </p>
        </div>

        {methodology === 'cva' && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Minimum CVA score to pass</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.25}
                value={cvaMinScore}
                onChange={(e) => setCvaMinScore(Number(e.target.value))}
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">e.g. 82 or 84. SCA defines no pass mark — this is the Wolthers/contract threshold.</p>
            </div>
            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={requiresDescriptors}
                onChange={(e) => setRequiresDescriptors(e.target.checked)}
                className="h-4 w-4"
              />
              Require flavor notes (descriptive CATA) before this quality can pass
            </label>
          </div>
        )}
```

> If `text-foreground`/`text-muted-foreground`/`border-border` aren't the tokens used in this file, match whatever the adjacent fields use (the file already styles name/description inputs — copy those exact classes).

- [ ] **Step 3: Include the fields in the save payload**

In the save handler (the `payload` object passed to `onSave`, ~lines 200–219), add the three top-level columns:

```tsx
      methodology,
      cva_min_score: methodology === 'cva' ? cvaMinScore : null,
      requires_descriptors: methodology === 'cva' ? requiresDescriptors : false,
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Open `/quality/templates` → New. Confirm the Methodology dropdown appears; selecting "Specialty — SCA CVA 2024" reveals Min score + Require flavor notes. Create a quality named e.g. "CVA Test 84", methodology specialty, min 84, requires notes off. Save.

Then verify in DB (Daniel runs):

```sql
SELECT id, name_en, methodology, cva_min_score, requires_descriptors
FROM quality_templates WHERE methodology = 'cva' ORDER BY created_at DESC LIMIT 5;
```

Expected: the new row with `methodology='cva'`, `cva_min_score=84`.

- [ ] **Step 5: Seed a CVA sample for journey testing**

So Phase 1 has something to open, Daniel assigns the new CVA quality to a client and a sample (via the normal client-quality + intake UI), OR runs this helper to point an existing test sample at a CVA quality (replace the IDs):

```sql
-- 1) find a CVA client_quality id
SELECT cq.id AS client_quality_id, qt.name_en, qt.methodology
FROM client_qualities cq JOIN quality_templates qt ON qt.id = cq.template_id
WHERE qt.methodology = 'cva';

-- 2) point a test sample at it (replace both IDs)
-- UPDATE samples SET quality_spec_id = '<client_quality_id>' WHERE tracking_number = '<TEST-TRACKING>';
```

- [ ] **Step 6: Commit**

```bash
git add src/components/quality/spec-editor/quality-spec-editor.tsx
git commit -m "feat(quality): create specialty (CVA) quality — methodology, min score, requires-notes"
```

---

# PART C — Phase 1: The Affective Journey

The usable-on-its-own spine: set the roast, rate 8 sections on the 9-point scale (with cooling shift), watch the live 0–100 score, jump around the progress path, autosave throughout, light + dark. All under the self-contained `cupping/cva/` namespace (no edits to the 2,258-line commodity page).

### Task 7: API — eligible CVA samples

**Files:**
- Create: `src/app/api/cupping/cva/eligible/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // CVA quality templates → their client_qualities → samples assigned to them.
    const { data: templates } = await supabase
      .from('quality_templates')
      .select('id')
      .eq('methodology', 'cva')
    const templateIds = (templates ?? []).map((t: any) => t.id)
    if (templateIds.length === 0) return NextResponse.json({ samples: [] })

    const { data: qualities } = await supabase
      .from('client_qualities')
      .select('id')
      .in('template_id', templateIds)
    const qualityIds = (qualities ?? []).map((q: any) => q.id)
    if (qualityIds.length === 0) return NextResponse.json({ samples: [] })

    const { data: samples, error } = await supabase
      .from('samples')
      .select('id, tracking_number, status, workflow_stage, quality_spec_id, created_at')
      .in('quality_spec_id', qualityIds)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error

    return NextResponse.json({ samples: samples ?? [] }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('GET /api/cupping/cva/eligible', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cupping/cva/eligible/route.ts
git commit -m "feat(cva): API — list eligible CVA samples"
```

---

### Task 8: API — create/get a CVA session

**Files:**
- Create: `src/app/api/cupping/cva/session/route.ts`

Mirrors the existing save-digital pattern: anon client for auth, service-role client for the write (bypassing RLS), reusing `cupping_sessions` with `session_type='cva'`.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const sampleId: string | undefined = body?.sample_id
    if (!sampleId) {
      return NextResponse.json({ error: 'sample_id required' }, { status: 400 })
    }

    // Reuse an existing active CVA session that contains this sample, if any.
    const { data: existing } = await admin
      .from('cupping_sessions')
      .select('id')
      .eq('session_type', 'cva')
      .contains('sample_ids', [sampleId])
      .in('status', ['setup', 'active', 'review'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ session_id: existing[0].id })
    }

    // Carry the sample's lab onto the session when available.
    const { data: sample } = await admin
      .from('samples')
      .select('laboratory_id')
      .eq('id', sampleId)
      .single()

    const { data: created, error } = await admin
      .from('cupping_sessions')
      .insert({
        session_type: 'cva',
        status: 'active',
        created_by: user.id,
        participants: [user.id],
        cupper_ids: [user.id],
        sample_ids: [sampleId],
        laboratory_id: (sample as any)?.laboratory_id ?? null,
      } as any)
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({ session_id: created.id })
  } catch (error) {
    console.error('POST /api/cupping/cva/session', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cupping/cva/session/route.ts
git commit -m "feat(cva): API — create/get a CVA cupping session"
```

---

### Task 9: API — load & save the assessment

**Files:**
- Create: `src/app/api/cupping/cva/[id]/route.ts`

GET returns this cupper's existing payload (or an empty one); PUT upserts the `cupping_scores` row and re-verifies the score server-side.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { computeAssessmentScore } from '@/lib/cva/scoring'
import { createEmptyAssessment, type CvaAssessment } from '@/types/cva'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function loadContext(sessionId: string) {
  const { data: session } = await admin
    .from('cupping_sessions')
    .select('id, sample_ids, session_type, status')
    .eq('id', sessionId)
    .single()
  if (!session) return null
  const sampleId = (session as any).sample_ids?.[0] as string | undefined
  if (!sampleId) return null
  const { data: sample } = await admin
    .from('samples')
    .select('id, tracking_number, status')
    .eq('id', sampleId)
    .single()
  return { session, sampleId, sample }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: sessionId } = await params
    const ctx = await loadContext(sessionId)
    if (!ctx) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const { data: row } = await admin
      .from('cupping_scores')
      .select('scores')
      .eq('session_id', sessionId)
      .eq('sample_id', ctx.sampleId)
      .eq('cupper_id', user.id)
      .maybeSingle()

    const assessment = ((row as any)?.scores as CvaAssessment) ?? createEmptyAssessment()
    return NextResponse.json({ sample: ctx.sample, assessment }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('GET /api/cupping/cva/[id]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: sessionId } = await params
    const ctx = await loadContext(sessionId)
    if (!ctx) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const incoming = (await request.json()) as CvaAssessment
    // Re-verify the score server-side — never trust the client's number.
    const live = computeAssessmentScore(incoming)
    const payload: CvaAssessment = {
      ...incoming,
      protocol: 'cva',
      score: live.score,
      u: live.u,
      d: live.d,
    }

    const { data: existing } = await admin
      .from('cupping_scores')
      .select('id')
      .eq('session_id', sessionId)
      .eq('sample_id', ctx.sampleId)
      .eq('cupper_id', user.id)
      .maybeSingle()

    const rowData = {
      session_id: sessionId,
      sample_id: ctx.sampleId,
      cupper_id: user.id,
      scores: payload,
      protocol: 'cva',
      cva_score: live.complete ? live.score : null,
      entry_method: 'manual',
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error } = await admin.from('cupping_scores').update(rowData as any).eq('id', (existing as any).id)
      if (error) throw error
    } else {
      const { error } = await admin.from('cupping_scores').insert(rowData as any)
      if (error) throw error
    }

    return NextResponse.json({ ok: true, cva_score: live.score, complete: live.complete })
  } catch (error) {
    console.error('PUT /api/cupping/cva/[id]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

> Note: `new Date().toISOString()` runs server-side in a request handler (allowed) — this is NOT a Workflow script. The DB `updated_at` trigger may also cover it; harmless either way.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cupping/cva/[id]/route.ts
git commit -m "feat(cva): API — load/save assessment with server-verified score"
```

---

### Task 10: `useCvaAssessment` hook (state + debounced autosave)

**Files:**
- Create: `src/hooks/useCvaAssessment.ts`

- [ ] **Step 1: Write the hook**

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createEmptyAssessment, type CvaAssessment, type CvaSectionScore } from '@/types/cva'
import type { CvaSectionKey } from '@/lib/cva/sections'

interface SampleHeader { id: string; tracking_number: string; status?: string }

export function useCvaAssessment(sessionId: string) {
  const [assessment, setAssessment] = useState<CvaAssessment>(createEmptyAssessment())
  const [sample, setSample] = useState<SampleHeader | null>(null)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<CvaAssessment>(assessment)

  // Initial load.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/cupping/cva/${sessionId}`)
        const data = await res.json()
        if (cancelled) return
        if (data.assessment) {
          setAssessment(data.assessment)
          latest.current = data.assessment
        }
        if (data.sample) setSample(data.sample)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  const persist = useCallback(async (next: CvaAssessment) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/cupping/cva/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (res.ok) setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }, [sessionId])

  // Debounced autosave on every change.
  const update = useCallback((mutator: (draft: CvaAssessment) => CvaAssessment) => {
    setAssessment((prev) => {
      const next = mutator(prev)
      latest.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => persist(latest.current), 700)
      return next
    })
  }, [persist])

  // Save any pending change on unmount.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      void persist(latest.current)
    }
  }, [persist])

  // Typed setters used by the UI.
  const setSectionValue = useCallback((key: CvaSectionKey, patch: Partial<CvaSectionScore>) => {
    update((d) => ({ ...d, sections: { ...d.sections, [key]: { ...d.sections[key], ...patch } } }))
  }, [update])

  const setRoast = useCallback((patch: Partial<CvaAssessment['roast']>) => {
    update((d) => ({ ...d, roast: { ...d.roast, ...patch } }))
  }, [update])

  return { assessment, sample, ready, saving, savedAt, setSectionValue, setRoast }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCvaAssessment.ts
git commit -m "feat(cva): useCvaAssessment hook with debounced autosave"
```

---

### Task 11: `ImpressionScale` — the 9-point widget (TDD)

**Files:**
- Create: `src/components/cupping/cva/ImpressionScale.tsx`
- Test: `src/components/cupping/cva/ImpressionScale.test.tsx`

The interaction centerpiece: nine click/tap blocks, a synced numeric field, keys 1–9, pointer magnify, and click-only cooling shift. No slider, no drag.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImpressionScale } from './ImpressionScale'

describe('ImpressionScale', () => {
  it('renders nine impression blocks', () => {
    render(<ImpressionScale accent="#556b2f" onChange={() => {}} onChangeFinal={() => {}} />)
    expect(screen.getAllByRole('button', { name: /impression [1-9]/i })).toHaveLength(9)
  })

  it('click selects an initial value', () => {
    const onChange = vi.fn()
    render(<ImpressionScale accent="#556b2f" onChange={onChange} onChangeFinal={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /impression 7/i }))
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('numeric field is two-way synced', () => {
    const onChange = vi.fn()
    render(<ImpressionScale value={5} accent="#556b2f" onChange={onChange} onChangeFinal={() => {}} />)
    const input = screen.getByLabelText(/impression value/i) as HTMLInputElement
    expect(input.value).toBe('5')
    fireEvent.change(input, { target: { value: '8' } })
    expect(onChange).toHaveBeenCalledWith(8)
  })

  it('keys 1-9 set the value', () => {
    const onChange = vi.fn()
    render(<ImpressionScale accent="#556b2f" onChange={onChange} onChangeFinal={() => {}} />)
    fireEvent.keyDown(screen.getByTestId('impression-scale'), { key: '9' })
    expect(onChange).toHaveBeenCalledWith(9)
  })

  it('cooling toggle routes a click to the final value', () => {
    const onChangeFinal = vi.fn()
    render(<ImpressionScale value={6} accent="#556b2f" onChange={() => {}} onChangeFinal={onChangeFinal} />)
    fireEvent.click(screen.getByLabelText(/changed as it cooled/i))
    fireEvent.click(screen.getByRole('button', { name: /impression 8/i }))
    expect(onChangeFinal).toHaveBeenCalledWith(8)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/cupping/cva/ImpressionScale.test.tsx`
Expected: FAIL — cannot resolve `./ImpressionScale`.

- [ ] **Step 3: Write `ImpressionScale.tsx`**

```tsx
'use client'

import { useState, useCallback } from 'react'
import { IMPRESSION_COLORS, IMPRESSION_LABELS } from '@/lib/cva/sections'

interface ImpressionScaleProps {
  value?: number
  finalValue?: number
  accent: string
  onChange: (v: number) => void
  onChangeFinal: (v: number | undefined) => void
  onCommit?: (v: number) => void
}

export function ImpressionScale({ value, finalValue, accent, onChange, onChangeFinal, onCommit }: ImpressionScaleProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [cooling, setCooling] = useState<boolean>(finalValue != null)

  const pick = useCallback((point: number) => {
    if (cooling) {
      onChangeFinal(point)
    } else {
      onChange(point)
      onCommit?.(point)
    }
  }, [cooling, onChange, onChangeFinal, onCommit])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const n = Number(e.key)
    if (n >= 1 && n <= 9) {
      e.preventDefault()
      onChange(n)
      onCommit?.(n)
    }
  }, [onChange, onCommit])

  const onNumeric = useCallback((raw: string) => {
    const n = Math.max(1, Math.min(9, Math.round(Number(raw))))
    if (!Number.isNaN(n)) { onChange(n); onCommit?.(n) }
  }, [onChange, onCommit])

  // Dock-style magnify factor for the block at index i (pointer only).
  const scaleFor = (i: number) => {
    if (hovered == null) return 1
    const d = Math.abs(i - hovered)
    return Math.max(1, 1.5 - 0.18 * d)
  }

  return (
    <div data-testid="impression-scale" tabIndex={0} onKeyDown={onKeyDown} className="space-y-4 outline-none">
      <div className="relative flex items-end gap-2" onMouseLeave={() => setHovered(null)}>
        {IMPRESSION_COLORS.map((color, i) => {
          const point = i + 1
          const selected = value === point
          const isFinal = finalValue === point
          return (
            <button
              key={point}
              type="button"
              aria-label={`Impression ${point} — ${IMPRESSION_LABELS[i]}`}
              aria-pressed={selected}
              onMouseEnter={() => setHovered(i)}
              onClick={() => pick(point)}
              className="relative flex-1 rounded-xl transition-transform duration-150 ease-out focus:outline-none"
              style={{
                height: 64,
                background: color,
                transform: `scale(${scaleFor(i)})`,
                transformOrigin: 'bottom center',
                boxShadow: selected ? `0 0 0 3px ${accent}` : isFinal ? `0 0 0 3px ${accent}80` : 'none',
                outline: isFinal && !selected ? `2px dashed ${accent}` : 'none',
              }}
            >
              <span className="absolute inset-x-0 bottom-1 text-center text-xs font-semibold text-white/90">{point}</span>
            </button>
          )
        })}
        {value != null && finalValue != null && value !== finalValue && (
          <CoolingArrow from={value} to={finalValue} accent={accent} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Value</span>
          <input
            aria-label="Impression value"
            type="number"
            min={1}
            max={9}
            value={value ?? ''}
            onChange={(e) => onNumeric(e.target.value)}
            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cooling}
            onChange={(e) => { setCooling(e.target.checked); if (!e.target.checked) onChangeFinal(undefined) }}
          />
          <span>Changed as it cooled?</span>
        </label>
        {value != null && (
          <span className="text-sm text-muted-foreground">{IMPRESSION_LABELS[value - 1]}</span>
        )}
      </div>
    </div>
  )
}

/** Thin arrow drawn from the initial block center to the cooled-final block center. */
function CoolingArrow({ from, to, accent }: { from: number; to: number; accent: string }) {
  const x = (point: number) => ((point - 0.5) / 9) * 100
  const x1 = x(from)
  const x2 = x(to)
  return (
    <svg className="pointer-events-none absolute -top-3 left-0 h-3 w-full" preserveAspectRatio="none" viewBox="0 0 100 10">
      <defs>
        <marker id="cva-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={accent} />
        </marker>
      </defs>
      <line x1={x1} y1="5" x2={x2} y2="5" stroke={accent} strokeWidth="1.5" markerEnd="url(#cva-arrow)" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/cupping/cva/ImpressionScale.test.tsx`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/cupping/cva/ImpressionScale.tsx src/components/cupping/cva/ImpressionScale.test.tsx
git commit -m "feat(cva): ImpressionScale 9-point widget (click/numeric/keys/magnify/cooling) + tests"
```

---

### Task 12: `RoastStep`, `LiveScore`, `ProgressPath`, `ScoreSummary`, `SectionScreen`

**Files:**
- Create: `src/components/cupping/cva/RoastStep.tsx`
- Create: `src/components/cupping/cva/LiveScore.tsx`
- Create: `src/components/cupping/cva/ProgressPath.tsx`
- Create: `src/components/cupping/cva/ScoreSummary.tsx`
- Create: `src/components/cupping/cva/SectionScreen.tsx`

- [ ] **Step 1: `RoastStep.tsx`**

```tsx
'use client'

import type { CvaAssessment, RoastLevel } from '@/types/cva'

const LEVELS: { key: RoastLevel; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'medium-light', label: 'Medium-Light' },
  { key: 'medium', label: 'Medium' },
  { key: 'medium-dark', label: 'Medium-Dark' },
  { key: 'dark', label: 'Dark' },
]

interface Props {
  roast: CvaAssessment['roast']
  onChange: (patch: Partial<CvaAssessment['roast']>) => void
}

export function RoastStep({ roast, onChange }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Roast level</h2>
        <p className="text-xs text-muted-foreground">Recorded visually before tasting (SCA-102). Cupping level ≈ CIELAB L* 26–29.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {LEVELS.map((l) => {
          const active = roast.level === l.key
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => onChange({ level: l.key })}
              className={`rounded-2xl border px-5 py-4 text-sm transition ${active ? 'border-foreground bg-foreground/5 font-semibold' : 'border-border hover:bg-foreground/5'}`}
            >
              {l.label}
            </button>
          )
        })}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Agtron (optional)</span>
        <input
          type="number"
          min={0}
          max={100}
          value={roast.agtron ?? ''}
          onChange={(e) => onChange({ agtron: e.target.value === '' ? undefined : Number(e.target.value) })}
          className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="63"
        />
      </label>
    </div>
  )
}
```

- [ ] **Step 2: `LiveScore.tsx`**

```tsx
'use client'

import type { LiveScore as Live } from '@/lib/cva/scoring'

export function LiveScore({ live }: { live: Live }) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-border bg-background/80 px-4 py-2 backdrop-blur">
      <span className="text-2xl font-semibold tabular-nums text-foreground">
        {live.complete ? live.score.toFixed(2) : '—'}
      </span>
      <span className="text-xs text-muted-foreground">
        {live.complete ? 'CVA score' : `${live.count}/8 sections · Σ${live.sum}`}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: `ProgressPath.tsx`**

```tsx
'use client'

interface Step { key: string; label: string; accent: string; done: boolean }

interface Props {
  steps: Step[]
  current: number
  onJump: (index: number) => void
}

export function ProgressPath({ steps, current, onJump }: Props) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto py-2">
      {steps.map((s, i) => {
        const active = i === current
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onJump(i)}
            className="group flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs transition"
            style={{ background: active ? `${s.accent}22` : 'transparent' }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: active || s.done ? s.accent : 'var(--border, #9ca3af)', opacity: s.done || active ? 1 : 0.4 }}
            />
            <span className={active ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{s.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: `ScoreSummary.tsx`** (basic end screen — full Coffee Profile is Phase 5)

```tsx
'use client'

import type { LiveScore } from '@/lib/cva/scoring'
import { CVA_SECTIONS } from '@/lib/cva/sections'
import { effectiveImpression } from '@/lib/cva/scoring'
import type { CvaAssessment } from '@/types/cva'

export function ScoreSummary({ assessment, live }: { assessment: CvaAssessment; live: LiveScore }) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="text-6xl font-semibold tabular-nums text-foreground">
          {live.complete ? live.score.toFixed(2) : '—'}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {live.complete ? 'SCA CVA cupping score' : `Score appears once all 8 sections are rated (${live.count}/8).`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CVA_SECTIONS.map((s) => {
          const v = effectiveImpression(assessment.sections[s.key])
          return (
            <div key={s.key} className="rounded-2xl border border-border p-4" style={{ borderColor: `${s.accent}55` }}>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-2xl font-semibold tabular-nums text-foreground">{v ?? '—'}</div>
            </div>
          )
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        The full Coffee Profile (flavor path, AI highlights, whiskey-style label, certificate) arrives in Phase 5.
      </p>
    </div>
  )
}
```

- [ ] **Step 5: `SectionScreen.tsx`**

```tsx
'use client'

import type { CvaSectionDef } from '@/lib/cva/sections'
import type { CvaSectionScore } from '@/types/cva'
import { ImpressionScale } from './ImpressionScale'

interface Props {
  section: CvaSectionDef
  value: CvaSectionScore | undefined
  onChange: (patch: Partial<CvaSectionScore>) => void
  onCommit?: (v: number) => void
}

export function SectionScreen({ section, value, onChange, onCommit }: Props) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 rounded-full" style={{ background: section.accent }} />
        <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
      </div>
      <ImpressionScale
        value={value?.impression}
        finalValue={value?.impression_final}
        accent={section.accent}
        onChange={(v) => onChange({ impression: v })}
        onChangeFinal={(v) => onChange({ impression_final: v })}
        onCommit={onCommit}
      />
      <textarea
        value={value?.note ?? ''}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="Affective note (optional) — a short justification for the score."
        className="min-h-20 w-full rounded-2xl border border-border bg-background p-4 text-sm"
      />
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/cupping/cva/RoastStep.tsx src/components/cupping/cva/LiveScore.tsx src/components/cupping/cva/ProgressPath.tsx src/components/cupping/cva/ScoreSummary.tsx src/components/cupping/cva/SectionScreen.tsx
git commit -m "feat(cva): roast, live score, progress path, summary, section screen components"
```

---

### Task 13: `CvaJourney` orchestrator

**Files:**
- Create: `src/components/cupping/cva/CvaJourney.tsx`

Wires the steps (Roast → 8 sections → Score), progress path, nav, autosave indicator, per-section accent, light/dark.

- [ ] **Step 1: Write `CvaJourney.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { CVA_SECTIONS } from '@/lib/cva/sections'
import { computeAssessmentScore, effectiveImpression } from '@/lib/cva/scoring'
import { useCvaAssessment } from '@/hooks/useCvaAssessment'
import { ProgressPath } from './ProgressPath'
import { RoastStep } from './RoastStep'
import { SectionScreen } from './SectionScreen'
import { ScoreSummary } from './ScoreSummary'
import { LiveScore } from './LiveScore'

const NEUTRAL = '#9ca3af'

export function CvaJourney({ sessionId }: { sessionId: string }) {
  const { assessment, sample, ready, saving, savedAt, setSectionValue, setRoast } = useCvaAssessment(sessionId)
  const [step, setStep] = useState(0)

  const live = useMemo(() => computeAssessmentScore(assessment), [assessment])

  // Steps: 0 = roast, 1..8 = sections, 9 = score.
  const steps = useMemo(() => {
    const sectionSteps = CVA_SECTIONS.map((s) => ({
      key: s.key,
      label: s.label,
      accent: s.accent,
      done: effectiveImpression(assessment.sections[s.key]) != null,
    }))
    return [
      { key: 'roast', label: 'Roast', accent: NEUTRAL, done: !!assessment.roast.level },
      ...sectionSteps,
      { key: 'score', label: 'Score', accent: '#151618', done: live.complete },
    ]
  }, [assessment, live.complete])

  const accent = steps[step]?.accent ?? NEUTRAL
  const last = steps.length - 1

  if (!ready) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ ['--cva-accent' as any]: accent }}>
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{sample?.tracking_number ?? 'CVA cupping'}</div>
            <div className="text-xs text-muted-foreground">
              {saving ? 'Saving…' : savedAt ? 'Saved' : 'Specialty · SCA CVA 2024'}
            </div>
          </div>
          <LiveScore live={live} />
        </div>
        <div className="mx-auto max-w-3xl">
          <ProgressPath steps={steps} current={step} onJump={setStep} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {step === 0 && <RoastStep roast={assessment.roast} onChange={setRoast} />}
        {step >= 1 && step <= 8 && (() => {
          const section = CVA_SECTIONS[step - 1]
          return (
            <SectionScreen
              key={section.key}
              section={section}
              value={assessment.sections[section.key]}
              onChange={(patch) => setSectionValue(section.key, patch)}
              onCommit={() => { if (step < last) setStep(step + 1) }}
            />
          )
        })()}
        {step === 9 && <ScoreSummary assessment={assessment} live={live} />}
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-background/80 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-full border border-border px-5 py-2 text-sm disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            disabled={step === last}
            onClick={() => setStep((s) => Math.min(last, s + 1))}
            className="rounded-full px-6 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: accent }}
          >
            Next
          </button>
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/cupping/cva/CvaJourney.tsx
git commit -m "feat(cva): CvaJourney orchestrator — progress, nav, autosave, accent, light/dark"
```

---

### Task 14: Routes — index + journey host

**Files:**
- Create: `src/app/cupping/cva/page.tsx`
- Create: `src/app/cupping/cva/[sessionId]/page.tsx`

- [ ] **Step 1: Journey host `src/app/cupping/cva/[sessionId]/page.tsx`**

```tsx
'use client'

import { useParams } from 'next/navigation'
import { CvaJourney } from '@/components/cupping/cva/CvaJourney'

export default function CvaSessionPage() {
  const params = useParams<{ sessionId: string }>()
  const sessionId = params?.sessionId
  if (!sessionId) return null
  return <CvaJourney sessionId={sessionId} />
}
```

- [ ] **Step 2: Index `src/app/cupping/cva/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface EligibleSample { id: string; tracking_number: string; status?: string }

export default function CvaIndexPage() {
  const router = useRouter()
  const [samples, setSamples] = useState<EligibleSample[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/cupping/cva/eligible')
        const data = await res.json()
        setSamples(data.samples ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const start = async (sampleId: string) => {
    setStarting(sampleId)
    try {
      const res = await fetch('/api/cupping/cva/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_id: sampleId }),
      })
      const data = await res.json()
      if (data.session_id) router.push(`/cupping/cva/${data.session_id}`)
    } finally {
      setStarting(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-sm font-semibold text-foreground">Specialty (CVA) cupping</h1>
      <p className="mt-1 text-xs text-muted-foreground">Samples on a specialty (SCA CVA 2024) quality.</p>
      {loading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      ) : samples.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No specialty samples yet. Create a CVA quality and assign a sample to it.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {samples.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
              <span className="text-sm font-medium text-foreground">{s.tracking_number}</span>
              <button
                type="button"
                disabled={starting === s.id}
                onClick={() => start(s.id)}
                className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background disabled:opacity-50"
              >
                {starting === s.id ? 'Starting…' : 'Start CVA'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/cupping/cva/page.tsx src/app/cupping/cva/[sessionId]/page.tsx
git commit -m "feat(cva): routes — eligible-samples index + journey host"
```

---

### Task 15: Full verification & checkpoint

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS — `scoring.test.ts` + `ImpressionScale.test.tsx` all green.

- [ ] **Step 2: Type & build check**

Run: `npm run build`
Expected: compiles. (If new DB columns trip the generated types, confirm the `as any` casts on the cupping_scores/cupping_sessions inserts and the quality-template insert.)

- [ ] **Step 3: Regenerate Supabase types (recommended, removes the casts)**

After the migration is applied, Daniel runs:

```bash
npx supabase gen types typescript --project-id ojyonxplpmhvcgaycznc > src/lib/database.types.ts
```

Then remove the temporary `as any` casts added in Tasks 5, 8, 9. Re-run `npm run build`.

- [ ] **Step 4: Manual end-to-end (the real proof)**

Run `npm run dev`, then:
1. Go to `/cupping/cva` → the seeded CVA sample appears → **Start CVA**.
2. **Roast:** tap Medium, type Agtron 63.
3. **Fragrance:** click block 8 → it springs, auto-advances to Aroma. Verify the numeric field shows 8.
4. Rate all 8 sections. On one, toggle **"Changed as it cooled?"** and click a different block → arrow draws initial→final; confirm the **final** value is what feeds the score.
5. Watch the header **LiveScore**: with all 8 = 8 → Σ64 → **94.75**. Cross-check against the two-way table.
6. Tap a **progress-path** step to jump back and revise; confirm the value persisted.
7. **Score** step shows the count-up summary + per-section grid.
8. Toggle the app **theme** (light/dark) — confirm contrast and accents hold.
9. Reload the page → values reload from autosave (confirms the `cupping_scores` round-trip).

Daniel confirms in DB:

```sql
SELECT cupper_id, protocol, cva_score, jsonb_pretty(scores) AS payload
FROM cupping_scores WHERE protocol = 'cva' ORDER BY updated_at DESC LIMIT 1;
```

Expected: `protocol='cva'`, `cva_score` matching the on-screen score, and the full CVA payload in `scores`.

- [ ] **Step 5: Final commit / branch wrap-up**

```bash
git add -A
git commit -m "test(cva): Phase 1 verification — full affective journey passes"
```

(Then use `superpowers:finishing-a-development-branch` to decide merge/PR.)

---

## Self-review (against spec + new requirements)

- **Strict SCA scoring** — `scoring.ts` reproduces Appendix 7.1 for every Σ 8–72, with −2u/−4d and 0.25 rounding; checkpoints 79.00 / 100.00 / 73.00 asserted. ✓
- **No sliders** — `ImpressionScale` is click/tap + numeric + keys; cooling shift is click-only with an arrow. ✓
- **8 sections, 9-point** — `sections.ts` + `SectionScreen` + journey. ✓
- **Guided journey + progress path + autosave + light/dark** — `CvaJourney`, `ProgressPath`, `useCvaAssessment`, Tailwind `dark:`/tokens. ✓
- **Reuse cupping tables + CVA JSON + methodology/protocol/cva_score** — migrations + API. ✓
- **Methodology routing on the quality template** — column + eligible query + editor. ✓
- **NEW: create a specialty quality** — editor + API (Part B). ✓
- **NEW: per-quality min score (82/84…)** — `cva_min_score` on the template, editable per quality. ✓
- **NEW: requires flavor notes** — `requires_descriptors` column + toggle (stored now, enforced Phase 2/4). ✓
- **Describe panel, flavor wheel, voice, cups step, multi-cupper resolution, Coffee Profile/AI, certificate** — intentionally **out of Phase 1**; see roadmap. The `describe`/`cups`/`highlights` JSON shape is locked now so later phases don't migrate. ✓

---

## Roadmap — later phases (separate plans)

- **Phase 2 — Describe the cup:** `DescribePanel` (3 tabs: Aroma / Flavor & Aftertaste / Mouthfeel), `FlavorWheel` (2-ring CATA), `IntensityPicker` (the **7** per-section 15-pt intensities), `MainTastes` (≤2), `MouthfeelPicker` (≤2), persistent `DescribeButton` with captured indicator, shared cup-level state. Enforce caps + `requires_descriptors`.
- **Phase 3 — Voice:** `VoiceRecorder` hold-to-talk, Web Speech (PT/ES/EN), transcript → suggested CATA chips; server transcription later.
- **Phase 4 — Cups & finalize:** `CupsStep` (5 cups, non-uniform/defective), server score re-verify on finalize, write to `quality_assessments`, CVA pass/fail vs `cva_min_score`, and the **master-cupper divergence resolution** mirroring `cupping-validation-modal.tsx` (keep mine / average / match other) for the 8 affective sections.
- **Phase 5 — Coffee Profile + AI:** `CoffeeProfile` end screen (flavor path, words+icons, whiskey-style label), `/api/cupping/cva/highlights` (Claude — **confirm model + notes-disclosure policy**), certificate integration via the unified tracking-number pipeline.
- **Phase 6 — Later:** real-time multi-cupper calibration/alignment.
```
# Contract → Quality Auto-fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a QC sample intake links a sys contract, auto-select the matching WAQC quality spec in the Quality Specification dropdown, conservatively, with a visible overridable hint.

**Architecture:** A pure matcher (`matchQuality`) bridges the contract's free-text `quality_description` to one of the resolved client's structured `client_qualities`. Matching runs once, server-side, in `GET /api/contracts/[id]` after the buyer→client resolution. The match flows through the existing `ContractResolution` payload → `mapContractToFormData` (sets `quality_spec_id`, marks it prefilled) → the form's existing prefill plumbing. The Quality step shows a muted hint while the value is still the auto-filled one. No schema change.

**Tech Stack:** TypeScript, Next.js App Router (route handlers), Supabase server client, Vitest (jsdom), React.

**Locked decisions (do not relitigate):** auto-fill on contract link · server-side resolver · WAQC keeps its own QC templates · QC flow only (Other-Sample out of scope) · no schema change / migration · no persistent cross-reference · **conservative matcher** (under-match beats mis-match) · **show the hint**.

---

## File Structure

- **`src/lib/quality-matching.ts`** (new) — pure `matchQuality(contractText, specs)` + normalization + abbreviation dictionary. Owns the `QualitySpecCandidate` and `QualityMatch` types. No I/O, no imports from app code.
- **`src/lib/quality-matching.test.ts`** (new) — Vitest table of matcher cases.
- **`src/lib/contract-intake-mapping.ts`** (modify) — extend `ContractResolution` with `resolved_quality_spec_id` + `quality_match`; set `quality_spec_id` in `mapContractToFormData`.
- **`src/lib/contract-intake-mapping.test.ts`** (modify) — update `baseResolution`; add a quality-prefill case.
- **`src/app/api/contracts/[id]/route.ts`** (modify) — after client resolution, fetch `client_qualities`, call `matchQuality`, populate the two new resolution fields.
- **`src/components/samples/intake/types.ts`** (modify) — add `quality_match` to the client-side `contract_resolution` shape.
- **`src/components/samples/intake/contract-search-step.tsx`** (modify) — carry `quality_match` into the form's `contract_resolution`.
- **`src/components/samples/intake/quality-step.tsx`** (modify) — render the auto-select hint.

---

## Task 1: The pure matcher + tests

**Files:**
- Create: `src/lib/quality-matching.ts`
- Test: `src/lib/quality-matching.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/quality-matching.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchQuality, type QualitySpecCandidate } from './quality-matching'

// Helper: build a candidate with sensible nulls.
const spec = (over: Partial<QualitySpecCandidate> & { id: string }): QualitySpecCandidate => ({
  custom_name: null,
  quality_code: null,
  template_name: null,
  ...over,
})

describe('matchQuality', () => {
  it('worked example: "NY 2/3 17/18 FC" auto-selects "17/18 FC", not the 14/16 spec', () => {
    const specs = [
      spec({ id: 'a', custom_name: '17/18 FC' }),
      spec({ id: 'b', custom_name: '14/16 Fine Cup' }),
    ]
    const m = matchQuality('NY 2/3 17/18 FC', specs)
    expect(m.confidence).toBe('high')
    expect(m.matched).toBe(true)
    expect(m.spec_id).toBe('a')
    expect(m.spec_label).toBe('17/18 FC')
    expect(m.source_text).toBe('NY 2/3 17/18 FC')
  })

  it('expands the FC abbreviation to match a "Fine Cup" spec name', () => {
    const specs = [spec({ id: 'a', custom_name: '17/18 Fine Cup' })]
    expect(matchQuality('17/18 FC', specs).spec_id).toBe('a')
  })

  it('matches across spec fields (screen in quality_code, cup in template name)', () => {
    const specs = [
      spec({ id: 'a', custom_name: 'Floriana Premium', quality_code: '17/18', template_name: 'Brazil Fine Cup' }),
    ]
    expect(matchQuality('17/18 FC', specs).spec_id).toBe('a')
  })

  it('disqualifies a screen-size mismatch (14/16 contract must not pick a 17/18 spec)', () => {
    const specs = [spec({ id: 'a', custom_name: '17/18 FC' })]
    const m = matchQuality('14/16 FC', specs)
    expect(m.confidence).toBe('none')
    expect(m.spec_id).toBeNull()
  })

  it('picks the screen-matching spec when a mismatched one is also present', () => {
    const specs = [
      spec({ id: 'a', custom_name: '14/16 Fine Cup' }),
      spec({ id: 'b', custom_name: '17/18 FC' }),
    ]
    expect(matchQuality('17/18 FC', specs).spec_id).toBe('b')
  })

  it('strips NY defect grades and matches on screen alone', () => {
    const specs = [spec({ id: 'a', custom_name: '17/18' })]
    const m = matchQuality('NY 2 17/18', specs)
    expect(m.confidence).toBe('high')
    expect(m.spec_id).toBe('a')
  })

  it('exact cup match with no screen size is high confidence', () => {
    const specs = [spec({ id: 'a', custom_name: 'Fine Cup' })]
    expect(matchQuality('Fine Cup', specs).confidence).toBe('high')
  })

  it('matches the plus screen-size form (16+)', () => {
    const specs = [spec({ id: 'a', custom_name: '16+ Fine Cup' })]
    expect(matchQuality('16+ FC', specs).spec_id).toBe('a')
  })

  it('ambiguous tie (two identical specs) does not auto-select', () => {
    const specs = [
      spec({ id: 'a', custom_name: '17/18 FC' }),
      spec({ id: 'b', custom_name: '17/18 FC' }),
    ]
    const m = matchQuality('17/18 FC', specs)
    expect(m.confidence).toBe('low')
    expect(m.spec_id).toBeNull()
  })

  it('screen present on contract but absent of cup detail across specs -> no auto-select', () => {
    const specs = [
      spec({ id: 'a', custom_name: '17/18 FC' }),
      spec({ id: 'b', custom_name: '17/18 GC' }),
    ]
    // contract gives only the screen size -> can't disambiguate FC vs GC
    expect(matchQuality('17/18', specs).confidence).toBe('low')
  })

  it('different cup tokens with no screen -> no match', () => {
    const specs = [spec({ id: 'a', custom_name: 'Good Cup' })]
    expect(matchQuality('Fine Cup', specs).confidence).toBe('none')
  })

  it('empty spec list -> none', () => {
    expect(matchQuality('17/18 FC', []).confidence).toBe('none')
  })

  it('null / empty contract text -> none', () => {
    expect(matchQuality(null, [spec({ id: 'a', custom_name: '17/18 FC' })]).confidence).toBe('none')
    expect(matchQuality('', [spec({ id: 'a', custom_name: '17/18 FC' })]).confidence).toBe('none')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/quality-matching.test.ts`
Expected: FAIL — `Failed to resolve import "./quality-matching"` (module not created yet).

- [ ] **Step 3: Write the matcher implementation**

Create `src/lib/quality-matching.ts`:

```ts
// src/lib/quality-matching.ts
//
// Pure matcher that bridges a sys contract's free-text `quality_description`
// (e.g. "NY 2/3 17/18 FC") to one of a WAQC client's structured quality specs
// (client_qualities rows). No I/O — the caller passes the contract text and the
// candidate list; this returns a match result.
//
// Conservative by design: auto-select (`confidence: 'high'`) ONLY when exactly
// one non-disqualified spec is the unique top scorer AND it clears the
// high-confidence bar (screen-size match + >=1 cup token, or exact normalized
// equality). Mismatched screen sizes DISQUALIFY a spec. Anything ambiguous or
// weak returns 'low'/'none' and leaves the dropdown for the lab to pick.
// "Under-match beats mis-match."

export interface QualitySpecCandidate {
  id: string
  custom_name: string | null
  quality_code: string | null
  template_name: string | null
}

export interface QualityMatch {
  matched: boolean              // true only when confidence === 'high'
  spec_id: string | null        // client_qualities.id of the matched spec (high only)
  spec_label: string | null     // custom_name || quality_code of the match (high only)
  source_text: string           // the contract.quality_description we matched from
  confidence: 'high' | 'low' | 'none'
}

// Cup/prep abbreviations -> canonical phrase. Kept deliberately small; extend as
// real contract data demands. Single-letter abbreviations are intentionally
// excluded (too noisy after tokenization).
const ABBREVIATIONS: Record<string, string> = {
  fc: 'fine cup',
  gc: 'good cup',
  ss: 'strictly soft',
  sd: 'strictly drinkable',
  sdm: 'strictly drinkable mild',
  fw: 'fully washed',
  nw: 'natural',
  rio: 'rio',
}

// Structural / modifier words that carry no discriminating signal between specs
// (they appear in most quality names). Removed from the cup-token set so e.g.
// "fine cup" vs "good cup" differ only on {fine} vs {good}.
const STOPWORDS = new Set([
  'cup', 'bean', 'beans', 'coffee', 'grade', 'quality', 'prep', 'preparation',
  'screen', 'scr', 'strictly', 'and', 'type', 'lot',
])

// Commercial-only qualifiers that appear on contracts but not on QC specs — drop
// so they neither help nor penalise. NY defect grades, "up", bare single digits,
// and single-digit slash pairs ("2/3") are all stripped before cup tokenization.
function isCommercialQualifier(token: string): boolean {
  if (/^ny\d?$/.test(token)) return true          // ny, ny2, ny3
  if (token === 'up') return true
  if (/^\d$/.test(token)) return true             // bare single digit (NY grade remnant)
  if (/^\d\/\d$/.test(token)) return true         // single-digit slash pair, e.g. 2/3
  return false
}

interface QualityProfile {
  screen: string | null         // e.g. "17/18" or "16+"
  cup: Set<string>              // discriminating cup/prep tokens
  signature: string            // canonical signature for exact-equality checks
}

function profileOf(raw: string): QualityProfile {
  // Normalize: lowercase, strip punctuation except "/" and "+", collapse whitespace.
  const norm = raw
    .toLowerCase()
    .replace(/[^a-z0-9/+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Screen size: two-digit slash form (13/14 .. 19/20) first, else two-digit plus
  // form (16+, 18+). Two-digit requirement keeps NY grades like "2/3" out.
  const slash = norm.match(/\b(\d{2}\/\d{2})\b/)
  const plus = norm.match(/\b(\d{2}\+)/)
  const screen = slash ? slash[1] : plus ? plus[1] : null

  const cup = new Set<string>()
  for (const token of norm.split(' ')) {
    if (!token) continue
    if (token === screen) continue
    if (isCommercialQualifier(token)) continue
    const expanded = ABBREVIATIONS[token]
    const words = expanded ? expanded.split(' ') : [token]
    for (const w of words) {
      if (STOPWORDS.has(w)) continue
      if (isCommercialQualifier(w)) continue
      cup.add(w)
    }
  }

  const signature = `${screen ?? ''}|${[...cup].sort().join(',')}`
  return { screen, cup, signature }
}

function specText(s: QualitySpecCandidate): string {
  return [s.custom_name, s.quality_code, s.template_name].filter(Boolean).join(' ')
}

function none(source_text: string): QualityMatch {
  return { matched: false, spec_id: null, spec_label: null, source_text, confidence: 'none' }
}

export function matchQuality(
  contractText: string | null | undefined,
  specs: QualitySpecCandidate[],
): QualityMatch {
  const source_text = contractText ?? ''
  if (!source_text.trim()) return none(source_text)

  const cp = profileOf(source_text)
  if (!cp.screen && cp.cup.size === 0) return none(source_text) // nothing to match on
  if (specs.length === 0) return none(source_text)

  const evals = specs.map(s => {
    const sp = profileOf(specText(s))
    const screenBoth = !!cp.screen && !!sp.screen
    const screenMatch = screenBoth && cp.screen === sp.screen
    const disqualified = screenBoth && cp.screen !== sp.screen
    const sharedCup = [...cp.cup].filter(t => sp.cup.has(t)).length
    const exactEqual = cp.signature === sp.signature
    const high = !disqualified && ((screenMatch && sharedCup >= 1) || exactEqual)
    const score = disqualified ? -1 : (screenMatch ? 3 : 0) + sharedCup
    return { s, disqualified, high, score }
  })

  const live = evals.filter(e => !e.disqualified && e.score > 0)
  if (live.length === 0) return none(source_text)

  const top = Math.max(...live.map(e => e.score))
  const tops = live.filter(e => e.score === top)
  const highs = live.filter(e => e.high)

  if (highs.length === 1 && tops.length === 1 && highs[0].s.id === tops[0].s.id) {
    const m = highs[0].s
    return {
      matched: true,
      spec_id: m.id,
      spec_label: m.custom_name || m.quality_code || null,
      source_text,
      confidence: 'high',
    }
  }

  // Something overlapped but it wasn't a unique, confident win — leave it manual.
  return { matched: false, spec_id: null, spec_label: null, source_text, confidence: 'low' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/quality-matching.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quality-matching.ts src/lib/quality-matching.test.ts
git commit -m "feat(intake): pure contract->quality matcher (matchQuality) + tests"
```

---

## Task 2: Extend ContractResolution + set quality_spec_id in the mapper

**Files:**
- Modify: `src/lib/contract-intake-mapping.ts:40-48` (interface), `:175` (mapper)
- Test: `src/lib/contract-intake-mapping.test.ts:18` (baseResolution), new case

- [ ] **Step 1: Write the failing test**

In `src/lib/contract-intake-mapping.test.ts`, update the imports at the top to also pull the matcher type, update `baseResolution`, and add a quality-prefill describe block.

Change the import block (lines 1-10) to add `QualityMatch`-free usage — only `baseResolution` needs the new fields. Replace `baseResolution` (lines 18-26) with:

```ts
const baseResolution: ContractResolution = {
  resolved_client_id: null,
  importer_is_qc_client: false,
  resolved_importer_id: null,
  candidate_seller_exporter_ids: [],
  candidate_shipper_exporter_ids: [],
  multiple_seller_matches: false,
  multiple_shipper_matches: false,
  resolved_quality_spec_id: null,
  quality_match: null,
}
```

Add this describe block at the end of the file:

```ts
describe('mapContractToFormData — quality spec prefill', () => {
  it('sets quality_spec_id and marks it prefilled when the resolver matched a spec', () => {
    const c = baseContract({ quality_description: 'NY 2/3 17/18 FC' })
    const resolution: ContractResolution = {
      ...baseResolution,
      resolved_quality_spec_id: 'spec-123',
      quality_match: {
        matched: true,
        spec_id: 'spec-123',
        spec_label: '17/18 FC',
        source_text: 'NY 2/3 17/18 FC',
        confidence: 'high',
      },
    }
    const { patch, prefilled } = mapContractToFormData(c, resolution)
    expect(patch.quality_spec_id).toBe('spec-123')
    expect(prefilled).toContain('quality_spec_id')
    // Free-text quality_name is still set as before.
    expect(patch.quality_name).toBe('NY 2/3 17/18 FC')
  })

  it('does not set quality_spec_id when there is no confident match', () => {
    const c = baseContract({ quality_description: 'NY 2/3 17/18 FC' })
    const { patch, prefilled } = mapContractToFormData(c, baseResolution)
    expect(patch.quality_spec_id).toBeUndefined()
    expect(prefilled).not.toContain('quality_spec_id')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/contract-intake-mapping.test.ts`
Expected: FAIL — TypeScript/assertion error: `resolved_quality_spec_id`/`quality_match` not on `ContractResolution`, and `patch.quality_spec_id` is undefined in the first case.

- [ ] **Step 3: Extend the interface**

In `src/lib/contract-intake-mapping.ts`, add the import near the top (after line 7):

```ts
import type { QualityMatch } from '@/lib/quality-matching'
```

Replace the `ContractResolution` interface (lines 40-48) with:

```ts
export interface ContractResolution {
  resolved_client_id: string | null         // clients.id where company_id = contract.buyer_id
  importer_is_qc_client: boolean            // mirrors resolved client's is_qc_client
  resolved_importer_id: string | null       // importers.id matching buyer fantasy_name
  candidate_seller_exporter_ids: string[]   // exporters whose name matches the seller
  candidate_shipper_exporter_ids: string[]  // exporters whose name matches the shipper
  multiple_seller_matches: boolean
  multiple_shipper_matches: boolean
  resolved_quality_spec_id: string | null   // client_qualities.id of a high-confidence quality match, else null
  quality_match: QualityMatch | null         // full match detail for the UI hint (null when not computed)
}
```

- [ ] **Step 4: Set quality_spec_id in the mapper**

In `mapContractToFormData`, replace the Quality block (line 175):

```ts
  // Quality
  if (c.quality_description) set('quality_name', c.quality_description)
```

with:

```ts
  // Quality — keep the free-text label, and additionally pin the structured spec
  // when the server resolver found a confident match (so the dropdown preselects).
  if (c.quality_description) set('quality_name', c.quality_description)
  if (resolution.resolved_quality_spec_id) {
    set('quality_spec_id', resolution.resolved_quality_spec_id)
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/contract-intake-mapping.test.ts`
Expected: PASS — all existing cases plus the two new ones green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contract-intake-mapping.ts src/lib/contract-intake-mapping.test.ts
git commit -m "feat(intake): carry resolved_quality_spec_id through the contract mapper"
```

---

## Task 3: Resolve the match in the contract route

**Files:**
- Modify: `src/app/api/contracts/[id]/route.ts` (import at `:9`, fetch + build at `:154-213`)

- [ ] **Step 1: Add the matcher import**

In `src/app/api/contracts/[id]/route.ts`, change the import on line 9 to also pull the matcher:

```ts
import type { ContractWithParties, ContractResolution } from '@/lib/contract-intake-mapping'
import { matchQuality, type QualitySpecCandidate } from '@/lib/quality-matching'
```

- [ ] **Step 2: Fetch client_qualities and run the matcher**

In `src/app/api/contracts/[id]/route.ts`, immediately after the line:

```ts
    const importer_is_qc_client: boolean = !!clientData?.is_qc_client
```

(line 155) insert:

```ts
    // Quality auto-fill — only when a QC client resolved AND the contract carries a
    // free-text quality. Fetch that client's active specs and run the conservative
    // matcher. A 'high' confidence result pins the dropdown; anything else stays
    // manual (the free-text quality_name still flows through as before).
    let resolved_quality_spec_id: string | null = null
    let quality_match: ContractResolution['quality_match'] = null
    if (resolved_client_id && c.quality_description) {
      const { data: specRows, error: specErr } = await (supabase as any)
        .from('client_qualities')
        .select('id, custom_name, quality_code, template:quality_templates(name)')
        .eq('client_id', resolved_client_id)
        .eq('is_active', true)
      if (specErr) {
        console.warn('[contracts/[id]] could not load client_qualities for quality match:', specErr.message)
      }
      const candidates: QualitySpecCandidate[] = (specRows || []).map((r: any) => ({
        id: r.id,
        custom_name: r.custom_name ?? null,
        quality_code: r.quality_code ?? null,
        template_name: r.template?.name ?? null,
      }))
      quality_match = matchQuality(c.quality_description, candidates)
      resolved_quality_spec_id = quality_match.confidence === 'high' ? quality_match.spec_id : null
      if (quality_match.confidence !== 'high') {
        // Observability for tuning the abbreviation dict — logs the misses only.
        console.debug('[contracts/[id]] quality match not high:', {
          source: c.quality_description, confidence: quality_match.confidence, specs: candidates.length,
        })
      }
    }
```

- [ ] **Step 3: Add the new fields to the resolution payload**

In the same file, replace the `resolution` object literal (lines 205-213) with:

```ts
    const resolution: ContractResolution = {
      resolved_client_id,
      importer_is_qc_client,
      resolved_importer_id,
      candidate_seller_exporter_ids,
      candidate_shipper_exporter_ids,
      multiple_seller_matches: candidate_seller_exporter_ids.length > 1,
      multiple_shipper_matches: candidate_shipper_exporter_ids.length > 1,
      resolved_quality_spec_id,
      quality_match,
    }
```

- [ ] **Step 4: Verify the route typechecks**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). If the Supabase `template:quality_templates(name)` join trips the loose `any` typing, the cast `(supabase as any)` already covers it (matches the existing query style in this file).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/contracts/[id]/route.ts
git commit -m "feat(intake): resolve contract quality -> client spec server-side"
```

---

## Task 4: Carry the match into the form's contract_resolution

**Files:**
- Modify: `src/components/samples/intake/types.ts:110-116` (shape)
- Modify: `src/components/samples/intake/contract-search-step.tsx:125-131` (populate)

- [ ] **Step 1: Extend the client-side contract_resolution shape**

In `src/components/samples/intake/types.ts`, add the import at the top (after line 1):

```ts
import { Database } from '@/lib/supabase'
import type { QualityMatch } from '@/lib/quality-matching'
```

Replace the `contract_resolution` field in `FormData` (lines 110-116) with:

```ts
  contract_resolution: {
    seller_match_count: number
    shipper_match_count: number
    multiple_seller_matches: boolean
    multiple_shipper_matches: boolean
    importer_resolved: boolean   // true if a WAQC client OR importer was matched for the buyer
    quality_match: QualityMatch | null  // server-side contract->spec match, for the auto-select hint
  } | null
```

- [ ] **Step 2: Populate quality_match on select**

In `src/components/samples/intake/contract-search-step.tsx`, inside `handleSelect`, replace the `contract_resolution` object (lines 125-131) with:

```ts
        contract_resolution: {
          seller_match_count: resolution.candidate_seller_exporter_ids.length,
          shipper_match_count: resolution.candidate_shipper_exporter_ids.length,
          multiple_seller_matches: resolution.multiple_seller_matches,
          multiple_shipper_matches: resolution.multiple_shipper_matches,
          importer_resolved: resolution.resolved_client_id !== null || resolution.resolved_importer_id !== null,
          quality_match: resolution.quality_match ?? null,
        },
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/samples/intake/types.ts src/components/samples/intake/contract-search-step.tsx
git commit -m "feat(intake): thread quality_match into form contract_resolution"
```

---

## Task 5: The auto-select hint in the Quality step

**Files:**
- Modify: `src/components/samples/intake/quality-step.tsx` (compute flag near `:273`, render near `:558`)

- [ ] **Step 1: Compute the hint condition**

In `src/components/samples/intake/quality-step.tsx`, just before the `return (` (line 273), add:

```ts
  // Show a muted hint while the dropdown still holds the server-auto-selected spec.
  // It disappears the moment the lab changes the dropdown, because updateFormData
  // drops quality_spec_id from contract_prefilled_fields on edit.
  const qualityMatch = formData.contract_resolution?.quality_match
  const showQualityHint =
    qualityMatch?.confidence === 'high' &&
    !!qualityMatch.spec_id &&
    formData.quality_spec_id === qualityMatch.spec_id &&
    (formData.contract_prefilled_fields?.includes('quality_spec_id') ?? false)
```

- [ ] **Step 2: Render the hint under the dropdown**

In the Quality Specification block, the `<Select>` for qualities is wrapped in:

```tsx
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Quality Specification {(formData.sample_type === 'pss' || formData.sample_type === 'ss') && '*'}</Label>
          {loadingQualities ? (
```

Find the matching closing of that `<div>` — it is the `</div>` on line 558 (immediately before the comment `{/* Hide exporter checkbox ... */}`). Insert the hint just before that closing `</div>`, i.e. after the final `)}` of the `loadingQualities ? ... : ...` ternary:

```tsx
          )}
          {showQualityHint && (
            <p className="text-[11px] text-muted-foreground mt-1 max-w-[200px] leading-snug">
              Auto-selected from contract quality &ldquo;{qualityMatch!.source_text}&rdquo; — change if needed.
            </p>
          )}
        </div>
```

(The single new lines are the `{showQualityHint && (...)}` paragraph; the surrounding `)}` and `</div>` already exist — insert the paragraph between them.)

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/samples/intake/quality-step.tsx
git commit -m "feat(intake): hint when quality spec is auto-selected from a contract"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all suites green, including the two new/updated files.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 3: Manual smoke test (dev server)**

Run: `npm run dev`, open the sample intake, Step 1 (Contract Search):
1. Link contract **42250/26** (`"NY 2/3 17/18 FC"`, Floriana). Advance to the Quality step → the Quality Specification dropdown shows **`17/18 FC`** preselected with the muted hint *"Auto-selected from contract quality '…' — change if needed."*
2. Change the dropdown to another value → the hint disappears and the value sticks.
3. Link a contract whose quality is a **14/16** screen with only 17/18 specs available → dropdown stays empty (no mis-select), no hint.
4. Unlink the contract → `quality_spec_id` resets (it was prefilled), dropdown clears.

Expected: all four behaviours as described. Record results.

- [ ] **Step 4: Final commit / push (only if user asks)**

```bash
git push
```

---

## Self-Review

**Spec coverage:**
- Server-side resolver in `/api/contracts/[id]` → Task 3. ✓
- Pure `matchQuality` + normalization + abbreviation dict, unit-tested → Task 1. ✓
- `ContractResolution` gains `resolved_quality_spec_id` + `quality_match` → Task 2. ✓
- `mapContractToFormData` sets `quality_spec_id` + adds to `prefilled` → Task 2. ✓
- Conservative decision (screen disqualify, unique top high, under-match beats mis-match) → Task 1 matcher + tests. ✓
- Hint UX (show on high, clears on change) → Task 5. ✓
- Edge cases: null client (no fetch → `quality_match: null`), zero specs (`none`), null `quality_description` (no fetch), screen disqualify, re-link (prefill mechanism), override (updateFormData drops the prefilled key) → covered by Task 3 gate + Task 1 tests + existing prefill plumbing. ✓
- No schema change, QC flow only, no persistent cross-ref → respected (pure code, contract route only). ✓

**Placeholder scan:** none — every code step has complete code.

**Type consistency:** `QualitySpecCandidate` / `QualityMatch` defined in `quality-matching.ts` (Task 1) and imported by `contract-intake-mapping.ts` (Task 2), the route (Task 3), and `types.ts` (Task 4). `matchQuality(contractText, specs)` signature is identical at definition (Task 1) and call site (Task 3). `resolved_quality_spec_id` / `quality_match` field names match across interface, route literal, mapper, and tests.

**Note on file size:** all touched files stay well under the 2000-line guideline; `quality-matching.ts` is a new ~150-line module.

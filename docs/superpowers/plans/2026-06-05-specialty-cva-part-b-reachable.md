# Specialty CVA — Part B: Make the Journey Reachable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the one remaining gap in CVA Phase 1 — there is currently **no way to create a CVA quality or reach the journey through the app** — so a cupper can create a specialty (CVA) quality, route a sample to it, open the immersive CVA journey from the nav, score it, and have it round-trip through autosave end-to-end.

**Architecture:** Phase 0 + Phase 1 are already **built, committed, and tested** on this branch (`feat/approval-send-view`, 12 commits `54bfa0a`→`4ca4597`, 82/82 vitest green). This plan adds **Part B** from the prior plan ([2026-06-02-specialty-cva-cupping-phase1.md](2026-06-02-specialty-cva-cupping-phase1.md)), which was never implemented: (1) confirm/apply the two CVA migrations, (2) teach the `quality-templates` API to accept the 3 new columns, (3) add the methodology / min-score / requires-notes fields to the full-screen quality editor, (4) add a discoverable nav entry to `/cupping/cva`, (5) seed + verify a full end-to-end run. `methodology` MUST be a top-level column on `quality_templates` (the eligible route filters `.eq('methodology','cva')`), not inside the `parameters` JSONB.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Shadcn `Select`/`Input`/`Label`/`Switch` (already imported in the editor) · Supabase (anon client for reads/auth, service-role for writes) · Vitest. No new dependencies.

---

## Resolved decisions (locked 2026-06-02, re-confirmed 2026-06-05 — do NOT reopen)

| # | Question | Decision (already in the committed data model) |
|---|---|---|
| 1 | Methodology flag | `quality_templates.methodology` (`commodity`\|`cva`); sample inherits via `quality_spec → template`; mirrored as `session_type='cva'` on the session |
| 2 | Pass threshold | **Per-quality** `quality_templates.cva_min_score` (default 84) |
| 3 | Intensity granularity | **7 per-section intensities + 3 CATA boxes** (strict SCA-103) — locked in `CvaDescribe` |
| 4 | AI model / language | Phase 5: latest Claude Sonnet, cached; default language English (switch PT/ES/EN) |
| 5 | Voice | Web Speech now, server transcription later (Phase 3) |
| 6 | Multi-cupper | Master-cupper divergence resolution, Phase 4 |

---

## What already exists (do NOT rebuild — verified present + tested)

- `src/lib/cva/{scoring.ts,scoring.test.ts,sections.ts}`, `src/types/cva.ts` (full payload incl. `describe`/`cups`/`highlights` shapes locked).
- `src/components/cupping/cva/{CvaJourney,ImpressionScale(+test),RoastStep,SectionScreen,ProgressPath,LiveScore,ScoreSummary}.tsx`.
- `src/hooks/useCvaAssessment.ts` (debounced, race-safe serialized autosave).
- `src/app/cupping/cva/page.tsx` (eligible-samples index) + `[sessionId]/page.tsx` (journey host).
- `src/app/api/cupping/cva/{eligible,session,[id]}/route.ts` (server-side score re-verify on PUT).
- Migration **files**: `database/migrations/20260602110000_cva_session_type_enum.sql` + `20260602110001_cva_quality_and_cupping.sql` (apply status confirmed in Task 1).

---

## File map (Part B)

```
VERIFY/APPLY (Daniel pastes & applies — standing prefs):
  database/migrations/20260602110000_cva_session_type_enum.sql      (already written)
  database/migrations/20260602110001_cva_quality_and_cupping.sql    (already written)

MODIFY:
  src/app/api/quality-templates/route.ts                  POST: accept methodology/cva_min_score/requires_descriptors
  src/app/api/quality-templates/[id]/route.ts             PATCH: allowedFields += 3
  src/components/quality/spec-editor/quality-spec-editor.tsx   Template type + state + BasicInformation fields + save payload
  src/components/layout/left-sidebar.tsx                   nav entry → /cupping/cva
```

No automated tests are added in Part B (it is UI + API wiring with no new pure logic). It is verified by `npm run build`, the existing `npm run test:run` (must stay 82/82 green), a manual create + DB read, and a full browser E2E run (Task 6).

---

## Task 1: Confirm (and if needed apply) the two CVA migrations

**Files:**
- `database/migrations/20260602110000_cva_session_type_enum.sql` (already written — enum)
- `database/migrations/20260602110001_cva_quality_and_cupping.sql` (already written — columns)

> Per Daniel's standing prefs ("I prefer pasting the SQL", "I will always apply migrations"), the agent hands SQL to Daniel and waits — it does NOT run psql / supabase db push. This task gates everything else: until the columns + enum value exist, the editor save and the eligible/save routes will error against the live DB.

- [ ] **Step 1: Ask Daniel to run the read-only check and paste the result**

```sql
-- 1) The 5 new columns
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE (table_name = 'quality_templates' AND column_name IN ('methodology','cva_min_score','requires_descriptors'))
   OR (table_name = 'cupping_scores'   AND column_name IN ('protocol','cva_score'))
ORDER BY table_name, column_name;

-- 2) The enum value
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'session_type'::regtype AND enumlabel = 'cva';
```

Expected when applied: 5 column rows + 1 enum row (`cva`).

- [ ] **Step 2: If the check returns fewer than 5 columns or no enum row, hand Daniel the apply SQL — enum FIRST, columns SECOND**

`ALTER TYPE ... ADD VALUE` must commit before the value is usable, so it is a separate file and a separate paste. File 1 (`20260602110000_cva_session_type_enum.sql`):

```sql
ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'cva';
```

Then file 2 (`20260602110001_cva_quality_and_cupping.sql`) — exactly as already written in the repo:

```sql
ALTER TABLE quality_templates
  ADD COLUMN IF NOT EXISTS methodology text NOT NULL DEFAULT 'commodity',
  ADD COLUMN IF NOT EXISTS cva_min_score numeric(5,2) DEFAULT 84,
  ADD COLUMN IF NOT EXISTS requires_descriptors boolean NOT NULL DEFAULT false;

ALTER TABLE quality_templates DROP CONSTRAINT IF EXISTS quality_templates_methodology_check;
ALTER TABLE quality_templates ADD CONSTRAINT quality_templates_methodology_check
  CHECK (methodology IN ('commodity', 'cva'));

ALTER TABLE cupping_scores
  ADD COLUMN IF NOT EXISTS protocol text,
  ADD COLUMN IF NOT EXISTS cva_score numeric(5,2);
```

- [ ] **Step 3: Re-run the Step 1 check; do not proceed past this task until it returns 5 columns + the enum row.**

---

## Task 2: `quality-templates` API accepts the 3 new columns

**Files:**
- Modify: `src/app/api/quality-templates/route.ts` (POST — after the `templateData` object literal ends at line 169)
- Modify: `src/app/api/quality-templates/[id]/route.ts` (PATCH — `allowedFields` array, lines 99–117)

The POST builds `const templateData: QualityTemplateInsert = { … }` (lines 131–169) and inserts via `(supabase as any).from('quality_templates').insert(templateData)` (line 172). Adding the keys *inside* the typed object literal would trip the excess-property check until `database.types.ts` is regenerated, so set them **after** construction with a cast — no type regen required.

- [ ] **Step 1: POST — set the 3 columns after the `templateData` literal**

In `src/app/api/quality-templates/route.ts`, immediately after the closing `}` of the `templateData` object (line 169) and before the `// Insert template` comment (line 171), add:

```ts
    // CVA methodology routing (top-level columns — eligible route filters on these)
    ;(templateData as any).methodology = body.methodology === 'cva' ? 'cva' : 'commodity'
    ;(templateData as any).cva_min_score = body.methodology === 'cva' ? (body.cva_min_score ?? 84) : null
    ;(templateData as any).requires_descriptors = body.methodology === 'cva' ? !!body.requires_descriptors : false
```

- [ ] **Step 2: PATCH — allow updating the 3 columns**

In `src/app/api/quality-templates/[id]/route.ts`, inside the `allowedFields` array, change the final line (line 116) from:

```ts
      'name', 'description', 'parameters', 'is_active'
```

to:

```ts
      'name', 'description', 'parameters', 'is_active',
      // CVA methodology routing
      'methodology', 'cva_min_score', 'requires_descriptors',
```

The existing loop (`updateData[field as keyof QualityTemplateUpdate] = body[field]`, lines 119–123) already casts the key, so no further type change is needed.

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: compiles with no new type errors from these two files. (If the loop's assignment complains, it is already cast — confirm the `as any` on the POST `templateData` assignments.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/quality-templates/route.ts "src/app/api/quality-templates/[id]/route.ts"
git commit -m "feat(quality): API accepts methodology/cva_min_score/requires_descriptors"
```

---

## Task 3: Methodology fields in the quality editor

**Files:**
- Modify: `src/components/quality/spec-editor/quality-spec-editor.tsx`

Four edits: extend the `Template` type, add state, render the controls inside `BasicInformation` using the Shadcn components already imported, and include the columns in the save `payload`.

- [ ] **Step 1: Extend the `Template` interface**

In the `Template` interface, after `assigned_laboratories?: string[]` (line 55), add:

```ts
  methodology?: 'commodity' | 'cva'
  cva_min_score?: number | null
  requires_descriptors?: boolean
```

- [ ] **Step 2: Add editor state**

After the `sharing` state initializer (the `useState<Sharing>(…)` block ending at line 127), add:

```tsx
  const [methodology, setMethodology] = useState<'commodity' | 'cva'>(
    (template?.methodology === 'cva' ? 'cva' : 'commodity')
  )
  const [cvaMinScore, setCvaMinScore] = useState<string>(
    template?.cva_min_score != null ? String(template.cva_min_score) : '84'
  )
  const [requiresDescriptors, setRequiresDescriptors] = useState<boolean>(
    !!template?.requires_descriptors
  )
```

- [ ] **Step 3: Pass the new props into `<BasicInformation>`**

In the `active === 'basic'` branch (the `<BasicInformation … />` element, lines 335–345), add these props alongside `sharing`/`setSharing`:

```tsx
                  methodology={methodology} setMethodology={setMethodology}
                  cvaMinScore={cvaMinScore} setCvaMinScore={setCvaMinScore}
                  requiresDescriptors={requiresDescriptors} setRequiresDescriptors={setRequiresDescriptors}
```

- [ ] **Step 4: Extend the `BasicInformation` props signature**

In the `BasicInformation` function's props type (lines 377–385), after `sharing: Sharing; setSharing: (v: Sharing) => void`, add:

```tsx
  methodology: 'commodity' | 'cva'; setMethodology: (v: 'commodity' | 'cva') => void
  cvaMinScore: string; setCvaMinScore: (v: string) => void
  requiresDescriptors: boolean; setRequiresDescriptors: (v: boolean) => void
```

- [ ] **Step 5: Render the methodology controls**

In `BasicInformation`, after the "Template sharing" block (the `</div>` closing the sharing field at line 457) and before the card's final `</div>` (line 458), add:

```tsx
      <div className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label>Grading methodology</Label>
          <Select value={props.methodology} onValueChange={(v) => props.setMethodology(v as 'commodity' | 'cva')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="commodity">Commodity — standard cupping grid</SelectItem>
              <SelectItem value="cva">Specialty — SCA CVA 2024</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Specialty qualities open the immersive CVA tasting journey and score 0–100 on the SCA 2024 standard.
          </p>
        </div>

        {props.methodology === 'cva' && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="space-y-2">
              <Label htmlFor="cva-min">Minimum CVA score to pass</Label>
              <Input id="cva-min" type="number" min={0} max={100} step={0.25} className="w-32"
                value={props.cvaMinScore} onChange={(e) => props.setCvaMinScore(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                e.g. 82 or 84. SCA defines no pass mark — this is the Wolthers/contract threshold.
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
              <Switch checked={props.requiresDescriptors} onCheckedChange={props.setRequiresDescriptors} />
              Require flavor notes (descriptive CATA) before this quality can pass
            </label>
          </div>
        )}
      </div>
```

- [ ] **Step 6: Include the columns in the save payload**

In `handleSave`, inside the `payload` object (after `assigned_laboratories: …` at line 218), add:

```tsx
        methodology,
        cva_min_score: methodology === 'cva' ? (parseFloat(cvaMinScore) || 84) : null,
        requires_descriptors: methodology === 'cva' ? requiresDescriptors : false,
```

- [ ] **Step 7: Verify it compiles**

Run: `npm run build`
Expected: compiles with no new type errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/quality/spec-editor/quality-spec-editor.tsx
git commit -m "feat(quality): editor — create specialty (CVA) quality (methodology, min score, requires-notes)"
```

---

## Task 4: Discoverable nav entry to the CVA journey

**Files:**
- Modify: `src/components/layout/left-sidebar.tsx`

`/cupping/cva` is currently unlinked. Add a sibling top-level item right after Cupping. This preserves the existing Cupping link behavior exactly. `CuppingBowl` is already imported (line 38).

- [ ] **Step 1: Add the nav item**

In `getNavigation`, immediately after the Cupping item object (the one ending at line 129, `permission: 'conduct_assessments',` then `},`), insert:

```tsx
  {
    title: 'Specialty (CVA)',
    href: '/cupping/cva',
    icon: CuppingBowl,
    permission: 'conduct_assessments',
  },
```

- [ ] **Step 2: Verify it compiles + renders**

Run: `npm run build`
Expected: compiles. (Manual confirm in Task 6: the "Specialty (CVA)" item appears under Cupping in the sidebar and navigates to `/cupping/cva`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/left-sidebar.tsx
git commit -m "feat(cva): sidebar entry — Specialty (CVA) → /cupping/cva"
```

---

## Task 5: Seed a CVA quality + sample for end-to-end testing

**Files:** none (UI + SQL).

- [ ] **Step 1: Create a CVA quality through the UI**

`npm run dev` → `/quality/templates` → New. In **Basic information**, set **Grading methodology = Specialty — SCA CVA 2024**; min score 84; leave "Require flavor notes" off (it is enforced in Phase 2/4). Name it `CVA Test 84`. Save.

- [ ] **Step 2: Confirm the row (Daniel runs)**

```sql
SELECT id, name_en, methodology, cva_min_score, requires_descriptors
FROM quality_templates WHERE methodology = 'cva' ORDER BY created_at DESC LIMIT 5;
```

Expected: the new row with `methodology='cva'`, `cva_min_score=84.00`, `requires_descriptors=false`.

- [ ] **Step 3: Make a sample eligible**

The eligible route resolves: `quality_templates(methodology='cva')` → `client_qualities(template_id IN …)` → `samples(quality_spec_id IN client_quality_ids)`. Assign the CVA quality to a client via the normal client-quality UI (creating a `client_qualities` row), intake/point a sample at it. SQL fallback to point an existing test sample (replace both IDs):

```sql
-- 1) find a CVA client_quality id
SELECT cq.id AS client_quality_id, qt.name_en, qt.methodology
FROM client_qualities cq JOIN quality_templates qt ON qt.id = cq.template_id
WHERE qt.methodology = 'cva';

-- 2) point a test sample at it (replace both IDs)
-- UPDATE samples SET quality_spec_id = '<client_quality_id>' WHERE tracking_number = '<TEST-TRACKING>';
```

> If `/cupping/cva` shows no samples despite correct data, the cause is almost always RLS on the anon read in `eligible/route.ts` (quality_templates / client_qualities / samples). Confirm the cupper role can SELECT those before changing app code.

---

## Task 6: Full end-to-end verification & wrap-up

- [ ] **Step 1: Tests stay green**

Run: `npm run test:run`
Expected: PASS — 82/82 (77 scoring + 5 ImpressionScale). Part B adds no tests but must not break these.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compiles clean.

- [ ] **Step 3: Manual E2E (the real proof)**

With `npm run dev`:
1. Sidebar → **Specialty (CVA)** → `/cupping/cva` → the seeded sample appears → **Start CVA**.
2. **Roast:** tap Medium, type Agtron 63.
3. **Fragrance:** click block 8 → it springs and auto-advances to Aroma; the numeric field shows 8.
4. Rate all 8 sections. On one, tick **"Changed as it cooled?"** and click a different block → arrow draws initial→final; confirm the **final** value is what feeds the score.
5. Header **LiveScore**: all 8 = 8 → Σ64 → **94.75** (cross-check the two-way table).
6. Tap a **progress-path** step to jump back; confirm the value persisted.
7. **Score** step shows the summary + per-section grid.
8. Toggle app theme (light/dark) — contrast + accents hold.
9. **Reload** the page → values reload from autosave (proves the `cupping_scores` round-trip).

- [ ] **Step 4: Confirm the DB round-trip (Daniel runs)**

```sql
SELECT cupper_id, protocol, cva_score, jsonb_pretty(scores) AS payload
FROM cupping_scores WHERE protocol = 'cva' ORDER BY updated_at DESC LIMIT 1;
```

Expected: `protocol='cva'`, `cva_score` matching the on-screen score, full CVA payload in `scores`.

- [ ] **Step 5: Wrap-up**

If a migration was applied in Task 1, optionally regenerate types to drop the `as any` casts added in Task 2:

```bash
npx supabase gen types typescript --project-id ojyonxplpmhvcgaycznc > src/lib/database.types.ts
```

Then use `superpowers:finishing-a-development-branch` to decide merge/PR. Note: this branch (`feat/approval-send-view`) also carries unrelated approval/cert work — coordinate the CVA commits accordingly (the Phase 1 + Part B CVA commits are self-contained under `src/**/cva*`, `src/types/cva.ts`, `src/hooks/useCvaAssessment.ts`, the two API/editor/sidebar edits, and `database/migrations/2026060211000*`).

---

## Self-review (against the chosen scope)

- **Make a CVA quality creatable** — editor methodology/min-score/requires-notes fields + API POST/PATCH columns. ✓ (Tasks 2, 3)
- **Top-level `methodology` column** (not params) so `eligible` filters work — set on the API insert/update, read by the editor as a top-level field. ✓
- **Reachable** — sidebar entry → `/cupping/cva` (existing index → session → journey). ✓ (Task 4)
- **Routed sample → journey end-to-end + autosave round-trip** — seed + browser E2E + DB read. ✓ (Tasks 5, 6)
- **Migrations gating** — verify-then-apply, Daniel pastes. ✓ (Task 1)
- **No rebuild of Phase 0/1** — Part B only touches the quality API, editor, and sidebar; the committed CVA code + 82 tests are left intact and must stay green. ✓
- **Type safety without forcing a regen** — POST sets columns via post-construction cast; PATCH loop already casts the key; editor `payload` is `any`. ✓
- **Out of scope (intentional):** routing the *main* Cup action by methodology (samples list / home button still go to commodity `/cupping`); enforcing `requires_descriptors`; the Describe layer, cups step, finalize/pass-fail, Coffee Profile/AI — all later phases.
```

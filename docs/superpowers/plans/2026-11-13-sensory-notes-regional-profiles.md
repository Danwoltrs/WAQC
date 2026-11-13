# Sensory notes + regional profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commodity client qualities can switch on flavor-wheel sensory notes and a regional profile; each cupper picks notes and answers "matches profile" on their card, the validator merges and freezes the panel result, and the certificate prints a 90 pt wheel, the notes and the profile line.

**Architecture:** Two keys in the quality's `parameters` (versioned by the existing spec-version machinery and read through `resolveSampleSpec`). A shared `regional_profiles` table. Per-cupper picks in `cupping_scores.sensory`; the frozen panel result in `quality_assessments.sensory_resolution`. One pure library (`src/lib/sensory/`) holds every rule (sanitizing, merging, freezing, parsing); routes and screens only call it. The wheel UI reuses the CVA `FlavorWheel`; the PDF reuses `CertificateFlavorWheel`.

**Tech Stack:** Next.js 15 / React 19, Supabase (Postgres + RLS), @react-pdf/renderer, Vitest + Testing Library (`npm run test:run`), Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-13-sensory-notes-regional-profiles-design.md`

**Workspace:** worktree `../WAQC-sensory`, branch `feat/sensory-profiles`, cut from `origin/main` a085bb6f.

## Global Constraints

- A "No" (or any sensory data) never changes approval, compliance, "approved with comments", or the sys write-back.
- Certificates of lots with no `sensory_resolution` render exactly as today.
- Notes never go into `cupping_scores.scores` (attribute rails) — only into `cupping_scores.sensory`.
- Never show `samples.tracking_number` (SAN-…) anywhere: UI, PDF, emails, toasts, logs written for people.
- No emojis in UI. No mock data. No seeded profiles.
- Files stay under ~2,000 lines (2,200 hard ceiling). `src/app/cupping/page.tsx` is 2,176 today and is split in Task 7 before anything is added.
- Every reader of a lot's spec goes through `resolveSampleSpec(s)` (`src/lib/quality-spec/no-live-spec-reads.test.ts` must stay green).
- Caps: profile 6 notes; cupper 5 picks; frozen result 6 notes.
- Default for both settings is off; a new private copy made from a source without edits starts with both off.
- Specialty (`methodology = 'cva'`) qualities: no Sensory page, no sensory row, no sensory section.
- SQL is written to a migration file and pasted to Daniel in the final message; Daniel applies it. Code must fail soft (no crash, no sensory UI) when the columns/table do not exist yet.
- Charcoal text on the certificate; "Does not match" is not red.
- Commit to the feature branch per task; push to `main` only after Daniel confirms the SQL is applied.

## Review Focus

1. **Quality toggled off (or profile removed) after cuppers picked notes** — the validation section hides, finalize writes no `sensory_resolution`, the certificate prints nothing. Pinned in Task 9.
2. **Profile changed on the quality between cupping and validation** — cupper answers given for a different `profile_id` are ignored in the majority; the snapshot is taken from the profile row at finalize. Pinned in Task 2 (`mergePanelSensory`) and Task 9.
3. **Re-validating a lot** (cupping finished before grading, validated twice) — the modal restores the stored `sensory_resolution` rather than recomputing the majority. Pinned in Task 9.
4. **Tampered or stale picks** (paths not on the wheel, duplicates, more than the cap) — dropped/trimmed server-side by `sanitizePicks` on every write. Pinned in Task 2 and Task 8.
5. **Paper-card and anonymised rows** — rows with `sensory = null` are not counted in the "half of the cuppers who gave notes" denominator; the modal keys rows by `score_id`, never by `cupper_id` (the aggregate route nulls other cuppers' ids). Pinned in Task 2 and Task 9.

---

### Task 1: SQL migration

**Files:**
- Create: `database/migrations/20261113000000_sensory_notes_regional_profiles.sql`

**Interfaces:**
- Produces: table `public.regional_profiles(id uuid pk default gen_random_uuid(), name text not null, origin text, region text, notes jsonb not null default '[]', description text, is_active boolean not null default true, created_by uuid references auth.users, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`; column `public.cupping_scores.sensory jsonb` (nullable); column `public.quality_assessments.sensory_resolution jsonb` (nullable).

- [ ] **Step 1: Write the migration.** One `BEGIN; … COMMIT;` block: `CREATE TABLE IF NOT EXISTS regional_profiles`, unique index on `lower(name)`, `CHECK (jsonb_typeof(notes) = 'array')`, `ALTER TABLE regional_profiles ENABLE ROW LEVEL SECURITY`, policies `regional_profiles_staff_select` (FOR SELECT TO authenticated USING `(SELECT public.waqc_is_staff())`) and `regional_profiles_staff_write` (FOR ALL … USING and WITH CHECK the same), an `updated_at` trigger only if the repo already has a shared `set_updated_at()` function (grep `database/migrations` first; otherwise the API sets it), `ALTER TABLE cupping_scores ADD COLUMN IF NOT EXISTS sensory jsonb`, `ALTER TABLE quality_assessments ADD COLUMN IF NOT EXISTS sensory_resolution jsonb`, `COMMENT ON` each. Follow `20261111000001_client_quality_versions.sql` for style. Use no `SELECT … INTO` (the Supabase editor appends ENABLE RLS and breaks it).
- [ ] **Step 2: Append verification SELECTs as comments** at the end of the file: table exists with 0 rows, both columns exist (`information_schema.columns`), policies listed from `pg_policies`.
- [ ] **Step 3: Commit**

```bash
git add database/migrations/20261113000000_sensory_notes_regional_profiles.sql
git commit -m "feat(sensory): migration for regional profiles, per-cupper sensory, frozen sensory resolution"
```

---

### Task 2: Sensory rules library

**Files:**
- Create: `src/lib/sensory/types.ts`, `src/lib/sensory/settings.ts`, `src/lib/sensory/picks.ts`, `src/lib/sensory/merge.ts`, `src/lib/sensory/resolution.ts`, `src/lib/sensory/index.ts`
- Test: `src/lib/sensory/settings.test.ts`, `picks.test.ts`, `merge.test.ts`, `resolution.test.ts`

**Interfaces:**
- Produces (exact):
  ```ts
  // types.ts
  export const PROFILE_NOTE_CAP = 6
  export const CUPPER_PICK_CAP = 5
  export const RESOLVED_NOTE_CAP = 6
  export interface RegionalProfile { id: string; name: string; origin: string | null; region: string | null; notes: string[][]; description: string | null; is_active: boolean }
  export interface QualitySensorySettings { notesEnabled: boolean; profile: { id: string; name: string } | null }
  export interface CupperSensory { picks: string[][]; profile_id: string | null; profile_match: boolean | null }
  export interface SensoryResolution {
    version: 1
    notes: string[][]
    profile: { id: string; name: string; region: string | null; notes: string[][]; description: string | null; match: boolean } | null
    resolved_by: string | null; resolved_at: string; source: 'validation' | 'certificate_editor'
  }
  export interface PanelSensoryRow { score_id: string; cupper_id: string | null; sensory: CupperSensory | null }
  // settings.ts
  export function readSensorySettings(customParameters: unknown, templateParameters: unknown, methodology?: string | null): QualitySensorySettings
  export function stripSensorySettings<T extends Record<string, unknown>>(parameters: T): T
  // picks.ts
  export function isWheelPath(path: unknown): path is string[]
  export function sanitizePicks(raw: unknown, cap: number): string[][]
  export function leafTerm(path: string[]): string
  export function parseCupperSensory(raw: unknown): CupperSensory | null
  // merge.ts
  export function mergePanelSensory(input: {
    rows: PanelSensoryRow[]; excludedScoreIds: readonly string[]; sourceScoreId: string | null; profileId: string | null
  }): { notes: string[][]; counts: Record<string, number>; match: boolean | null; contributors: number }
  // resolution.ts
  export function buildSensoryResolution(input: {
    notes: unknown; profile: RegionalProfile | null; match: boolean | null
    resolvedBy: string | null; resolvedAt: string; source: SensoryResolution['source']
  }): { ok: true; value: SensoryResolution } | { ok: false; error: 'profile_answer_required' }
  export function parseSensoryResolution(raw: unknown): SensoryResolution | null
  ```

- [ ] **Step 1: Write the failing tests.** Key assertions (wheel paths from `src/lib/cva/flavor-wheel-data.ts` `NODES`):

```ts
// settings.test.ts
expect(readSensorySettings({}, {})).toEqual({ notesEnabled: false, profile: null })
expect(readSensorySettings({ sensory_notes_enabled: true }, { sensory_notes_enabled: false }).notesEnabled).toBe(true) // custom wins
expect(readSensorySettings(null, { sensory_notes_enabled: true, regional_profile: { id: 'p1', name: 'Cerrado Mineiro' } }))
  .toEqual({ notesEnabled: true, profile: { id: 'p1', name: 'Cerrado Mineiro' } })
expect(readSensorySettings(null, { sensory_notes_enabled: true, regional_profile: { id: 'p1', name: 'X' } }, 'cva'))
  .toEqual({ notesEnabled: false, profile: null })
expect(readSensorySettings(null, { regional_profile: { id: '', name: 'X' } }).profile).toBeNull()
expect(stripSensorySettings({ a: 1, sensory_notes_enabled: true, regional_profile: { id: 'p', name: 'n' } })).toEqual({ a: 1 })

// picks.test.ts
expect(sanitizePicks([['Nutty/Cocoa','Cocoa','Chocolate'], ['Not','A','Path'], ['Nutty/Cocoa','Cocoa','Chocolate'], 'x'], 5))
  .toEqual([['Nutty/Cocoa','Cocoa','Chocolate']])
expect(sanitizePicks(sixValidPaths, 5)).toHaveLength(5) // keeps the first five
expect(leafTerm(['Sweet','Brown Sugar'])).toBe('Brown Sugar')
expect(parseCupperSensory({ picks: [['Sweet']], profile_id: 'p1', profile_match: 'yes' }))
  .toEqual({ picks: [['Sweet']], profile_id: 'p1', profile_match: null })

// merge.test.ts — threshold = ceil(contributors / 2), contributors = included rows with ≥1 pick
const choc = ['Nutty/Cocoa','Cocoa','Chocolate'], nut = ['Nutty/Cocoa','Nutty','Hazelnut'], car = ['Sweet','Brown Sugar','Caramelized']
// 4 contributors: choc×3, nut×2, car×1 → threshold 2
expect(merge(rows4).notes).toEqual([choc, nut])
// 1 of 1 and 1 of 2 both pass
// a null-sensory (paper) row does not raise the threshold
// an excluded score_id's picks and answer are ignored
// sourceScoreId set → notes = that row's picks, match = that row's answer (if its profile_id matches)
// answers: yes,yes,no → true; yes,no → null (tie); none → null
// an answer whose profile_id !== input.profileId is ignored
// order: count desc, then NODES index order; capped at RESOLVED_NOTE_CAP

// resolution.test.ts
expect(buildSensoryResolution({ notes: [choc], profile: cerrado, match: null, … })).toEqual({ ok: false, error: 'profile_answer_required' })
expect(buildSensoryResolution({ notes: [choc, ['bad']], profile: null, match: null, … }).value.notes).toEqual([choc])
// the profile snapshot copies name, region, notes, description from the RegionalProfile passed in
expect(parseSensoryResolution({ version: 2 })).toBeNull()
expect(parseSensoryResolution(null)).toBeNull()
```

- [ ] **Step 2: Run** `npx vitest run src/lib/sensory` — expect FAIL (modules missing).
- [ ] **Step 3: Implement.** `isWheelPath` = array of 1–3 strings whose joined key exists in `NODES` (build a `Set` of `path.join('>')` once). `readSensorySettings` reads `custom_parameters` first, then template parameters, key by key, like every other spec key; returns all-off for `'cva'`. `mergePanelSensory` keys picks by `path.join('>')`.
- [ ] **Step 4: Run** `npx vitest run src/lib/sensory` — expect PASS.
- [ ] **Step 5: Commit** `feat(sensory): rules library — settings, picks, panel merge, frozen resolution`

---

### Task 3: Sensory wheel dialog (shared picker)

**Files:**
- Create: `src/components/sensory/sensory-wheel-dialog.tsx`
- Test: `src/components/sensory/sensory-wheel-dialog.test.tsx`

**Interfaces:**
- Consumes: `FlavorWheel` (`src/components/cupping/cva/wheel/FlavorWheel.tsx`, props `picks: WheelPick[]`, `onToggle`, `active`, `refusals`, `chrome`), `sanitizePicks`, `leafTerm`.
- Produces: `export function SensoryWheelDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; title: string; value: string[][]; cap: number; onSave: (picks: string[][]) => void; readOnly?: boolean }): JSX.Element`

- [ ] **Step 1: Failing test.** Mock `FlavorWheel` to render a button per supplied path that calls `onToggle({ path })`. Assert: toggling adds/removes a chip showing `leafTerm`; a toggle beyond `cap` leaves the list unchanged and increments the `refusals` prop passed to the wheel; Save calls `onSave` with the working list; Cancel discards; `readOnly` hides Save and ignores toggles; the header shows "n of cap".
- [ ] **Step 2: Run** `npx vitest run src/components/sensory` — FAIL.
- [ ] **Step 3: Implement.** Full-screen `Dialog` below `xl`, centred large panel at `xl+` (same classes as `sample-detail-modal.tsx`). Wrap the wheel in `className="cva-root"` so its CSS tokens apply. Chips of picked terms under the title with an x to remove. Working copy local until Save.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(sensory): wheel picker dialog reusing the flavor wheel`

---

### Task 4: Regional profiles — API and list tab

**Files:**
- Create: `src/app/api/regional-profiles/route.ts` (GET, POST), `src/app/api/regional-profiles/[id]/route.ts` (PATCH), `src/components/quality/regional-profiles/regional-profiles-tab.tsx`, `src/components/quality/regional-profiles/profile-editor-dialog.tsx`
- Modify: `src/app/quality/templates/page.tsx` (add a "Templates | Regional profiles" switch in the header row)
- Test: `src/app/api/regional-profiles/route.test.ts`, `src/components/quality/regional-profiles/regional-profiles-tab.test.tsx`

**Interfaces:**
- Consumes: `SensoryWheelDialog`, `sanitizePicks`, `PROFILE_NOTE_CAP`, `RegionalProfile`; `MICRO_ORIGINS` / `/api/micro-regions?origin=` for the region picker.
- Produces: `GET /api/regional-profiles?active=true` → `{ profiles: RegionalProfile[] }` sorted by name; `POST` body `{ name, origin?, region?, notes, description? }` → `{ profile }`; `PATCH /api/regional-profiles/[id]` same fields + `is_active`. Route files export only handlers.

- [ ] **Step 1: Failing route tests.** Non-staff → 403 on POST/PATCH (use the same staff check `POST /api/quality-templates` uses); missing name → 400; notes are sanitized to `PROFILE_NOTE_CAP` valid paths; duplicate name (Postgres 23505) → 409 "A profile with this name already exists."; table missing (42P01) on GET → `{ profiles: [] }` with 200 so screens fail soft.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement routes** with `createClient` from `@/lib/supabase-server` (RLS applies).
- [ ] **Step 4: Failing tab test.** Lists name, region, notes as words, Active/Inactive; "New profile" opens the editor; editor saves name, origin, region, description and notes picked through `SensoryWheelDialog` (cap 6); deactivate toggles `is_active`.
- [ ] **Step 5: Implement tab + editor + page switch.** Table edge to edge like the templates list; green primary button; 10/6/4/0 corners per `ui-radius` conventions.
- [ ] **Step 6: Run** `npx vitest run src/app/api/regional-profiles src/components/quality/regional-profiles` — PASS.
- [ ] **Step 7: Commit** `feat(sensory): regional profiles list and API`

---

### Task 5: Quality editor Sensory page (staff) + copies start off

**Files:**
- Create: `src/components/quality/spec-editor/sections/sensory-section.tsx`
- Modify: `src/components/quality/spec-editor/spec-editor-body.tsx` (SectionId `'sensory'`, nav item in the Sensory group after `clean`, `SECTION_TITLES.sensory = 'Sensory notes & regional profile'`, heading subtitle, summary, render branch, hide the nav item when `methodology === 'cva'`), `src/lib/quality-spec/private-copy.ts` (`makePrivateCopy`: when `edits.parameters` is undefined, use `stripSensorySettings(tpl.parameters)`), `src/lib/quality-spec/spec-diff.ts` (`SECTION_OF_KEY`: both keys → `'Sensory notes & regional profile'`; a `regional_profile` change reports `before/after` as the profile names, `(none)` for null, never the id)
- Test: `sensory-section.test.tsx`, extend `private-copy.test.ts`, `spec-diff.test.ts`

**Interfaces:**
- Consumes: `readSensorySettings`, `GET /api/regional-profiles?active=true`.
- Produces: `export function SensorySection(props: { params: Record<string, any>; patch: (slice: Record<string, any>) => void; profiles: RegionalProfile[] | null; readOnlyProfiles?: boolean }): JSX.Element` — writes `sensory_notes_enabled: boolean` and `regional_profile: { id, name } | null`. When `profiles` is null it fetches them itself.

- [ ] **Step 1: Failing tests.** Section: two rows, "Sensory notes" switch (off by default) and "Regional profile" select ("None" + active profiles by name); picking shows the profile's region, notes as words and description beneath; picking "None" patches `regional_profile: null`; a profile already on the quality but now inactive still shows as selected with "(inactive)". Private copy: copying `{ sensory_notes_enabled: true, regional_profile: {...}, moisture_max: 12 }` with no edits yields `{ moisture_max: 12 }`; with `edits.parameters` supplied it is kept verbatim. Diff: `regional_profile` null → `{id:'p1',name:'Cerrado Mineiro'}` yields one change `Sensory notes & regional profile: regional_profile (none) → Cerrado Mineiro`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/components/quality/spec-editor src/lib/quality-spec` — PASS (incl. `no-live-spec-reads.test.ts`).
- [ ] **Step 5: Commit** `feat(sensory): quality editor sensory page; new copies start with sensory off`

---

### Task 6: Portal — clients toggle the same settings

**Files:**
- Create: `src/app/api/portal/regional-profiles/route.ts` (GET, gate `requireQcPortal(request, { view: 'qc_specs' })`, reads with `gate.ctx.admin`, active profiles only, fields `id, name, origin, region, notes, description, is_active`)
- Modify: `src/lib/portal/portal-qualities.ts` (`ClientSectionId` + `CLIENT_SECTIONS` add `'sensory'`; `SECTION_REASONS.sensory = []`), `src/components/portal/qualities/spec-sections-view.tsx` (case `'sensory'` → `SensorySection` with profiles from the portal route), and the portal quality page's section list if it enumerates labels separately.
- Test: `src/app/api/portal/regional-profiles/route.test.ts`, extend the portal spec-sections / change-dialog tests

**Interfaces:**
- Consumes: `SensorySection` (with `profiles` passed in, so it never calls the staff route), existing `createSpecChange` flow (no change: `parameters` is a whole object).
- Produces: `GET /api/portal/regional-profiles` → `{ profiles: RegionalProfile[] }`.

- [ ] **Step 1: Failing tests.** Route: no portal session → gate response; returns only active profiles; 42P01 → `{ profiles: [] }`. Portal view: the Sensory section renders; a client turning notes on and picking a profile submits `parameters` containing `sensory_notes_enabled: true` and `regional_profile: { id, name }`; the change dialog lists the change under "Sensory notes & regional profile" by profile name.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/app/api/portal src/components/portal src/lib/portal` — PASS.
- [ ] **Step 5: Commit** `feat(portal): clients can switch sensory notes and pick a regional profile`

---

### Task 7: Split the commodity cupping page (no behaviour change)

**Files:**
- Create: `src/components/cupping/commodity/attribute-spider-chart.tsx` (the "Spider Chart Visualization" block, `page.tsx` ~1624–1753), `src/components/cupping/commodity/cupping-defects-panel.tsx` (the "Defects Section" block, ~1754–1972)
- Modify: `src/app/cupping/page.tsx`

**Interfaces:**
- Produces: `AttributeSpiderChart` and `CuppingDefectsPanel` taking exactly the values/handlers the blocks use today as props (no new state, no context).

- [ ] **Step 1:** Run `npx vitest run src/app/cupping src/components/cupping` and `npx tsc --noEmit`; note the baseline.
- [ ] **Step 2:** Move each block verbatim into its component; replace with the component call.
- [ ] **Step 3:** `wc -l src/app/cupping/page.tsx` — expect ≤ 1,850. Re-run the Step 1 commands — same results as baseline.
- [ ] **Step 4: Commit** `refactor(cupping): spider chart and defects panel out of the cupping page`

---

### Task 8: Cupping card — notes and profile answer, saved per cupper

**Files:**
- Create: `src/app/api/samples/[id]/sensory-config/route.ts` (GET), `src/lib/sensory/load-config.ts`, `src/components/cupping/commodity/sensory-card-row.tsx`
- Modify: `src/app/api/samples/[id]/cupping-score/route.ts` (POST accepts optional `sensory`), `src/app/api/cupping/my-samples/bulk-data/route.ts` (select `sensory`; on 42703 retry without it), `src/app/cupping/page.tsx` (state map `sensoryMap`, load from bulk data, render `SensoryCardRow` between the defects panel and Cupping Comments, include `sensory` in `handleSaveCurrent`)
- Test: `src/lib/sensory/load-config.test.ts`, `src/app/api/samples/[id]/sensory-config/route.test.ts`, `src/app/api/samples/[id]/cupping-score/route.test.ts` (extend or create), `sensory-card-row.test.tsx`

**Interfaces:**
- Consumes: `resolveSampleSpec`, `readSensorySettings`, `sanitizePicks`, `parseCupperSensory`, `SensoryWheelDialog`, `CUPPER_PICK_CAP`.
- Produces:
  ```ts
  // load-config.ts (server)
  export async function loadSampleSensoryConfig(supabase: SupabaseClient, sampleId: string): Promise<{ notesEnabled: boolean; profile: RegionalProfile | null }>
  ```
  `GET /api/samples/[id]/sensory-config` → `{ notesEnabled, profile }` (profile = full row when the quality's `regional_profile.id` resolves, including inactive; null otherwise or when the table is missing).
  `SensoryCardRow(props: { config: { notesEnabled: boolean; profile: RegionalProfile | null }; value: CupperSensory | null; onChange: (v: CupperSensory) => void; disabled?: boolean })`.

- [ ] **Step 1: Failing tests.** Config: off/off quality → `{ notesEnabled: false, profile: null }`; CVA quality → all off; profile id that no longer exists → `profile: null`. Save route: `sensory` with 7 picks incl. one bad path stores 5 valid picks; `profile_id` not equal to the lot's configured profile stores `profile_match: null`; absent `sensory` leaves the column untouched; `scores` never contains sensory keys. Card row: hidden when both settings off; "Sensory notes" button shows "Add notes" or the picked terms; profile row shows name, notes as words, and a Yes / No segmented control (unanswered by default, tapping the selected one clears it).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** The page fetches `/sensory-config` once per sample on load (in parallel with bulk data) and keeps it in a map. Existing edit lock rules apply unchanged (the row is disabled exactly when the score inputs are).
- [ ] **Step 4: Run** `npx vitest run src/lib/sensory src/app/api/samples src/components/cupping` and `npx tsc --noEmit` — PASS; `wc -l src/app/cupping/page.tsx` ≤ 2,000.
- [ ] **Step 5: Commit** `feat(sensory): cuppers pick notes and answer the regional profile on their card`

---

### Task 9: Validation — merge, adjust, freeze

**Files:**
- Create: `src/components/cupping/validation/sensory-resolution-section.tsx`
- Modify: `src/app/api/cupping/scores/aggregate/route.ts` (select `sensory`; each `individual_scores[]` row gets `sensory: CupperSensory | null`; response gets `sensory_resolution: SensoryResolution | null` from the lab unit's `quality_assessments`), `src/components/cupping/cupping-validation-modal.tsx` (fetch `/sensory-config`; render the section when either setting is on; seed state; send `sensory_resolution` in the finalize body; block Finalize with "Answer the regional profile: Yes or No" when a profile is set and unanswered), `src/app/api/cupping/finalize/route.ts` (write `sensory_resolution` in the same pre-gate write as `score_resolution`)
- Test: `sensory-resolution-section.test.tsx`, extend `src/app/api/cupping/finalize/route.test.ts` and the aggregate route test

**Interfaces:**
- Consumes: `mergePanelSensory`, `buildSensoryResolution`, `parseSensoryResolution`, `loadSampleSensoryConfig`, `SensoryWheelDialog`.
- Produces: finalize body field `sensory_resolution?: { notes: string[][]; match: boolean | null }`. Server rules: if the lot's config has neither setting on → ignore the field and write nothing; else load the profile row fresh, `buildSensoryResolution({ …, source: 'validation' })`; `profile_answer_required` → 400 `{ error: 'Answer the regional profile: Yes or No' }` before anything is written; notes forced to `[]` when `notesEnabled` is false; profile forced to null when no profile is configured.

- [ ] **Step 1: Failing tests.** Section: shows each row (by `score_id`; label = `cupper_name`) with its picked terms or "no notes"; seeds ticks from `mergePanelSensory` (3 of 4 / 2 of 4 ticked, 1 of 4 unticked); excluding a cupper in the modal re-seeds; taking one cupper's card seeds from that card; a stored `sensory_resolution` seeds instead of the merge (re-validation); "Add note" opens the wheel limited to 6 total; profile answer seeded from the majority, tie unanswered. Finalize route: settings off → no `sensory_resolution` written even if sent; profile set + `match: null` → 400 and neither resolution is written; valid → `sensory_resolution.profile` equals the DB profile snapshot (not client-sent names); `source: 'validation'`, `resolved_by` = validator profile id. Aggregate: rows carry `sensory`; anonymised rows keep `score_id`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Keep `cupping-validation-modal.tsx` under 1,800 lines: all sensory UI and state helpers live in the new section file.
- [ ] **Step 4: Run** `npx vitest run src/components/cupping src/app/api/cupping` and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat(sensory): validation merges the panel's notes and profile answer and freezes them`

---

### Task 10: Certificate editor — late corrections

**Files:**
- Modify: `src/components/certificates/cert-editor/cupping-quadrant.tsx` (Sensory block in the "Edit cupping / sensory" panel; a read-only line in the quadrant), `src/components/certificates/cert-editor/use-cert-editor.ts` (load `/sensory-config` and `sensory_resolution`; send it on save), `src/app/api/samples/[id]/quality-assessment/route.ts` (POST accepts `sensory_resolution`; GET returns it)
- Test: extend `src/app/api/samples/[id]/quality-assessment/route.test.ts`; `cupping-quadrant` sensory test

**Interfaces:**
- Consumes: `buildSensoryResolution`, `parseSensoryResolution`, `loadSampleSensoryConfig`, `SensoryWheelDialog`.
- Produces: POST body field `sensory_resolution?: { notes: string[][]; match: boolean | null }`. Lab staff only (same check as `resolved_defects`, 403 "Only lab staff can change sensory notes"). Profile snapshot: keep the stored snapshot when one exists and its id matches the configured profile; otherwise snapshot the configured profile fresh. `source: 'certificate_editor'`. Never touches approval.

- [ ] **Step 1: Failing tests.** Non-staff → 403; staff edit keeps the stored snapshot's notes/description even if the profile row changed since; a legacy lot (no `sensory_resolution`) gets one with `source: 'certificate_editor'`; `match: null` with a profile → 400; panel hidden when the quality has neither setting.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/components/certificates src/app/api/samples` — PASS.
- [ ] **Step 5: Commit** `feat(sensory): certificate editor corrects notes and the profile answer`

---

### Task 11: Certificate PDF — wheel, notes, profile line

**Files:**
- Modify: `src/lib/certificate-data.ts` (`CuppingData.sensory: SensoryResolution | null`, set from `parseSensoryResolution(qualityAssessment.sensory_resolution)` on the commodity path only; `null` on CVA), `src/components/pdf/certificate/quality-certificate.tsx` (pass `sensory`), `src/components/pdf/certificate/certificate-cupping-chart.tsx` (right column), `src/components/pdf/certificate/__fixtures__/` (new `dense-commodity-sensory-lot.ts`), `src/components/pdf/certificate/quality-certificate.page-fit.test.tsx`
- Test: `src/components/pdf/certificate/certificate-sensory.test.ts`

**Interfaces:**
- Consumes: `CertificateFlavorWheel` (`size` prop), `leafTerm`, `SensoryResolution`.
- Produces: prop `sensory?: SensoryResolution | null` on `CertificateCuppingChart`.

- [ ] **Step 1: Failing tests.** `sensory` null → output identical to today (snapshot of the right column's text). Notes present → a 90 pt wheel and `Notes: Chocolate, Hazelnut`; no notes but a profile → no wheel, profile line only; profile line text exactly `Regional profile: Cerrado Mineiro — Matches` / `— Does not match`, the profile's notes as words on a second, smaller line; colour of both lines is `COLORS.dark` (not red). CVA lot → `sensory` ignored. Page fit: the new fixture (≥10 attributes, 6 notes, a profile, two comment paragraphs) renders ONE page with the vendored Inter; existing page-fit cases stay one page.
- [ ] **Step 2: Run** `npx vitest run src/components/pdf/certificate` — FAIL.
- [ ] **Step 3: Implement.** In the commodity right column: a row whose left side is the existing cup-status/cup-profile/taints-faults stack and whose right side is the wheel (only when `sensory.notes.length > 0`); the notes and profile lines go under that row. If the page-fit case fails, reduce the wheel size first (not below 72 pt), then nothing else.
- [ ] **Step 4: Run** `npx vitest run src/components/pdf/certificate src/lib` — PASS. `wc -l src/lib/certificate-data.ts` ≤ 2,000 (else move the cupping reader into `src/lib/certificate-cupping-data.ts`).
- [ ] **Step 5: Commit** `feat(sensory): certificate prints the panel's flavor wheel, notes and regional profile`

---

### Task 12: Whole-branch verification and hand-off

- [ ] **Step 1:** `npm run test:run` — no new failures against the baseline taken in Task 7 Step 1 (pre-existing unhandled rejections may remain; count must not rise).
- [ ] **Step 2:** `npx tsc --noEmit` — 0 errors. `npm run lint` — 0 errors.
- [ ] **Step 3:** `grep -rn "tracking_number" $(git diff --name-only origin/main -- src | grep -v test)` — every hit is a join or a select key, none rendered.
- [ ] **Step 4:** Final message to Daniel: the full SQL of `20261113000000_sensory_notes_regional_profiles.sql` pasted, the verification SELECTs, the ship order (apply SQL → confirm → push to `main`), and what to check in a browser (create a profile, switch it on for one client quality, cup with two cuppers, validate, open the certificate).

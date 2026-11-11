# Portal Qualities and Spec Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients see every quality they buy in a Qualities tab, read its spec step by step, and change it now or from a date. Every lot is judged by the spec version that applies to it.

**Architecture:**
- **Private copies:** every client quality gets its own private template copy.
- **Versions:** `client_quality_versions` holds a frozen snapshot of the spec per version. The copy's live template always equals the version in force today. A daily cron applies scheduled versions.
- **Resolver:** one resolver, `resolveSampleSpecs`, returns the same shape the readers join today (`client_qualities` + `template`), built from the lot's pinned version. Each reader swaps its join for the resolver and keeps its own logic.
- **Pinning:** a lot is pinned to a version when grading or cupping starts.
- **Portal:** the portal reads and writes versions through `/api/portal/qualities/*`.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres RPCs, service role), vitest, shadcn/ui, Microsoft Graph mail.

**Spec:** `docs/superpowers/specs/2026-10-26-client-portal-views-design.md` §6 (Qualities), with §3 for the constraints.

**Workspace:**
- Worktree `../WAQC-qualities`, branch `feat/portal-qualities`, cut from `origin/main` c272576a.
- Trunk-based: push with `git push origin HEAD:main` only when Daniel says so.
- Do not touch `../WAQC-intake`. It holds someone's uncommitted portal-certificates work.

**Two parts, two ship gates:**
- **Part 1 (Tasks 1–7):** the versions backend and the readers. It ships alone with no visible change: every lot resolves to v1, which equals today's spec.
- **Part 2 (Tasks 8–12):** the portal tab.
- **SQL first:** Daniel applies each part's SQL before that part's code is pushed. The code fails without the tables.

## Global Constraints

- **SQL:** Daniel applies all SQL himself. Paste every migration to him in full, and also save it in `database/migrations/`. Wrap each paste in `BEGIN; … COMMIT;`. No top-level `SELECT … INTO` or `CREATE TABLE … AS` (the Supabase editor appends ENABLE RLS and breaks them).
- **Portal routes:** every route goes through `requireQcPortal(request, need)` and reads with `ctx.admin`, scoped to `ctx.companyId`. The staff view-as is read-only, which the gate already enforces by HTTP method.
- **Access keys:** Qualities needs view `qc_specs`. Changing a spec needs capability `qc_spec_edit`.
- **Scope:** Qualities belong to the `client_id` company (`client_qualities.client_id = ctx.companyId`). Lot counts use `scope: 'client'`, like the reports.
- **Hidden fields:**
  - Never show `samples.tracking_number` (SAN-…) anywhere: UI, emails, API payloads.
  - Never send the `client_qualities.fee_*` columns to the portal.
- **Companies:** labels come from `companyDisplayName()`.
- **Look:**
  - Radius: containers 10px, controls 6px, badges 4px, tables 0.
  - Charcoal by default. Approval bands: olive `#556b2f` ≥90%, `#a9a454` 70–89%, `#ef4444` <70%.
  - No emojis. No mock data.
- **Emails:** every spec-change email goes to `HOUSE_CC` (`wolthers@wolthers.com`) plus the labs. Send it from `QC_MAILBOX` through `sendMail`, honouring `MICROSOFT_GRAPH_TEST_RECIPIENT`.
- **Dates:** calendar dates in `America/Sao_Paulo`. `effective_from` is a `date`. "Now" means today's date there.
- **Who can edit what:**
  - Clients edit `template.parameters` only: the eight sections of the lab spec editor.
  - Methodology, the CVA pass mark and the template columns stay Wolthers-only.
- **File size:** files stay under ~2,000 lines.
- **Route files:** they export only HTTP handlers plus `dynamic`/`maxDuration`. Helpers live in `src/lib/`.

## Review Focus

1. **A finished lot opened after a spec change:** a PDF re-download, the public QR page or the cert editor must show the limits of the version the lot was pinned to, not today's. → test in Task 5.
2. **A new change while another is scheduled:** refused (one pending change at a time). Two people saving from the same base version: the second gets 409. → tests in Task 9.
3. **A sample whose quality has no version row** (created by a path Part 1 missed): the resolver falls back to the live join and logs. It never throws and never returns null for a sample that has a spec. → test in Task 3.
4. **A contract sibling with its own contract date:** the version comes from the lab unit (`lab_source_sample_id ?? id`), and every row of the group is pinned to the same version. → test in Task 3.
5. **Portal payloads never carry `fee_` keys or `SAN-` strings,** including inside the spec JSON. → test in Task 8.

---

## Part 1: versions backend and readers

### Task 1: SQL: private copies, versions table, snapshot and write functions

**Files:**
- Create: `database/migrations/20261111000000_client_quality_private_copies.sql`
- Create: `database/migrations/20261111000001_client_quality_versions.sql`
- Create: `src/lib/quality-spec/spec-columns.ts`
- Test: `src/lib/quality-spec/spec-columns.test.ts`

**Interfaces:**
- Produces:
  - **Table** `client_quality_versions(id, client_quality_id, version_no, effective_from, spec, source, note, created_by, created_at, applied_at, notified_at, cancelled_at, cancelled_by, cancel_note)`
  - **Columns** `samples.spec_version_id uuid` and `samples.contract_date date`
  - **RPCs** (service role only):
    - `client_quality_spec_snapshot(uuid) → jsonb`
    - `record_client_quality_version(p_client_quality_id uuid, p_source text, p_user uuid, p_note text) → uuid`
    - `insert_client_quality_version(p_client_quality_id uuid, p_base_version_id uuid, p_parameters jsonb, p_effective_from date, p_user uuid, p_note text) → uuid`
    - `apply_client_quality_version(p_version_id uuid) → void`
  - **TS:** `SPEC_TEMPLATE_COLUMNS` (readonly string tuple)

- [ ] **Step 1: Write the failing guard test.** It reads `20261111000001_client_quality_versions.sql` as text and asserts that every entry of `SPEC_TEMPLATE_COLUMNS` appears inside the `client_quality_spec_snapshot` body as `'<col>', t.<col>`.

```ts
// SPEC_TEMPLATE_COLUMNS must equal exactly:
['parameters', 'methodology', 'cva_min_score', 'requires_descriptors', 'cva_score_spread_max',
 'cupping_scale_min', 'cupping_scale_max', 'cupping_discrepancy_threshold',
 'defect_thresholds_primary', 'defect_thresholds_secondary', 'max_taints_allowed',
 'max_faults_allowed', 'screen_size_requirements']
```

- [ ] **Step 2:** Run `npx vitest run src/lib/quality-spec/spec-columns.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Write `20261111000000_client_quality_private_copies.sql`.**
  - **Header comment:** what it does, plus a pre-check to run first: `SELECT indexdef FROM pg_indexes WHERE tablename = 'quality_templates';`. A unique index on a name column would make the copy fail. If one exists, stop and tell Daniel.
  - **Body:** one statement, exactly this shape:

```sql
BEGIN;
WITH targets AS (
  SELECT cq.id AS cq_id, cq.template_id, gen_random_uuid() AS new_id
  FROM public.client_qualities cq
  JOIN public.quality_templates t ON t.id = cq.template_id
  WHERE NOT t.is_client_variant
     OR (SELECT count(*) FROM public.client_qualities o WHERE o.template_id = cq.template_id) > 1
), copies AS (
  INSERT INTO public.quality_templates
  SELECT (jsonb_populate_record(NULL::public.quality_templates,
           to_jsonb(t) || jsonb_build_object(
             'id', tg.new_id, 'is_client_variant', true, 'is_global', false,
             'template_parent_id', t.id, 'version', 1,
             'created_at', now(), 'updated_at', now()))).*
  FROM targets tg JOIN public.quality_templates t ON t.id = tg.template_id
  RETURNING id
)
UPDATE public.client_qualities cq SET template_id = tg.new_id
FROM targets tg WHERE cq.id = tg.cq_id;
COMMIT;
```

  - **Verification SELECT** (paste after the COMMIT): expect `shared_left = 0`.

```sql
SELECT count(*) AS shared_left
FROM public.client_qualities cq JOIN public.quality_templates t ON t.id = cq.template_id
WHERE NOT t.is_client_variant
   OR (SELECT count(*) FROM public.client_qualities o WHERE o.template_id = cq.template_id) > 1;
```

- [ ] **Step 4: Write `20261111000001_client_quality_versions.sql`** inside `BEGIN; … COMMIT;`.
  - **Table:**
    - `client_quality_versions`:
      - `id uuid pk default gen_random_uuid()`
      - `client_quality_id uuid not null references client_qualities(id) on delete cascade`
      - `version_no int not null`
      - `effective_from date not null`
      - `spec jsonb not null`
      - `source text not null check (source in ('migration','client','wolthers'))`
      - `note text`
      - `created_by uuid references profiles(id)`
      - `created_at timestamptz not null default now()`
      - `applied_at timestamptz`
      - `notified_at timestamptz`
      - `cancelled_at timestamptz`
      - `cancelled_by uuid references profiles(id)`
      - `cancel_note text`
      - `unique (client_quality_id, version_no)`
    - Index on `(client_quality_id, effective_from)`.
    - `ENABLE ROW LEVEL SECURITY`.
    - One policy: `client_quality_versions_staff_select FOR SELECT TO authenticated USING ((SELECT public.waqc_is_staff()))`.
    - No write policies: writes go through the service role.
  - **Columns:** `ALTER TABLE samples ADD COLUMN IF NOT EXISTS spec_version_id uuid REFERENCES client_quality_versions(id)` and `ADD COLUMN IF NOT EXISTS contract_date date`.
  - **`client_quality_spec_snapshot(p uuid) RETURNS jsonb`:** `LANGUAGE sql STABLE SET search_path = public`. Returns:
    - `{"template": {<every SPEC_TEMPLATE_COLUMNS entry as '<col>', t.<col>, with parameters COALESCEd to '{}'>}, "custom_parameters": COALESCE(cq.custom_parameters,'{}'), "cups_per_sample": cq.cups_per_sample, "discrepancy_threshold": cq.discrepancy_threshold}`
    - from `client_qualities cq JOIN quality_templates t ON t.id = cq.template_id`.
  - **`record_client_quality_version(...)`:** plpgsql.
    - Locks the `client_qualities` row `FOR UPDATE`.
    - Cancels any pending version, meaning effective in the future, not applied, not cancelled. It sets `cancelled_at = now(), cancelled_by = p_user, cancel_note = 'Cancelled when Wolthers changed this specification'`.
    - Inserts version `max(version_no)+1` with:
      - `effective_from = (now() AT TIME ZONE 'America/Sao_Paulo')::date`
      - `spec = client_quality_spec_snapshot(p)`
      - `applied_at = now()`
      - `source = p_source`
    - Returns the new id.
  - **`insert_client_quality_version(...)`:** plpgsql, with the client quality row locked `FOR UPDATE`.
    - Raises `'stale_base'` if `p_base_version_id` is not the highest non-cancelled `version_no`.
    - Raises `'pending_change'` if a pending version exists.
    - Raises `'past_date'` if `p_effective_from` is before today (Sao Paulo).
    - Inserts with `spec = base.spec || jsonb_build_object('template', (base.spec->'template') || jsonb_build_object('parameters', p_parameters))` and `source 'client'`.
    - If `p_effective_from = today`, it calls `apply_client_quality_version` on the new id.
    - Returns the id.
  - **`apply_client_quality_version(p_version_id)`:**
    - Raises `'not_a_private_copy'` if the quality's template has `is_client_variant = false`.
    - Updates `quality_templates SET parameters = spec->'template'->'parameters', version = version + 1, updated_at = now()`.
    - Inserts `template_versions(template_id, version_number, parameters, changes_description, created_by)` with the description `'Client change, version <no>'`.
    - Sets `applied_at = now()`.
    - Does nothing if the version is already applied or cancelled.
  - **Permissions:** `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` on the three write functions. The snapshot function stays callable by authenticated (it is STABLE and read-only).
  - **Backfill v1:** `INSERT INTO client_quality_versions (client_quality_id, version_no, effective_from, spec, source, applied_at) SELECT id, 1, DATE '2000-01-01', client_quality_spec_snapshot(id), 'migration', now() FROM client_qualities WHERE template_id IS NOT NULL ON CONFLICT DO NOTHING;`
  - **Pin started lots:** set `spec_version_id` to that quality's v1 on every sample with `quality_spec_id` set AND (a `quality_assessments` row, OR a `certificates` row, OR a `cupping_scores` row) on itself or its lab unit. Lots not yet started stay unpinned and are pinned at grading start.
  - **Verification SELECTs** after the COMMIT:
    - qualities without v1 (expect 0)
    - pinned sample count
    - unpinned started samples (expect 0)

- [ ] **Step 5:** Create `src/lib/quality-spec/spec-columns.ts` exporting `SPEC_TEMPLATE_COLUMNS` and `type SpecTemplateColumn`. Run the test. Expected: PASS.

- [ ] **Step 6:** Commit with the message `feat(spec-versions): private copy per client quality, versions table, snapshot + write RPCs (SQL)`. Paste both files to Daniel in order (copies first) and wait for his "applied" before Task 3 runs anything live.

### Task 2: Snapshot types and version picking (pure)

**Files:**
- Create: `src/lib/quality-spec/types.ts`
- Create: `src/lib/quality-spec/pick-version.ts`
- Test: `src/lib/quality-spec/pick-version.test.ts`

**Interfaces:**
- Produces:

```ts
// types.ts
export interface SpecSnapshot {
  template: { parameters: Record<string, any> } & Partial<Record<SpecTemplateColumn, any>>
  custom_parameters: Record<string, any>
  cups_per_sample: number | null
  discrepancy_threshold: number | null
}
export interface VersionRow {
  id: string; client_quality_id: string; version_no: number; effective_from: string // YYYY-MM-DD
  spec: SpecSnapshot; source: 'migration' | 'client' | 'wolthers'; note: string | null
  created_by: string | null; created_at: string; applied_at: string | null
  cancelled_at: string | null; cancel_note: string | null
}
/** Same shape the readers join today as `client_qualities(..., template:quality_templates(...))`. */
export interface ResolvedSpec {
  id: string; custom_name: string | null; quality_code: string | null; template_id: string | null
  cups_per_sample: number | null; discrepancy_threshold: number | null
  custom_parameters: Record<string, any>
  template: { id: string; name: string | null; name_en: string | null; description: string | null } & SpecSnapshot['template']
  version: { id: string; versionNo: number; effectiveFrom: string; pinned: boolean } | null
}
// pick-version.ts
export function specToday(now?: Date): string                       // Sao Paulo YYYY-MM-DD
export function versionInForce(versions: VersionRow[], onDate: string): VersionRow | null
export function pickVersion(versions: VersionRow[], at: { pinnedId: string | null; contractDate: string | null; today: string }): VersionRow | null
export function pendingVersion(versions: VersionRow[], today: string): VersionRow | null
```

- [ ] **Step 1: Write the failing tests** in `pick-version.test.ts`. Fixtures: v1 `2000-01-01`, v2 `2026-09-01`, v3 `2027-09-01` not applied (pending), and v4 cancelled `2026-10-01`.
  - `versionInForce(_, '2026-08-31')` → v1. `versionInForce(_, '2026-09-01')` → v2. A cancelled version is never returned.
  - `pickVersion` with `pinnedId = v1.id` returns v1, whatever the dates.
  - `pickVersion` with no pin and `contractDate '2026-08-15'` returns v1. With no pin and no contract date, today `'2026-11-11'` returns v2. The pending v3 is never picked while today < `2027-09-01`.
  - On a tie of `effective_from`, the higher `version_no` wins.
  - `pendingVersion(_, '2026-11-11')` → v3.
  - `specToday(new Date('2026-11-11T02:00:00Z'))` → `'2026-11-10'` (Sao Paulo is UTC−3).

- [ ] **Step 2:** Run `npx vitest run src/lib/quality-spec/pick-version.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `types.ts` and `pick-version.ts`. `specToday` uses `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(spec-versions): snapshot types and version picking`.

### Task 3: The resolver, pinning and the service client

**Files:**
- Create: `src/lib/supabase-service.ts`
- Create: `src/lib/quality-spec/resolve.ts`
- Test: `src/lib/quality-spec/resolve.test.ts`

**Interfaces:**
- Consumes: Task 2 (`pickVersion`, `specToday`, types). Task 1 RPC names and columns.
- Produces:

```ts
// supabase-service.ts
export function serviceRoleClient(): SupabaseClient<any>   // same env + options as portalServiceClient
// resolve.ts
export async function resolveSampleSpecs(sampleIds: string[], opts?: { pin?: boolean; admin?: SupabaseClient<any> }): Promise<Map<string, ResolvedSpec>>
export async function resolveSampleSpec(sampleId: string, opts?: { pin?: boolean; admin?: SupabaseClient<any> }): Promise<ResolvedSpec | null>
export async function specVersionStatus(sampleId: string, admin?: SupabaseClient<any>): Promise<{ pinned: VersionRow | null; implied: VersionRow | null; mismatch: boolean }>
```

- [ ] **Step 1: Write the failing tests** with a fake admin client, in the style of the existing route tests:
  - **Lab unit decides:** a sibling (`lab_source_sample_id = L`) with its own `contract_date '2026-08-01'`, where lab unit L has `contract_date '2026-10-01'`, resolves to the version in force on `2026-10-01` (L's date). With `pin: true`, both L and the sibling get `spec_version_id` written to the same id.
  - **Pinned wins:** a sample pinned to v1 resolves to v1 even when its contract date points at v2. `result.version.pinned === true`.
  - **Contract date order:** `samples.contract_date` (lab-typed) wins over `contracts.contract_date` (from `contract_id`). If both are null, use today.
  - **Fallback:** a quality with no version rows returns a `ResolvedSpec` built from the live `client_qualities` + `template` join, with `version: null`. It does not throw, and `console.warn` is called once with the quality id.
  - **No re-pin:** `pin: true` never overwrites an existing `spec_version_id`.
  - **Names stay live:** `custom_name`, `quality_code` and `template.name`/`name_en`/`description` come from the live rows, and every other field comes from `version.spec`.
  - **Mismatch flag:** `specVersionStatus` returns `mismatch: true` when the pinned id differs from `pickVersion` run without a pin.

- [ ] **Step 2:** Run `npx vitest run src/lib/quality-spec/resolve.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Reads, in order** (always the service role, because `contracts` is a sys table with RESTRICTIVE deny policies):
    1. `samples(id, lab_source_sample_id, quality_spec_id, spec_version_id, contract_date, contract_id)` for the ids plus their lab units.
    2. `contracts(id, contract_date)`.
    3. `client_qualities(id, custom_name, quality_code, template_id, cups_per_sample, discrepancy_threshold, custom_parameters, template:quality_templates!client_qualities_template_id_fkey(id, name, name_en, description, <SPEC_TEMPLATE_COLUMNS>))`.
    4. `client_quality_versions` for those qualities.
  - **Chunking:** use `selectInChunks` for every `.in()`.
  - **Pin:** an `update … is('spec_version_id', null)` over the lab unit and the rows that point at it.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(spec-versions): resolveSampleSpecs, pin at start, mismatch status`.

### Task 4: Compliance and grading gates read the lot's version

**Files:**
- Modify:
  - `src/lib/compliance.ts` (`evaluateSampleCompliance` ~L57–87, `checkHasValidationRules` L181)
  - `src/lib/tolerance/sample-limits.ts` (`computeIssuedValuesForSample` L65–80)
  - `src/app/api/cupping/finalize/route.ts` (L316–401)
  - `src/app/api/cupping/cva/finalize/route.ts` (L250–283)
  - `src/lib/cupping/certify-after-grading.ts` (L115–117)
  - `src/app/api/samples/[id]/quality-assessment/route.ts` (POST, L46 onward; calls at L211/231)
  - `src/app/api/cupping/scores/submit/route.ts`
  - `src/app/api/cupping/scores/save-digital/route.ts`
  - `src/lib/approval-notification/quality-summary.ts` (L754)
- Test: extend `src/lib/compliance.test.ts` (create it if missing) and `src/app/api/samples/[id]/quality-assessment/route.test.ts`.

**Interfaces:**
- Consumes: `resolveSampleSpec(sampleId, { pin })` from Task 3.
- Produces: `checkHasValidationRules(supabase, qualitySpecId, sampleId: string)`, with a new third parameter. Update the three callers listed by the inventory.

- [ ] **Step 1: Write the failing tests:**
  - `evaluateSampleCompliance` on a sample pinned to a version with `max_quakers: 8`, while the live template now says `5`, uses 8. Twelve quakers yields the violation `Quakers: 12 exceeds maximum (8)`.
  - The quality-assessment POST calls `resolveSampleSpec` with `{ pin: true }` (spy).
- [ ] **Step 2:** Run `npx vitest run src/lib/compliance.test.ts "src/app/api/samples/[id]/quality-assessment"`. Expected: FAIL.
- [ ] **Step 3: Replace each listed `client_qualities(… template:quality_templates(…))` read** with `resolveSampleSpec(labSampleId)`, keeping the rest of each function as it is.
  - **Pinning:** pass `{ pin: true }` in the quality-assessment POST, scores submit, save-digital, and both finalize routes. Everywhere else, pin is off.
  - **CVA pass mark:** the CVA finalize reads `resolved.template.cva_min_score`.
  - **Clean/uniform cup:** the cupping finalize reads `resolved.template.parameters.cup_status_rules`.
- [ ] **Step 4:** Run `npx vitest run src/lib src/app/api/cupping src/app/api/samples` and `npx tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 5:** Commit: `feat(spec-versions): compliance, tolerance and finalize judge by the lot's version; pin at grading/cupping start`.

### Task 5: Certificates render the lot's version

**Files:**
- Modify:
  - `src/lib/certificate-data.ts` (the two spec reads, L528–548 and L673–690; update the L811–819 comment)
  - `src/app/certificate/[...path]/page.tsx` (L78, L198–260)
  - `src/components/certificates/cert-editor/use-cert-editor.ts` (L411–425)
  - `src/components/certificates/cert-editor/info-strip.tsx`
- Create: `src/app/api/samples/[id]/spec/route.ts`
- Test: `src/lib/certificate-data.test.ts` (extend or create), `src/app/api/samples/[id]/spec/route.test.ts`, `src/components/certificates/cert-editor/info-strip.test.tsx`

**Interfaces:**
- Consumes: `resolveSampleSpec`, `specVersionStatus` (Task 3).
- Produces: `GET /api/samples/[id]/spec` → `{ client_quality: ResolvedSpec | null, version: { pinned: number | null, implied: number | null, mismatch: boolean } }`. Staff-gated the same way `/api/client-qualities/[id]` is today.

- [ ] **Step 1: Write the failing tests:**
  - `getCertificateData` for a lot pinned to v1, where the live template has a different cupping attribute minimum, renders v1's minimum (Review Focus 1).
  - The spec route returns 401 without a user.
  - With a mismatch, `version` is `{ pinned: 3, implied: 2, mismatch: true }`.
  - `InfoStrip` given `specVersion = { pinned: 3, implied: 2, mismatch: true }` shows exactly `Graded under spec v3; the contract date points to v2`. Without a mismatch it shows nothing.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3: Switch both `certificate-data.ts` reads and the public page to `resolveSampleSpec`.**
  - In `use-cert-editor.ts`, fetch `/api/samples/${s.id}/spec` instead of `/api/client-qualities/${s.quality_spec_id}`. The response keeps the `client_quality` key, so the parsing lines don't change.
  - Store `version` in state and pass it to `InfoStrip` as a `specVersion` prop.
- [ ] **Step 4:** Run the tests and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(spec-versions): certificate data, public QR page and cert editor show the pinned version`.

### Task 6: Grading, cupping and card readers; the guard test

**Files:**
- Modify:
  - `src/app/api/cupping/my-samples/route.ts` (L210–217)
  - `src/app/api/cupping/scores/aggregate/route.ts` (L195–210)
  - `src/lib/embed/quadrant-aggregate.ts` (L634–655)
  - `src/app/api/samples/bulk-details/route.ts` (L72–83)
  - `src/app/api/samples/[id]/quality-spec/route.ts` (L29–60)
  - `src/app/api/cupping/cva/[id]/route.ts` (`loadPassMarks`, L83–112)
  - `src/app/api/cupping/cva/panel/route.ts` (L124–130)
- Delete: `src/app/api/samples/[id]/quality-template/route.ts`. It joins a relation that doesn't exist and has no callers.
- Test: create `src/lib/quality-spec/no-live-spec-reads.test.ts`

**Interfaces:**
- Consumes: `resolveSampleSpecs` (batched) for my-samples, aggregate, quadrant and bulk-details; `resolveSampleSpec` elsewhere.

- [ ] **Step 1: Write the failing guard test.**
  - It walks `src/` (excluding `*.test.*`) and fails on any file whose text matches `/quality_templates[^)]*\bparameters\b/` or `/custom_parameters\s*\|\|\s*\w*\.?parameters/`, unless the file is on `ALLOWED`.
  - `ALLOWED` lists the template editors and pickers, which read a template on purpose:
    - `src/app/api/quality-templates/**`
    - `src/app/api/client-qualities/**`
    - `src/app/api/clients/[id]/**`
    - `src/app/quality/**`
    - `src/components/quality/**`
    - `src/components/clients/**`
    - `src/components/samples/intake/**`
    - `src/app/api/cupping/ocr/process-card/route.ts` (the template id comes from the printed card)
    - `src/lib/quality-spec/**`
    - `src/lib/database.types.ts`
  - The failure message names the file and says: "read the lot's spec through resolveSampleSpec(s)".
- [ ] **Step 2:** Run `npx vitest run src/lib/quality-spec/no-live-spec-reads.test.ts`. Expected: FAIL, listing the files in this task.
- [ ] **Step 3: Switch each file to the resolver,** keeping each file's existing precedence rules: the `custom_parameters || template.parameters` whole-object fallback in `aggregate` and `quadrant-aggregate` stays as it is, now fed from `ResolvedSpec`. Delete the dead route.
- [ ] **Step 4:** Run the guard test, then `npx vitest run src/app/api/cupping src/lib/embed src/app/api/samples` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(spec-versions): grading, cupping, cards and CVA read the lot's version; guard against live spec reads`.

### Task 7: Staff writes record a version; base templates list their copies; contract date

**Files:**
- Create: `src/lib/quality-spec/record-version.ts`
- Modify:
  - `src/app/api/quality-templates/[id]/route.ts` (PATCH, L70–207)
  - `src/app/api/quality-templates/[id]/restore/route.ts`
  - `src/app/api/client-qualities/[id]/route.ts` (PATCH)
  - `src/app/api/client-qualities/route.ts` (POST)
  - `src/app/api/client-qualities/[id]/duplicate/route.ts`
  - the `src/app/api/clients/[id]/quality-specifications` POST, and the PATCH in `[specId]`
  - `src/app/api/quality-templates/[id]/clients/route.ts`
  - `src/app/api/samples/[id]/route.ts` (PATCH allow-list: add `contract_date`, which is not a shared sibling field)
  - `src/components/samples/supply-chain-edit-table.tsx` (a "Contract date" date input next to the Wolthers contract nr, L404)
  - `src/components/samples/intake/contracts-step.tsx` and `src/components/samples/intake/types.ts`
  - `src/app/api/samples/route.ts` (intake insert passes `contract_date`)
- Test: `src/lib/quality-spec/record-version.test.ts`, plus extensions to the PATCH tests of the routes above where they exist.

**Interfaces:**
- Produces:

```ts
export async function recordStaffVersion(clientQualityIds: string[], userId: string, note?: string): Promise<void>
export async function clientQualityIdsForTemplate(admin: SupabaseClient<any>, templateId: string): Promise<string[]> // only when the template is_client_variant
```

- [ ] **Step 1: Write the failing tests:**
  - `recordStaffVersion(['cq1'], 'u1')` calls `rpc('record_client_quality_version', { p_client_quality_id: 'cq1', p_source: 'wolthers', p_user: 'u1', p_note: null })`.
  - An RPC error is logged with `console.error` (including the quality id) and rethrown.
  - The template PATCH on an `is_client_variant` template calls `recordStaffVersion` with that template's client qualities.
  - On a non-variant (base) template it does not.
  - The client-qualities PATCH calls it when `template_id`, `cups_per_sample`, `discrepancy_threshold` or `custom_parameters` change, and not for `notes`/`custom_name`/`fee_*`.
  - The POST and duplicate routes call it for the new row with the note `'First version'`.
  - The template `clients` route also returns client qualities whose template has `template_parent_id = id`, each marked `copy: true`.
  - The sample PATCH accepts `contract_date: '2026-08-15'` and rejects `'15/08/2026'` with 400.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3: Implement, calling `recordStaffVersion` after each successful write.**
  - **Intake:** `contracts-step.tsx` shows an optional "Contract date" input only when no sys contract is linked. A linked contract supplies its own date through the resolver.
  - **Sample editor:** the input is always editable, and its helper text reads exactly: `Picks the spec version. Leave empty when the contract carries the date.`
- [ ] **Step 4:** Run `npx vitest run src/app/api src/components/samples src/lib/quality-spec`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS, 0, 0.
- [ ] **Step 5:** Commit: `feat(spec-versions): staff edits record versions; base templates list client copies; contract date on intake and the sample editor`.

**Part 1 ship gate:**
- Run `npx vitest run`, `npx tsc --noEmit` and `npm run lint`.
- Daniel confirms both SQL files are applied.
- Push only on his word.
- Smoke check: open a certified lot's PDF and a lot in grading. Both should look exactly as before.

---

## Part 2: the portal Qualities tab

### Task 8: Quality facts and the list/detail read routes

**Files:**
- Modify: `src/lib/portal/portal-facts.ts`. Add `qualitySpecId: string | null` (from `sample.quality_spec_id`) and `complianceViolations: string[]` (raw `compliance_violations`, also for approved certificates) to `PortalCertFact` and `SELECT`.
- Create:
  - `src/lib/portal/portal-qualities.ts`
  - `src/app/api/portal/qualities/route.ts`
  - `src/app/api/portal/qualities/[id]/route.ts`
- Modify: `src/app/api/portal/no-san.test.ts` (cover the two new routes and the `fee_` rule)
- Test: `src/lib/portal/portal-qualities.test.ts`, `src/app/api/portal/qualities/route.test.ts`, `src/app/api/portal/qualities/[id]/route.test.ts`

**Interfaces:**
- Produces:

```ts
export type ClientSectionId = 'screen' | 'green' | 'roast' | 'defects' | 'physical' | 'cupping' | 'taints' | 'clean'
export const CLIENT_SECTIONS: readonly ClientSectionId[]   // that order
export const SECTION_REASONS: Record<ClientSectionId, RejectionReasonKey[]>
//   screen:['screen'] green:[] roast:[] defects:['primary','secondary'] physical:['moisture','quakers']
//   cupping:['cup_score'] taints:['cup_fault','cup_taint'] clean:[]
export interface QualityListRow { id: string; name: string; origin: string; versionNo: number | null
  scheduled: { versionNo: number; effectiveFrom: string } | null
  certificates: number; pssApprovedPct: number | null; ssApprovedPct: number | null }
export function buildQualityList(facts: PortalCertFact[], qualities: { id: string; name: string; origin: string | null; versions: VersionRow[] }[], today: string): QualityListRow[]
export function buildOriginSummary(rows: QualityListRow[]): { origin: string; qualities: number; certificates: number; approvedPct: number | null }[]
export function sectionCompliance(facts: PortalCertFact[], qualityId: string): Record<ClientSectionId, { within: number; lots: number } | null>
export interface PortalVersionView { id: string; versionNo: number; effectiveFrom: string
  status: 'in_force' | 'scheduled' | 'past' | 'cancelled'; changedBy: string; note: string | null; cancelNote: string | null }
export function versionViews(versions: VersionRow[], today: string, names: Map<string, string>, clientCompanyId: string): PortalVersionView[]
```

- **`GET /api/portal/qualities?company&period`** (view `qc_specs`) → `{ period, periods, origins, qualities: QualityListRow[] }`.
- **`GET /api/portal/qualities/[id]?company&period`** (view `qc_specs`; 404 unless `client_id = ctx.companyId` and `is_active`) → `{ quality: { id, name, origin, methodology }, inForce: { versionId, versionNo, effectiveFrom, parameters }, versions: PortalVersionView[], sections: ReturnType<typeof sectionCompliance>, canEdit: boolean }`.
  - `canEdit = ctx.keys.capabilities.includes('qc_spec_edit') && !ctx.isStaffViewAs`.

- [ ] **Step 1: Write the failing tests:**
  - **`buildQualityList`:** groups by origin. A quality without certificates in the period still lists, with `certificates: 0` and null percentages. `scheduled` comes from `pendingVersion`.
  - **`sectionCompliance`:** 20 certificates of the quality, two with `Quakers: 12 exceeds maximum (8)` → `physical: { within: 18, lots: 20 }`. `green` → null. Certificates of another quality are ignored.
  - **`versionViews` `changedBy`:** `'Wolthers'` for `source 'wolthers' | 'migration'`. The person's name for `source 'client'`.
  - **`versionViews` `status`:** a cancelled version shows `status 'cancelled'` with its `cancelNote`.
  - **Detail route:**
    - 404 for a quality of another company.
    - 403 without `qc_specs`.
    - `canEdit` is false in the staff view-as.
    - The response JSON never contains `fee_` or `SAN-` (Review Focus 5). The test seeds `fee_price` and a `SAN-01234/26` string on the fake rows.
- [ ] **Step 2:** Run `npx vitest run src/lib/portal/portal-qualities.test.ts src/app/api/portal`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The routes read `client_qualities` with an explicit column list that leaves out `fee_*`.
  - Names come from `custom_name`, else the live template `name_en`/`name`.
  - Versions come from `client_quality_versions`.
  - Version authors' names come from `profiles(full_name, email)`.
  - Facts come from `fetchPortalCertFacts(admin, { companyId, period, scope: 'client' })`.
- [ ] **Step 4:** Run the tests and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(portal): qualities list and detail routes with lots-within counts per section`.

### Task 9: Change and cancel routes, the change email, the daily cron

**Files:**
- Create:
  - `src/app/api/portal/qualities/[id]/versions/route.ts` (POST)
  - `src/app/api/portal/qualities/[id]/versions/[versionId]/route.ts` (DELETE)
  - `src/lib/quality-spec/spec-diff.ts`
  - `src/lib/portal/spec-change-email.ts`
  - `src/lib/quality-spec/apply-due.ts`
  - `src/app/api/cron/apply-spec-versions/route.ts`
- Modify:
  - `src/lib/portal/invite-email.ts` (export `QC_MAILBOX` and `sandboxedRecipients(to: string[], subject: string)`, the current `sandboxed` widened to a list)
  - `vercel.json` (add `{ "path": "/api/cron/apply-spec-versions", "schedule": "0 9 * * *" }`, 06:00 Sao Paulo)
- Test: `spec-diff.test.ts`, `spec-change-email.test.ts`, `apply-due.test.ts`, and both route tests

**Interfaces:**
- Consumes: Task 1 RPCs. Task 2 `specToday`, `pendingVersion`. Task 8 access rules.
- Produces:

```ts
export interface SpecChange { section: string; path: string; before: string; after: string }
export function diffSpecParameters(before: Record<string, any>, after: Record<string, any>): SpecChange[]
export function removedCuppingAttributes(before: Record<string, any>, after: Record<string, any>): string[]
export function buildSpecChangeEmail(input: { clientName: string; qualityName: string; versionNo: number
  effectiveFrom: string; changedBy: string; note: string | null; changes: SpecChange[]; cancelled?: boolean }): BuiltEmail
export async function sendSpecChangeEmail(versionId: string): Promise<boolean>   // sets notified_at on success
export async function applyDueVersions(admin: SupabaseClient<any>, today: string): Promise<{ applied: number; notified: number }>
```

- **POST body:** `{ baseVersionId: string, parameters: object, effectiveFrom: 'now' | 'YYYY-MM-DD', note?: string }`.
- **POST gate:** `{ view: 'qc_specs', capability: 'qc_spec_edit' }`.
- **POST responses:**
  - 201 `{ versionId, versionNo, effectiveFrom, notified }`
  - 409 `{ error }` for `stale_base` / `pending_change`
  - 400 for `past_date`, a bad date or a non-object `parameters`
  - 404 for another company's quality
- **DELETE:** the same gate. It cancels a pending version of this quality and sends the email with `cancelled: true`. It returns 409 if the version has already started or been applied.

- [ ] **Step 1: Write the failing tests:**
  - **`diffSpecParameters`:**
    - Changing `max_quakers` from 8 to 5 gives `{ section: 'Moisture, density & quakers', path: 'max_quakers', before: '8', after: '5' }`.
    - A key added under `taint_fault_configuration` reports `before: '(none)'`.
    - Identical inputs give `[]`.
    - Section labels come from the top-level key via a fixed map, and an unknown key falls back to `'Other'`.
  - **`removedCuppingAttributes`:** renaming `Body` to `Mouthfeel` returns `['Body']`.
  - **Email** (`buildSpecChangeEmail`):
    - The subject is exactly `Quality specification changed: <qualityName> for <clientName>, from <d MMMM yyyy>`.
    - The body lists each change as `<section>: <path> <before> → <after>`, plus who and when.
    - It never contains `fee_` or `SAN-`.
  - **Email** (`sendSpecChangeEmail`):
    - Recipients are `HOUSE_CC` plus the `laboratories.contact_email` of every lab that holds samples of this quality created in the last 365 days, deduplicated, with invalid addresses dropped.
    - A send failure returns false and leaves `notified_at` null.
  - **POST route:**
    - `effectiveFrom: 'now'` calls `insert_client_quality_version` with today's date.
    - A `pending_change` RPC error gives 409 with the error `A change is already scheduled for <d MMMM yyyy>. Cancel it before making another.`
    - `stale_base` gives 409 `This specification was changed by someone else. Reload to see the latest version.` (Review Focus 2)
    - The staff view-as gets 403.
  - **`applyDueVersions`:**
    - Applies the versions with `effective_from <= today`, `applied_at` null and not cancelled.
    - Sends any version with `notified_at` null, including ones made today whose email failed.
    - Returns the counts.
  - **Cron route:** 401 without `Authorization: Bearer $CRON_SECRET`. Reuse the `timingSafeEqual` check pattern in `src/lib/reports/lab-activity-routes.ts`.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Map RPC error messages to the responses above.
  - The POST sends the email after a successful insert and returns `notified`. A failed email never fails the request, because the cron retries it.
- [ ] **Step 4:** Run the tests, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(portal): clients change a quality now or from a date; Wolthers and the lab are emailed; daily cron applies due versions`.

### Task 10: Qualities tab and list page

**Files:**
- Modify: `src/components/portal/portal-nav.ts`. Insert `{ label: 'Qualities', href: '/portal/qualities', view: 'qc_specs' }` after Overview.
- Create: `src/app/portal/qualities/page.tsx`, `src/components/portal/qualities/origin-summary.tsx`, `src/components/portal/qualities/qualities-table.tsx`
- Test: `src/app/portal/qualities/page.test.tsx`, plus an extended `portal-nav` test

**Interfaces:**
- Consumes: `GET /api/portal/qualities` (Task 8). Fetch with the existing portal fetch helper (`src/lib/portal/portal-fetch.ts`) and the period select used on Suppliers.

- [ ] **Step 1: Write the failing tests:**
  - The nav shows Qualities second for a person with `qc_specs`, and not without it.
  - The page renders one origin summary card per origin (name, qualities, certificates, approved %).
  - Below the cards, one table grouped by origin, with columns `Quality · Version · Certificates · PSS approved · SS approved`.
  - A scheduled change shows the badge `v4 from 1 Sep 2027`.
  - Rows link to `/portal/qualities/<id>`, keeping `company` and `period`.
  - Percentages use the band colours from Global Constraints.
  - The empty state reads `No qualities are set up for this company yet.`
  - The data is tagged with `{companyId, periodKey}` and the page shows loading on a mismatch (the company-switch gotcha).
- [ ] **Step 2:** Run `npx vitest run src/app/portal/qualities src/components/portal`. Expected: FAIL.
- [ ] **Step 3:** Implement, following `src/app/portal/suppliers/page.tsx` for layout, period and loading.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(portal): Qualities tab with origin overview and per-quality approval`.

### Task 11: Quality detail: read view and versions

**Files:**
- Create: `src/app/portal/qualities/[id]/page.tsx`, `src/components/portal/qualities/spec-sections-view.tsx`, `src/components/portal/qualities/versions-panel.tsx`
- Modify: `src/components/quality/spec-editor/spec-editor-body.tsx` (export `sectionTitle` if it isn't already exported; make no other change)
- Test: `src/components/portal/qualities/spec-sections-view.test.tsx`, `src/components/portal/qualities/versions-panel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/portal/qualities/[id]` (Task 8). The section components under `src/components/quality/spec-editor/sections/*`, which all take `{ params, patch }`. `AspectSection` also takes `aspectType`.
- Produces: `SpecSectionsView({ parameters, sections, active, onSelect, editing, onPatch })`, so Task 12 reuses it for editing.

- [ ] **Step 1: Write the failing tests:**
  - **Header:** `<name> · <origin>` and the badge `v<no> in force since <d MMM yyyy>`.
  - **Left nav:** the eight `CLIENT_SECTIONS`, titled with `sectionTitle`, each showing `18 of 20 lots within` when the count isn't null.
  - **Read-only:** the active section renders its lab section component inside `<fieldset disabled>`, so every input and button is disabled while `editing` is false.
  - **Versions panel:** newest first, with status labels `In force`, `Scheduled from 1 Sep 2027`, `Past`, `Cancelled`. A cancelled row shows its `cancelNote`. `changedBy` shows as `Changed by <name>`.
  - **Cancel button:** on the scheduled row, only when `canEdit` is true.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Layout: a 10px-radius container, section nav on the left, the panel on the right, and the versions panel under the panel.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(portal): quality detail shows the spec step by step with lots-within counts and its versions`.

### Task 12: Changing a spec from the portal

**Files:**
- Create: `src/components/portal/qualities/change-dialog.tsx`
- Modify: `src/app/portal/qualities/[id]/page.tsx`
- Test: `src/components/portal/qualities/change-dialog.test.tsx`, plus an extended `src/app/portal/qualities/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `SpecSectionsView` (Task 11), `removedCuppingAttributes` (Task 9), POST/DELETE routes (Task 9).

- [ ] **Step 1: Write the failing tests:**
  - **Change button:** shown only when `canEdit`, and hidden while a scheduled version exists. In its place: `A change is scheduled for <date>. Cancel it to make another.`
  - **Editing:** pressing Change enables the section (`editing`) on a working copy of `parameters`. Cancel throws the copy away.
  - **Save dialog:**
    - Radio `Now` / `From a date`, a date input (min = tomorrow) and an optional note.
    - It lists the changes from `diffSpecParameters(inForce.parameters, working)`.
    - Save is disabled when the list is empty.
  - **Rename warning:** when `removedCuppingAttributes` is non-empty, the dialog shows `Body is no longer in the cupping attributes. Its score history does not carry over to a new name.` (one line per name). Save then needs the checkbox `I understand`.
  - **Submit:** POSTs `{ baseVersionId: inForce.versionId, parameters: working, effectiveFrom, note }` and refetches the detail on 201.
  - **Errors:** on 409 it shows the server's error text and keeps the working copy.
  - **Cancel scheduled:** cancelling a scheduled version asks for confirmation inside the dialog component (no `window.confirm`) and sends DELETE.
- [ ] **Step 2:** Run those tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS, 0, 0.
- [ ] **Step 5:** Commit: `feat(portal): clients change any section of a quality, now or from a date, with a rename warning`.

**Part 2 ship gate:**
- Run the full suite, tsc and lint.
- Paste Daniel the check list below.
- Push on his word.

**Live check list for Daniel (staff view-as, then a real client account with `qc_specs` + `qc_spec_edit`):**
1. **Lists:** Qualities lists Ahold's and Dunkin's qualities by origin. The counts match the Overview for the same crop year.
2. **Changes:** open a quality and change `max_quakers` from a date next week. The scheduled badge appears and wolthers@wolthers.com receives the email. Cancel it, and the cancellation email arrives.
3. **Old lots:** change it **now** and re-download an older certificate of that quality. It still shows the old limit.
4. **Staff view-as:** shows no Change buttons.

## Gotchas

- **`quality_templates` changes from Part 1 on:** Quality Templates edits no longer reach clients. The template's Clients list shows the client copies made from it, marked as copies.
- **Old cupping cards:** printed before the copy migration, they carry the base template id in their QR, which `ocr/process-card` reads directly. Reprint cards for lots still waiting to be cupped.
- **Tables and columns missing from types:** `src/lib/database.types.ts` lacks `methodology`, `is_client_variant`, the `cva_*` columns and the new table. Type the new reads locally (`types.ts`) and do not regenerate the file in this plan.
- **Company switch:** `router.push` to the same path does not remount, so every portal page tags its data with `{companyId, periodKey}`.
- **sys tables** (`contracts`) carry RESTRICTIVE policies. Read them with the service role only.

## Calls made in this plan (check with Daniel)

1. **Pin per lab unit:** the version is pinned once per lab unit, using the lab unit's contract date, and every contract sibling shares it.
2. **One pending change at a time:** a staff edit cancels a pending client change, and the client sees why in the versions list.
3. **Clients edit the spec sections only:** methodology, the CVA pass mark and the legacy template columns stay with Wolthers.
4. **Change emails go to head office plus the labs** that graded the quality in the last 365 days (`laboratories.contact_email`).
5. **Scheduled versions apply at 06:00 Sao Paulo** on their date. "Now" applies on save.

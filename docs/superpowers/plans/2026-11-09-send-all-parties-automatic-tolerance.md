# Send to all parties + automatic 5% approval: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A near-miss lot for an opted-in client is approved with comments at finalize with no human step, and one action sends each certificate to its client, importer, roaster and seller, one email per party, with the PDF only where it belongs.

**Architecture:** Part 1 adds one function, `approveWithinTolerance`, called by the two commodity decision points at the moment they would reject. Part 2 widens the existing send pipeline from two sides to four parties, keeping `'buyer'` as the client's stored side. Both ride on two new per-client switches.

The spec lists the manual route's write order, but this plan changes it on purpose. The manual route writes status first and the flag last, which leaves a window where the lot is approved without the flag, and that is the spec's forbidden state. The new order is: audit row, walk to review, mint certificates, then one `UPDATE` that sets status, stage and flag together. The lot therefore cannot be approved without the flag, and any earlier failure leaves it undecided in Review. No Postgres function is needed. Minting before the status write is safe: `assign_certificate_number` does not read the status, and `auto_generate_certificate_on_approval` skips a sample that already has a certificate.

**Tech Stack:** Next.js 14 route handlers, TypeScript, Supabase service-role client, Microsoft Graph `sendMail`, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-09-send-all-parties-automatic-tolerance-design.md`

## Global Constraints

- Build from `origin/main` (`7e453ca6` or newer), never from the `feat/certificate-print-list` checkout, which is 35 commits behind. Use a worktree on a new branch `feat/send-all-parties`. Copy the spec and this plan in, since they are uncommitted in the old checkout.
- Daniel applies all migrations. Write the file, paste its SQL to him, never run it. He applies it before anything is pushed, because `QC_CLIENT_SELECT` reads the new columns and the clients pages return 500 without them.
- Commit per task. Do not push; pushing to `main` happens only when Daniel asks, after Task 10.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `samples.tracking_number` never reaches anything a person sees: show the certificate number or contract refs.
- Company labels use `companyDisplayName()`. No emojis. No mock data in the product.
- Tolerance size stays as `src/lib/tolerance/limits.ts` has it: `SCREEN_TOLERANCE_PP = 5`, `DEFECT_TOLERANCE_EQ = 5`.
- Recipients stay contacts tagged `qc_certificates`, no fallback; `HOUSE_CC` stays locked.
- The CVA finalize route and the single-sample `notify-approval` route are not touched.
- Files stay under about 2,000 lines. `src/app/grading/page.tsx` is 2,008 today and Task 4 shrinks it. Tell Daniel if any file passes 2,200.
- Route files export only their handlers (`src/app/api/route-exports.test.ts`).

## Review Focus

1. A specialty lot reaching `certifyAfterGrading` with `cva_passed = true`, the client opted in and a screen inside tolerance: it must not be auto-approved. Test in Task 3.
2. A lot previously rejected, whose seller already has the rejection email, that later passes through the 5% rule: the seller must still get the approved-with-comments notice. Test in Task 6.
3. The switches cannot be read because of a database error: the 5% rule leaves the lot undecided rather than rejecting it, and the PDF stays with the client alone. Tests in Tasks 2 and 6.
4. Send history is per party: emailing the client must not mark the importer as sent, and the reverse. Test in Task 5.
5. A company that is client on one certificate and importer on another, in the same send: two emails, and only the client's files on the contract. Tests in Tasks 6 and 7.

---

### Task 1: Client switches

**Files:**
- Create: `database/migrations/20261109000000_qc_client_settings_parties_tolerance.sql`
- Modify: `src/lib/qc-client-mapper.ts`, `src/components/clients/qc-config-panel.tsx`, `src/components/clients/client-detail-view.tsx`, `src/app/clients/page.tsx`, `src/components/clients/add-client-modal.tsx`
- Test: `src/lib/qc-client-mapper.test.ts`

**Interfaces:**
- Produces: columns `qc_client_settings.tolerance_auto_approve` and `.certificates_to_all_parties`; `QcConfigData.toleranceAutoApprove: boolean`, `QcConfigData.certificatesToAllParties: boolean`.

- [ ] **Step 1: Create the worktree from `origin/main` on branch `feat/send-all-parties`, copy the spec and this plan in, commit them.**

- [ ] **Step 2: Write the migration, exactly the spec's SQL, and paste it to Daniel.**

```sql
ALTER TABLE qc_client_settings
  ADD COLUMN IF NOT EXISTS tolerance_auto_approve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificates_to_all_parties boolean NOT NULL DEFAULT false;
```

- [ ] **Step 3: Write the failing tests** in `qc-client-mapper.test.ts`, using that file's existing row and config builders.

```ts
it('reads both switches, off when absent', () => {
  expect(mapCompanyToClient(rowWith({ tolerance_auto_approve: true, certificates_to_all_parties: true })))
    .toMatchObject({ tolerance_auto_approve: true, certificates_to_all_parties: true })
  expect(mapCompanyToClient(rowWith({})))
    .toMatchObject({ tolerance_auto_approve: false, certificates_to_all_parties: false })
})
it('routes both switches to qc_client_settings', () => {
  expect(splitClientPayload({ tolerance_auto_approve: true, certificates_to_all_parties: true }).settingsFields)
    .toEqual({ tolerance_auto_approve: true, certificates_to_all_parties: true })
})
it('carries both switches into the create payload', () => {
  expect(buildQcClientCreatePayload(config({ toleranceAutoApprove: true, certificatesToAllParties: true })))
    .toMatchObject({ tolerance_auto_approve: true, certificates_to_all_parties: true })
})
```

- [ ] **Step 4: Run** `npx vitest run src/lib/qc-client-mapper.test.ts`. Expected: the three new tests FAIL.

- [ ] **Step 5: Implement.** In the mapper, add both columns to `QC_CLIENT_SELECT`, `QcSettings`, `QC_SETTINGS_FIELDS`, `mapCompanyToClient` (`?? false`) and `buildQcClientCreatePayload`. In `QcConfigPanel`, add both fields to `QcConfigData`, state, the sync effect (line 116) and the `onSave` object, and add two `SwitchRow`s after "Certificate validity period":
  - title "Automatic 5% approval", description "Approve near-miss lots with comments at finalize, with nobody reviewing them"
  - title "Share certificates with everyone", description "Importer, roaster and seller also receive the certificate PDF"

  Carry both fields through every place `qcFeeCoBrokerCompanyId` is mapped: `client-detail-view.tsx` lines 350, 629 and 830, `clients/page.tsx` lines 309 and 607, and the two `false` defaults in `add-client-modal.tsx`.

- [ ] **Step 6: Run** the test file, then `npx tsc --noEmit`. Expected: PASS, no type errors.

- [ ] **Step 7: Commit** `feat(clients): per-client switches for the 5% rule and sharing certificates`.

---

### Task 2: `approveWithinTolerance`

**Files:**
- Create: `src/lib/tolerance/auto-approve.ts`
- Test: `src/lib/tolerance/auto-approve.test.ts`

**Interfaces:**
- Consumes: `tolerance_auto_approve` (Task 1).
- Produces:

```ts
export type ToleranceOutcome =
  | { kind: 'not_applicable' }
  | { kind: 'approved'; groupIds: string[]; certificate: MintedCertificate | null; sellerEmail: SellerNoticeOutcome }
  | { kind: 'failed'; error: string }

export interface ApproveWithinToleranceInput {
  labId: string
  qualitySpecId: string | null
  clientId: string | null
  sampleCategory: string | null
  trackingNumber: string | null
  currentWorkflowStage: string | null
  assignedCupperIds: string[]
  userId: string
}

export function everyClientOptedIn(clientIds: Array<string | null>, optedIn: ReadonlySet<string>): boolean
export async function approveWithinTolerance(db: SupabaseClient<any>, input: ApproveWithinToleranceInput): Promise<ToleranceOutcome>
```

- [ ] **Step 1: Write the failing tests.** Build the fake database and hoisted mocks the way `src/app/api/samples/[id]/approve-with-comments/route.test.ts` does, recording every write in order. Mock `@/lib/cupping/finalize-pipeline` (`applyDecision`, `mintCertificates`), `@/lib/compliance` (`evaluateSampleCompliance`), `@/lib/tolerance/evaluate`, `@/lib/tolerance/sample-limits`, `@/lib/sample-group` (group `['lab-1','sib-1']`), `@/lib/approval-notification/tolerance-seller-send` and `@/lib/approval-notification/sys-decision-writeback`.

```ts
it('everyClientOptedIn: all on is on; one off, a null client or none at all is off', () => {
  expect(everyClientOptedIn(['a', 'b'], new Set(['a', 'b']))).toBe(true)
  expect(everyClientOptedIn(['a', 'b'], new Set(['a']))).toBe(false)
  expect(everyClientOptedIn(['a', null], new Set(['a']))).toBe(false)
  expect(everyClientOptedIn([], new Set())).toBe(false)
})
it('approves: audit row, walk to review, mint, then one write with status, stage and flag together', async () => {
  const out = await approveWithinTolerance(db, input)
  expect(out.kind).toBe('approved')
  expect(writeOrder()).toEqual(['insert sample_tolerance_approvals', 'mint', 'update samples', 'writeback', 'seller'])
  expect(applyDecision.mock.calls[0][1]).toMatchObject({ decision: 'pending' })
  expect(samplesUpdates()).toHaveLength(1)
  expect(samplesUpdates()[0]).toMatchObject({ status: 'approved', workflow_stage: 'certified', approved_with_comments: true })
  expect(mintCertificates.mock.calls[0][1]).toMatchObject({ decision: 'approved', isRejected: false, violations: [] })
})
it('writes the prefilled Portuguese comments and asks for the additional sample', async () => {
  await approveWithinTolerance(db, input)
  expect(auditRow()).toMatchObject({ comments: ['Melhorar peneira 18 para no mínimo 30%.'], request_additional_sample: true, sample_id: 'lab-1', decided_by: 'user-1' })
})
it('judges with the assigned cuppers, so the 5% check and the gate read the same scores', async () => {
  await approveWithinTolerance(db, { ...input, assignedCupperIds: ['c1'] })
  expect(evaluateSampleCompliance.mock.calls[0][3]).toEqual(['c1'])
})
it.each([
  ['a client switched off', () => optedIn([])],
  ['not offered', () => evaluate.mockReturnValue({ offered: false, items: [], blockedBy: ['Cup'] })],
  ['issued values fail', () => issued.mockResolvedValue({ ok: false, reason: 'x' })],
])('%s: not applicable, nothing written', async (_n, arrange) => {
  arrange()
  expect((await approveWithinTolerance(db, input)).kind).toBe('not_applicable')
  expect(writes).toHaveLength(0)
})
it('an Other Sample is not applicable', async () => {
  expect((await approveWithinTolerance(db, { ...input, sampleCategory: 'other' })).kind).toBe('not_applicable')
})
it('settings unreadable: failed, not a rejection, nothing written', async () => {
  settingsError('boom')
  expect((await approveWithinTolerance(db, input)).kind).toBe('failed')
  expect(writes).toHaveLength(0)
})
it('a member fails to mint: failed, new certificates and audit row removed, lot never approved, nobody told', async () => {
  mintCertificates.mockResolvedValue({ certificate: null, group: { minted: ['lab-1'], revised: [], unchanged: [], failed: [{ sampleId: 'sib-1', error: 'x' }], certificates: { 'lab-1': { id: 'cert-1', certificate_number: 'SAK-1/26' } } } })
  expect((await approveWithinTolerance(db, input)).kind).toBe('failed')
  expect(samplesUpdates()).toHaveLength(0)
  expect(deletes()).toEqual(['certificates cert-1', 'sample_tolerance_approvals'])
  expect(writeback).not.toHaveBeenCalled()
  expect(seller).not.toHaveBeenCalled()
})
it('the decision write fails: failed, new certificates and audit row removed', async () => {
  samplesUpdateError('boom')
  expect((await approveWithinTolerance(db, input)).kind).toBe('failed')
  expect(deletes()).toEqual(['certificates cert-1', 'sample_tolerance_approvals'])
})
it('a seller who could not be emailed does not undo the approval', async () => {
  seller.mockResolvedValue({ sent: [], waiting: ['Exportadora'] })
  expect((await approveWithinTolerance(db, input)).kind).toBe('approved')
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/tolerance/auto-approve.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** in this order, inside one `try/catch` that returns `failed`:
  1. `sampleCategory === 'other'` returns `not_applicable`.
  2. Read `client_id` for every `groupSampleIds(db, labId)` member, then `qc_client_settings` where `tolerance_auto_approve` for those companies. A read error returns `failed`. `everyClientOptedIn` false returns `not_applicable`.
  3. `evaluateSampleCompliance(db, labId, qualitySpecId, assignedCupperIds)`, then `evaluateTolerance`. Not offered returns `not_applicable`.
  4. `computeIssuedValuesForSample`. Not ok returns `not_applicable`.
  5. Insert `buildDecision({ items, issued, comments: prefillComments(items), requestAdditionalSample: true, userId })`. An error returns `failed`.
  6. `applyDecision(db, { sampleId: labId, decision: 'pending', currentWorkflowStage, actorUserId: userId, sellerComment: null })`, which walks to Review and stops.
  7. `mintCertificates(..., decision: 'approved', isRejected: false, violations: [])`. Any `group.failed` or a throw means undo.
  8. One direct `db.from('samples').update({ status: 'approved', workflow_stage: 'certified', approved_with_comments: true, updated_at }).in('id', groupIds)`. Do not use `applyDecisionToGroup`, which splits the flag into a second write. An error means undo.
  9. `writeDecisionToShipmentSamples(db, labId, userId, null)`.
  10. Load the actor's `profiles` row (`full_name, email, email_signature_html`) and call `sendSellerNoticeNow(db, groupIds, sender)`.

  Undo deletes the certificates in `group.minted` (by id) and the audit row, logs loudly, and returns `failed` with this text: `The lot is inside the 5% tolerance but could not be approved. Nothing was decided and it stays in Review. Finalize again to retry.` Certificates in `group.revised` are left for the retry to revise. No grading stamp is written: both callers run only with grading finalized.

- [ ] **Step 4: Run** the test file. Expected: PASS.

- [ ] **Step 5: Commit** `feat(tolerance): approve near-miss lots automatically, never approved without the flag`.

---

### Task 3: Wire both decision points

**Files:**
- Modify: `src/lib/cupping/certify-after-grading.ts`, `src/app/api/cupping/finalize/route.ts`
- Test: create `src/lib/cupping/certify-after-grading.test.ts`, `src/app/api/cupping/finalize/route.test.ts`

**Interfaces:**
- Consumes: `approveWithinTolerance`, `ToleranceOutcome` (Task 2).

- [ ] **Step 1: Write the failing tests**, mocking `@/lib/tolerance/auto-approve`, `@/lib/compliance`, `@/lib/cupping/certificate-mint` and the pipeline.

```ts
// certify-after-grading.test.ts
it('a commodity lot failing rules tries the 5% rule and returns the approved certificate', async () => {
  tolerance.mockResolvedValue({ kind: 'approved', groupIds: ['lab'], certificate: { id: 'c', certificate_number: 'SAK-1/26' }, sellerEmail: { sent: [], waiting: [] } })
  expect(await certifyAfterGrading(db, args)).toMatchObject({ decision: 'approved', violations: [], id: 'c' })
  expect(applyDecisionToGroup).not.toHaveBeenCalled()
  expect(closeSessionsOnceDecided).toHaveBeenCalled()
})
it('not applicable rejects as before', async () => {
  tolerance.mockResolvedValue({ kind: 'not_applicable' })
  expect(await certifyAfterGrading(db, args)).toMatchObject({ decision: 'rejected' })
})
it('failed leaves the lot undecided: null, no rejection written', async () => {
  tolerance.mockResolvedValue({ kind: 'failed', error: 'x' })
  expect(await certifyAfterGrading(db, args)).toBeNull()
  expect(applyDecisionToGroup).not.toHaveBeenCalled()
})
it('a specialty lot (no commodity scores, cva_passed true) never tries the 5% rule', async () => {
  commodityScores([]); assessment({ cva_passed: true, grading_finalized_at: 'x' })
  await certifyAfterGrading(db, args)
  expect(tolerance).not.toHaveBeenCalled()
})
it('a manual decision on a spec with no rules never tries the 5% rule', async () => {
  hasRules(false)
  await certifyAfterGrading(db, { ...args, manualDecision: 'rejected' })
  expect(tolerance).not.toHaveBeenCalled()
})

// finalize/route.test.ts
it('approved: answers approved, no second decision or mint, session closed', async () => {
  tolerance.mockResolvedValue({ kind: 'approved', groupIds: ['s1'], certificate: { id: 'c', certificate_number: 'SAK-1/26' }, sellerEmail: { sent: [], waiting: [] } })
  const body = await (await POST(req())).json()
  expect(body).toMatchObject({ decision: 'approved', violations: [] })
  expect(body.message).toBe('Sample approved with comments - Certificate SAK-1/26 generated')
  expect(applyDecision).not.toHaveBeenCalled()
  expect(mintCertificates).not.toHaveBeenCalled()
  expect(closeSessionIfComplete.mock.calls[0][1]).toMatchObject({ decision: 'approved', violations: [] })
})
it('failed: 500 with the reason, nothing rejected, session left open', async () => {
  tolerance.mockResolvedValue({ kind: 'failed', error: 'stays in Review' })
  const res = await POST(req())
  expect(res.status).toBe(500)
  expect((await res.json()).error).toBe('stays in Review')
  expect(applyDecision).not.toHaveBeenCalled()
  expect(closeSessionIfComplete).not.toHaveBeenCalled()
})
it('not applicable rejects as before', async () => {
  tolerance.mockResolvedValue({ kind: 'not_applicable' })
  await POST(req())
  expect(applyDecision.mock.calls[0][1]).toMatchObject({ decision: 'rejected' })
})
it('a passing lot and a manual rejection never try the 5% rule', async () => { /* compliance approved; then no-rules manual_decision */ expect(tolerance).not.toHaveBeenCalled() })
```

- [ ] **Step 2: Run** both files. Expected: FAIL.

- [ ] **Step 3: Implement `certifyAfterGrading`.** Hold `const judgedByRules = await checkHasValidationRules(...)`. After `decision` is computed and before `applyDecisionToGroup`, when `decision === 'rejected' && judgedByRules && commodityCupped`, call `approveWithinTolerance` with `labId`, `sample.client_id`, `sample.sample_category`, `workflow_stage` and `assignedCupperIds`, adding those fields to the `sample` parameter type and to what both callers select. On `failed`, log and return `null`: the quality-assessment route already answers `certificate_failed` with a "finalize again" message. On `approved`, call `closeSessionsOnceDecided` and return `{ id, certificate_number, decision: 'approved', violations: [] }`.

- [ ] **Step 4: Implement the route.** Immediately before the existing `applyDecision` call:

```ts
const tolerance = decision === 'rejected' && !isManualDecision && commodityScoreRows.length > 0
  ? await approveWithinTolerance(supabaseAdmin, { /* sample_id, spec, client, category, tracking, stage, uniqueCupperIdsList, user.id */ })
  : ({ kind: 'not_applicable' } as const)
if (tolerance.kind === 'failed') return NextResponse.json({ error: tolerance.error }, { status: 500 })
if (tolerance.kind === 'approved') {
  decision = 'approved'
  newWorkflowStage = 'certified'
  complianceResult = { approved: true, violations: [] }
}
```

  Run the existing `applyDecision` and mint block only when `tolerance.kind !== 'approved'`; otherwise set `certificate = tolerance.certificate`. Word the success message `Sample approved with comments - Certificate X generated` for this path. A retry is safe: the score freeze and cup-status writes are updates, and `assertCanFinalize` does not check session status.

- [ ] **Step 5: Run** both files and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(tolerance): both finalize paths apply the 5% rule automatically`.

---

### Task 4: Remove the manual button

**Files:**
- Delete: `src/components/grading/tolerance-banner.tsx` and `.test.tsx`, `src/components/grading/tolerance-confirm-dialog.tsx` and `.test.tsx`, `src/lib/tolerance/for-sample.ts` and `.test.ts`, `src/app/api/samples/[id]/approve-with-comments/` (route and test), `src/app/api/samples/[id]/tolerance/` (route and any test)
- Modify: `src/app/grading/page.tsx`; comments in `src/lib/tolerance/{decision-row,fetch,sample-limits}.ts`, `src/lib/cupping/{finalize-pipeline,certify-after-grading}.ts`

The routes go too. Keeping an unused service-role route that can approve a lot is a liability with no caller.

- [ ] **Step 1: Remove from `grading/page.tsx`** the imports at 59, 61 and 62, the state at 203-213, the effect and `confirmTolerance` at about 220-280, `currentTolerance` at 1295, the three banner mounts (1485, 1498, 1772) and the dialog (1990).

- [ ] **Step 2: Delete the files, and point the comments at `src/lib/tolerance/auto-approve.ts`.**

- [ ] **Step 3: Verify.** Run `git grep -n "approve-with-comments\|ToleranceBanner\|ToleranceConfirmDialog\|toleranceForSample" -- src`. Expected: no output. Then run `npx vitest run src/lib/tolerance src/app/api/route-exports.test.ts` and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 4: Commit** `refactor(grading): the 5% rule runs at finalize, so the manual button goes`.

---

### Task 5: The party model and per-party history

**Files:**
- Modify: `src/lib/approval-notification/types.ts`, `certificate-parties.ts`, `batch-send.ts` (status section only), `prior-sends.ts`
- Test: `certificate-parties.test.ts`, `batch-send.test.ts`, `prior-sends.test.ts`

**Interfaces:**
- Produces, in `types.ts`: `export type CertificateParty = 'buyer' | 'importer' | 'roaster' | 'seller'` and `export const ALL_PARTIES: CertificateParty[]` in that order. `ApprovalSide` stays for `notify-approval`.
- Produces, in `certificate-parties.ts`:

```ts
// SampleCounterparties gains roaster_id: string | null. CertificateParties gains importerId, roasterId.
export const PARTY_SEND_GO_LIVE = '2026-11-10'
export function isBeforePartyGoLive(issuedAt: string | null): boolean // null counts as before
export function certificatePartyCompanies(p: CertificateParties): Array<{ party: CertificateParty; companyId: string }>
export function requiredParties(p: CertificateParties, issuedAt: string | null): RequiredParties
export function audienceOf(party: CertificateParty): 'buyer' | 'seller'
export function parseChosenParties(param: string | null): Set<CertificateParty> | undefined // null = all; always includes 'buyer'; unknown names dropped
```

- Produces, in `batch-send.ts`: `RequiredParties = { buyer: boolean; seller: boolean; importer?: boolean; roaster?: boolean }`; `SampleSendStatus` gains `importerSent` and `roasterSent`; `SendStatusRow.side: CertificateParty`; `sentFor(status: SampleSendStatus | undefined, party: CertificateParty): SideSend | null`.

- [ ] **Step 1: Write the failing tests.**

```ts
const p = (o: Partial<CertificateParties>): CertificateParties => ({ contractId: null, buyerId: null, sellerId: null, importerId: null, roasterId: null, buyerReference: null, sellerReference: null, contractNumber: null, ...o })

it('a company holding several buyer-side roles gets one, the first of client, importer, roaster', () => {
  expect(certificatePartyCompanies(p({ buyerId: 'blaser', importerId: 'blaser', roasterId: 'r1', sellerId: 's1' })))
    .toEqual([{ party: 'buyer', companyId: 'blaser' }, { party: 'roaster', companyId: 'r1' }, { party: 'seller', companyId: 's1' }])
  expect(certificatePartyCompanies(p({ importerId: 'x', roasterId: 'x' }))).toEqual([{ party: 'importer', companyId: 'x' }])
})
it('a company that is seller and client keeps both', () => {
  expect(certificatePartyCompanies(p({ buyerId: 'x', sellerId: 'x' }))).toEqual([{ party: 'buyer', companyId: 'x' }, { party: 'seller', companyId: 'x' }])
})
it('importers and roasters are owed only from go-live', () => {
  const parties = p({ buyerId: 'c', importerId: 'i', roasterId: 'r', sellerId: 's' })
  expect(requiredParties(parties, '2026-11-09T23:00:00Z')).toEqual({ buyer: true, seller: true, importer: false, roaster: false })
  expect(requiredParties(parties, '2026-11-10T00:00:00Z')).toEqual({ buyer: true, seller: true, importer: true, roaster: true })
  expect(requiredParties(parties, null).importer).toBe(false)
})
it('a deduped importer is not owed', () => {
  expect(requiredParties(p({ buyerId: 'b', importerId: 'b' }), '2026-12-01').importer).toBe(false)
})
it('only the seller reads the seller version', () => {
  expect(['buyer', 'importer', 'roaster', 'seller'].map((x) => audienceOf(x as CertificateParty))).toEqual(['buyer', 'buyer', 'buyer', 'seller'])
})
it('the client is always chosen', () => {
  expect([...parseChosenParties('seller,nonsense')!].sort()).toEqual(['buyer', 'seller'])
  expect(parseChosenParties(null)).toBeUndefined()
})

// batch-send.test.ts
it('tracks each party on its own, and full needs every required one', () => {
  const rows: SendStatusRow[] = [{ sampleId: 's1', side: 'buyer', sentBy: 'A', sentAt: 't' }]
  const m = computeSendStatus(rows, new Map([['s1', { buyer: true, seller: false, importer: true }]]))
  expect(m.get('s1')).toMatchObject({ importerSent: null, full: false })
  expect(sentFor(m.get('s1'), 'buyer')?.by).toBe('A')
  expect(sentFor(m.get('s1'), 'importer')).toBeNull()
})

// prior-sends.test.ts
it('keeps importer and roaster sends and still drops unknown sides', () => { /* side: 'importer', 'roaster', 'foo' => two rows */ })
```

- [ ] **Step 2: Run** the three files. Expected: FAIL.

- [ ] **Step 3: Implement.** `prior-sends.ts` is the only reader of `email_messages.metadata.side` on `main`, so no other history reader needs changing. `importerId` and `roasterId` come from the sample only (`sample.importer_id`, `sample.roaster_id`). `certificatePartyCompanies` dedupes among buyer, importer and roaster; the seller is never deduped. Add `roaster_id` to the select lists in `send-queue.ts` and `send-unit.ts` and to `sampleKeys` in `src/app/api/certificates/route.ts`, so the required field compiles. Fix every test fixture of `SampleCounterparties` with `roaster_id: null`. Update `toEqual` expectations of `resolveCertificateParties` to include the two new fields.

- [ ] **Step 4: Run** the three files and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(send): four parties with their own send history`.

---

### Task 6: The queue builds one email per party

**Files:**
- Modify: `src/lib/approval-notification/batch-send.ts` (units), `send-queue.ts`, `tolerance-seller-send.ts`, `src/app/api/certificates/batch-send/queue/route.ts`
- Test: `batch-send.test.ts`, `tolerance-seller-send.test.ts`, `src/app/api/certificates/batch-send/queue/route.test.ts`

**Interfaces:**
- Consumes: Task 5's helpers.
- Produces:
  - `BatchSampleInput` gains optional `importerId`, `roasterId`, `qcClientId`, `shareWithAll`.
  - `BatchUnit.side: CertificateParty`, `BatchUnit.qcClientName: string | null` (seller units only), `BatchUnitSample.attach: boolean`.
  - `BatchUnit.attachCertificates` is now only the composer's override and the queue leaves it unset.
  - `buildBatchUnits` options: `{ parties?: ReadonlySet<CertificateParty>; includeAlreadySent?: boolean; includePreGoLive?: boolean }`.
  - `SendQueueOptions` replaces `onlySide` with `parties?: Set<CertificateParty>` and adds `includeAlreadySent?: boolean`.
  - `export async function fetchShareWithAllClients(db, clientIds: string[]): Promise<Set<string>>`.
  - Queue route params: `parties` (comma list), `includeSent=1`; `side` is removed.

- [ ] **Step 1: Write the failing tests.** Replace `onlySide` usages. Add to `batch-send.test.ts`:

```ts
const after = { date: '2026-12-01', buyerReference: null, sellerReference: null }
const s = (over: Partial<BatchSampleInput>): BatchSampleInput => ({ sampleId: 's1', buyerId: 'c1', sellerId: 'x', ...after, line: line(), ...over })
const order = (us: BatchUnit[]) => us.map((u) => `${u.side}:${u.companyId}`)

it('orders clients, importers, roasters, sellers', () => {
  expect(order(buildBatchUnits([s({ importerId: 'i1', roasterId: 'r1', qcClientId: 'c1' })], new Map(), new Map(), new Map())))
    .toEqual(['buyer:c1', 'importer:i1', 'roaster:r1', 'seller:x'])
})
it('splits a seller by QC client, one email each, a lot with no client on its own', () => {
  const units = buildBatchUnits([s({ sampleId: 'a', qcClientId: 'c1' }), s({ sampleId: 'b', qcClientId: 'c2' }), s({ sampleId: 'n', qcClientId: null })], new Map(), new Map(), new Map([['c1', 'Blaser'], ['c2', 'Ahold']]), { parties: new Set(['seller']) })
  expect(units.map((u) => u.samples.map((l) => l.sampleId))).toEqual([['n'], ['b'], ['a']])
  expect(units.map((u) => u.qcClientName)).toEqual([null, 'Ahold', 'Blaser'])
})
it('client on one certificate and importer on another: two emails', () => {
  const units = buildBatchUnits([s({ sampleId: 'a', buyerId: 'b' }), s({ sampleId: 'c', buyerId: 'z', importerId: 'b' })], new Map(), new Map(), new Map(), { parties: new Set(['buyer', 'importer']) })
  expect(order(units)).toEqual(['buyer:b', 'buyer:z', 'importer:b'])
})
it('attach defaults per certificate: the client, or anyone when shared with all', () => {
  const units = buildBatchUnits([s({ sampleId: 'a', importerId: 'i' }), s({ sampleId: 'd', importerId: 'i', shareWithAll: true })], new Map(), new Map(), new Map())
  expect(units.find((u) => u.side === 'buyer')!.samples.every((l) => l.attach)).toBe(true)
  expect(units.find((u) => u.side === 'importer')!.samples.map((l) => [l.sampleId, l.attach])).toEqual([['a', false], ['d', true]])
})
it('skips importers on older certificates unless asked, and only the chosen parties', () => {
  const old = s({ date: '2026-10-01', importerId: 'i' })
  expect(order(buildBatchUnits([old], new Map(), new Map(), new Map(), { parties: new Set(['buyer', 'importer']) }))).toEqual(['buyer:c1'])
  expect(order(buildBatchUnits([old], new Map(), new Map(), new Map(), { parties: new Set(['buyer', 'importer']), includePreGoLive: true }))).toEqual(['buyer:c1', 'importer:i'])
})
it('a party with no contact is flagged and does not stop the others', () => {
  const units = buildBatchUnits([s({ importerId: 'i' })], new Map(), new Map([['c1', panel('all', ['a@b.c'])]]), new Map())
  expect(units.find((u) => u.side === 'importer')!.needsRecipients).toBe(true)
  expect(units.find((u) => u.side === 'buyer')!.needsRecipients).toBe(false)
})
```

  Add to `queue/route.test.ts`, seeding `qc_client_settings`:

```ts
it('emails each seller once per QC client', async () => {
  const { body } = await get('from=2026-09-14&to=2026-09-14')
  expect(summary(body.units)).toEqual(['buyer Ahold: san-921', 'buyer Dunkin: san-d1', 'seller LDC Suisse: san-921', 'seller LDC Suisse: san-d1'])
})
it('leaves out already-sent pairs in a selection unless includeSent is passed', async () => { /* buyer send logged for san-921; sampleIds=san-921 omits buyer; &includeSent=1 restores it */ })
it('honours the chosen parties, always with the client', async () => { /* &parties=seller => buyer + seller units, no importer */ })
it('attaches for every party when the client shares with everyone', async () => { /* Dunkin row certificates_to_all_parties: true => seller unit samples attach true; Ahold false */ })
```

  Update the "seller once for all" and `clientIds=dunkin` expectations. Add to `tolerance-seller-send.test.ts`:

```ts
it('asks for the seller only, including one already sent the earlier rejection', async () => {
  await sendSellerNoticeNow({} as any, ['lab-1'], sender)
  const opts = h.loadSendQueue.mock.calls[0][1]
  expect([...opts.parties]).toEqual(['seller'])
  expect(opts.includeAlreadySent).toBe(true)
})
it('sends every unit of a seller split by client, with each certificate attach default', async () => {
  h.loadSendQueue.mockResolvedValue({ status: 200, body: { units: [unit({ samples: [{ sampleId: 'a', attach: true }] }), unit({ samples: [{ sampleId: 'b', attach: false }] })] } })
  await sendSellerNoticeNow({} as any, ['a', 'b'], sender)
  expect(h.sendCertificateUnit).toHaveBeenCalledTimes(2)
  expect(h.sendCertificateUnit.mock.calls[0][1].certRefs).toEqual([{ sampleId: 'a', attach: true }])
  expect(h.sendCertificateUnit.mock.calls[0][1].includeCertificates).toBeUndefined()
})
```

  Add a `fetchShareWithAllClients` test: a read error returns an empty set.

- [ ] **Step 2: Run** the three files. Expected: FAIL.

- [ ] **Step 3: Implement `buildBatchUnits`.** Loop `ALL_PARTIES`, filtered by `opts.parties`. Bucket on `certificatePartyCompanies`, with key `companyId`, or `companyId|qcClientId` for sellers. Sort by company name, then `qcClientName` (null first). Skip via `sentFor` unless `includeAlreadySent`. Skip importer and roaster when `isBeforePartyGoLive(s.date)` unless `includePreGoLive`. Set `attach: party === 'buyer' || !!s.shareWithAll`. Pass `audienceOf(party)` to the batch template.

- [ ] **Step 4: Implement `loadSendQueue`.** Select `roaster_id`. Add importer and roaster to `partyIds`. Fill `required` from `requiredParties(parties, c.created_at)`. Load `fetchShareWithAllClients` for the certificates' clients, reading only when it is not `clientsView`. In explicit mode pass `includeAlreadySent: opts.includeAlreadySent` and `includePreGoLive: true`; otherwise pass neither. For each unit: `attached = samples.some(attach)`, group by `qcClient` for sellers and `seller` otherwise, audience from `audienceOf(u.side)`, and do not set `u.attachCertificates`. Count `noRecipients` only when no party filter is narrowing the send (`!opts.parties || opts.parties.size === ALL_PARTIES.length`).

- [ ] **Step 5: Implement the route and the seller notice.** The route uses `parseChosenParties(sp.get('parties'))` and `includeAlreadySent: sp.get('includeSent') === '1'`. `sendSellerNoticeNow` passes `parties: new Set(['seller'])`, `includeAlreadySent: true`, `certRefs` with each `attach`, and no `includeCertificates`. Dedupe the names in `out.sent` and `out.waiting`.

- [ ] **Step 6: Run** the three files. Expected: PASS. `npx tsc --noEmit` may still flag `attach` on `CertRef` and the composer's `selection.side`; Tasks 7 and 9 finish those, and no other errors are acceptable.

- [ ] **Step 7: Commit** `feat(send): one email per party, sellers split by client, attachment per certificate`.

---

### Task 7: Sending respects the party

**Files:**
- Modify: `src/lib/approval-notification/send-unit.ts`, `src/app/api/certificates/batch-send/route.ts`
- Test: `src/app/api/certificates/batch-send/route.test.ts`

**Interfaces:**
- Consumes: `CertificateParty`, `audienceOf`, `ALL_PARTIES` (Task 5).
- Produces: `CertRef = { sampleId: string; attach?: boolean }`; `SendUnitInput.side: CertificateParty`. Per certificate, attachment resolves as `ref.attach ?? input.includeCertificates ?? side === 'buyer'`.

- [ ] **Step 1: Write the failing tests**, on the file's existing fake with a linked contract.

```ts
it('an importer send files nothing on the contract and writes nothing to sys, even with a PDF', async () => {
  const res = await POST(request({ ...body, side: 'importer', certificates: [{ sampleId: 's', attach: true }] }))
  expect(res.status).toBe(200)
  expect(h.writes.filter((w) => w.table === 'documents')).toHaveLength(0)
  expect(h.uploads).toHaveLength(0)
  expect(h.applyShipmentSampleApproval).not.toHaveBeenCalled()
})
it('a seller send with a PDF does not file or write back either', async () => { /* side: 'seller', attach: true => same three assertions */ })
it('the client send still files and writes back', async () => { /* side: 'buyer' => one documents row, write-back called once */ })
it.each(['importer', 'roaster'])('%s reads the client version', async (side) => {
  await POST(request({ ...body, side }))
  expect(summaryOpts()).toEqual({ sellerComment: false, audience: 'buyer' })
})
it('the attach flag is per certificate', async () => {
  await POST(request({ ...body, side: 'importer', certificates: [{ sampleId: 'a', attach: true }, { sampleId: 'b', attach: false }] }))
  expect(h.sendMail.mock.calls[0][0].attachments).toHaveLength(1)
})
it('logs the send against the party', async () => {
  await POST(request({ ...body, side: 'roaster' }))
  expect(h.writes.find((w) => w.table === 'email_messages')!.payload.metadata).toMatchObject({ side: 'roaster' })
})
it('refuses an unknown party', async () => {
  expect((await POST(request({ ...body, side: 'nobody' }))).status).toBe(400)
})
```

  To read `summaryOpts()`, spy on `buildQualitySummaryHtml` with a partial mock of `quality-summary`.

- [ ] **Step 2: Run** the file. Expected: FAIL.

- [ ] **Step 3: Implement.** In `sendCertificateUnit`, the annex and write-back gate becomes `side === 'buyer' && v.attachment && v.contractId`. Grouping uses `isSeller ? 'qcClient' : 'seller'`. `composeQualityBody` takes its audience from `audienceOf(side)`. Attachments come from each `Valid.attachment`. Change the unit comment "Annexing ... BUYER side" to say the client's send only. In the route, validate `side` against `ALL_PARTIES` before anything else and keep `attach` when deduping refs, only when it is a boolean.

- [ ] **Step 4: Run** the file. Expected: PASS.

- [ ] **Step 5: Commit** `fix(send): only the client's send files on the contract; every other party reads the client version`.

---

### Task 8: Certificates list shows all parties

**Files:**
- Modify: `src/app/api/certificates/route.ts`, `src/app/certificates/page.tsx`
- Test: `src/app/api/certificates/route.test.ts`

**Interfaces:**
- Consumes: `requiredParties`, `SampleSendStatus` (Task 5).
- Produces: `send_status` gains `importerSent` and `roasterSent`; `batchSelection` becomes `{ sampleIds: string[] }`.

- [ ] **Step 1: Write the failing tests.** Update the `toEqual` at line 122 with `importerSent: null, roasterSent: null`, and add:

```ts
it('an older certificate is not partial for want of its importer', async () => { /* created_at before go-live, importer set, buyer and seller sent => full true */ })
it('a new certificate is partial until its importer has it', async () => { /* created_at after go-live, buyer and seller sent => full false, importerSent null */ })
```

- [ ] **Step 2: Run** the file. Expected: FAIL.

- [ ] **Step 3: Implement the route.** Build `required` from `requiredParties(parties, cert.created_at)` and add the two chips.

- [ ] **Step 4: Implement the page.** Add the two fields to the `send_status` type. In the Sent column, use all four chips for `last`, and title lines labelled `Client`, `Importer`, `Roaster`, `Seller`. In the Actions menu, replace both send items and their hint lines with one enabled `Send` item calling `setBatchSelection({ sampleIds })`, and remove `buyers`, `sellers`, `canBuyer`, `canSeller`.

- [ ] **Step 5: Run** the file. Expected: PASS.

- [ ] **Step 6: Commit** `feat(certificates): Sent column covers all parties; one Send action with no single-company limit`.

---

### Task 9: Choosing parties and walking the emails

**Files:**
- Create: `src/components/certificates/party-choice.tsx`
- Modify: `src/components/certificates/qc-client-step.tsx`, `batch-approval-send-view.tsx`, `src/lib/approval-notification/batch-send.ts`
- Test: `party-choice.test.tsx`, `qc-client-step.test.tsx`, `batch-approval-send-view.test.tsx`, `batch-send.test.ts`

**Interfaces:**
- Consumes: `BatchUnit`, `CertificateParty` (Tasks 5 and 6).
- Produces:

```ts
// batch-send.ts
export function attachedSampleIds(unit: BatchUnit): string[] // override true = all; override false = none; unset = samples with attach
export function composerPosition(units: BatchUnit[], index: number): { label: string; divider: string | null }

// party-choice.tsx
export function PartyChoice(props: { value: CertificateParty[]; onChange: (next: CertificateParty[]) => void }): JSX.Element
export function PartyStep(props: { count: number; onContinue: (parties: CertificateParty[], includeSent: boolean) => void }): JSX.Element

// qc-client-step.tsx
onContinue: (clientIds: string[], parties: CertificateParty[]) => void

// batch-approval-send-view.tsx
selection?: { sampleIds: string[] }
```

- [ ] **Step 1: Write the failing tests.**

```ts
// batch-send.test.ts
it('attachedSampleIds follows the override, else each certificate', () => {
  const u = { attachCertificates: undefined, samples: [{ sampleId: 'a', attach: true }, { sampleId: 'b', attach: false }] } as unknown as BatchUnit
  expect(attachedSampleIds(u)).toEqual(['a'])
  expect(attachedSampleIds({ ...u, attachCertificates: true })).toEqual(['a', 'b'])
  expect(attachedSampleIds({ ...u, attachCertificates: false })).toEqual([])
})
it('composerPosition counts within the party and announces a change', () => {
  const us = [{ side: 'buyer' }, { side: 'importer' }, { side: 'importer' }, { side: 'seller' }] as BatchUnit[]
  expect(composerPosition(us, 0)).toEqual({ label: 'Client 1 of 1', divider: null })
  expect(composerPosition(us, 1)).toEqual({ label: 'Importer 1 of 2', divider: 'Now sending to IMPORTERS' })
  expect(composerPosition(us, 2)).toEqual({ label: 'Importer 2 of 2', divider: null })
  expect(composerPosition(us, 3)).toEqual({ label: 'Seller 1 of 1', divider: 'Now sending to SELLERS' })
})
```

```tsx
// party-choice.test.tsx
it('starts with All parties and every party ticked, and the client cannot be unticked', ...)
it('unticking All parties leaves only the client; re-ticking restores all', ...)
it('unticking one party unticks All parties', ...)
it('PartyStep has Include already sent off by default and passes it on', ...)

// qc-client-step.test.tsx: update the two onContinue expectations
expect(onContinue).toHaveBeenCalledWith(['ahold', 'dunkin'], ['buyer', 'importer', 'roaster', 'seller'])

// batch-approval-send-view.test.tsx: replace the bulk test
it('asks for the parties for a selection, then loads that queue', async () => {
  render(<BatchApprovalSendView open selection={{ sampleIds: ['s1', 's2'] }} onClose={() => {}} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(lastFetchUrl()).toContain('sampleIds=s1%2Cs2'))
  expect(lastFetchUrl()).toContain('parties=buyer%2Cimporter%2Croaster%2Cseller')
  expect(lastFetchUrl()).not.toContain('includeSent')
})
it('posts each certificate with its own attach flag', ...)
it('names the client on a seller split', ...) // the panel title reads "Exportadora (seller, for Blaser)"
```

  Update the attachment tests' fixtures with `attach` on each sample. The "defaults to checked for a buyer" and "defaults to unchecked for a seller" cases now read from `attach`.

- [ ] **Step 2: Run** the four files. Expected: FAIL.

- [ ] **Step 3: Implement.** `PartyChoice` shows "All parties", then Client (checked and disabled), Importer, Roaster, Seller. `PartyStep` wraps it with "Include already sent" and a Continue button. `QcClientStep` gets `PartyChoice` above the list and its copy changes to: "Clients first, then importers and roasters. Sellers follow, one email for each client." Styling follows `qc-client-step.tsx` (no new tokens).

- [ ] **Step 4: Implement the composer.** Selection mode opens on `PartyStep`, then `loadQueue` with `sampleIds`, `parties` and optional `includeSent=1`. Range mode passes `parties` from the client step. Replace `attachesCerts` with `attachedSampleIds(u).length > 0`. Post `certificates: samples.map((s) => ({ sampleId: s.sampleId, attach: ids.has(s.sampleId) }))` and drop `includeCertificates`. The attached panel lists only attached certificates and titles itself "N of M certificates attached" when they differ. The hint beside the checkbox shows for any non-client party: "(normally only the client receives them)". Use `composerPosition` for the header and divider. The `RecipientPanel` title uses the party's label, plus `, for <qcClientName>` when present.

- [ ] **Step 5: Run** the four files, then `npx tsc --noEmit`. Expected: PASS, no type errors anywhere.

- [ ] **Step 6: Commit** `feat(send): choose the parties, walk one email per party`.

---

### Task 10: Whole-branch check and handover

**Files:** none unless a check fails; `PARTY_SEND_GO_LIVE` in `certificate-parties.ts` if the date moved.

- [ ] **Step 1: Run** `npx vitest run`. Expected: no failures beyond those already failing on `origin/main`. Compare against a baseline run and report any difference with its output.

- [ ] **Step 2: Run** `npx tsc --noEmit` and `npx next build`. Expected: both succeed. The build is what catches stray route exports.

- [ ] **Step 3: Scan what people see.** Run `git diff origin/main --stat` and `wc -l` on every touched file; report anything over 2,000. Run `git diff origin/main | grep -n "tracking_number"`; every added line must be a join key or a check, never rendered.

- [ ] **Step 4: Set `PARTY_SEND_GO_LIVE`** to the day the push will happen if it is no longer `2026-11-10`.

- [ ] **Step 5: Hand to Daniel, without pushing:** paste the SQL again, ask him to apply it, then ask whether to merge to `main` and push. After the push, remind him that near-misses reject with no button until he ticks clients, to switch on "Share certificates with everyone" for Dunkin', and list the spec's Acceptance items that need a live check: a real send to each party, the PDF on a Dunkin' lot, the Actions send of mixed-seller Blaser certificates.

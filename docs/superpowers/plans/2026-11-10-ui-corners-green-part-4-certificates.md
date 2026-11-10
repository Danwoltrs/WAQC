# Part 4: Certificates, the Send dropdown, the editor and the approval send view

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send on Certificates opens a dropdown that lists only the parties on the ticked certificates, by company name in supply-chain order, and goes straight to the email walk-through. The Certificates page, its editor overlay and the single-sample approval send view adopt the shared header, selection bar, row actions and pinned footers.

**Architecture:** The batch-send queue route gains a `view=parties` mode. It runs the same certificate load and party resolution as the queue, then returns one entry per party with the companies in it (a pure `summarizeParties` in `certificate-parties.ts`). A new `SendPartiesPopover` fetches that, reuses `PartyChoice` (now able to list named options), and hands the chosen parties to `BatchApprovalSendView`, which loses its party step.

**Tech Stack:** Next.js route handlers, Supabase, React, shadcn/ui, vitest + Testing Library.

**Spec:** §6.3 of `docs/superpowers/specs/2026-09-28-ui-corners-and-button-placement-design.md`. Index: `docs/superpowers/plans/2026-11-10-ui-corners-green.md`. Background: `docs/superpowers/specs/2026-11-09-send-all-parties-automatic-tolerance-design.md` (party rules, PDF sharing, go-live).

**Depends on:** Parts 1 and 2 on `main`. Part 3 need not be done first.

**Vocabulary:** the stored party `buyer` is shown as "Client" (`partyLabel`). Daniel's "exporter" is the seller. Dunkin' lots run Seller › Importer › Roaster › Dunkin' (the client).

---

### Task 1: `summarizeParties`

**Files:**
- Modify: `src/lib/approval-notification/certificate-parties.ts`
- Test: `src/lib/approval-notification/certificate-parties.test.ts` (create if absent)

**Interfaces:**
- Consumes: `CertificateParties`, `certificatePartyCompanies` (same file).
- Produces:

```ts
export interface PartyOption { party: CertificateParty; companies: Array<{ id: string; name: string }> }
/** Supply-chain order for display: seller, importer, roaster, client. */
export const PARTY_CHAIN_ORDER: CertificateParty[] = ['seller', 'importer', 'roaster', 'buyer']
export function summarizeParties(certs: CertificateParties[], nameOf: (companyId: string) => string): PartyOption[]
```

- [ ] **Step 1: Failing tests**

```ts
const p = (o: Partial<CertificateParties>): CertificateParties => ({
  contractId: null, buyerId: null, sellerId: null, importerId: null, roasterId: null,
  buyerReference: null, sellerReference: null, contractNumber: null, ...o,
})
const names: Record<string, string> = { dunkin: "Dunkin'", ldc: 'LDC Suisse', imp: 'Olam', roa: 'Roaster Co', blaser: 'Blaser', ahold: 'Ahold' }
const nameOf = (id: string) => names[id] ?? id

it('client and seller only: two entries, seller first', () => {
  expect(summarizeParties([p({ buyerId: 'ahold', sellerId: 'ldc' })], nameOf)).toEqual([
    { party: 'seller', companies: [{ id: 'ldc', name: 'LDC Suisse' }] },
    { party: 'buyer', companies: [{ id: 'ahold', name: 'Ahold' }] },
  ])
})
it("a Dunkin' lot: four entries in chain order", () => {
  const out = summarizeParties([p({ buyerId: 'dunkin', sellerId: 'ldc', importerId: 'imp', roasterId: 'roa' })], nameOf)
  expect(out.map((o) => o.party)).toEqual(['seller', 'importer', 'roaster', 'buyer'])
})
it('a company that is client and importer shows once, as client', () => {
  const out = summarizeParties([p({ buyerId: 'blaser', importerId: 'blaser', sellerId: 'ldc' })], nameOf)
  expect(out.map((o) => o.party)).toEqual(['seller', 'buyer'])
})
it('dedupes companies across certificates and sorts them by name', () => {
  const out = summarizeParties([p({ buyerId: 'dunkin', sellerId: 'ldc' }), p({ buyerId: 'ahold', sellerId: 'ldc' })], nameOf)
  expect(out.find((o) => o.party === 'buyer')!.companies.map((c) => c.name)).toEqual(['Ahold', "Dunkin'"])
  expect(out.find((o) => o.party === 'seller')!.companies).toHaveLength(1)
})
it('nothing resolved: empty', () => { expect(summarizeParties([p({})], nameOf)).toEqual([]) })
```

- [ ] **Step 2:** `npx vitest run src/lib/approval-notification/certificate-parties.test.ts` → FAIL (not exported).
- [ ] **Step 3: Implement.** For each certificate, take `certificatePartyCompanies(c)` (it already applies the per-certificate buyer-side dedupe), collect company ids per party, then emit parties in `PARTY_CHAIN_ORDER`, skipping empty ones, with companies sorted by `name` (`localeCompare`).
- [ ] **Step 4:** Run → PASS. Commit `feat(send): summarize the parties on a set of certificates in supply-chain order`.

---

### Task 2: `view=parties` on the queue route

**Files:**
- Modify: `src/lib/approval-notification/send-queue.ts` (`SendQueueOptions` ~line 73; inside `loadSendQueue`, right after `companyNameById` is filled, ~line 200)
- Modify: `src/app/api/certificates/batch-send/queue/route.ts` (read `view=parties`)
- Test: `src/app/api/certificates/batch-send/queue/route.test.ts`

**Interfaces:**
- Produces: `SendQueueOptions.partiesView?: boolean`. `GET /api/certificates/batch-send/queue?view=parties&sampleIds=a,b` → `200 { parties: PartyOption[] }`; `{ parties: [] }` when no certificate matches. Staff-only, as the route is today. Only explicit selections use it.

- [ ] **Step 1: Failing tests** (in the route test file, reusing its harness `h`, `get` and fixtures)

```ts
it('view=parties lists the parties on the chosen certificates', async () => {
  // a Dunkin' certificate whose sample carries importer and roaster
  h.tables.certificates = [{ ...dunkinCert, sample: { ...dunkinCert.sample, importer_id: 'imp', roaster_id: 'roa' } }]
  h.tables.companies = [...h.tables.companies, { id: 'imp', name: 'Olam', fantasy_name: null }, { id: 'roa', name: 'Roaster Co', fantasy_name: null }]
  const { status, body } = await get(`view=parties&sampleIds=${dunkinCert.sample_id}`)
  expect(status).toBe(200)
  expect(body.parties.map((p: any) => p.party)).toEqual(['seller', 'importer', 'roaster', 'buyer'])
  expect(body.parties.at(-1).companies[0].name).toBe('Dunkin')
  expect(body.units).toBeUndefined()
})
it('view=parties with nothing matching returns an empty list', async () => {
  const { body } = await get('view=parties&sampleIds=nope')
  expect(body).toEqual({ parties: [] })
})
```

Match the fixture shapes the file already uses (`dunkinCert`, company rows). If the harness keys samples differently, adapt the setup, not the assertions.

- [ ] **Step 2:** `npx vitest run src/app/api/certificates/batch-send/queue/route.test.ts` → FAIL.
- [ ] **Step 3: Implement.** In `loadSendQueue`: if `opts.partiesView`, return `{ status: 200, body: { parties: summarizeParties([...partiesByKey.values()], (id) => companyNameById.get(id) ?? id) } }` straight after the names are loaded, before contacts are read. The early "no certificates" return gives `{ parties: [] }` in this mode. Already-sent pairs are not filtered here: the popover shows who *could* be sent to, and "Include already sent" still decides at queue time. The route passes `partiesView: sp.get('view') === 'parties'` and returns `result.body` untouched in that mode. Keep `route.ts` exporting only `GET`.
- [ ] **Step 4:** Run → PASS (the existing route tests too). Commit `feat(send): queue route answers which parties a selection has`.

---

### Task 3: `PartyChoice` lists named options; `PartyStep` goes

**Files:**
- Modify: `src/components/certificates/party-choice.tsx`, `party-choice.test.tsx`

**Interfaces:**
- Consumes: `PartyOption`, `PARTY_CHAIN_ORDER` (Task 1), `partyLabel`.
- Produces: `PartyChoice({ value, onChange, options? }: { value: CertificateParty[]; onChange: (next: CertificateParty[]) => void; options?: PartyOption[] })`. With `options`: one row per option in the given order, labelled `"<partyLabel> · <names>"`, where names = first two joined by ", " plus " +N". "All parties" toggles only the listed parties. Without `options`: today's behaviour (all four, `ALL_PARTIES` order), still used by `QcClientStep`. `onChange` always emits parties in `ALL_PARTIES` order (`buyer, importer, roaster, seller`), client always included. `PartyStep` is deleted.

- [ ] **Step 1: Failing tests** (replace the `PartyStep` describe)

```tsx
const dunkin: PartyOption[] = [
  { party: 'seller', companies: [{ id: 'ldc', name: 'LDC Suisse' }] },
  { party: 'importer', companies: [{ id: 'imp', name: 'Olam' }] },
  { party: 'roaster', companies: [{ id: 'roa', name: 'Roaster Co' }] },
  { party: 'buyer', companies: [{ id: 'd', name: "Dunkin'" }] },
]
it('lists the given parties in order with company names', () => {
  render(<Harness options={dunkin} initial={['buyer', 'importer', 'roaster', 'seller']} />)
  expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')!.textContent))
    .toEqual(['All parties', 'Seller · LDC Suisse', 'Importer · Olam', 'Roaster · Roaster Co', "Client · Dunkin'"])
})
it('shows only listed parties', () => {
  render(<Harness options={[dunkin[0], dunkin[3]]} initial={['buyer', 'seller']} />)
  expect(screen.getAllByRole('checkbox')).toHaveLength(3)
})
it('names more than two companies as two plus "+N"', () => {
  render(<Harness options={[{ party: 'buyer', companies: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] }]} initial={['buyer']} />)
  expect(screen.getByText('Client · A, B +1')).toBeInTheDocument()
})
it('unticking Roaster emits buyer, importer, seller', async () => {
  const onChange = vi.fn(); render(<PartyChoice options={dunkin} value={['buyer', 'importer', 'roaster', 'seller']} onChange={onChange} />)
  await userEvent.click(screen.getByLabelText('Roaster · Roaster Co'))
  expect(onChange).toHaveBeenLastCalledWith(['buyer', 'importer', 'seller'])
})
it('the client cannot be unticked', () => {
  render(<Harness options={dunkin} initial={['buyer']} />)
  expect(screen.getByLabelText("Client · Dunkin'")).toBeDisabled()
})
```

Keep the existing no-`options` tests (they cover `QcClientStep`).

- [ ] **Step 2–4:** fail → implement (checkboxes become the shared `Checkbox`, `rounded-lg` frame; remove the olive button with `PartyStep`) → pass. Commit `feat(send): party choice lists only the parties present, by company`.

---

### Task 4: `SendPartiesPopover`

**Files:**
- Create: `src/components/certificates/send-parties-popover.tsx`, `send-parties-popover.test.tsx`

**Interfaces:**
- Consumes: `PartyChoice` (Task 3), `PartyOption`, the route from Task 2, `Popover`, `Button`.
- Produces: `export function SendPartiesPopover(props: { sampleIds: string[]; onSend: (parties: CertificateParty[], includeSent: boolean) => void; disabled?: boolean }): JSX.Element`. Its trigger is an outline `sm` "Send" button with the `Mail` icon.

- [ ] **Step 1: Failing tests** (mock `global.fetch`)

```tsx
it('fetches the parties for the selection when opened', async () => {
  mockFetch({ parties: dunkin }); render(<SendPartiesPopover sampleIds={['s1', 's2']} onSend={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('view=parties&sampleIds=s1%2Cs2'))
  expect(await screen.findByText('Seller · LDC Suisse')).toBeInTheDocument()
})
it('two parties, two rows', async () => {
  mockFetch({ parties: [dunkin[0], dunkin[3]] }); render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findByText("Client · Dunkin'"); expect(screen.queryByText(/Importer/)).toBeNull()
})
it('sends the ticked parties and the include-sent choice', async () => {
  const onSend = vi.fn(); mockFetch({ parties: dunkin }); render(<SendPartiesPopover sampleIds={['s1']} onSend={onSend} />)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  await userEvent.click(await screen.findByLabelText('Roaster · Roaster Co'))
  await userEvent.click(screen.getByLabelText('Include already sent'))
  await userEvent.click(screen.getByRole('button', { name: 'Send emails' }))
  expect(onSend).toHaveBeenCalledWith(['buyer', 'importer', 'seller'], true)
})
it('on error it says so and Send stays disabled', async () => {
  mockFetch({ error: 'Failed to load certificates' }, 500); render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('Failed to load certificates')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send emails' })).toBeDisabled()
})
it('refetches when the selection changes between openings', async () => {
  mockFetch({ parties: dunkin }); const { rerender } = render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Send' })); await screen.findByText('Seller · LDC Suisse')
  await userEvent.keyboard('{Escape}')
  mockFetch({ parties: [dunkin[3]] }); rerender(<SendPartiesPopover sampleIds={['s9']} onSend={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText("Client · Dunkin'")).toBeInTheDocument(); expect(screen.queryByText('Seller · LDC Suisse')).toBeNull()
})
it('a selection with no parties says so', async () => {
  mockFetch({ parties: [] }); render(<SendPartiesPopover sampleIds={['s1']} onSend={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('No one to send these to.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send emails' })).toBeDisabled()
})
```

- [ ] **Step 2:** Run → FAIL (module not found).
- [ ] **Step 3: Implement.** Fetch on every open, keyed by `sampleIds.join(',')`; ignore a response that arrives for an older key. While loading, a spinner (`Loader2 animate-spin`) in the list area. Defaults: every listed party ticked, "Include already sent" off. Content: `PopoverContent align="end" className="w-[320px]"`, a 13px/600 heading "Who should receive them", the `PartyChoice`, the include-sent checkbox, then a right-aligned primary `sm` "Send emails" (one filled button). On send, close the popover and call `onSend`.
- [ ] **Step 4:** Run → PASS. Commit `feat(certificates): Send opens a party dropdown`.

---

### Task 5: `BatchApprovalSendView` starts at the first email

**Files:**
- Modify: `src/components/certificates/batch-approval-send-view.tsx` (props ~line 16; open effect ~line 95; `continueWithParties` ~line 137; the `PartyStep` branch ~line 294; olive buttons ~lines 329, 479, 486)
- Modify: `src/components/certificates/qc-client-step.tsx` (olive Continue ~line 68 → `Button`)
- Test: `src/components/certificates/batch-approval-send-view.test.tsx`

**Interfaces:**
- Produces: prop `selection?: { sampleIds: string[]; parties: CertificateParty[]; includeSent: boolean }`. In selection mode the view loads `?sampleIds=…&parties=…[&includeSent=1]` as soon as it opens; the party step no longer exists.

- [ ] **Step 1: Failing test:** open with `selection={{ sampleIds: ['s1'], parties: ['buyer', 'seller'], includeSent: false }}` → `fetch` called once with a URL containing `sampleIds=s1`, `parties=buyer%2Cseller` and no `includeSent`; no "Who should receive them" text. With `includeSent: true` the URL has `includeSent=1`. Update or remove the old tests that clicked through `PartyStep`.
- [ ] **Step 2–3:** fail → implement. The olive hand-built buttons (Close on the done screen, the composer's secondary/primary pair) become `Button` (`outline` / default), with the composer's actions in a `CommitBar` (Skip as `start`, then "Send all remaining" outline, then Send primary). Keep their labels and handlers.
- [ ] **Step 4:** `npx vitest run src/components/certificates` → PASS. Commit `feat(send): selection sends open straight on the first email`.

---

### Task 6: Certificates page in the header layout

**Files:**
- Modify: `src/app/certificates/page.tsx` (header ~lines 746–960, row actions ~lines 1200–1245, preview dialog ~line 1270, `headerHeight` measuring ~lines 286–287)
- Create: `src/components/certificates/certificate-row-actions.ts` (+ test) to keep the page from growing
- Test: `src/app/certificates/page.test.tsx` (existing; extend)

**Interfaces:**
- Consumes: `PageHeader` (with ref), `PageBody`, `Segmented`, `SelectionBar`, `RowActions`, `SendPartiesPopover`, `BatchApprovalSendView` (Task 5).
- Produces: `export function certificateRowActions(input: { canEdit: boolean; onDownload: () => void; onEdit: () => void; onOverride: () => void }): RowAction[]` returning, in order, Download PDF, Edit (`hidden: !canEdit`), Override status.

- [ ] **Step 1: Failing tests**
  - `certificateRowActions`: labels `['Download PDF', 'Edit', 'Override status']`; Edit `hidden` when `canEdit` is false.
  - `page.test.tsx`: the `h1` is "Certificates" with `text-primary`; with list entries present the `SelectionBar` shows "N selected", a "Send" button, "Download ZIP", "Tin labels", "Bag sleeves"; there is no "Actions (N)" button. Opening a row's More menu shows "Override status".
- [ ] **Step 2:** `npx vitest run src/app/certificates src/components/certificates/certificate-row-actions.test.ts` → FAIL.
- [ ] **Step 3: Implement** per spec §6.3:
  - `<MainLayout fullWidth>` + `PageHeader ref={setHeaderEl} crumbs={[{ label: 'Certificates' }]} count={total}`, actions: ghost "Today's tin labels" (today's `PrintMenu` "today" entry moves here), primary "Send unsent" (`SendUnsentMenu` opens on click, not hover). Toolbar row: search `inputSize="sm"`, the status chips become `Segmented`, Filters popover (outline `sm`), the count on the right. Remove the hand-built sticky header `div` and its `-mx-6 -mt-6` bleed. `headerHeight` keeps measuring, now the `PageHeader` element.
  - `SelectionBar count={list.count} noun="in list" onClear={list.clear}` at the bottom of the table, actions: Download ZIP (outline `sm`; disabled with its "at most N" title over the cap), `SendPartiesPopover` with the list's sample ids (the same derivation as today's `sampleIds`), Tin labels and Bag sleeves (from `PrintMenu`'s list entries). `onSend` sets `batchSelection = { sampleIds, parties, includeSent }`. Delete the "Actions (N)" dropdown.
  - Rows: `RowActions` with Open = preview, actions from `certificateRowActions`; wrap each row in `RowContextMenu` with the same array.
  - Preview dialog: Close becomes ghost; Download stays outline; "Send Email" stays outline; no filled button there.
  - Keep the file under 2,000 lines; the row-actions helper and any extracted toolbar live in `src/components/certificates/`.
- [ ] **Step 4:** Run → PASS. Commit `feat(certificates): header layout, selection bar with the Send dropdown, labelled row actions`.

---

### Task 7: Certificate editor overlay and approval send view

**Files:**
- Modify: `src/components/certificates/cert-editor/certificate-edit-overlay.tsx` (header actions ~lines 198–290)
- Modify: `src/components/certificates/cert-editor/ui-parts.tsx` (`EditPanel` footer ~lines 128–135; `saveLabel` default)
- Modify: `src/components/samples/approval-send-view.tsx` (Close ~line 126; "Send to both" ~line 169)
- Tests: `src/components/samples/approval-send-view.test.tsx`; create `src/components/certificates/cert-editor/ui-parts.test.tsx`

**Interfaces:**
- Produces: `EditPanel`'s `saveLabel` default becomes `'Apply'`; its footer is a `CommitBar` (Cancel ghost, Apply primary).

- [ ] **Step 1: Failing tests**
  - `ui-parts.test.tsx`: `EditPanel` without `saveLabel` shows "Apply" and no "Save"; its footer element has `sticky` and `bottom-0`.
  - `approval-send-view.test.tsx`: Close is a `button` named "Close" with the ghost variant class (`hover:bg-accent`) and sits before "Send to both" in DOM order inside the pinned bar (`sticky`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Overlay header: the `⋯` trigger becomes an outline `sm` "Actions" menu button, then Cancel (ghost), then "Save changes" (primary), in that order. Grep callers that pass `saveLabel="Save"` explicitly and decide each by rule 7 (it persists → "Save", it stages → "Apply").
- [ ] **Step 4:** `npx vitest run src/components/certificates src/components/samples/approval-send-view.test.tsx` → PASS. Commit `feat(certificates): editor panels apply, overlay header ordered, approval view footer pinned`.

---

### Task 8: Verify and ship Part 4

- [ ] `npx tsc --noEmit && npx vitest run && npx next build` → clean. `wc -l src/app/certificates/page.tsx` under 2,000.
- [ ] Browser QA, light and dark, desktop and tablet:
  - Tick one Ahold certificate → Send → two rows (Seller · …, Client · Ahold).
  - Tick a Dunkin' certificate → four rows in chain order.
  - Untick Roaster → Send emails → the walk-through opens on the first email, with no roaster email in the queue.
  - Clear the list, tick another set, open Send again: the new parties are listed.
  - Scroll the table to the bottom: the selection bar stays docked.
  - Editor overlay: Actions, Cancel, Save changes in order; a panel says Apply.
- [ ] No real sends during QA unless Daniel asks. Use Skip in the walk-through.
- [ ] `git push origin HEAD:main`; confirm the Vercel deploy. Tell Daniel what to check live.

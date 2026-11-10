# Part 3: Quality Templates and density limits

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The approved Quality Templates screens (list, editor, the new "Moisture, density & quakers" page), plus density limits that print on the certificate and never change a verdict.

**Architecture:** Density limits are two new keys in `quality_templates.parameters` (JSON, no migration). They travel the same path as the moisture limits: `QualitySpecLimits` in `certificate-data.ts` → `quality-certificate.tsx` → `CertificatePhysicalProperties`. `compliance.ts` is untouched, and a characterization test proves it. The screens adopt Part 2's `PageHeader`, `Segmented` and `RowActions` pieces.

**Tech Stack:** Next.js, shadcn/ui, react-pdf, vitest + Testing Library.

**Spec:** §6.10 of `docs/superpowers/specs/2026-09-28-ui-corners-and-button-placement-design.md`. Visual reference: https://claude.ai/artifact/RVGz8G64bCwMne9gbhQXwG (boards Main, Basic, Physical, ListPhone; Daniel's edits make filled controls green and the section name a green crumb). Index: `docs/superpowers/plans/2026-11-10-ui-corners-green.md`.

**Depends on:** Parts 1 and 2 on `main`.

---

### Task 1: Density never changes a verdict

**Files:**
- Test: `src/lib/compliance.characterization.test.ts` (add a `describe`)

- [ ] **Step 1: Write the test** (it should pass at once; it pins today's behaviour)

```ts
describe('evaluateQualityCompliance — density limits are print-only', () => {
  const template = { ...emptyTemplate, parameters: { density_min: 0.65, density_max: 0.72 } }
  it.each([0.6, 0.8])('approves a lot with density %s outside the limits', async (density) => {
    const supabase = fakeSupabase({
      client_qualities: specRow(template),
      cupping_scores: { data: [] },
      quality_assessments: { data: { green_bean_data: { density } } },
    })
    expect(await evaluateQualityCompliance(supabase, 'sample-1', 'spec-1')).toEqual({ approved: true, violations: [] })
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/compliance.characterization.test.ts`
Expected: PASS. If it fails, stop: something already reads density, and Daniel's rule is "print only, never rejects".

- [ ] **Step 3: Check the tolerance rule too**

Run: `grep -rn "density" src/lib/tolerance src/lib/compliance*.ts src/lib/certificate-checklist.ts`
Expected: no hits. Commit:

```bash
git add src/lib/compliance.characterization.test.ts
git commit -m "test(compliance): density limits never change the verdict"
```

---

### Task 2: The certificate prints density against its limits, in g/mL

**Files:**
- Create: `src/lib/spec-range-note.ts`, `src/lib/spec-range-note.test.ts`
- Modify: `src/lib/certificate-data.ts` (`QualitySpecLimits` ~line 138; the builder near `moisture_min: params.moisture_min` ~line 723)
- Modify: `src/components/pdf/certificate/quality-certificate.tsx` (~line 205, `CertificatePhysicalProperties` props)
- Modify: `src/components/pdf/certificate/certificate-physical-properties.tsx` (props ~line 118; density line ~line 187)
- Modify: `src/app/grading/page.tsx` (label "Density (G/L)" ~line 1567 and the `// Density in G/L` comment ~line 123)
- Test: `src/components/pdf/certificate/quality-certificate.issued-values.test.ts` (existing render test; add a case)

**Interfaces:**
- Produces: `export function rangeNote(value: number | null, min: number | undefined, max: number | undefined, format: (n: number) => string): string | null`. Returns `"(min <format(min)>)"` when below min, `"(max <format(max)>)"` when above max, otherwise `null`. `QualitySpecLimits` gains `density_min?: number` and `density_max?: number`. `CertificatePhysicalPropertiesProps` gains `densityMin?: number` and `densityMax?: number`.

- [ ] **Step 1: Failing tests** `src/lib/spec-range-note.test.ts`

```ts
const g = (n: number) => n.toFixed(3)
it('below min', () => expect(rangeNote(0.64, 0.65, 0.72, g)).toBe('(min 0.650)'))
it('above max', () => expect(rangeNote(0.73, 0.65, 0.72, g)).toBe('(max 0.720)'))
it('inside', () => expect(rangeNote(0.7, 0.65, 0.72, g)).toBeNull())
it('on the boundary is inside', () => { expect(rangeNote(0.65, 0.65, 0.72, g)).toBeNull(); expect(rangeNote(0.72, 0.65, 0.72, g)).toBeNull() })
it('one-sided limits', () => { expect(rangeNote(0.9, undefined, 0.72, g)).toBe('(max 0.720)'); expect(rangeNote(0.1, 0.65, undefined, g)).toBe('(min 0.650)') })
it('no value, no note', () => expect(rangeNote(null, 0.65, 0.72, g)).toBeNull())
it('a 0 limit still counts', () => expect(rangeNote(-0.1, 0, undefined, g)).toBe('(min 0.000)'))
```

And in `quality-certificate.issued-values.test.ts`, one case rendering a certificate with `greenBeanAnalysis.density = 0.64` and `specLimits = { density_min: 0.65, density_max: 0.72 }`. Assert the rendered text contains `0.640`, `g/mL` and `(min 0.650)`, and that a second render with density 0.700 contains no `(min` note. Follow that file's existing render-and-extract-text helper.

- [ ] **Step 2: Run, see them fail**

Run: `npx vitest run src/lib/spec-range-note.test.ts src/components/pdf/certificate/quality-certificate.issued-values.test.ts`
Expected: FAIL (module not found; no `g/mL` on the density line).

- [ ] **Step 3: Implement**

- `certificate-data.ts`: add the two keys to `QualitySpecLimits` and read them like `moisture_min` (`params.density_min as number | undefined`).
- `quality-certificate.tsx`: pass `densityMin={specLimits?.density_min}` and `densityMax={specLimits?.density_max}`.
- `certificate-physical-properties.tsx`: density `PropertyItem` gets `unit="g/mL"`, `outOfSpec` when `rangeNote(...)` is non-null, `specNote` = that note, and a fixed 3-decimal display. Add a `decimals?: number` prop to `PropertyItem`. Keep `formatValue`'s `< 2` branch, because moisture uses its 1-decimal side.
- `grading/page.tsx`: label `Density (g/mL)`; comment `// Density in g/mL (e.g., 0.700)`.
- Leave the moisture note code as it is. Moving it onto `rangeNote` is not part of this work.

- [ ] **Step 4: Run, see them pass**

Run: `npx vitest run src/lib/spec-range-note.test.ts src/components/pdf/certificate`
Expected: PASS, including the page-fit tests in that folder.

- [ ] **Step 5: Commit**

```bash
git add src/lib/spec-range-note.ts src/lib/spec-range-note.test.ts src/lib/certificate-data.ts src/components/pdf/certificate src/app/grading/page.tsx
git commit -m "feat(certificate): density printed in g/mL with a note when outside the template's limits"
```

---

### Task 3: Editor shell (`PageHeader` top bar, section titles become the crumb, no card frames)

**Files:**
- Modify: `src/components/quality/spec-editor/spec-editor-body.tsx`, `quality-spec-editor.tsx`
- Modify: every section file under `src/components/quality/spec-editor/sections/` that wraps itself in `rounded-2xl border border-border bg-card p-6` (`aspect`, `clean-cups`, `cupping`, `defects`, `screen-sizes`, `taints`) and the `BasicInformation` wrapper inside `spec-editor-body.tsx` (~line 381)
- Modify: `src/components/samples/intake/new-spec-editor-stage.tsx` (dialog header ~line 149)
- Create: `src/components/quality/spec-editor/quality-spec-editor.test.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `Crumb` (Part 2 Task 1).
- Produces: `export const SECTION_TITLES: Record<SectionId, string>` (replaces `SECTION_HEADINGS`; titles only) and `export function sectionTitle(id: SectionId): string` from `spec-editor-body.tsx`. The editor state exposes `active` already.

- [ ] **Step 1: Failing tests** `quality-spec-editor.test.tsx`

```tsx
it('shows the section name as the green last crumb', () => {
  render(<QualitySpecEditor template={{ name_en: 'Ahold SAP', version: 4, parameters: {} }} onSave={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByRole('heading', { level: 1, name: 'Basic information' }).className).toContain('text-primary')
  expect(screen.getByText('Ahold SAP')).toBeInTheDocument(); expect(screen.getByText('v4')).toBeInTheDocument()
})
it('follows the nav', async () => {
  render(<QualitySpecEditor template={{ name_en: 'Ahold SAP', parameters: {} }} onSave={vi.fn()} onCancel={vi.fn()} />)
  await userEvent.click(screen.getAllByText('Defects')[0])
  expect(screen.getByRole('heading', { level: 1, name: 'Defects' })).toBeInTheDocument()
})
it('has no section heading or subtitle in the body', () => {
  render(<QualitySpecEditor template={{ name_en: 'X', parameters: {} }} onSave={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  expect(screen.queryByText('Name, origin and how this template is shared.')).toBeNull()
})
it('the Quality Templates crumb and the back arrow cancel', async () => {
  const onCancel = vi.fn(); render(<QualitySpecEditor template={{ name_en: 'X', parameters: {} }} onSave={vi.fn()} onCancel={onCancel} />)
  await userEvent.click(screen.getByRole('button', { name: 'Quality Templates' })); expect(onCancel).toHaveBeenCalledTimes(1)
})
it('marks Active in the primary colour when on', () => {
  render(<QualitySpecEditor template={{ name_en: 'X', parameters: {}, is_active: true }} onSave={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByText('Active').className).toContain('text-primary')
})
```

Match the component's real prop names when writing these (read `quality-spec-editor.tsx` first). Mock what it imports from Supabase, if anything, the way `screen-sizes-section.test.tsx` does.

- [ ] **Step 2: Run, see them fail**

Run: `npx vitest run src/components/quality/spec-editor`
Expected: FAIL (no `h1`).

- [ ] **Step 3: Implement**

- Top bar → `PageHeader` with `back={{ onClick: onCancel, label: 'Back to Quality Templates' }}`, crumbs `[{ label: 'Quality Templates', onClick: onCancel }, { label: templateName, emphasis: true, badge: <version tag> }, { label: sectionTitle(state.active) }]`, actions: Active label + `Switch`, `Cancel` outline, `Save template` primary. Keep the full-screen `fixed inset-0` shell and the error strip.
- Body: delete the `<h2>` and `<p>` (~lines 195–199) and `SECTION_HEADINGS`' subtitles. Nav `w-[248px]`; the active item is `bg-black/[0.04] dark:bg-white/10 rounded-md`, not a raised card. Main area `px-10 py-7`, content `max-w-[860px]`.
- Sections: remove each outer `rounded-2xl border border-border bg-card p-6` wrapper (keep inner tables' borders). Where one section stacked several cards (aspect, taints), separate the blocks with `border-t pt-6` hairlines instead.
- `new-spec-editor-stage.tsx`: the `DialogTitle` reads `New quality specification` and, after a muted " / ", `sectionTitle(state.active)`.

- [ ] **Step 4: Run, see them pass; check the dialog**

Run: `npx vitest run src/components/quality src/components/samples/intake`
Expected: PASS. Then on `npm run dev`, open a template and the intake "New quality specification" dialog: no card frames, the section name in the header.

- [ ] **Step 5: Commit**

```bash
git add src/components/quality/spec-editor src/components/samples/intake/new-spec-editor-stage.tsx
git commit -m "feat(quality): template editor uses PageHeader; section name is the green crumb; no card frames"
```

---

### Task 4: "Moisture, density & quakers" page

**Files:**
- Create: `src/components/quality/spec-editor/sections/physical-section.tsx`, `physical-section.test.tsx`
- Delete: `sections/moisture-section.tsx`, `sections/quaker-section.tsx`
- Modify: `spec-editor-body.tsx` (`SectionId`, `NAV_GROUPS`, `SECTION_TITLES`, the summary map ~lines 184–187 of the body, the `active === 'moisture' | 'quaker'` branches)

**Interfaces:**
- Produces: `SectionId` loses `'moisture' | 'quaker'` and gains `'physical'`. `export function PhysicalSection(props: { params: any; patch: (slice: Record<string, any>) => void }): JSX.Element`. `export function physicalSummary(params: any): string`. `export function parseDensity(input: string): { value?: number; error?: string }`.

- [ ] **Step 1: Failing tests** `physical-section.test.tsx`

```tsx
describe('physicalSummary', () => {
  it('joins the checks that are on', () => {
    expect(physicalSummary({ moisture_min: 11, moisture_max: 12, density_min: 0.65, density_max: 0.72, max_quakers: 10 }))
      .toBe('11–12% · 0.650–0.720 g/mL · ≤10')
  })
  it('drops what is off', () => { expect(physicalSummary({ moisture_min: 11, moisture_max: 12 })).toBe('11–12%') })
  it('shows one-sided ranges', () => { expect(physicalSummary({ density_min: 0.65 })).toBe('≥0.650 g/mL') })
  it('says so when nothing is set', () => { expect(physicalSummary({})).toBe('Not measured') })
})
describe('parseDensity', () => {
  it('accepts g/mL', () => expect(parseDensity('0.680')).toEqual({ value: 0.68 }))
  it('empty clears', () => expect(parseDensity('')).toEqual({}))
  it('rejects g/L', () => expect(parseDensity('680')).toEqual({ error: 'Enter g/mL, e.g. 0.680' }))
})
describe('PhysicalSection', () => {
  it('loads a row on when any of its limits is set, 0 included', () => {
    render(<PhysicalSection params={{ moisture_min: 0, max_quakers: 0 }} patch={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Moisture' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Quakers' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Density' })).not.toBeChecked()
  })
  it('switching density off clears both keys', async () => {
    const patch = vi.fn(); render(<PhysicalSection params={{ density_min: 0.65, density_max: 0.72 }} patch={patch} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Density' }))
    expect(patch).toHaveBeenCalledWith({ density_min: undefined, density_max: undefined })
  })
  it('switching quakers off clears the limit and the roast size', async () => {
    const patch = vi.fn(); render(<PhysicalSection params={{ max_quakers: 10, roast_sample_size_grams: 300 }} patch={patch} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Quakers' }))
    expect(patch).toHaveBeenCalledWith({ max_quakers: undefined, roast_sample_size_grams: undefined })
  })
  it('an off row says so', () => {
    render(<PhysicalSection params={{}} patch={vi.fn()} />)
    expect(screen.getAllByText('Not measured for this quality.')).toHaveLength(3)
  })
  it('switching on shows empty fields', async () => {
    render(<PhysicalSection params={{}} patch={vi.fn()} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Density' }))
    expect(screen.getByLabelText('Min (g/mL)')).toHaveValue(null)
  })
  it('a g/L entry shows the hint and is not stored', async () => {
    const patch = vi.fn(); render(<PhysicalSection params={{ density_min: 0.65 }} patch={patch} />)
    await userEvent.clear(screen.getByLabelText('Max (g/mL)')); await userEvent.type(screen.getByLabelText('Max (g/mL)'), '720')
    expect(screen.getByText('Enter g/mL, e.g. 0.680')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalledWith(expect.objectContaining({ density_max: 720 }))
  })
})
```

- [ ] **Step 2: Run, see them fail**

Run: `npx vitest run src/components/quality/spec-editor/sections/physical-section.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Layout per spec §6.10 and board "Physical": three rows split by hairlines; each a `grid-cols-[240px_minmax(0,1fr)] gap-8 py-5`; left column `h3` name, one-line helper, `Switch` with `aria-label` = the name; right column the fields (inputs `w-24`, the moisture Standard select `w-[200px]`), or the muted "Not measured for this quality." when off. Copy:
- Moisture, helper "Acceptable range and the measurement standard." Fields Min (%), Max (%), Standard (Coffee industry / ISO 6673). Keys `moisture_min`, `moisture_max`, `moisture_standard`.
- Density, helper "Green bulk density, as typed on the grading screen. Leave a side empty for no limit." Fields Min (g/mL), Max (g/mL), placeholders `0.650` / `0.720`, `step="0.001"`. Keys `density_min`, `density_max`. No "When out of range" select (the mockup's select was dropped: density is print only).
- Quakers, helper "Counted on the roasted sample." Fields Roast sample (g), Max quakers. Keys `roast_sample_size_grams`, `max_quakers`.

Switch state is local, seeded from `!= null` on the row's keys; off calls `patch` with the row's keys set to `undefined`. Density inputs keep the raw text locally so the hint can show while `parseDensity` returns an error. Body wiring: one `physical` nav item labelled "Moisture, density & quakers" after Defects, summary `physicalSummary(params)`.

- [ ] **Step 4: Run, see them pass; search for old ids**

Run: `npx vitest run src/components/quality && grep -rn "'moisture'\|'quaker'" src/components/quality src/components/samples/intake`
Expected: tests PASS; the grep shows no `SectionId` uses left (the cert-editor and reports use their own `'moisture'` keys, which are unrelated).

- [ ] **Step 5: Commit**

```bash
git add -A src/components/quality/spec-editor
git commit -m "feat(quality): one page for moisture, density and quakers; density limits in g/mL"
```

---

### Task 5: Templates list

**Files:**
- Modify: `src/app/quality/templates/page.tsx` (header ~lines 357–394, table ~lines 420–575)
- Create: `src/components/quality/template-list/template-row.tsx`, `template-row.test.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `PageBody`, `Segmented`, `Button size="icon-sm"`, `Tooltip`, `DropdownMenu`.
- Produces: `export function clientsLabel(clients: Array<{ name?: string | null; fantasy_name?: string | null; company?: string | null }>): string` (via `companyDisplayName`; first two joined by ", ", then " +N"; empty string when none). `export function TemplateRow(props: { template: Template; onView; onEdit; onDuplicate; onManageClients; onDeactivate; spec: React.ReactNode }): JSX.Element`. Move the page's `Template` type next to it and export it.

- [ ] **Step 1: Failing tests** `template-row.test.tsx`

```tsx
it('clientsLabel: one, two, many', () => {
  expect(clientsLabel([{ fantasy_name: 'Bennett' }])).toBe('Bennett')
  expect(clientsLabel([{ fantasy_name: 'Rich Coop' }, { fantasy_name: 'Blaser' }])).toBe('Rich Coop, Blaser')
  expect(clientsLabel([{ fantasy_name: 'A' }, { fantasy_name: 'B' }, { fantasy_name: 'C' }])).toBe('A, B +1')
  expect(clientsLabel([])).toBe('')
})
it('puts clients before the description on line two', () => {
  render(<TemplateRow template={tpl({ assigned_clients: [{ fantasy_name: 'Blaser' }], description_en: 'Cerrado AAA' })} {...handlers} spec={null} />)
  expect(screen.getByTestId('template-row-line2').textContent).toBe('Blaser · Cerrado AAA')
})
it('Edit and Duplicate are labelled icon buttons; the row opens the view', async () => {
  render(<TemplateRow template={tpl()} {...handlers} spec={null} />)
  await userEvent.click(screen.getByRole('button', { name: 'Edit template' })); expect(handlers.onEdit).toHaveBeenCalled(); expect(handlers.onView).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Duplicate template' })); expect(handlers.onDuplicate).toHaveBeenCalled()
  await userEvent.click(screen.getByText('Ahold SAP')); expect(handlers.onView).toHaveBeenCalled()
})
it('More holds View, Manage clients and Deactivate (last)', async () => {
  render(<TemplateRow template={tpl()} {...handlers} spec={null} />)
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
  expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['View', 'Manage clients', 'Deactivate'])
})
it('row actions are visible, not hover-only', () => {
  render(<TemplateRow template={tpl()} {...handlers} spec={null} />)
  expect(screen.getByRole('button', { name: 'Edit template' }).closest('div')!.className).not.toContain('opacity-0')
})
```

- [ ] **Step 2: Run, see them fail**

Run: `npx vitest run src/components/quality/template-list`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** per spec §6.10 "List" and board Main

- Page: `<MainLayout fullWidth>`, `PageHeader crumbs={[{ label: 'Quality Templates' }]} count={filteredTemplates.length} toolbarPlacement="inline"`, toolbar = search `Input inputSize="sm"` about 300px with the search icon + `Segmented` All / Active / Inactive (`size="sm"`), action = primary "New template" (`+` icon; the label hides below `sm`, leaving an icon button with `aria-label="New template"`). Below `sm`, the segmented control becomes a `Select` (board ListPhone).
- Table: no wrapper frame; it sits directly under the header, edge to edge. Header row `grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_96px] h-9 px-6 bg-muted/40 border-b`, labels "Template · client", "Spec summary". Rows `px-6 py-3 border-b`, the same grid.
- Row line 1: name 14px/600, version tag, Active badge (`text-primary` on its tint, `rounded-sm`), author initials + date. Line 2 (`data-testid="template-row-line2"`): clients in `text-foreground text-xs font-medium`, " · ", description muted, truncated. With no clients, line 2 is the description alone.
- Spec chips: unchanged content (they move into the `spec` prop as today's JSX), `rounded-sm`.
- Remove the "Assigned to" column. Its click-to-manage moves into More → "Manage clients" (same `setAssigningTemplateId` + `setAssignmentDialogOpen` calls). "Deactivate" stays the existing delete flow.
- Empty state: no `Card`; a centred muted block with the primary "New template" button.
- Phone (below `md`): rows become three lines (name + version + clients label right-aligned; description; spec summary as dot-separated text), per board ListPhone.

- [ ] **Step 4: Run, see them pass; check visually**

Run: `npx vitest run src/components/quality src/app/quality`
Expected: PASS. Then on `npm run dev`, `/quality/templates` at 1280px, 1024px and 390px in light and dark: matches the boards; Manage clients and Deactivate still work.

- [ ] **Step 5: Commit**

```bash
git add src/app/quality/templates/page.tsx src/components/quality/template-list
git commit -m "feat(quality): templates list in the header layout; clients on line two; edge-to-edge table"
```

---

### Task 6: Verify and ship Part 3

- [ ] `npx tsc --noEmit && npx vitest run && npx next build` → clean. `wc -l` on every touched file: all under 2,000.
- [ ] Browser QA, light and dark, desktop and tablet:
  - Create a template with density 0.650–0.720 and save. Reopen it: the density row is on with both values, and the nav summary reads "… · 0.650–0.720 g/mL · …".
  - Grade a lot on that template with density 0.640: it is not rejected for density.
  - Preview its certificate: "0.640 g/mL (min 0.650)" in the muted red.
- [ ] `git push origin HEAD:main`; confirm the Vercel deploy. Tell Daniel the screen is live for his visual check.

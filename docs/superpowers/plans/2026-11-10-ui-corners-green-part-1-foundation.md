# Part 1: Tokens and primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One push that moves the whole app to the 10/6/4 corner scale, turns filled buttons, switches and checkboxes green, sets the two control heights, and pins dialog footers.

**Architecture:** Change CSS variables and the shadcn primitives in `src/components/ui/`; nearly every screen follows by inheritance. A file-reading test (`src/app/design-tokens.test.ts`, same style as `src/app/api/route-exports.test.ts`) pins the token values so they cannot drift.

**Tech Stack:** Tailwind, shadcn/ui, class-variance-authority, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-28-ui-corners-and-button-placement-design.md` §3.1, §3.2, §3.6, §5.1 (`PageBody` only), §5.2 (`DialogFooter`, `AlertDialog`), §5.6. Read the index plan's Global Constraints and Review Focus first: `docs/superpowers/plans/2026-11-10-ui-corners-green.md`.

---

### Task 1: Radius tokens and primitive corners

**Files:**
- Modify: `src/app/globals.css` (`:root` has `--radius: 20px` at ~line 29; `.lab-card` at ~line 77)
- Modify: `tailwind.config.ts` (`theme.extend.borderRadius`, ~line 55)
- Modify: `src/components/ui/dropdown-menu.tsx`, `context-menu.tsx`, `popover.tsx`, `select.tsx` (content only), `command.tsx` (root), `toast.tsx`, `badge.tsx`, `checkbox.tsx`
- Create: `src/app/design-tokens.test.ts`
- Also commit: the spec and the five plan files (copied from the main checkout, see the index)

**Interfaces:**
- Produces: CSS variables `--radius-container`, `--radius-control`, `--radius-badge`; Tailwind `rounded-lg` = 10px, `rounded-md` = 6px, `rounded-sm` = 4px.

- [ ] **Step 1: Write the failing test** `src/app/design-tokens.test.ts`

Read files with `fs.readFileSync(path.join(process.cwd(), …), 'utf8')`.

```ts
describe('radius tokens', () => {
  it('defines the three levels in :root', () => {
    expect(rootBlock).toContain('--radius-container: 10px')
    expect(rootBlock).toContain('--radius-control: 6px')
    expect(rootBlock).toContain('--radius-badge: 4px')
    expect(rootBlock).not.toMatch(/--radius:\s*20px/)
  })
  it('maps Tailwind lg/md/sm onto them', () => {
    expect(tailwind).toMatch(/lg:\s*'var\(--radius-container\)'/)
    expect(tailwind).toMatch(/md:\s*'var\(--radius-control\)'/)
    expect(tailwind).toMatch(/sm:\s*'var\(--radius-badge\)'/)
  })
  it('has no .lab-card rule', () => { expect(css).not.toContain('.lab-card') })
  it.each([
    ['dropdown-menu.tsx', 'rounded-lg'], ['context-menu.tsx', 'rounded-lg'], ['popover.tsx', 'rounded-lg'],
    ['command.tsx', 'rounded-lg'], ['toast.tsx', 'rounded-lg'],
  ])('%s content is a 10px container', (file, cls) => { expect(ui(file)).toContain(cls) })
  it('badges are 4px', () => {
    expect(ui('badge.tsx')).toContain('rounded-sm')
    expect(ui('badge.tsx')).not.toContain('rounded-full')
  })
  it('checkboxes are 3px', () => { expect(ui('checkbox.tsx')).toContain('rounded-[3px]') })
})
```

`rootBlock` is the text between the first `:root {` and its closing `}` inside `@layer base`.

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/app/design-tokens.test.ts`
Expected: FAIL on the `--radius-container` assertion.

- [ ] **Step 3: Implement**

`globals.css`: replace `--radius: 20px;` with the three variables exactly as in spec §3.1. Delete the unused `.lab-card` rule (confirm with `grep -rn "lab-card" src` that nothing uses it). `tailwind.config.ts`: the mapping in §3.1. Primitives: follow the §3.2 table. In menus and the select content only the *content* element's `rounded-md` becomes `rounded-lg`; items stay `rounded-sm`. `select.tsx`'s trigger is untouched here (Task 4).

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/app/design-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css tailwind.config.ts src/components/ui src/app/design-tokens.test.ts docs/superpowers/specs/2026-09-28-ui-corners-and-button-placement-design.md docs/superpowers/plans/2026-11-10-ui-corners-green*.md
git commit -m "feat(ui): 10/6/4 corner scale; menus and popovers are containers, badges 4px"
```

---

### Task 2: Green primary, and the portal stays light

**Files:**
- Modify: `src/app/globals.css` (`:root` `--primary` ~line 16, `.dark` `--primary` ~line 40; new `.portal-light` rule)
- Modify: `src/components/portal/portal-shell.tsx` (its three root `div`s with `min-h-screen`, ~lines 86, 90, 98)
- Modify: `src/components/quality/spec-editor/quality-spec-editor.tsx` (the "Active" label: `text-[#15663f] dark:text-[#5fcf8e]` → `text-primary`)
- Modify: `src/app/dashboard/settings/signature/page.tsx` (~line 228: `bg-[#556b2f] hover:bg-[#556b2f]/90` on a `Button` → remove the override)
- Modify: `src/components/portal/portal-shell.tsx` spinner `border-[#556b2f]` → `border-primary`
- Test: `src/app/design-tokens.test.ts`

**Interfaces:**
- Produces: CSS class `portal-light` that restates every light `:root` colour token. Part 10 relies on it.

- [ ] **Step 1: Add failing tests**

```ts
describe('primary green', () => {
  it('is #15663f in light mode', () => {
    expect(rootBlock).toMatch(/--primary:\s*151 66% 24%/)
    expect(rootBlock).toMatch(/--primary-foreground:\s*0 0% 98%/)
  })
  it('is a light green with dark text in dark mode', () => {
    expect(darkBlock).toMatch(/--primary:\s*151 50% 55%/)
    expect(darkBlock).toMatch(/--primary-foreground:\s*0 0% 9%/)
  })
  it('keeps the focus ring neutral', () => {
    expect(rootBlock).toMatch(/--ring:\s*0 0% 3\.9%/)
    expect(darkBlock).toMatch(/--ring:\s*0 0% 83\.1%/)
  })
})

describe('portal stays light', () => {
  it('restates every light colour token', () => {
    for (const [name, value] of colourTokens(rootBlock)) expect(portalBlock).toContain(`${name}: ${value}`)
  })
  it('wraps every portal screen', () => {
    const roots = shell.match(/className="[^"]*min-h-screen[^"]*"/g) ?? []
    expect(roots.length).toBeGreaterThan(0)
    for (const r of roots) expect(r).toContain('portal-light')
  })
})
```

`colourTokens(block)` returns `[name, value]` for every `--x: …;` line except `--radius-*`. `portalBlock` is the `.portal-light { … }` rule's body. `shell` is `portal-shell.tsx`'s text.

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/app/design-tokens.test.ts`
Expected: FAIL on `--primary: 151 66% 24%`.

- [ ] **Step 3: Implement**

Set the four token values (index Global Constraints). Add `.portal-light { … }` after `.dark` inside `@layer base`, restating the light colour tokens (it overrides the inherited `.dark` variables for the subtree). Add `portal-light` to the three root `div`s. Fold the hard-coded greens listed under Files into tokens. Leave chart, Sankey, PDF and email colours alone.

- [ ] **Step 4: Run and see them pass**

Run: `npx vitest run src/app/design-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/portal/portal-shell.tsx src/components/quality/spec-editor/quality-spec-editor.tsx src/app/dashboard/settings/signature/page.tsx src/app/design-tokens.test.ts
git commit -m "feat(ui): primary is green #15663f (light green in dark mode); portal pinned light"
```

---

### Task 3: Keep green for actions (the `primary` audit)

**Files (from `git grep -c -E "(text|bg|border)-primary([^-]|$)|bg-primary/"` on main, outside `components/ui`):**
`src/app/page.tsx` (11), `src/app/cupping/page.tsx` (5), `src/components/clients/client-auto-detection.tsx` (4), `src/components/quality/scale-builder.tsx` (3), `src/components/dashboard/dashboard-scan-dialog.tsx` (3), `src/components/cupping/print-cupping-cards-dialog.tsx` (3), `src/components/clients/client-form.tsx` (3), and 1–2 each in `supply-chain-edit-table.tsx`, `assign-cuppers-dialog.tsx`, `defect-config-manager.tsx`, `aspect-config-manager.tsx`, `main-layout.tsx`, `scan-cupping-cards-dialog.tsx`, `client-quality-manager.tsx`, `cert-editor/addable-select.tsx`, `intake/quality-step.tsx`, `intake/photo-drop-zone.tsx`, `intake/other-sample-details-step.tsx`, `intake/basic-info-step.tsx`, `taint-fault-config-manager.tsx`, `performance-leaderboard.tsx`, `activity-heatmap.tsx`, `cupping-validation-modal.tsx`, `cert-editor/defects-quadrant.tsx`, `cert-editor/cupping-quadrant.tsx`, `cert-editor/certifications-field.tsx`, `src/app/laboratories/page.tsx`, `dashboard/metrics/certificates/page.tsx`, `src/app/certificates/page.tsx`. Skip `page_BACKUP.tsx` and `src/app/test/**`.

- [ ] **Step 1: Classify each use**

Keep `primary` when it marks an action, a selected/"on" state, a focus/drag highlight, a link, or a loading spinner. Change to the neutral equivalent (`text-foreground`, `bg-foreground`, `border-foreground`, `bg-muted`) when it only means emphasis: a bold number, a heading, an icon decorating static text, a chart or heatmap cell (charts use the CLAUDE.md palette, so a heatmap scale built on `bg-primary/x` moves to olive `#556b2f` opacities).

- [ ] **Step 2: Apply and check visually**

Run `npm run dev`, open `/` (dashboard), `/cupping`, `/clients`, `/quality/templates` in light and dark mode. Expected: green appears only on buttons, switches, checkboxes, links and selected states.

- [ ] **Step 3: Run the suite**

Run: `npx vitest run`
Expected: PASS. Any snapshot or class assertion that named `text-primary` for an emphasis use is updated to the new class in the same commit.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(ui): primary colour only marks actions and on-states"
```

---

### Task 4: Two control heights, `destructive-outline`, sized inputs

**Files:**
- Modify: `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/select.tsx` (trigger)
- Modify: `src/components/samples/intake/success-view.tsx:59,63` (the only `size="lg"` uses → default)
- Create: `src/components/ui/button.test.tsx`, `src/components/ui/input.test.tsx`

**Interfaces:**
- Produces: `Button` `size`: `'default' | 'sm' | 'icon' | 'icon-sm'` (no `lg`); `variant` adds `'destructive-outline'`. `Input` prop `inputSize?: 'default' | 'sm'`. `SelectTrigger` prop `size?: 'default' | 'sm'`.

- [ ] **Step 1: Write failing tests**

```tsx
it.each([
  ['default', 'h-9'], ['sm', 'h-7'], ['icon', 'h-9 w-9'], ['icon-sm', 'h-7 w-7'],
] as const)('size %s is %s', (size, cls) => {
  render(<Button size={size}>x</Button>)
  for (const c of cls.split(' ')) expect(screen.getByRole('button').className).toContain(c)
})
it('sm text is xs', () => { render(<Button size="sm">x</Button>); expect(screen.getByRole('button').className).toContain('text-xs') })
it('destructive-outline is red text on the background', () => {
  render(<Button variant="destructive-outline">Reject</Button>)
  const c = screen.getByRole('button').className
  expect(c).toContain('bg-background'); expect(c).toContain('text-red-600'); expect(c).toContain('dark:text-red-400')
})
// input.test.tsx
it('Input defaults to h-9', () => { render(<Input aria-label="a" />); expect(screen.getByLabelText('a').className).toContain('h-9') })
it('Input inputSize="sm" is h-7 text-xs', () => { render(<Input aria-label="a" inputSize="sm" />); expect(screen.getByLabelText('a').className).toMatch(/h-7.*text-xs|text-xs.*h-7/) })
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/components/ui/button.test.tsx src/components/ui/input.test.tsx`
Expected: FAIL (`h-10` found where `h-9` is expected).

- [ ] **Step 3: Implement**

Sizes exactly as spec §5.6. `destructive-outline`: `border border-red-200 bg-background text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40`. `Input`: the `inputSize` variant must not reach the DOM (destructure it out). `SelectTrigger`: `size="sm"` → `h-7 text-xs`, default `h-9`. Existing per-call `h-*` overrides stay until Part 12 (they still win through `cn`).

- [ ] **Step 4: Run and see them pass, then typecheck**

Run: `npx vitest run src/components/ui && npx tsc --noEmit`
Expected: PASS; no `size="lg"` errors left.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui src/components/samples/intake/success-view.tsx
git commit -m "feat(ui): two control heights (36/28), icon-sm, destructive-outline, Input inputSize"
```

---

### Task 5: Pinned dialog footers

**Files:**
- Modify: `src/components/ui/dialog.tsx` (`DialogFooter`), `src/components/ui/alert-dialog.tsx` (`AlertDialogFooter`, `AlertDialogAction`)
- Create: `src/components/ui/dialog-footer.test.tsx`

**Interfaces:**
- Produces: `DialogFooter` and `AlertDialogFooter` props `React.HTMLAttributes<HTMLDivElement> & { start?: React.ReactNode }`. `AlertDialogAction` prop `variant?: ButtonProps['variant']` (default `'default'`).

- [ ] **Step 1: Write failing tests**

```tsx
it('puts start on the left and children on the right', () => {
  render(<DialogFooter start={<button>Delete</button>}><button>Cancel</button><button>Save</button></DialogFooter>)
  const names = screen.getAllByRole('button').map((b) => b.textContent)
  expect(names).toEqual(['Delete', 'Cancel', 'Save'])
})
it('is sticky at the bottom, edge to edge, on the muted bar', () => {
  const { container } = render(<DialogFooter><button>Save</button></DialogFooter>)
  const c = (container.firstChild as HTMLElement).className
  for (const cls of ['sticky', 'bottom-0', 'border-t', 'bg-muted', '-mx-4', 'sm:-mx-6', '-mb-4', 'sm:-mb-6']) expect(c).toContain(cls)
})
it('lets a caller cancel the bleed when DialogContent has no padding', () => {
  const { container } = render(<DialogFooter className="mx-0 mb-0"><button>Save</button></DialogFooter>)
  const c = (container.firstChild as HTMLElement).className
  expect(c).toContain('mx-0'); expect(c).not.toContain('-mx-4')
})
it('keeps primary on top on mobile', () => {
  const { container } = render(<DialogFooter><button>Save</button></DialogFooter>)
  expect((container.firstChild as HTMLElement).innerHTML).toContain('flex-col-reverse')
})
it('AlertDialogAction takes a variant', () => {
  // render inside an open AlertDialog
  expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-destructive')
})
```

The same footer tests run against `AlertDialogFooter`.

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/components/ui/dialog-footer.test.tsx`
Expected: FAIL (no `sticky`).

- [ ] **Step 3: Implement**

Outer element: `sticky bottom-0 z-10 -mx-4 -mb-4 sm:-mx-6 sm:-mb-6 flex items-center gap-2 border-t bg-muted px-4 py-3 sm:px-6`. Inside: `start` (when given), a `flex-1` spacer, then a group `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end` holding `children`. `AlertDialogAction`: `buttonVariants({ variant })`.

- [ ] **Step 4: Find dialogs that override the padding**

Run: `grep -rln "DialogContent[^>]*className=\"[^\"]*\bp-[0-3]\b" src` and, for each hit that also renders `DialogFooter` or `AlertDialogFooter`, pass `className="mx-0 mb-0"` (or the bleed matching its padding). Then replace the `className="bg-destructive …"` overrides on `AlertDialogAction` with `variant="destructive"` (`grep -rn "AlertDialogAction" src | grep destructive`).

- [ ] **Step 5: Run the suite and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/components/ui src/components src/app
git commit -m "feat(ui): dialog footers pin to the bottom with a start slot; AlertDialogAction variant"
```

---

### Task 6: `PageBody`

**Files:**
- Modify: `src/components/layout/main-layout.tsx` (export `PageBody`; the `max-w-[1400px]` default stays, see spec §5.1 amendment)
- Modify: `src/components/layout/main-layout.test.tsx`

**Interfaces:**
- Produces: `export function PageBody(props: { children: React.ReactNode; className?: string; flush?: boolean }): JSX.Element`. Renders `div` with `mx-auto w-full max-w-[1400px]` plus `p-6` unless `flush`. Migrated pages use `<MainLayout fullWidth><PageHeader …/><PageBody>…</PageBody></MainLayout>`.

- [ ] **Step 1: Write failing tests** (append to `main-layout.test.tsx`)

```tsx
describe('PageBody', () => {
  it('caps width and pads', () => {
    render(<PageBody><p>body</p></PageBody>)
    const c = screen.getByText('body').parentElement!.className
    expect(c).toContain('max-w-[1400px]'); expect(c).toContain('p-6')
  })
  it('flush drops the padding', () => {
    render(<PageBody flush><p>body</p></PageBody>)
    expect(screen.getByText('body').parentElement!.className).not.toContain('p-6')
  })
})
```

- [ ] **Step 2: Run, fail, implement, pass**

Run: `npx vitest run src/components/layout/main-layout.test.tsx`
Expected first: FAIL (`PageBody` is not exported). After implementing: PASS, including the two existing width tests.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout
git commit -m "feat(layout): PageBody carries the page width and padding"
```

---

### Task 7: Verify and ship Part 1

- [ ] **Step 1:** Run `npx tsc --noEmit && npx vitest run && npx next build`. Expected: all clean.
- [ ] **Step 2:** Browser check (`npm run dev`), light and dark, desktop and tablet width: `/samples/qc`, `/certificates`, `/grading`, `/cupping`, `/quality/templates`, one dialog with a footer (e.g. Override status), one alert dialog (template Deactivate), `/portal` with the OS in dark mode. Expected: 10px cards and dialogs, 6px buttons and inputs, green filled buttons and switches, dialog footers on a muted bar that stays in view when the dialog scrolls, portal title and buttons dark green on white.
- [ ] **Step 3:** `git push origin HEAD:main`, then confirm the Vercel deploy succeeded before starting Part 2.

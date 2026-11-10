# Part 2: Shared components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The five components that make the placement rules the easy path, each with tests. Nothing uses them until Part 3.

**Architecture:** Small presentational components in `src/components/ui/` and `src/components/layout/`, built on the existing shadcn primitives (`Button`, `DropdownMenu`, `ContextMenu`, `Tooltip`) plus shadcn `ToggleGroup` (added with the CLI; the repo convention is no direct Radix imports in app code).

**Tech Stack:** React, shadcn/ui, vitest + Testing Library + user-event.

**Spec:** §5.1–5.5 of `docs/superpowers/specs/2026-09-28-ui-corners-and-button-placement-design.md`. Index: `docs/superpowers/plans/2026-11-10-ui-corners-green.md`.

---

### Task 1: `PageHeader`

**Files:**
- Create: `src/components/layout/page-header.tsx`, `src/components/layout/page-header.test.tsx`

**Interfaces:**
- Produces:

```tsx
export type Crumb = { label: string; href?: string; onClick?: () => void; emphasis?: boolean; badge?: React.ReactNode }
export interface PageHeaderProps {
  crumbs: Crumb[]                       // last = the page title
  back?: { href?: string; onClick?: () => void; label: string }
  count?: number
  actions?: React.ReactNode             // ghost → outline → primary
  toolbar?: React.ReactNode
  toolbarPlacement?: 'row' | 'inline'   // default 'row'
  sticky?: boolean                      // default true; the portal passes false
}
export const PageHeader: React.ForwardRefExoticComponent<PageHeaderProps & React.RefAttributes<HTMLDivElement>>
// forwardRef to the outer div: pages with a sticky table head measure it (certificates, QC samples)
```

- [ ] **Step 1: Write failing tests**

```tsx
it('renders the last crumb as the green h1', () => {
  render(<PageHeader crumbs={[{ label: 'Samples', href: '/samples' }, { label: 'QC Samples' }]} />)
  const h1 = screen.getByRole('heading', { level: 1, name: 'QC Samples' })
  expect(h1.className).toContain('text-primary'); expect(h1.className).toContain('text-[18px]'); expect(h1.className).toContain('font-semibold')
})
it('links earlier crumbs and separates them with "/"', () => {
  render(<PageHeader crumbs={[{ label: 'Samples', href: '/samples' }, { label: 'QC Samples' }]} />)
  expect(screen.getByRole('link', { name: 'Samples' })).toHaveAttribute('href', '/samples')
  expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('/')
})
it('calls onClick crumbs (overlays)', async () => {
  const onClick = vi.fn()
  render(<PageHeader crumbs={[{ label: 'Quality Templates', onClick }, { label: 'Basic information' }]} />)
  await userEvent.click(screen.getByRole('button', { name: 'Quality Templates' })); expect(onClick).toHaveBeenCalled()
})
it('shows an emphasis crumb in foreground 14px/600 with its badge', () => {
  render(<PageHeader crumbs={[{ label: 'Quality Templates', onClick: () => {} }, { label: 'Ahold SAP', emphasis: true, badge: <span>v4</span> }, { label: 'Basic information' }]} />)
  const rec = screen.getByText('Ahold SAP'); expect(rec.className).toContain('text-foreground'); expect(rec.className).toContain('text-[14px]')
  expect(screen.getByText('v4')).toBeInTheDocument()
})
it('shows the count after the title', () => {
  render(<PageHeader crumbs={[{ label: 'Quality Templates' }]} count={24} />)
  expect(screen.getByText('24')).toBeInTheDocument()
})
it('renders a back button with its label', () => {
  const onClick = vi.fn(); render(<PageHeader back={{ onClick, label: 'Back to Quality Templates' }} crumbs={[{ label: 'X' }]} />)
  expect(screen.getByRole('button', { name: 'Back to Quality Templates' })).toBeInTheDocument()
})
it('is sticky by default and not when sticky={false}', () => {
  const { container, rerender } = render(<PageHeader crumbs={[{ label: 'X' }]} />)
  expect((container.firstChild as HTMLElement).className).toContain('sticky')
  rerender(<PageHeader crumbs={[{ label: 'X' }]} sticky={false} />)
  expect((container.firstChild as HTMLElement).className).not.toContain('sticky')
})
it('places the toolbar on its own row by default, inline when asked', () => {
  const { rerender } = render(<PageHeader crumbs={[{ label: 'X' }]} toolbar={<input aria-label="Search" />} />)
  expect(screen.getByTestId('page-header-toolbar-row')).toContainElement(screen.getByLabelText('Search'))
  rerender(<PageHeader crumbs={[{ label: 'X' }]} toolbar={<input aria-label="Search" />} toolbarPlacement="inline" />)
  expect(screen.queryByTestId('page-header-toolbar-row')).toBeNull()
})
it('forwards its ref to the outer element', () => {
  const ref = React.createRef<HTMLDivElement>()
  const { container } = render(<PageHeader ref={ref} crumbs={[{ label: 'X' }]} />)
  expect(ref.current).toBe(container.firstChild)
})
it('hides all but the last two crumbs below sm', () => {
  render(<PageHeader crumbs={[{ label: 'A', href: '/a' }, { label: 'B', href: '/b' }, { label: 'C' }]} />)
  expect(screen.getByRole('link', { name: 'A' }).closest('li')!.className).toContain('hidden sm:flex')
  expect(screen.getByRole('link', { name: 'B' }).closest('li')!.className).not.toContain('hidden')
})
```

- [ ] **Step 2: Run, see them fail**

Run: `npx vitest run src/components/layout/page-header.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** per spec §5.1 and the crumb table

Outer `div` `top-0 z-20 bg-background` (+ `sticky` when `sticky !== false`). Title row `h-[52px] border-b px-6 flex items-center gap-3`; crumbs in `<nav aria-label="Breadcrumb"><ol>`; earlier crumbs `text-[13px] text-muted-foreground`, separators `text-muted-foreground/40`; `count` `text-xs text-muted-foreground`; inline toolbar after the title with `flex-wrap`; `actions` in `ml-auto flex items-center gap-2`. Toolbar row (when `'row'`) `h-[52px] border-b px-6 flex items-center gap-2`, `data-testid="page-header-toolbar-row"`. Labelled actions shrinking to icons on phones are the caller's job (`<span className="hidden sm:inline">`), documented in a JSDoc on `actions`.

- [ ] **Step 4: Run, see them pass. Commit.**

Run: `npx vitest run src/components/layout/page-header.test.tsx` → PASS.

```bash
git add src/components/layout/page-header.tsx src/components/layout/page-header.test.tsx
git commit -m "feat(ui): PageHeader with the title as the green last crumb"
```

---

### Task 2: `CommitBar`

**Files:** Create `src/components/ui/commit-bar.tsx`, `src/components/ui/commit-bar.test.tsx`

**Interfaces:**
- Produces: `export function CommitBar(props: { start?: React.ReactNode; children: React.ReactNode; className?: string }): JSX.Element`

- [ ] **Step 1: Failing tests:** button order `['Back', 'Cancel', 'Next']` for `start={Back}` + children `Cancel, Next`; class contains `sticky`, `bottom-0`, `border-t`, `bg-muted`, `py-3`; no `rounded` class.
- [ ] **Step 2:** `npx vitest run src/components/ui/commit-bar.test.tsx` → FAIL.
- [ ] **Step 3: Implement** per spec §5.2 (same inner layout as `DialogFooter` from Part 1 Task 5, without the negative margins).
- [ ] **Step 4:** Run → PASS. Commit `feat(ui): CommitBar, the pinned footer for panels and wizards`.

---

### Task 3: `SelectionBar`

**Files:** Create `src/components/ui/selection-bar.tsx`, `src/components/ui/selection-bar.test.tsx`

**Interfaces:**
- Produces: `export function SelectionBar(props: { count: number; noun?: string; onClear: () => void; actions: React.ReactNode; destructive?: React.ReactNode }): JSX.Element | null`

- [ ] **Step 1: Failing tests**

```tsx
it('renders nothing at 0', () => { const { container } = render(<SelectionBar count={0} onClear={() => {}} actions={null} />); expect(container.firstChild).toBeNull() })
it('shows "3 selected" and Clear', async () => {
  const onClear = vi.fn(); render(<SelectionBar count={3} onClear={onClear} actions={<button>Send</button>} />)
  expect(screen.getByText('3 selected')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Clear' })); expect(onClear).toHaveBeenCalled()
})
it('uses the noun', () => { render(<SelectionBar count={2} noun="in list" onClear={() => {}} actions={null} />); expect(screen.getByText('2 in list')).toBeInTheDocument() })
it('puts destructive last after a divider', () => {
  render(<SelectionBar count={1} onClear={() => {}} actions={<button>Export</button>} destructive={<button>Delete</button>} />)
  const names = screen.getAllByRole('button').map((b) => b.textContent)
  expect(names).toEqual(['Clear', 'Export', 'Delete']); expect(screen.getByRole('separator')).toBeInTheDocument()
})
it('is a square sticky bar', () => {
  const { container } = render(<SelectionBar count={1} onClear={() => {}} actions={null} />)
  const c = (container.firstChild as HTMLElement).className
  for (const cls of ['sticky', 'bottom-0', 'border-t', 'bg-background']) expect(c).toContain(cls)
  expect(c).not.toMatch(/rounded/)
})
```

- [ ] **Step 2–4:** fail → implement (Clear is a ghost `sm` `Button`; divider is `Separator orientation="vertical"` with `role="separator"` exposed via `decorative={false}`) → pass. Commit `feat(ui): SelectionBar docked under the table`.

---

### Task 4: `RowActions` and `RowContextMenu`

**Files:** Create `src/components/ui/row-actions.tsx`, `src/components/ui/row-actions.test.tsx`

**Interfaces:**
- Produces: `RowAction` and the two functions exactly as spec §5.4, plus `export function visibleRowActions(actions: RowAction[]): RowAction[]` (drops `hidden`, moves `destructive` last, keeps order otherwise) used by both menus.

- [ ] **Step 1: Failing tests**

```tsx
const actions: RowAction[] = [
  { id: 'del', label: 'Delete', onSelect: vi.fn(), destructive: true },
  { id: 'pdf', label: 'Download PDF', onSelect: vi.fn() },
  { id: 'edit', label: 'Edit', onSelect: vi.fn(), hidden: true },
  { id: 'ovr', label: 'Override status', onSelect: vi.fn() },
]
it('visibleRowActions drops hidden and puts destructive last', () => {
  expect(visibleRowActions(actions).map((a) => a.id)).toEqual(['pdf', 'ovr', 'del'])
})
it('Open calls onOpen', async () => { const onOpen = vi.fn(); render(<RowActions onOpen={onOpen} actions={actions} />); await userEvent.click(screen.getByRole('button', { name: 'Open' })); expect(onOpen).toHaveBeenCalled() })
it('More lists the visible actions in order', async () => {
  render(<RowActions onOpen={() => {}} actions={actions} />)
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
  expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Download PDF', 'Override status', 'Delete'])
})
it('the context menu lists the same items', async () => {
  render(<RowContextMenu actions={actions}><div>row</div></RowContextMenu>)
  fireEvent.contextMenu(screen.getByText('row'))
  expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Download PDF', 'Override status', 'Delete'])
})
it('selecting an item calls it', async () => {
  render(<RowActions onOpen={() => {}} actions={actions} />)
  await userEvent.click(screen.getByRole('button', { name: 'More actions' })); await userEvent.click(screen.getByRole('menuitem', { name: 'Override status' }))
  expect(actions[3].onSelect).toHaveBeenCalled()
})
```

- [ ] **Step 2–4:** fail → implement (Open: ghost `sm`, label `openLabel ?? 'Open'`; More: ghost `icon-sm` with `aria-label="More actions"` and a `Tooltip`; destructive items `text-destructive` after a `DropdownMenuSeparator`/`ContextMenuSeparator`; triggers `stopPropagation` so a row click does not fire) → pass. Commit `feat(ui): RowActions and RowContextMenu share one action list`.

---

### Task 5: `Segmented`

**Files:**
- Create via CLI: `src/components/ui/toggle-group.tsx`, `src/components/ui/toggle.tsx` (`npx shadcn@latest add toggle-group`)
- Create: `src/components/ui/segmented.tsx`, `src/components/ui/segmented.test.tsx`

**Interfaces:**
- Produces:

```tsx
export interface SegmentedOption<T extends string> { value: T; label: string; count?: number }
export function Segmented<T extends string>(props: {
  value: T; onValueChange: (value: T) => void; options: SegmentedOption<T>[]; 'aria-label': string; size?: 'default' | 'sm'
}): JSX.Element
```

- [ ] **Step 1: Failing tests:** renders a `group` with the given `aria-label`; the active item has `data-state="on"`; clicking "Active" calls `onValueChange('active')`; clicking the already active item does **not** call `onValueChange('')` (single-select never empties); a count renders as muted text `"All 128"` → text `All` and `128`.
- [ ] **Step 2:** Run `npx shadcn@latest add toggle-group` (check `components.json` paths resolve to `src/components/ui`), then `npx vitest run src/components/ui/segmented.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the look in spec §5.5: track `inline-flex rounded-md bg-muted p-0.5`, items `rounded-sm px-3 text-xs font-medium data-[state=on]:bg-background data-[state=on]:shadow-sm`, heights `h-7` (sm, inside a 28px row) or `h-8` track.
- [ ] **Step 4:** Run → PASS. Commit `feat(ui): Segmented single-select on shadcn ToggleGroup`.

---

### Task 6: Verify and ship Part 2

- [ ] `npx tsc --noEmit && npx vitest run && npx next build` → clean.
- [ ] `git push origin HEAD:main`; confirm the Vercel deploy.

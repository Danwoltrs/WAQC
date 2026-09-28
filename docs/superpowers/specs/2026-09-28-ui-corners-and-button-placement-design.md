# UI corners and button placement

**Date:** 2026-09-28
**Status:** design approved in conversation; spec awaiting review
**Visual reference:** https://claude.ai/artifact/MrWxhswhCsHSUZjk6tcY5B (version 2). The QC Samples mockup uses the app's real tokens and logo, and has a radius tuner.

## 1. Intent

Daniel's complaint: "the rounded corners are making it difficult, the button placements are not so good."

**Round 1: rejected.** Four Refero Styles systems were shown, all with 0–4px corners and each with its own palette and fonts (Glassnode, Paradigm, Modern Treasury, Oxide). His reply: "none of those… some rounding, but not everywhere, and not too much."

**Round 2: approved** ("perfect, that's great"):

- **Keep today's look.** Inter, the current black/white tokens, today's status colours. No new palette and no new typeface.
- **Soft containers, crisp data.** The radius depends on what an element *is*:

  | Element | Radius |
  |---|---|
  | Containers | 10px |
  | Controls | 6px |
  | Badges | 4px |
  | Data and page structure | 0 |

- **Eight button-placement rules**, applied on every page (§4).

**Success means:**

- No element is rounded more than 10px outside the allowlist.
- Every page places actions the same way.
- No save/approve button can scroll out of view.
- Buttons come in exactly two heights.
- A guard test keeps it that way.

## 2. Out of scope

- Colours, fonts, spacing scale, and chart palettes.
- PDFs (react-pdf certificates, reports) and email HTML.
- The CVA wheel canvas geometry (`.wheel-*` rules in `globals.css`, `src/components/cupping/cva/wheel/**`). It has its own approved prototype. CVA *buttons* are in scope (§6.6).
- New features and behaviour changes. Actions move and get labels; nothing gains or loses a capability. The exception is §8 open item 1, which needs Daniel's call.
- i18n (the language switcher stays a stub).

## 3. Corners

### 3.1 Tokens

In `src/app/globals.css` (`:root`), remove `--radius: 20px` and add:

```css
--radius-container: 10px; /* cards, dialogs, menus, popovers, toasts */
--radius-control: 6px;    /* buttons, inputs, selects, segmented, nav items */
--radius-badge: 4px;      /* status badges, SS/PSS/OTH tags, counters */
```

In `tailwind.config.ts` → `theme.extend.borderRadius`:

```ts
lg: 'var(--radius-container)',
md: 'var(--radius-control)',
sm: 'var(--radius-badge)',
```

`var(--radius)` has no direct uses outside the Tailwind config (checked), so it can be removed safely. The mapping alone moves about 360 existing `rounded-lg`/`md`/`sm` uses onto the new scale.

### 3.2 Primitive changes (`src/components/ui/`)

| File | Change | Why |
|---|---|---|
| `dropdown-menu.tsx`, `context-menu.tsx` | Content `rounded-md` → `rounded-lg`; items stay `rounded-sm` | Menus are containers; items are 4px inside a 10px menu |
| `popover.tsx`, `select.tsx` (content), `command.tsx` (root), `toast.tsx` | `rounded-md` → `rounded-lg` | Containers |
| `badge.tsx` | `rounded-full` → `rounded-sm`; colours unchanged | Badges are 4px |
| `checkbox.tsx` | `rounded-sm` → `rounded-[3px]` | 4px reads as a button at 14px |
| `card.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `alert.tsx` | No change (`rounded-lg` → 10px) | |
| `button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx` (trigger), `tabs.tsx` list | No change (`rounded-md` → 6px) | |

### 3.3 Where corners stay square (0)

- Tables, rows and cells.
- The left sidebar frame.
- The page header and toolbar rows (§5.1).
- Selection bars and footers *inside* a container. The container clips them (`overflow-hidden` on Card and Dialog).
- Table wrappers inside a Card get no radius of their own.

### 3.4 Allowlist (may stay `rounded-full` or other values)

- Avatars.
- Radio buttons, switches, slider thumbs, the progress track.
- Scroll-area thumbs.
- Loading spinners (`animate-spin rounded-full`).
- Notification dots and unread counts.
- Colour swatches.
- The CVA wheel canvas (§2).

### 3.5 Sweep

Move everything outside the allowlist onto the three levels by element type:

- 127 arbitrary radii in 34 files (`rounded-[20px]`, `[16px]`, `[14px]`, `[12px]`, `[10px]`, `[9px]`, `[7px]`, …).
- 37 `rounded-2xl` and 31 `rounded-xl`.
- `rounded-full` used on buttons (4 `<Button … rounded-full>`, plus the sidebar-footer icon buttons).

The unused `.lab-card` rule in `globals.css` is deleted.

## 4. Placement rules

These eight rules are the contract. §5 builds components that make each one the easy path, and §6 applies them screen by screen.

1. **Every page has the same header.** Breadcrumb and title on the left, page actions on the right, main action last (`PageHeader`, §5.1).
2. **At most one filled (primary) button per view.** A confirmation's red "Delete" counts as that view's one filled button.
3. **Save/approve buttons never scroll away.** Two cases:
   - Page-like surfaces (pages, full-screen overlays) keep them in the sticky header's action slot.
   - Modal surfaces (dialogs, wizards, sheets, inline panels) keep them in a pinned footer (`CommitBar` / `DialogFooter`, §5.2).
4. **Every footer uses the same order.** Destructive action (Delete/Reject), or Back in a wizard, on the far left. Then, on the right: Cancel, secondary, main action last.
5. **Row actions are visible and labelled.** An "Open" button plus a "More" menu listing every row action. Right-click opens the same list (`RowActions` / `RowContextMenu`, §5.4). Nothing is hover-only or right-click-only.
6. **Selecting rows opens a bar docked at the bottom of the table.** It shows the count and Clear on the left, labelled actions on the right, and Delete last after a divider (`SelectionBar`, §5.3). This replaces the "Actions (N)" dropdowns.
7. **"Save" always persists.** A button that only stages a change is labelled "Apply". Each editor has one Save.
8. **Two control heights.**
   - 28px (`size="sm"`): tables, toolbars, selection bars.
   - 36px (default): everywhere else.

   Every button goes through the shared `Button`.

## 5. Components

### 5.1 `PageHeader` (new, `src/components/layout/page-header.tsx`)

```tsx
type Crumb = { label: string; href?: string }
interface PageHeaderProps {
  crumbs: Crumb[]          // last crumb is the title (semibold), earlier ones are muted links
  actions?: React.ReactNode // right side, in order: ghost → outline → primary
  toolbar?: React.ReactNode // optional second row: search, segmented filter, filters, count
}
```

- **Header row:** 60px, `border-b`, `bg-background`, title at 14px/600 (the CLAUDE.md scale).
- **Toolbar row:** 52px, `border-b`. Controls in it use `size="sm"`.
- **Sticky:** the whole block is sticky at the top of the `MainLayout` scroll area (`main-layout.tsx:143`). It replaces the per-page sticky bars (QC samples `qc/page.tsx:1273`, certificates `certificates/page.tsx:739`) and their `headerHeight` measuring.
- **Placement:** the header's border runs the full width. To allow that, `MainLayout` stops wrapping every page in `max-w-[1400px]` (`main-layout.tsx:144`). The same file exports a `PageBody` wrapper that carries the `max-w-[1400px]` and the page padding (`p-6`), and pages render `<PageHeader/>` then `<PageBody>…</PageBody>`. Pages that have not moved over yet get `PageBody` added mechanically in phase 1, so their layout doesn't change.

### 5.2 `CommitBar` (new, `src/components/ui/commit-bar.tsx`) and `DialogFooter`

```tsx
interface CommitBarProps {
  start?: React.ReactNode   // destructive action, or Back in a wizard: far left
  children: React.ReactNode // right side: Cancel, secondary, primary (in that order)
}
```

- **`CommitBar`:** `sticky bottom-0`, `border-t`, `bg-muted`, 12px vertical padding, `flex items-center gap-2`, with a spacer between `start` and `children`. It is square, since it lives inside a container.
- **`DialogFooter` (`dialog.tsx`)** gains the same `start` prop and becomes sticky at the bottom with the same styling:
  - Negative margins cancel `DialogContent`'s `p-6`, so the bar runs edge to edge.
  - Because many `DialogContent`s scroll themselves (`max-h-[90vh] overflow-y-auto`, 12 files), a sticky footer stays in view with no restructuring.
  - On mobile the stack order stays reversed (primary on top).
- **`AlertDialogFooter`** gets the same treatment. **`AlertDialogAction`** gains a `variant` prop (so `variant="destructive"` replaces today's className overrides).

### 5.3 `SelectionBar` (new, `src/components/ui/selection-bar.tsx`)

```tsx
interface SelectionBarProps {
  count: number
  noun?: string              // "selected" by default
  onClear: () => void
  actions: React.ReactNode    // size="sm" outline buttons
  destructive?: React.ReactNode // rendered last, after a divider
}
```

It renders only when `count > 0`, docked at the bottom of the table's Card as `sticky bottom-0`, square, with `border-t` and `bg-background`.

### 5.4 `RowActions` / `RowContextMenu` (new, `src/components/ui/row-actions.tsx`)

```tsx
interface RowAction {
  id: string
  label: string
  icon?: LucideIcon
  onSelect: () => void
  destructive?: boolean     // red; the menu places destructive items last after a separator
  hidden?: boolean          // permission-gated items (e.g. master-editor Edit)
}
function RowActions(props: { onOpen: () => void; openLabel?: string; actions: RowAction[] }): JSX.Element
function RowContextMenu(props: { actions: RowAction[]; children: React.ReactNode }): JSX.Element
```

- **`RowActions`** renders a ghost `sm` "Open" button plus a ghost `icon-sm` "More actions" trigger (with tooltip and `aria-label`) that opens a `DropdownMenu`.
- **`RowContextMenu`** renders the *same* `actions` array, so the two lists cannot drift apart.

### 5.5 `Segmented` (new, `src/components/ui/segmented.tsx`)

- A single-select control built on shadcn **ToggleGroup**, added with the shadcn CLI. The vault convention is shadcn-only, no direct Radix imports.
- **Look:** `bg-muted` track with a 2px inset; the active item is `bg-background` with a subtle shadow; the track uses the 6px control radius and items 4px.
- **Optional counts:** each item can show a muted count, as in "All 128".
- **Replaces:** the QC samples stage chips (`qc/page.tsx:1232`, plain `rounded-full` buttons).

### 5.6 `Button`, `Input`, `SelectTrigger`

**`Button` sizes:**

```ts
size: {
  default: 'h-9 px-4',                 // 36px (was h-10)
  sm: 'h-7 px-2.5 text-xs',            // 28px (was h-9)
  icon: 'h-9 w-9',
  'icon-sm': 'h-7 w-7',                // new
}
// 'lg' removed (2 uses → default)
```

**New `Button` variant** `'destructive-outline'`: red text, red-tinted border, `bg-background`, red-50 hover. In dark mode: red-400 text, red-900/60 border. It is used for Reject/Delete in footers and selection bars.

**`Input` and `SelectTrigger`:**
- Default height becomes `h-9`.
- `sm` (`h-7 text-xs`) is set with `inputSize="sm"` on `Input`, because the native `size` attribute collides. `SelectTrigger` takes `size="sm"`.

**Removed:** custom `h-*` classes on `Button`: 83 on `sm`, 12 on default, 19 on `icon`.

## 6. Screens

The line references come from the 2026-09-28 audit. Each screen that moves over follows §4 and uses §5.

### 6.1 Shell

- **`sidebar-footer.tsx`:** icon buttons drop `rounded-full`, becoming 6px `icon` buttons. The avatar stays round.
- **`left-sidebar.tsx`:** nav items go to `rounded-md` (6px; CLAUDE.md's 12px is superseded). The sidebar frame stays square.
- **`main-layout.tsx`:** the `max-w-[1400px]` wrapper moves into `PageBody` (§5.1). Nothing else changes.

### 6.2 QC Samples (`src/app/samples/qc/page.tsx`, 2,391 lines)

- **Header:** `PageHeader` with crumbs "Samples / QC Samples".
  - Actions: ghost "Today's tin labels" (`PrintTodayTinLabelsButton`), then primary "New sample".
  - Toolbar: search, `Segmented` stages, outline sm "Filters", labelled outline sm "Columns" (was icon-only, `:1246`), and the count on the right.
- **Rows** (`:1695-1730`, sub-contract rows `:2024-2063`):
  - `RowActions`: Open opens the sample detail overlay.
  - More menu: View certificate (when present), Download certificate, Edit, Duplicate, Add contract, Assign cuppers, Reprint cupping cards (when allowed), then Delete.
  - The row right-click menu (`:1743`) becomes a `RowContextMenu` with the same list.
  - Delete is no longer hover-only.
- **`SelectionBar`** replaces "Actions (N)" (`:1328`) and the page-level bulk right-click menu (`:2080-2153`): Assign cuppers, Reprint cupping cards, Tin labels, Bag sleeves, Export, then Delete.
- **Certificate preview dialog** (`:2271-2289`): Close becomes ghost, Download stays outline, and Close is no longer the filled button.
- **Split** (the file is over the 2,000-line limit): move the table rows, the row/bulk action definitions, the filter toolbar and the dialogs into `src/components/samples/qc-list/`. The page keeps state and composition. Target: every file under ~800 lines.

### 6.3 Certificates (`src/app/certificates/page.tsx`, 1,584 lines) and the editor

- **Header:** `PageHeader` "Certificates".
  - Actions: ghost "Today's tin labels", then primary "Send unsent". It opens on click, not hover (`send-unsent-menu.tsx:58`).
  - Toolbar: same as §6.2.
- **Rows** (`:1151-1195`): `RowActions`. Open opens the preview. The More menu holds Download PDF, Edit (master editor only, `hidden` otherwise) and **Override status** (was an unlabelled `RefreshCw` icon).
- **`SelectionBar`:** Download ZIP, Send to buyer, Send to seller, Tin labels, Bag sleeves.
- **Certificate editor overlay** (`cert-editor/certificate-edit-overlay.tsx:198-262`):
  - The header stays the pinned action area: the ⋯ trigger becomes a labelled outline sm "Actions" menu, then Cancel (ghost), then Save changes (primary).
  - `EditPanel`'s footer "Save" (`cert-editor/ui-parts.tsx:128-135`) becomes **"Apply"**, per rule 7. Its footer becomes a `CommitBar`.
- **Approval send view** (`approval-send-view.tsx:126,164`): "Send to both" moves into a pinned `CommitBar`, and Close becomes a ghost button instead of a faint link.

### 6.4 Grading (`src/app/grading/page.tsx`, 1,847 lines)

- **Header:** `PageHeader` "Grading", with the sample tabs (`sample-tabs-navigation.tsx`) as its toolbar row.
- **Save** (primary; it issues the certificate, `:1380-1401`) and Upload photo (outline) move from the scrolling info bar into the sticky header actions.
- **Tolerance banner:** "Approve with comments" (`tolerance-banner.tsx:38`) becomes outline, so Save stays the one filled button.

### 6.5 Cupping (`src/app/cupping/page.tsx`)

- **Header:** `PageHeader` "Cupping", with the tabs as its toolbar row.
  - Actions: Scan cards, Validate & review, Generate certificate (all outline), Edit (ghost), then Save (primary).
  - Scan Cards stops being filled, per rule 2.
- **Validation modal** (`cupping-validation-modal.tsx:1378-1502`):
  - Pinned `DialogFooter` with `start` = Reject (`destructive-outline`); right side = Close (ghost), then Approve (primary). In other states it shows Validate & Certify, or the override buttons, in the same slots.
  - The comment textarea moves out of the footer into the body.
- **Add-defect popover** (`:1882-1901`): Cancel, then Add (right).
- **`certificate-edit-dialog.tsx`:** its Save becomes pinned through `DialogFooter` (see §8, open item 2).

### 6.6 CVA (`src/components/cupping/cva/`)

- **`CvaJourney.tsx:651-672`:** Back/Next become shared `Button`s in a pinned `CommitBar` (Back as `start`).
- **`CertifyStep.tsx:221-240`:** order becomes Override (outline), then Certify (primary) on the right.
- **Override panel** (`:263-290`): Reject (`destructive-outline`, start), then Cancel and Approve.
- **Unchanged:** the picker page stays shell-less (mobile canvas) and keeps its sticky "Start cupping", now as a shared `Button`.

### 6.7 Intake wizard (`src/components/samples/sample-intake-form.tsx` and `intake/`)

- **Footer** (`:1372-1426`):
  - `start` = Previous.
  - Right = **Cancel** (new; today the only exit is the X), then "+ Add sub-contract" (outline, step 3), then Next or "Create sample" (primary).
  - "Skip — enter manually" (`contract-search-step.tsx:258`) becomes ghost, left of Next.
- **Standalone `/samples/intake` page:** one `PageHeader` "Samples / New sample" replaces its three titles.
- **Other-sample intake** (`other-sample-intake.tsx:707-715, 931-944`): the plain emerald buttons become `Button`.
- **Sequencing:** another session currently has uncommitted changes in `intake/*` (including deleting `contract-link-badge.tsx`). Intake goes last and starts from whatever is on `main` at that point.

### 6.8 Everything else

Every other page under `MainLayout` gets a `PageHeader`, and their footers and dialogs follow §4:

- dashboard, metrics, reports, lab activity, signature settings
- clients (list, detail, new, edit)
- other samples, storage, sys sync
- laboratories, finance, users, quality templates
- the partner portal pages

The `/test/*` pages are left alone.

**Dialogs:**
- The 21 dialogs with hand-built footers move to `DialogFooter`.
- The three "filled Close" cases (`qc/page.tsx:2286`, `sample-actions.tsx:181`, `certificates/page.tsx:1260`) are fixed.
- `add-sub-contract-dialog.tsx:476-492` gains Cancel and the standard order.
- `ocr-validation-dialog.tsx:776-810` has five buttons: two go into a "More" menu, per rule 2.

### 6.9 Plain `<button>` elements

There are 220 plain `<button>` elements. They move to `Button`, except:

- CVA canvas controls.
- Table expand chevrons, which become `Button variant="ghost" size="icon-sm"` anyway.
- Elements that are not actions (e.g. `CommandItem`).

The implementation plan lists them per file.

## 7. Guard rails, tests and docs

- **Radius guard test** (`src/app/ui-radius-guard.test.ts`, same pattern as `src/app/api/route-exports.test.ts`). It fails when any `.tsx` under `src/` (outside an allowlist of paths and line patterns from §3.4) contains:
  - `rounded-2xl`, `rounded-3xl` or `rounded-xl`
  - `rounded-[Npx]` with N > 10
  - `rounded-full` on a `<Button`
- **Button height guard:** in the same test, no `<Button` or `<Input` may carry an `h-\d` class.
- **Unit tests** (vitest + Testing Library) for `PageHeader`, `CommitBar`, `DialogFooter`, `SelectionBar`, `RowActions`/`RowContextMenu` and `Segmented`. They cover:
  - slot order (start left, primary last)
  - sticky classes present
  - `SelectionBar` hidden at count 0
  - the same actions in the dropdown and the context menu
  - `hidden` items omitted
  - destructive items last
- **Existing suites:** existing tests pass. `tsc --noEmit` and `next build` are clean on every push (route-file export rule, see memory).
- **Browser QA:** each migrated screen is checked in light and dark mode at desktop and tablet width. The five highest-traffic screens (QC samples, certificates + editor, grading, cupping, intake) also get a scroll test: the commit buttons stay visible with the content scrolled to the bottom.
- **Docs:** the UI section of the project `CLAUDE.md` changes to match:
  - radii 10/6/4/0 instead of 20px cards, 12px nav and 16px search
  - the two control heights
  - a pointer to this spec

  The vault `01-projects/waqc/context.md` line quoting `border-radius: 20px` is updated too.

## 8. Delivery order

Each phase ships to `main` on its own and leaves the app consistent.

1. **Tokens and primitives** (§3.1, §3.2, §5.6 heights and variants, the `DialogFooter`/`AlertDialog` changes, and moving `max-w-[1400px]` into `PageBody` with every page wrapped). This one push fixes corners app-wide and pins dialog footers.
2. **New components** (§5.1–5.5) with their tests. Unused until phase 3.
3. **Screens, by daily use.** One push per screen. QC samples also gets its split.
   1. QC samples
   2. Certificates + editor + approval send
   3. Grading
   4. Cupping + validation modal
   5. CVA
   6. Remaining pages and dialogs (§6.8)
   7. Intake (§6.7), last
4. **Sweep and guard.** Remaining arbitrary radii, custom heights and plain buttons; the guard test turns on; `CLAUDE.md` and the vault note are updated.

## 9. Open items for Daniel

1. **Unreachable bulk email dialog** (`certificates/page.tsx:1207-1360`): nothing calls `setShowEmailDialog(true)`. **Delete it** (proposed; batch send and Send unsent cover the need) or wire it to a selection-bar action?
2. **Two certificate editors:** `cupping/certificate-edit-dialog.tsx` (opened from Cupping → Edit) and the `cert-editor` overlay. This spec only pins the older one's Save. Retiring it in favour of the overlay would be a separate change.

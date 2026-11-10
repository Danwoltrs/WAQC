# UI corners and button placement

**Date:** 2026-09-28, amended 2026-11-10
**Status:** approved by Daniel 2026-11-10 ("go ahead"). Plan: `docs/superpowers/plans/2026-11-10-ui-corners-green.md`
**Visual references:**
- https://claude.ai/artifact/MrWxhswhCsHSUZjk6tcY5B (version 2). The QC Samples mockup uses the app's real tokens and logo, and has a radius tuner.
- https://claude.ai/artifact/RVGz8G64bCwMne9gbhQXwG (2026-11-10, approved: "perfect, approved"). Quality Templates list, editor and the new Moisture, density & quakers page. It is the reference for the green buttons and the green title crumb (§3.6, §5.1) and for §6.10.

**Line references** in §6 come from the 2026-09-28 audit. Six weeks of commits have moved them; re-find each one before editing.

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

**Round 3: approved 2026-11-10** on the Quality Templates mockup ("perfect, approved, ensure we have this new template of green buttons, and green title on the top header followed by a / … everywhere"):

- **Filled buttons are green** (`#15663f`), and so are checked switches and checkboxes (§3.6).
- **The page title lives in the header**, as the last crumb, in green at 18px/600, after a "/" (§5.1). It no longer repeats as a big heading in the page body.
- **The client portal is included** (Daniel's call, 2026-11-10).
- Daniel chose to build the whole of this spec together with the green, in one programme.

**Success means:**

- No element is rounded more than 10px outside the allowlist.
- Every page places actions the same way.
- No save/approve button can scroll out of view.
- Buttons come in exactly two heights.
- A guard test keeps it that way.

## 2. Out of scope

- Fonts, spacing scale, and chart palettes. Colours change in one place only: the primary token becomes green (§3.6). Status colours stay as they are.
- PDFs (react-pdf certificates, reports) and email HTML.
- The CVA wheel canvas geometry (`.wheel-*` rules in `globals.css`, `src/components/cupping/cva/wheel/**`). It has its own approved prototype. CVA *buttons* are in scope (§6.6).
- New features and behaviour changes. Actions move and get labels; nothing gains or loses a capability. The exceptions are the density limits (§6.10) and the Send dropdown on Certificates (§6.3).
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

### 3.6 Primary colour: green (added 2026-11-10)

In `src/app/globals.css`:

| Token | Light (`:root`) | Dark (`.dark`) |
|---|---|---|
| `--primary` | `151 66% 24%` (`#15663f`) | `151 50% 55%` (a light green) |
| `--primary-foreground` | `0 0% 98%` (unchanged) | `0 0% 9%` (unchanged) |

- **Why dark mode uses a light green with dark text:** it mirrors today's dark mode, where filled buttons are light with dark text. One token then works both as a button fill and as text on `#2A2A2A`. A dark green would fail contrast as text there. The builder checks both pairings reach 4.5:1 and nudges the lightness if not.
- **What turns green by itself:** the default `Button`, checked `Switch` and `Checkbox`, `border-primary` loading spinners, `bg-primary/5` and `/10` tints, and every `text-primary`.
- **Audit `text-primary` and `bg-primary` uses** (about 45 and 45 today). Where one means "plain emphasis" rather than "the action colour", change it to `text-foreground` (or the matching neutral) so the green stays reserved for actions, the title crumb and "on" states.
- **Hard-coded greens fold into the token:** the `#15663f` / `dark:#5fcf8e` "Active" text in `quality-spec-editor.tsx` and the list's Active badge become `text-primary` (the badge keeps its tinted background). Search for other literal `#15663f` uses and do the same where they mean the primary green; leave status greens (approved, valid) alone.
- `--ring` stays neutral.
- **Olive `#556b2f` (builder's call, 2026-11-10):** it stays a chart and data-visual colour only. Any filled action, loading spinner or "on" state drawn in olive moves to the primary token. Charts, chart legends and the Sankey keep the CLAUDE.md palette.

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
type Crumb = {
  label: string
  href?: string            // or onClick, for overlays such as the template editor
  onClick?: () => void
  emphasis?: boolean       // a record name, e.g. the template "Ahold SAP": black 14px/600
  badge?: React.ReactNode  // shown right after the label, e.g. the "v4" version tag
}
interface PageHeaderProps {
  crumbs: Crumb[]           // last crumb is the page title
  back?: { href?: string; onClick?: () => void; label: string } // optional arrow before the crumbs
  count?: number            // muted number after the title, e.g. "Quality Templates 24"
  actions?: React.ReactNode // right side, in order: ghost → outline → primary
  toolbar?: React.ReactNode // search, segmented filter, filters
  toolbarPlacement?: 'row' | 'inline' // default 'row' (second row); 'inline' sits after the title and wraps below on narrow screens
}
```

Crumb styling (the approved 2026-11-10 mockup):

| Crumb | Look |
|---|---|
| Earlier crumbs | muted, 13px/400, links |
| A record name (`emphasis`) | foreground, 14px/600, plus its `badge` |
| Separators | a "/" in a light muted tone |
| **Last crumb (the title)** | **`text-primary` (green), 18px/600**, rendered as the page's `h1` |

Examples: "Quality Templates" alone (list page, green). "Samples / QC Samples" ("QC Samples" green). "Quality Templates / **Ahold SAP** v4 / Basic information" (the editor: the section name is green).

- **Header row:** 52px, `border-b`, `bg-background`. This supersedes the earlier 60px and 14px title.
- **The body no longer repeats the title.** Page-level `h1`s and section headings that only restate the crumb are removed, and so are the one-line subtitles under them.
- **Toolbar row:** 52px, `border-b`. Controls in it use `size="sm"`.
- **Phone width:** the crumbs keep only the last two; earlier ones collapse into the back arrow. Actions with labels shrink to icon buttons with `aria-label` where they would not fit (as in board 4 of the 2026-11-10 mockup, where "New template" becomes a "+" button).
- **Sticky:** the whole block is sticky at the top of the `MainLayout` scroll area (`main-layout.tsx:143`). It replaces the per-page sticky bars (QC samples `qc/page.tsx:1273`, certificates `certificates/page.tsx:739`) and their `headerHeight` measuring.
- **Placement:** the header's border runs the full width. To allow that, `MainLayout` stops wrapping every page in `max-w-[1400px]` (`main-layout.tsx:144`). The same file exports a `PageBody` wrapper that carries the `max-w-[1400px]` and the page padding (`p-6`), and pages render `<PageHeader/>` then `<PageBody>…</PageBody>`. Pages that have not moved over yet get `PageBody` added mechanically in phase 1, so their layout doesn't change.
  - *Amended at planning (builder's call, 2026-11-10):* instead of wrapping all 23 pages in phase 1, `MainLayout` keeps its `max-w-[1400px]` default for pages not yet moved; a migrated page passes `fullWidth` and renders `<PageHeader/>` + `<PageBody>`. Phase 4 flips the default once every page has moved. Same end state, no mass edit up front.

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
- **`SelectionBar`:** Download ZIP, Send, Tin labels, Bag sleeves. (On main the Actions menu already has one "Send" in place of Send to buyer / Send to seller.)
- **Send opens a dropdown, not a page** (Daniel, 2026-11-10). Today Send opens the full-screen `BatchApprovalSendView` on its first step, `PartyStep` (`party-choice.tsx`), with all four parties listed whether or not the ticked certificates have them. Instead:
  - Send opens a popover anchored to the button, holding the party choice, "Include already sent" and a primary **Send** button. On Send, the existing email walk-through opens straight at its first email (Send, Skip, Send all remaining stay). `PartyStep` is removed from the view; `PartyChoice` is reused inside the popover.
  - **Only the parties present on the ticked certificates are listed.** On open, the popover asks the server which parties those certificates have, using the same resolution the queue uses (`resolveCertificateParties` → `certificatePartyCompanies`, so a company holding two buyer-side roles shows once, under its first role). A selection with only a client and a seller shows two rows; a Dunkin' selection (Seller › Importer › Roaster › Dunkin') shows four. While it loads, the rows show a spinner; on error, the popover says so and Send stays disabled.
  - **Each row names its companies:** "Seller · LDC Suisse", "Client · Dunkin'". More than two companies in one role show as the first two plus "+N".
  - **Order follows the supply chain:** Seller, Importer, Roaster, Client. *(My call: it reads the way Daniel describes the chain. The emails still go out clients first.)* "All parties" on top.
  - Everything listed starts ticked; the client cannot be unticked. Importer and roaster are listed regardless of `PARTY_SEND_GO_LIVE`, because sending from Actions is explicit, as today.
  - Vocabulary: "exporter" in Daniel's words is the seller (Daniel, 2026-11-10). `samples.exporter_id` stays a fallback for the seller, not a fifth party.
  - The data source is the builder's call: a small read-only route (e.g. `GET /api/certificates/batch-send/parties?sampleIds=`) returning `{ party, companies: [{ id, name }] }[]`, or the queue route with `includeSent=1` reduced to parties. Company names go through `companyDisplayName()`.
  - Tests: two-party selection shows two rows; Dunkin'-shaped selection shows four in chain order; a company that is client and importer shows once, as client; unticking Roaster sends `parties=buyer,importer,seller`.
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
- **Sequencing:** intake goes last and starts from whatever is on `main` at that point. (The 2026-09-28 note about another session's uncommitted `intake/*` changes no longer applies; checked 2026-11-10.)

### 6.8 Everything else

Every other page under `MainLayout` gets a `PageHeader`, and their footers and dialogs follow §4:

- dashboard, metrics, reports, lab activity, signature settings
- clients (list, detail, new, edit)
- other samples, storage, sys sync
- laboratories, finance, users (quality templates: §6.10)
- the client portal (`src/app/portal/*`: overview, samples, contracts, certificates, team). Its layout is `portal/layout.tsx` and `portal-shell.tsx`, not `MainLayout`, so `PageHeader` must work there too; its hard-coded `text-neutral-900` titles go.
  - **The portal stays light-only (builder's call).** `portal-shell.tsx` hard-codes a white page, but `ThemeProvider` still puts `.dark` on `<html>` for dark-OS users, so the dark tokens would leak in (light green title on white fails contrast). The portal subtree pins the light token values (a scoped class that restates the `:root` tokens). A dark-mode portal is not part of this work.
  - **Placement:** `PageHeader` sits inside the portal's centred `max-w-6xl` column, under its top nav, not sticky (the portal's nav is the sticky element).

The `/test/*` pages are left alone. Public pages (`/certificate/[...path]`, `/sample-photo/*`) and the `/auth/*` pages keep their own look.

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

### 6.10 Quality Templates (added 2026-11-10; mockup boards 1–4)

**List** (`src/app/quality/templates/page.tsx`):

- `PageHeader` crumbs "Quality Templates" with the template count, `toolbarPlacement="inline"`: search (about 300px wide) and `Segmented` All / Active / Inactive sit in the header row. Primary action "New template" (was "Create Template").
- **The table drops its card frame** (`rounded-xl border bg-card`) and runs edge to edge, like QC samples. Its column header row stays (`bg-muted/40`, uppercase 11px).
- **"Assigned to" column removed.** Clients move into the first column, on the second line before the description: client names in foreground 12px/500, then " · ", then the description, muted and truncated. More than two clients show the first two and "+N".
- **Two columns:** "Template · client" and "Spec summary", then the row actions. Spec chips unchanged (largest screen first, Pan last; red zero-tolerance chip).
- **Row actions:** Edit and Duplicate as ghost `icon-sm` buttons with tooltips and `aria-label`, then a More menu (View, Delete and anything else today's row offers). The row itself still opens the view. *(Builder's note: this follows the approved mockup rather than rule 5's "Open" button, because clicking the row already opens the template.)*
- **Phone width** (board 4): title, count and a "+" button on one line; search and a status `Select` below; each row is three lines (name + version + clients right-aligned, description, spec summary as dot-separated text).

**Editor** (`spec-editor/quality-spec-editor.tsx`, `spec-editor-body.tsx`, `sections/*`):

- **Top bar** uses `PageHeader`: back arrow, crumbs "Quality Templates / **<template name>** v<n> / <section name>", the section name green. Actions: "Active" label (`text-primary` when on) + `Switch`, Cancel (outline), Save template (primary).
- **The section heading and subtitle leave the body** (`spec-editor-body.tsx` `<h2>` + `<p>`, `SECTION_HEADINGS.subtitle` deleted; the titles feed the crumb). In the intake's "New quality specification" dialog (`samples/intake/new-spec-editor-stage.tsx`), which already hides the heading, the section name goes in the dialog's own header instead.
- **No card frames around sections.** Every section's `rounded-2xl border border-border bg-card p-6` wrapper goes; fields sit directly on the page background, left-aligned beside the nav, `max-width` about 860px, padding 28px × 40px. Inner tables and lists keep their own borders.
- **Left nav:** 248px; the active item is the flat highlight (`bg-black/[0.04]`, dark `bg-white/10`, 6px radius) instead of the raised card.
- **Inputs:** 36px high, 6px corners (they follow §5.6).

**New section "Moisture, density & quakers"** (replaces the Moisture % and Quaker count pages):

- One `SectionId` (`physical`) in the Physical group, after Defects. Nav summary, e.g. "11–12% · 0.650–0.720 g/mL · ≤10", parts dropped when that check is off.
- Three rows separated by hairlines. Each row: a 240px left column (name, a one-line helper, an on/off `Switch`) and the fields on the right. Off shows "Not measured for this quality." in muted text.
  - **The switches are display only (builder's call):** no new `*_enabled` keys. A row loads as on when any of its limits is set. Switching on shows the empty fields; switching off clears that row's limits. A row saved on with every field empty reopens as off. That is the same thing, since no limit means not measured.
  - **Moisture:** Min (%), Max (%), Standard (Coffee industry / ISO 6673). Today's fields and keys (`moisture_min`, `moisture_max`, `moisture_standard`).
  - **Density (new):** Min and Max in **g/mL** (Daniel, 2026-11-10), three decimals, placeholder 0.650 / 0.720, either side may be empty. New keys in `quality_templates.parameters`: `density_min`, `density_max`. No migration (the column is JSON). Switching off clears both.
  - **Quakers:** Roast sample (g), Max quakers. Today's keys (`roast_sample_size_grams`, `max_quakers`) and today's behaviour.
- **Density never rejects** (Daniel, 2026-11-10: "print only, never rejects"). `src/lib/compliance.ts` does not read `density_min`/`density_max`; the 5% tolerance rule ignores them. A characterization test pins that a lot outside the density limits keeps its verdict.
- **The certificate prints it** (a deliberate exception to §2's "PDFs out of scope", limited to the density line): pass the limits through the same path as `moistureMin`/`moistureMax` (`certificate-data.ts`). When the value is outside them, print the same muted-red note moisture uses, e.g. "(min 0.650)". *(Builder's call, mirroring moisture; it informs and does not change the result.)*
  - **Unit label:** `certificate-physical-properties.tsx:187` says `unit="g/L"` while `certificate-analysis.tsx` says `g/mL`. Both become **g/mL**.
  - **Stored values are all g/mL:** Daniel's count on 2026-11-10 found 289 density readings, all below 2 (g/mL) and none typed in g/L. No conversion and no ≥ 2 guard; the note compares the value against the limits directly. The density line passes an explicit 3 decimals. The formatter's 1-decimal branch stays, because moisture uses it.
  - **Where the limits travel** (checked on main): `QualitySpecLimits` in `src/lib/certificate-data.ts` (built from `parameters` near `moisture_min`) → `quality-certificate.tsx` props → `CertificatePhysicalProperties`.
- **Grading screen label:** `src/app/grading/page.tsx` "Density (G/L)" becomes "Density (g/mL)" (and the code comment), so the lab types the unit the limits use.
- `spec-review.tsx`: nothing to move. Checked on main: review items only use the `basic`, `screen` and `defects` sections (`quality-copy-edits.ts`), and `REVIEW_FIELD` maps tones, not sections.
- `moisture-section.tsx` and `quaker-section.tsx` merge into `physical-section.tsx`.

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
  - filled buttons and the title crumb in green `#15663f` (light) / the light green (dark)
  - page titles: 18px/600 green, in the header, not 24px in the body
  - a pointer to this spec

  The vault `01-projects/waqc/context.md` line quoting `border-radius: 20px` is updated too.

## 8. Delivery order

Each phase ships to `main` on its own and leaves the app consistent.

1. **Tokens and primitives** (§3.1, §3.2, §3.6 green with its `text-primary` audit, §5.6 heights and variants, the `DialogFooter`/`AlertDialog` changes, and moving `max-w-[1400px]` into `PageBody` with every page wrapped). This one push fixes corners and turns filled buttons green app-wide, and pins dialog footers.
2. **New components** (§5.1–5.5) with their tests. Unused until phase 3.
3. **Screens.** One push per screen. QC samples also gets its split.
   0. Quality Templates (§6.10): the approved reference screen, built first so the rest can copy it
   1. Certificates + editor + approval send, with the Send dropdown *(moved ahead of QC samples at planning: it carries the behaviour change Daniel asked for, and QC samples needs its file split first)*
   2. QC samples
   3. Grading
   4. Cupping + validation modal
   5. CVA
   6. Remaining pages and dialogs (§6.8)
   7. Client portal (§6.8)
   8. Intake (§6.7), last
4. **Sweep and guard.** Remaining arbitrary radii, custom heights and plain buttons; the guard test turns on; `CLAUDE.md` and the vault note are updated.

## 9. Open items for Daniel

1. ~~Unreachable bulk email dialog~~: already deleted on main by the send-to-all-parties work (3f0536ae). Daniel's answer (2026-11-10) became the Send dropdown in §6.3. The single-certificate "Send Email" dialog in the preview stays.
2. **Two certificate editors:** `cupping/certificate-edit-dialog.tsx` (opened from Cupping → Edit) and the `cert-editor` overlay. This spec only pins the older one's Save. Retiring it in favour of the overlay would be a separate change.

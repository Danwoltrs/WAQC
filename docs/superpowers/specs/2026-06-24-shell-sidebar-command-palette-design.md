# Shell Redesign — Header Removal, Sidebar Controls & Ctrl+K Command Palette

**Date:** 2026-06-24
**Status:** Approved design, ready for implementation plan

## Overview

Reclaim vertical space by deleting the global top header. The Wolthers logo + "QC"
move to the top of the left sidebar; the four header controls (language, theme,
notifications, user) move to the bottom of the sidebar. The header's search box is
removed and replaced by a context-aware Ctrl/Cmd+K command palette that finds samples,
certificates, and contracts by number.

### Goals
- Remove the top header on every authenticated page; give that height back to content.
- Sidebar spans full screen height: logo at top, navigation in the middle, the four
  relocated controls + collapse toggle at the bottom.
- A Ctrl/Cmd+K palette that looks things up by **certificate number** and **Wolthers
  contract number**, scoped by the page the user is on.
- No regression to mobile: nav must still be reachable with the header gone.

### Non-goals
- Wiring real i18n. The language switcher stays the non-functional stub it is today; it
  is only relocated.
- Changing the notifications right-sidebar itself (only its trigger moves).
- Server-side search for the existing samples/certificates list pages (they keep their
  current client-side filtering).

## Locked decisions

| Decision | Choice |
|---|---|
| Palette result action | **Smart**: a single match opens the item; a contract # with several matches offers "view all" → filtered list. |
| Palette scope off Samples/Certificates pages | **Global**: search samples + certificates + contracts together, plus page jump-to. |
| Mobile nav with header gone | **Floating menu button** (top-left, `lg:hidden`) opens the existing sidebar overlay. |
| Language switcher | Relocate as-is (stub behavior preserved). |

## Current state (relevant anchors)

- `src/components/layout/main-layout.tsx` — app shell. `h-screen flex flex-col`:
  `<Header>` on top, then a `flex-1 flex` row holding the desktop sidebar
  (`hidden lg:block`, `w-64`/`w-14`), the **mobile sidebar overlay** (fixed,
  positioned `top-16`), and `<main>`. Owns `mobileMenuOpen`, `notificationsSidebarOpen`,
  and `unreadCount` (from `useNotifications`).
- `src/components/layout/header.tsx` — renders logo + "QC", the search box, and the four
  controls inline. Holds the theme toggle (`useTheme`), language stub state, bell (uses
  `unreadNotifications` prop + `onNotificationsToggle`), and the avatar dropdown
  (`useAuth`, `signOut`, `getInitials`). **To be deleted.**
- `src/components/layout/left-sidebar.tsx` — `<aside h-full>` → `flex flex-col h-full`
  with a scrollable `<nav flex-1>`, then a bordered **mode-toggle footer** (the Collapse
  button), then a **mobile-only static language button** (`lg:hidden`). No logo today.
  Mode system (`expanded` / `collapsed` / `hover`) and `isExpanded` come from props.
- `src/components/ui/command.tsx` — full shadcn `CommandDialog` + parts, currently unused.
- `src/app/samples/qc/page.tsx`, `src/app/certificates/page.tsx` — list pages with a
  client-side-filtered search box; samples open a `SampleDetailModal`, certificates open
  the cert editor overlay.
- Lookup endpoints that already exist: `GET /api/certificates?search=` (server-side over
  certificate_number / issued_to / tracking_number / client name) and
  `GET /api/contracts/search?q=` (contract_number / seller_reference / buyer_reference).
  Samples have **no** server-side free-text search endpoint yet.

## Design

### 1. Shell restructure — `main-layout.tsx`
- Remove the `<Header>` import and element.
- The outer container stays `h-screen flex flex-col`; the `flex-1 flex` content row
  becomes the full height. The desktop sidebar wrapper already reserves `w-64`/`w-14` and
  is `h-full`, so it now runs top-to-bottom automatically.
- Mobile sidebar overlay: change `top-16` → `top-0` (no header to clear). Pass the new
  control props (below) to both the desktop and overlay `<LeftSidebar>` instances.
- Add a **floating mobile menu button**: a small rounded `lg:hidden` button, `fixed`
  top-left, `z-30`, visible only while `mobileMenuOpen` is false, calling
  `setMobileMenuOpen(true)`. (The overlay already renders its own close affordance via the
  backdrop click.)
- Mount the command palette here: keep `commandOpen` state, register a global
  `keydown` listener for `(e.metaKey || e.ctrlKey) && e.key === 'k'`
  (`preventDefault`, toggle open), and render `<CommandPalette open={commandOpen}
  onOpenChange={setCommandOpen} />`. `MainLayout` wraps every authenticated page, so this
  covers the whole app. Esc-to-close is handled by `CommandDialog`.

### 2. Sidebar — logo header + relocated controls
- **Logo header (new, top of `<aside>`, before `<nav>`):** the Wolthers logo + "QC",
  wrapped in a `Link href="/"`. The sidebar background is `bg-background` (white light /
  `#2A2A2A` dark), so the green-header off-white asset won't read in light mode. Use a
  theme-swapped pair — `wolthers-logo-black.svg` with `dark:hidden` and
  `wolthers-logo-off-white.svg` with `hidden dark:block` (available assets: `-black`,
  `-green`, `-off-white` in `.svg`/`.png`). When `isExpanded` is false, show just the logo
  mark (no separator/"QC"), centered to the `w-14` rail.
- **Footer controls (new):** above the existing collapse toggle, a bordered section
  holds the four controls in the header's order — language, theme, bell, avatar.
  - Expanded: a horizontal row of icon buttons (language shows "EN" label; avatar shows
    the initials circle).
  - Collapsed (`w-14`): the four stacked vertically, icon-only, centered.
  - The language and avatar dropdowns open via `DropdownMenu`; in collapsed mode set
    `side="right"` so they don't clip off the rail.
  - The bell keeps the unread badge and calls `onNotificationsToggle`.
- The existing **mobile-only language button** at the very bottom is removed (the footer
  now carries language for all breakpoints).
- The collapse toggle stays exactly as-is at the very bottom.

### 3. Component extraction & header deletion
To keep `left-sidebar.tsx` under the file-size budget and avoid duplicating the header's
control logic, extract a presentational footer:
- **`src/components/layout/sidebar-footer.tsx`** — renders the four controls. Props:
  `{ isExpanded: boolean; unreadNotifications: number; onNotificationsToggle: () => void }`.
  Internally uses `useTheme` (toggle), `useAuth` (`user`, `profile`, `signOut`,
  initials), and a local `currentLanguage` stub. This is the new home for the logic
  currently in `header.tsx`.
- `LeftSidebar` gains props `unreadNotifications` and `onNotificationsToggle`, threaded
  from `MainLayout`, and renders `<SidebarFooter>`.
- **Delete `src/components/layout/header.tsx`** once nothing imports it.

### 4. Command palette — `src/components/command-palette/command-palette.tsx`
Built on `CommandDialog`. Props: `{ open, onOpenChange }`.

- **Context detection** via `usePathname()`:
  - `pathname.startsWith('/samples')` → scope `samples`
  - `pathname.startsWith('/certificates')` → scope `certificates`
  - otherwise → scope `global`
- **Input handling:** controlled query string, debounced ~250 ms, minimum 2 chars before
  firing a request. Show a loading row while in flight and a "No results" empty state.
- **Per-scope fetch:**
  - `samples` → `GET /api/samples/search?q=` (new, below).
  - `certificates` → `GET /api/certificates?search=&limit=20`.
  - `global` → all three (`/api/samples/search`, `/api/certificates?search=`,
    `/api/contracts/search?q=`) in parallel via `Promise.allSettled`, rendered as separate
    `CommandGroup`s ("Samples", "Certificates", "Contracts"). A failed group is omitted,
    not fatal.
- **Static "Go to…" group:** always present, filtered by the typed text — entries for the
  main destinations (Samples, Certificates, Clients, Grading, Cupping, Specialty (CVA),
  Finance, Laboratories, Users, Dashboard/Overview). Selecting routes via `next/navigation`.
- **Smart selection:**
  - A sample row → navigate to `/samples/qc?open=<sampleId>` (the page auto-opens its
    detail modal for that id).
  - A certificate row → navigate to `/certificates?open=<certId>` (page auto-opens the
    cert editor for that id).
  - A contract row, or a query that resolves to **multiple** samples for one contract #
    → show a leading "View all N for contract <number>" item that navigates to
    `/samples/qc?q=<contractNumber>` (filtered list). Individual sample rows under it still
    open directly.
- Close the palette (`onOpenChange(false)`) and clear the query on any selection.
- Guard against `cmdk`'s value-filter trap (see Memory: cmdk combobox value trap): set
  `shouldFilter={false}` on the `Command` and do our own result list, since values are ids.

### 5. New API — `src/app/api/samples/search/route.ts`
`GET /api/samples/search?q=<text>&limit=20`
- Auth-gated like the other sample routes (reject unauthenticated).
- Server-side `ILIKE %q%` across `tracking_number` (= certificate number) and
  `wolthers_contract_nr` (optionally also the other `*_contract_nr` ref fields).
- Returns a small array: `{ id, tracking_number, wolthers_contract_nr, origin,
  client_name, status, workflow_stage }`, capped at `limit` (default 20).
- Used only by the palette; the list pages are untouched.

### 6. Query-param contract for auto-open / prefilter
- **`/samples/qc`**: read `?open=<id>` → fetch (via `/api/samples/[id]` if not already in
  the loaded list) and open `SampleDetailModal`. Read `?q=<text>` → prefill the existing
  search box state. Strip the param after consuming so ref/refresh is clean.
- **`/certificates`**: read `?open=<certId>` → ensure that certificate is loaded (fetch if
  needed) and open the cert editor overlay. Read `?q=<text>` → prefill its search box.
- Reading params uses `useSearchParams`; both pages already manage the relevant
  open/search state, so this is additive.

## Files

**Create**
- `src/components/command-palette/command-palette.tsx`
- `src/components/layout/sidebar-footer.tsx`
- `src/app/api/samples/search/route.ts`

**Modify**
- `src/components/layout/main-layout.tsx` — drop header; full-height sidebar; Ctrl+K
  listener + palette; floating mobile button; overlay `top-0`; thread control props.
- `src/components/layout/left-sidebar.tsx` — logo header at top; render `SidebarFooter`;
  remove the mobile-only language button; accept the two new props.
- `src/app/samples/qc/page.tsx` — consume `?open=` / `?q=`.
- `src/app/certificates/page.tsx` — consume `?open=` / `?q=`.

**Delete**
- `src/components/layout/header.tsx`

## Edge cases & error handling
- **Logo contrast:** the sidebar background is `bg-background`, not the green header, so
  use the `dark:`-swapped `-black` / `-off-white` pair (see §2) for legibility in both
  themes.
- **Ctrl+K vs. inputs:** the global listener must still open the palette while focus is in
  a text field; it should not fire on Ctrl+K combos the browser reserves — `preventDefault`
  only for our exact combo.
- **Collapsed-mode dropdowns:** language/avatar menus must open to the right of the `w-14`
  rail (`side="right"`), not be clipped by `overflow-hidden` on the `<aside>`.
- **Palette partial failures:** in global scope, one endpoint failing must not blank the
  others (`Promise.allSettled`).
- **`?open=` for an id not in the current list:** fetch it by id; if it 404s, ignore the
  param and just land on the page (optionally a toast).
- **Contract # is not unique** (per project memory): always treat contract-number matches
  as potentially multi-row → the "view all" path.
- **Mobile floating button overlap:** ensure it sits above page content (`z-30`) but below
  the open sidebar overlay/backdrop (`z-40`/`z-50`), and hides while the overlay is open.

## Testing
- Unit: `/api/samples/search` returns matches for a tracking number and a Wolthers
  contract number; rejects unauthenticated; respects `limit`.
- Unit/component: context detection maps pathnames to the right scope; `shouldFilter={false}`
  list renders grouped results; selection routes to the expected URL (`?open=` vs `?q=`).
- Manual smoke: Ctrl+K on Samples opens a sample by cert #; on Certificates opens a cert;
  on Dashboard does a global lookup and a page jump; theme/language/bell/avatar all work
  from the sidebar footer in expanded, collapsed, and mobile-overlay states; mobile floating
  button opens the nav; content gained the header's height with no layout breakage.
- Regression: existing Ctrl+S handlers on grading/cupping pages still work (no collision).

## Out of scope / future
- Real i18n behind the language switcher.
- Server-side search on the list pages themselves.
- Palette quick-actions (create sample, start cupping, send batch) — possible later.

## Risks
- Several pages assume `MainLayout` provides the header height; removing it could expose
  pages that relied on that top offset. Mitigation: the shell uses flex, not fixed offsets,
  so content should reflow; verify the top of each main page visually.
- The certificates auto-open path depends on the cert editor accepting an externally
  supplied id; confirm the page can open an arbitrary cert that may not be in the current
  filter window.

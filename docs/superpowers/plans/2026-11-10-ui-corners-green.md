# UI corners, button placement and green primary: Implementation Plan (index)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every QC page gets the approved look: 10/6/4/0 corners, two control heights, green filled buttons, the page title as a green crumb in one shared header, actions in fixed places. Quality Templates gains density limits, and the Certificates "Send" becomes a dropdown listing only the parties present.

**Architecture:** One token change (radius scale and `--primary` green) restyles most of the app at once. Five shared components (`PageHeader`, `CommitBar`, `SelectionBar`, `RowActions`, `Segmented`) then make the placement rules the easy path, and each screen moves over in its own push. Two behaviour changes ride along: density limits on the template (print only, never reject) and a party-aware Send popover backed by a `view=parties` mode on the existing batch-send queue route.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui (Radix), Supabase, react-pdf, vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-28-ui-corners-and-button-placement-design.md` (amended and approved 2026-11-10). Read it with this plan; §-references below point into it.

## Where to work

- Build from **`origin/main`**. The main checkout (`/Users/danielwolthers/Documents/GitHub/WAQC`) is on the stale `feat/certificate-print-list` with other sessions' uncommitted files. Do not touch them.
- Use a worktree on `main` (superpowers:using-git-worktrees). The spec and these plan files are uncommitted in the main checkout: copy them into the worktree and commit them in the first push (Part 1, Task 1).
- Trunk-based: commit and push straight to `main`. Vercel deploys Production on push, so every push must pass `npx tsc --noEmit`, `npx vitest run` and `npx next build`.

## Parts

| Part | File | Spec | Ships |
|---|---|---|---|
| 1 | `2026-11-10-ui-corners-green-part-1-foundation.md` | §3.1–3.2, §3.6, §5.6, §5.2 (`DialogFooter`/`AlertDialog`), §5.1 `PageBody` | corners + green app-wide, two heights, pinned dialog footers |
| 2 | `2026-11-10-ui-corners-green-part-2-components.md` | §5.1–5.5 | `PageHeader`, `CommitBar`, `SelectionBar`, `RowActions`/`RowContextMenu`, `Segmented` (unused until Part 3) |
| 3 | `2026-11-10-ui-corners-green-part-3-quality-templates.md` | §6.10 | the reference screen + density limits |
| 4 | `2026-11-10-ui-corners-green-part-4-certificates.md` | §6.3 | Certificates screen + Send dropdown + cert editor + approval send view |
| 5–12 | written one at a time, just before each starts (see below) | §6.1–6.9, §7, §8.4 | remaining screens, portal, intake, sweep and guard |

**Why Parts 5–12 are not written yet:** each one's tasks depend on line-level facts in files that Parts 1–4 move (the spec already warns its line numbers are six weeks stale), and on the final shape of the Part 2 components. Each is planned against `main` when the previous part has landed, using the same format, and its scope is fixed now:

- **Part 5, QC samples (§6.2):** split `src/app/samples/qc/page.tsx` into `src/components/samples/qc-list/` (every file under ~800 lines) first, then `PageHeader` "Samples / QC Samples", `Segmented` stages, labelled Columns, `RowActions` + `RowContextMenu` with one list, `SelectionBar`, the preview dialog's Close becomes ghost.
- **Part 6, Grading (§6.4):** `PageHeader` with the sample tabs as its toolbar; Save and Upload photo move to the header; the tolerance banner's button becomes outline.
- **Part 7, Cupping (§6.5):** header, validation modal footer (`start` = Reject), the add-defect popover order, `certificate-edit-dialog.tsx` pinned Save.
- **Part 8, CVA (§6.6):** Back/Next in a `CommitBar`; Certify step order; the Override panel.
- **Part 9, remaining pages and dialogs (§6.1, §6.8):** shell (sidebar footer, nav radius), the pages listed in §6.8, the 21 hand-built dialog footers, the three filled-Close cases, `add-sub-contract-dialog`, `ocr-validation-dialog`.
- **Part 10, client portal (§6.8):** `PageHeader` (non-sticky) inside the `max-w-6xl` column; the hard-coded `text-neutral-900` titles go. The light-only pin lands in Part 1.
- **Part 11, intake (§6.7):** footer order with Cancel, the ghost "Skip", the standalone page header, other-sample intake buttons.
- **Part 12, sweep and guard (§3.5, §6.9, §7):** remaining arbitrary radii and `h-*` overrides on `Button`/`Input`, the 220 plain `<button>`s, `MainLayout`'s default flips to no max-width, the radius/height guard test turns on, then `CLAUDE.md` and the vault note.

## Global Constraints

- Radii: containers 10px (`rounded-lg`), controls 6px (`rounded-md`), badges 4px (`rounded-sm`), data and page structure 0. Allowlist in spec §3.4.
- Primary: light `--primary: 151 66% 24%` (`#15663f`), `--primary-foreground: 0 0% 98%`; dark `--primary: 151 50% 55%`, `--primary-foreground: 0 0% 9%`. Contrast measured at planning: 6.99 (green on white), 6.7 (`#fafafa` on green), 6.7 (dark green on `#2A2A2A`), 8.37 (`#171717` on dark green), so no nudge needed. `--ring` stays neutral.
- Olive `#556b2f` is for charts and data visuals only. Status greens (approved/valid) are untouched.
- Control heights: 36px default (`h-9`), 28px `sm` (`h-7`). Nothing else.
- Page titles: 18px/600 `text-primary`, the last crumb in `PageHeader`, rendered as the `h1`. The page body never repeats them.
- At most one filled button per view; footer order: destructive or Back on the far left, then Cancel, secondary, primary last.
- Never render `samples.tracking_number` (SAN-…). Show the certificate number or contract refs.
- Company names go through `companyDisplayName()` (`src/lib/contract-intake-mapping.ts`).
- No emojis in the UI. No mock data.
- Files stay under ~2,000 lines (2,200 tolerated); say so and split if one would pass that.
- Route files (`route.ts`) export only HTTP handlers; helpers live in `src/lib/`.
- Density is g/mL, three decimals, and never changes a verdict.
- SQL, if any is ever needed, is pasted to Daniel; he applies it. This programme needs none.

## Review Focus

1. **Dark-mode users on the client portal.** `ThemeProvider` puts `.dark` on `<html>` for dark-OS users while the portal paints white. Expected: the portal keeps the light tokens (dark green title on white), never the light dark-mode green. Pinned by a test in Part 1, Task 2.
2. **Someone types a density limit in g/L** (680 instead of 0.680). Expected: the editor says "Enter g/mL, e.g. 0.680" under the field and does not store 680. Pinned in Part 3, Task 4.
3. **A limit of 0 counts as set.** A template with `moisture_min: 0` or `max_quakers: 0` must load with that row switched on (`!= null`, not truthiness). Pinned in Part 3, Task 4.
4. **The Send popover's selection changes between openings** (ticks added or cleared). Expected: it fetches the parties again for the new selection and never shows the previous one's companies. Pinned in Part 4, Task 4.
5. **A dialog whose `DialogContent` overrides its padding** (`p-0`, `p-2`) with a sticky `DialogFooter`. Expected: the footer stays inside the dialog, edge to edge, no overflow. Pinned in Part 1, Task 5 (an override check, plus a grep step for `p-0` dialogs).

# WAQC — Quality Templates List + Spec Editor Redesign

**Repo:** qc.wolthers.com · routes `/quality` (list) and the template editor · **Stack:** Next.js 14 · TypeScript · Supabase · Tailwind · shadcn/ui
**Reference mockups:** `qc-quality-list-redesign.html`, `qc-quality-editor-redesign.html`

## Goal

Two surfaces. The **list** is drowning in columns (Sharing + Created By repeat identical text on every row; six narrow param columns wrap badly; a scrolling mini-box mangles the screen constraints). The **spec editor** is a mess because it's a *modal that opens more modals* — each section (Green aspect, Defects, Cupping, Taints) launches a full modal on top of the template modal. Fix: clean the list, and rebuild the editor as a **full-screen view with a left section-nav and inline panels** — no nested modals.

Keep the green/black/white shadcn language. (Theme note in Open Decisions.)

---

## Part A — Quality Templates list

Columns: **Template · Assigned to · Spec summary · actions**.

- **Template cell:** name (bold) + version tag (`v7`, mono) + `Active` pill on line 1; description (muted, single-line ellipsis) on line 2; a faint **meta line** "Anderson Nunes · 5 May 2026" on line 3. The old **Sharing** column (always "Wolthers & Associates…") and **Created By** column (always Anderson) are gone as columns — that identical-on-every-row text was pure noise; the creator/date lives in the meta line, sharing in the editor.
- **Assigned to:** client chips (`Blaser`, `Mitsui`…) with `+N` overflow; faint "Unassigned" when none.
- **Spec summary** — what a grader actually scans for, replacing the six param columns:
  - **Screen profile with targets** as monospace chips: `15 any` `16 ≥40%` `Pan ≤10%` (or `Peas 11 ≥45%`…). Not a bare "3 screens". Chips read in editor entry order (see Open Decisions).
  - divider, then **defect threshold**: `Def ≤21`.
  - **max taints / faults**: `T≤2 · F≤1`; render **red** (`T≤0 · F≤0`) when zero-tolerance.
  - **Green and roast levels dropped** — noise in a list.
  - Quakers chip only when an actual limit is set (skip "no limit").
- **Actions:** view / edit / duplicate / delete, on row hover. Edit opens the full-screen editor (Part B).
- Above the table: single search + `All / Active / Inactive` segmented control.

---

## Part B — Full-screen Quality Spec editor

Replaces the nested-modal stack with one full-screen surface: **sticky top bar + left section-nav + scrolling main panel**. Every section edits **inline** in the panel — nothing opens a modal on top.

### Top bar (sticky)
Breadcrumb `Quality Templates / {name}` · version tag · **Active** toggle · `Cancel` · `Save template`.

### Left nav (text-only)
Grouped: **Definition** (Basic information, Screen sizes) · **Appearance** (Green aspect, Roast aspect) · **Physical** (Defects, Moisture, Quaker count) · **Sensory** (Cupping attributes, Taints & faults, Clean / uniform cups). Each item shows its label + a one-line summary ("9 levels", "3 constraints", "Required · max 5"). **No icons.**

**Active state = a raised card, not a flat fill:** sidebar sits on faint gray; the selected item is a white card that lifts (subtle shadow, ~1px translate up) with a green label; on click it presses down (inset shadow) then settles. Hover gives a slight lift. This replaces the old green block + left accent bar.

### Sections (all inline)

1. **Basic information** — template name, sample size (g), origin, micro-origins (blends), description, template sharing (Private / Lab / Public).
2. **Screen sizes** — "Defined constraints" rows, each: sieve pill + type pill (`any` / `minimum` / `maximum`) + target (`≥40%`) + remove. Add-constraint row: screen size select · type select · value % · Add.
3. **Green aspect** — load-from-template select; **Appearance wordings** as a compact reorderable list (drag handle · index · name · `value [n]` · remove), **value sits right next to the word**, rows are a tidy fixed-width column (~440px) **not** stretched across the panel, **all wordings shown**; add-new-wording row; minimum acceptable wording; notes.
4. **Roast aspect** — identical treatment to Green, fewer wordings.
5. **Defects** — primary/secondary/total max thresholds; then **Primary** and **Secondary** as two **compact tables** (`# · Defect · Weight · remove`), tight rows, **all defects shown** (no "…N more" truncation), with an add-row per table.
6. **Moisture %** — min, max, standard.
7. **Quaker count** — a **"required" toggle**; when on, reveals roast sample size (g) + quaker limit (max); when off, quakers aren't assessed and the fields collapse.
8. **Cupping attributes** — load-from-template; attribute cards in a grid, each with a **grip handle** and **drag-to-reorder**; per-card: name, abbreviation, scale type (numeric / wording / yes-no) + range, edit-scale, duplicate; Add attribute.
9. **Taints & faults** — the old "Defect Registry & Thresholds" modal, now an inline section: defect registry table (`Defect · Taint threshold · Max intensity · Increment · Active · remove`, threshold `0` = always fault), all shown; add defect; sample validation (max taints / max faults); deduction multipliers (taint × / fault ×) with the formula caption.
10. **Clean / uniform cups** — Clean Cup (max taints / faults) + Uniform Cup (max taints / faults); note that empty rules default to true.

### Drag-and-drop
Green wordings, roast wordings, and cupping attributes all reorder by drag. **Use SortableJS or dnd-kit — not hand-rolled native HTML5 DnD** (the mockup uses native for demo only). Requirements: visible grip handle, keyboard-accessible reordering, touch support, and persisting the new order + re-indexing values where relevant.

---

## Design tokens (match the set)

```
--green:#15663f  --ink:#0d0f12  --muted:#6b7280  --faint:#9aa1ab
--border:#ececee  --border-strong:#e2e3e6  --row-hover:#fafbfb
mono: ui-monospace, SFMono-Regular, Menlo, monospace   /* version tags, screen chips, weights, values */
zero-tolerance red: bg #fbeceb / text #b0322a
nav raised-card shadow: 0 1px 1px rgba(0,0,0,.03), 0 9px 20px -11px rgba(20,70,45,.40)
field height 40px · row height (tables/wordings) ~34px · radius 8–12px
```

---

## Open decisions (confirm before building)

1. **Theme.** The mockups are **light** to match the rest of the redesign; your current quality screens render **dark**. Ship light, or keep this area dark (same tokens, swapped)? Decide before styling.
2. **Heavy sub-editors.** Everything is inline in the panel. If a section gets very long (30+ taint defects), the alternative is a **right slide-over** inside the full-screen shell (still no modal stacking). Inline by default unless you say otherwise.
3. **Screen-chip order** (list spec summary): entry order (default), sorted by screen size, or mins-first?

---

## Checkpoints (ralph-loop)

**List**
1. New row layout (template cell with meta line, assigned chips, spec-summary chips); drop Sharing/Created-By columns — typecheck + lint, commit.
2. Spec-summary chips wired to real data (screen constraints → targets, defect threshold, taint/fault max, zero-tolerance red) — typecheck + lint, commit.

**Editor**
3. Full-screen shell: top bar, left nav (grouped, summaries, raised-card active state), section switching — typecheck + lint, commit.
4. Inline sections — Basic, Screen sizes, Moisture, Quaker (required toggle), Clean/uniform — typecheck + lint, commit.
5. Green & Roast aspect: compact reorderable wording column, value beside word, all shown — typecheck + lint, commit.
6. Defects as compact tables (all shown) + thresholds — typecheck + lint, commit.
7. Cupping attributes (cards + drag reorder) and Taints & faults registry (inline, all shown, validation + multipliers) — typecheck + lint, commit.
8. Wire drag-and-drop via SortableJS/dnd-kit across green, roast, cupping — typecheck + lint, commit.

## Out of scope

No changes to grading/cupping session logic or certificate generation. Reuse the existing template data model and per-section save endpoints — this collapses the nested modals into one inline surface; it doesn't change what's stored.

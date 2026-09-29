# Handoff: new quality specification from the sample intake (duplicate and adjust)

Date: 2026-09-29. Written for a fresh Claude Code session on WAQC (qc.wolthers.com).

## What Daniel asked for

> "I want to be able to duplicate a previous quality, and change some small
> specifications only, all on this screen, without leaving the add new quality."

The trigger is the sample intake. A sys contract says **"15/16 FC"**. The QC
client (e.g. Cape Horn) only has **14/16 FINE CUP** and **17/18** specs, so
nothing matches. The intake now notices this and offers
**Create "15/16 FC" specification**. Daniel wants that screen to let him:

1. pick one of the client's existing specs (e.g. 14/16 FINE CUP) as the
   starting point,
2. change only what differs (e.g. the screen size, 14/16 to 15/16), and
3. save. The new spec belongs to that client and is selected for the sample
   being entered,

all inside the one "New quality specification" dialog, without navigating to
the Quality Templates page or opening nested modals.

Brainstorm first (superpowers:brainstorming), propose 2 or 3 layouts, and wait
for Daniel's pick before building. Work on `main` (trunk-based; a push deploys
Production). Commit and push only when asked.

## Where things stand (shipped in 2026-09-29 push)

- The intake Step 2 Quality card shows `QualitySuggestion`
  (`src/components/samples/intake/quality-suggestion.tsx`). It appears when the
  contract's words have no confident match (`quality_match.confidence` is
  `low` or `none`). It stays up even while another spec is selected, unless
  that spec's name equals the contract words. It has a
  **Create "<words>" specification** button.
- The button opens `LinkQualityTemplateDialog`
  (`src/components/samples/intake/link-quality-template-dialog.tsx`), now
  started from the contract's words:
  - `initialName`, `initialOrigin` props.
  - Title "New quality specification".
  - `onSuccess(specification)` returns the new row. `quality-step.tsx` then
    reloads the client's specs and selects it (`pickQuality`).
- Today the dialog only **links a shared template** to the client
  (template + name + code + origin), via
  `POST /api/clients/[id]/quality-specifications`.
  - That route now saves `custom_name`, `quality_code` and `is_active`. Before
    2026-09-29 it silently dropped them.

### The gap this task closes

`POST /api/clients/[id]/quality-specifications` returns **409** when the client
already has the same template for the same origin. A "15/16 FC" spec is
usually the client's existing FC template with one parameter changed, so the
current dialog cannot create it. The fix is the duplicate path below, not
loosening the 409 (two specs on one shared template would share parameters).

## What already exists to build on

- **Duplicate a client spec (private copy):**
  `POST /api/client-qualities/[id]/duplicate`
  (`src/app/api/client-qualities/[id]/duplicate/route.ts`), used today by
  `src/components/clients/client-quality-manager.tsx` (Copy icon).
  - It clones the spec's template into a NEW `quality_templates` row with
    `is_client_variant=true`, `template_parent_id=<source>`, `is_global=false`.
  - It inserts a new `client_qualities` row pointing at that clone, with a
    unique "(copy)" name. It rolls the clone back if the insert fails.
  - Editing the clone's parameters touches only this client.
  - See memory `client-variant-templates`: variants are hidden from
    `GET /api/quality-templates` unless `?include_variants=true`.
- **Spec editor sections (reuse, don't rebuild):**
  `src/components/quality/spec-editor/`.
  - `quality-spec-editor.tsx` (full-screen shell, holds a `params` working
    copy of `template.parameters`, `onSave(payload)`).
  - `sections/`: `screen-sizes-section.tsx`, `moisture-section.tsx`,
    `defects-section.tsx`, `quaker-section.tsx`, `clean-cups-section.tsx`,
    `aspect-section.tsx`, `cupping-section.tsx`, `taints-section.tsx`. Each
    edits a slice of `params` through a `patch` callback, so individual
    sections can be embedded.
  - Locked editor decisions: memory `quality-revamp-decisions` (screens
    largest to smallest with Pan last, dnd-kit, inline sections).
- **Template update:** `PATCH /api/quality-templates/[id]` (check the route for
  the payload the spec editor sends; `quality/templates/page.tsx` wires it).
- **Client's specs:** `GET /api/clients/[id]/quality-specifications` (used by
  the intake to fill the Quality specification dropdown).
- **Matching:** `src/lib/quality-matching.ts` (`matchQuality`, `suggestions`)
  and `src/lib/quality-text-attributes.ts`. The contract's words are
  `formData.contract_resolution.quality_match.source_text`.

## Likely shape (to confirm with Daniel)

- In the "New quality specification" dialog: **Start from** = one of this
  client's specs (default: the closest suggestion from `quality_match`) or a
  shared template (today's behaviour).
- Picking an existing spec shows a compact summary of its parameters with
  the most-edited ones inline: screen sizes first (the 14/16 to 15/16 case),
  then defects, moisture and cupping minimum. Everything else sits behind
  "All parameters", reusing the spec-editor sections.
- Name defaults to the contract words ("15/16 FC").
- Save does:
  1. `POST /api/client-qualities/<source>/duplicate` with the new name. Extend
     the route to accept `custom_name` (it currently always builds
     "<name> (copy)"), and ideally the changed parameters too, so a failure
     cannot leave an unedited copy.
  2. Otherwise `PATCH` the clone template's `parameters`.
  3. Return the new spec to `onSuccess`, as the intake already expects.
- Consider one server call (duplicate + parameter patch in one request, one
  rollback) over two client calls.

## Constraints and conventions

- UI standards (memory `ui-radius-soft-containers-crisp-data`, spec commit
  `892e5933`):
  - Corners: containers 10px, controls 6px, badges 4px, data square.
  - Buttons: one filled button per view; pinned footer with Cancel left of
    the main action; labelled row actions; "Save" always saves ("Apply" for
    staging).
  - The intake's scoped corner CSS is
    `src/components/samples/intake/intake-radius.css`; the dialog renders in
    a portal inside the intake, so it already picks it up.
- Keyboard first; loading, error and empty states; works at phone width.
- No mock data, no emojis in the UI. Company names shown via
  `companyDisplayName()` (trade name).
- Files under ~2000 lines (`quality-step.tsx` is ~640,
  `link-quality-template-dialog.tsx` ~270). Split the new editor into its own
  component file rather than growing the dialog.
- Route files export only HTTP handlers (memory
  `route-files-export-only-handlers`: `next build` rejects other exports even
  though tsc/vitest pass).
- Any SQL: paste it for Daniel; he applies migrations himself. Check
  `pg_proc` before trusting an RLS helper (memory
  `rls-helper-is-waqc-staff-missing`).
- Supabase project `ojyonxplpmhvcgaycznc`. `database.types.ts` is not
  regenerated for `is_client_variant`; use `(supabase as any)` for it.

## Tests to write

- Duplicate route: `custom_name` honoured, changed parameters land on the
  clone only, rollback on failure, the source template is untouched.
- Dialog: starting from an existing spec, change a screen size, and Save
  calls `onSuccess` with the new spec; 409 and network errors show inline.
- Intake: after Create, the new spec is selected and the prompt disappears
  (the name equals the contract words). See
  `quality-suggestion.test.tsx` and `link-quality-template-dialog.test.tsx`
  for the existing patterns.

## Open questions for Daniel

1. Who may create specs from the intake: any lab user, or only some roles?
2. When a sys contract's words match nothing, should the new spec also
   remember those words (e.g. an alias list on the spec) so the next contract
   saying "15/16 FC" matches automatically?
3. Should the copy be visible and editable from the client's Quality
   Specifications tab (`client-quality-manager.tsx`) exactly like today's
   duplicates? (Assumed yes.)

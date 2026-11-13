# Sensory notes + regional profiles on commodity qualities — design

Date: 2026-11-13. Status: draft for Daniel's approval.

## Intent

Two optional add-ons any commodity quality can switch on:

1. **Sensory notes.** Cuppers pick notes on the coffee flavor wheel. The certificate prints a small flavor wheel with the panel's notes lit, plus the notes as words.
2. **Regional profile.** A shared list of region profiles (Mogiana, Cerrado Mineiro, Sul de Minas, Matas de Minas, …), each pre-loaded with the notes typical of that region. A quality points at one profile. The QC team answers per lot "matches the profile: Yes / No", and the answer prints on the certificate (the QC report).

Daniel's words: the profile notes are pre-loaded "so they would appear on the QC reports and then it would just be a Yes to profile, no to Profile from the QC team".

## Goals

- A quality editor switch for sensory notes and a picker for one regional profile.
- A managed list of regional profiles, shared across qualities.
- Each cupper picks notes and answers Yes / No on their own digital cupping card.
- The validator merges the panel's picks and answers in the validation screen; the result is frozen with the scores.
- The certificate prints the wheel, the notes and the profile line inside the cupping block without growing the page.

## Non-goals

- Paper cupping cards and the scan/OCR flow. Notes are digital only (Daniel). A paper-card cupper contributes no notes.
- Specialty (CVA) qualities. They already have their own describe step and certificate wheel. The Sensory page is hidden for a CVA quality.
- Showing notes/profile answers on portal screens (beyond the certificate PDF), the public QR certificate page, period/annual reports, analytics. Later pieces. (The portal's Qualities tab DOES get the two toggles; see §2.)
- iPad app.

## Anti-goals (would be a failure even if it works)

- A **No** changing approval. It is information only, like density limits and late taints. It never rejects, never sets "approved with comments", never touches the sys write-back.
- Any certificate already issued printing differently. Certificates render on the fly; only lots validated after this ships carry sensory data.
- Notes leaking into the attribute rails (has happened with the CVA payload in `cupping_scores.scores`).
- Slowing the cupping table down. The wheel is one optional button per sample; a cupper who skips it loses nothing.
- Editing a profile later rewriting old certificates.

## Approaches considered

- **A. Master cupper records once per lot** (certificate editor / grading section). Simplest; loses each cupper's own impression.
- **B. Every cupper picks on their own card; merged at validation.** — **CHOSEN by Daniel.** Records each cupper's impression; needs a merge rule and a validator step, which follows the existing score-resolution pattern.
- **C. Region notes pre-ticked; cupper edits; Yes/No inferred.** Fastest on matching lots, but the answer is implied, not stated by QC.

Certificate placement options considered: (1) inside the cupping block's right column, (2) a new sensory band below the cupping block (+~100 pt height, page-fit risk), (3) a small mark beside the quality description (60 pt, unreadable wheel), (4) a simplified 9-family ring. **Daniel chose 1, with the full wheel.**

## Design

### 1. Regional profiles (new shared list)

- New table `regional_profiles`: `id`, `name` (e.g. "Cerrado Mineiro"), `origin` (country, as intake lists it), `region` (a `MICRO_ORIGINS` name, nullable), `notes jsonb` (array of flavor-wheel paths, same shape as CVA `paths`), `description text` (optional one line, e.g. "low acidity, full body"), `is_active`, `created_by`, `created_at`, `updated_at`.
- Managed on a **"Regional profiles" tab on `/quality/templates`**, beside the templates list. Same staff who may edit templates may edit profiles. *(my call)*
- A profile's notes are picked with the same flavor wheel the cuppers use, plus the description line. Cap: 6 notes. *(my call)*
- Deactivating a profile hides it from the quality picker; qualities already pointing at it keep it.

### 2. Quality editor

- New page **"Sensory notes & regional profile"** in the editor's Sensory nav group (after "Clean / uniform cups"), one page like every other section.
- Two settings, stored in `quality_templates.parameters`:
  - `sensory_notes_enabled: boolean` — shows the wheel button on the cupping card.
  - `regional_profile: { id: uuid, name: string } | null` — shows Yes / No on the cupping card and the profile line on the certificate. The name rides along so the portal's change emails read "Cerrado Mineiro", not an id. *(planning call)*
- Each is independent: a quality may have notes without a profile, or a profile without notes.
- Hidden when `methodology = 'cva'`.
- **The switches live on each client's quality (its private copy), off by default** (Daniel). Most lots point at a client copy (`is_client_variant`), and since c418cb91 base edits never reach copies; there is no pass-down. Staff open a client's quality and toggle it on when wanted. Readers take `custom_parameters` first, then `template.parameters`, as for every other spec key.
- Duplicating a template into a client copy starts both settings **off**, whatever the source had. *(my call, from "normally set to off")*
- **The profile is always picked by hand.** Nothing suggests or assigns a profile from the quality's name or region: "even if a quality has the name Cerrado on it, we may not use it" (Daniel).
- **Clients may toggle these too, on the portal's Qualities tab** (Daniel), as well as staff. A client's change goes through the same dated-version flow as their other quality edits (`insert_client_quality_version`); its parameter check accepts the two keys. Clients pick from active profiles only and cannot create or edit profiles. 
- Portal clients can **read** active `regional_profiles` (name, region, notes, description) so they can pick one and see what it means. Writing stays staff only.
- Cupping, validation and the certificate read the settings through whatever spec resolver is live when this ships (the pinned spec version, if `feat/portal-qualities` has shipped first). *(my call)*
- The templates list's spec-summary may show a small "Profile: Cerrado" chip. *(builder's call)*

### 3. Cupping card (commodity cupping screen)

- **Prerequisite:** `src/app/cupping/page.tsx` is 2,176 lines. Split the per-sample card out into its own module before adding anything.
- When the sample's quality has `sensory_notes_enabled`, the card gets a **Sensory notes** button. It opens the existing `FlavorWheel` (`src/components/cupping/cva/wheel/FlavorWheel.tsx`) in a dialog, one group only (no Aroma / Flavour / Mouthfeel split). Up to **5 notes per cupper**; a 6th tap is refused with the wheel's existing refusal pulse. *(my call)* The button shows the count and the picked terms once there are any.
- When the quality has a regional profile, the card shows the profile name, its notes as words, and **Matches profile: Yes / No** (unanswered by default).
- Stored per cupper in a **new column `cupping_scores.sensory jsonb`**: `{ picks: string[][], profile_id: uuid|null, profile_match: boolean|null }`. Never inside `scores`. Saved by the same save/submit routes as the scores.
- Notes and the answer are editable until the lot is validated, under the same rules as the scores.

### 4. Validation screen (merge + freeze)

- In `cupping-validation-modal.tsx`, a **Sensory** section appears when the quality has either setting on:
  - Every included cupper's picks side by side (cuppers without picks shown as "no notes").
  - **Pre-ticked:** notes picked by at least half of the included cuppers who gave notes (1 of 1, 1 of 2, 2 of 3, 2 of 4). Matching is on the exact wheel path. *(my call)*
  - The validator ticks / unticks freely, from the union of picks, and may add a note from the wheel. Cap 6 on the result. *(my call)*
  - **Profile answer** starts at the panel majority. A tie or no answers starts unanswered. When the quality has a profile, the validator **must** choose Yes or No before validating. *(my call — keeps every certificate's profile line answered)*
- Excluding a cupper from the score average also excludes their notes and answer. *(my call)*
- When the validator takes one cupper's card (`mode: 'cupper'`), the notes and answer start from that cupper's card instead of the majority; the validator can still adjust them. *(my call)*
- Frozen into a **new column `quality_assessments.sensory_resolution jsonb`** (planning call: not a key inside `score_resolution`, because lots validated before 2026-09-10 have no score resolution and a certificate-editor edit would otherwise have to fabricate one):
  ```
  { version: 1,
    notes: string[][],
    profile: { id, name, region, notes: string[][], description, match: boolean } | null,
    resolved_by, resolved_at, source: 'validation' | 'certificate_editor' }
  ```
  The profile's name, notes and description are **copied** at validation, so editing the profile later never changes an issued certificate.
- A lot with no `sensory_resolution` is legacy: print nothing. `score-resolution.ts` is untouched.

### 5. Certificate editor

- The existing "Edit cupping / sensory" panel gets the same Sensory section (wheel + profile Yes / No), editing the frozen `score_resolution.sensory`, lab staff only, stamped who/when. Same warn-never-re-decide rule as taints. *(my call, so a late correction doesn't need a re-validation)*
- The section shows only when the lot's quality has either setting on. On a lot validated before this shipped (no `sensory_resolution`) staff may add sensory data deliberately; that is a staff edit, like a late taint, not a silent reprint. *(my call)*

### 6. Certificate (PDF)

- Inside `certificate-cupping-chart.tsx`, commodity path, right column:
  ```
  │ Fragrance ──◆──   │ Clean cup  Yes        ╭──╮ │
  │ Flavour   ──◆──   │ Uniform    Yes      (wheel)│
  │ Acidity   ───◆─   │ Cup profile: Soft     ╰──╯ │
  │ Body      ──◆──   │ Taints 0   Faults 0        │
  │ ...               │ Notes: chocolate, hazelnut │
  │                   │ Cerrado Mineiro profile: Matches
  ```
- Wheel: `CertificateFlavorWheel` at ~90 pt, top-right of the right column, same washed-out full wheel as specialty.
- Notes line: the leaf term of each frozen pick, comma-separated.
- Profile line: "Regional profile: <name> — Matches" / "— Does not match", with the profile's notes as words in a smaller line under it. Charcoal, **no red** for "Does not match": it is not a rejection. *(my call, per the report-restraint rule)*
- Nothing prints when the frozen resolution has no `sensory` key, or when notes are empty (no wheel) / profile null (no line).
- `quality-certificate.page-fit.test.tsx`: add a dense commodity lot (≥10 attributes) with wheel, 6 notes, profile line and two comment paragraphs; it must stay one page. If it does not, the wheel shrinks before anything else moves.
- `certificate-data.ts` (1,798 lines) reads `sensory_resolution`; if the addition pushes it past ~2,000 lines, extract the cupping reader into its own module.

## Constraints

- SQL is pasted for Daniel; he applies it. Three pieces in one file: `regional_profiles` table (+RLS for staff via `public.waqc_is_staff()`, as `client_quality_versions` does), `cupping_scores.sensory` and `quality_assessments.sensory_resolution`.
- The certificate number is the only identifier printed; no SAN numbers anywhere.
- No emojis, no mock data, no seeded profiles: Daniel's team creates the real ones.
- Files stay under ~2,000 lines (cupping page split is step one).
- Portal qualities + spec versions are on `main` (a085bb6f). The two new parameter keys ride along in the version snapshots, so lots read them through `resolveSampleSpec(s)` like every other key.
- Trunk-based on `main`; Vercel deploys on push.

## Left to the builder

- Exact dialog layout of the wheel on the cupping card (desktop and iPad widths).
- The wheel's word list stays the SCA 110-note taxonomy; no separate commodity vocabulary.
- Test layout, beyond the page-fit case above.
- Whether the templates list shows a profile chip.

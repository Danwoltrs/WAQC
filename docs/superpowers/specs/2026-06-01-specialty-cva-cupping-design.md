# Specialty CVA Cupping Screen — Design Spec

**Date:** 2026-06-01
**Status:** Design approved in brainstorm; ready for implementation planning
**Author:** Daniel Wolthers + Claude (brainstorm)
**Topic:** A new, separate "specialty" cupping screen implementing the SCA 2024 Coffee Value Assessment (CVA), distinct from the existing commodity cupping screen.

---

## 1. Goal & framing

Build a **new, dedicated cupping screen** for high-end / specialty coffee that implements the **SCA 2024 Coffee Value Assessment (CVA)** — the standard that officially *replaces* the 2004 SCA Cupping Protocol (the old 100-point Q sheet). It must feel **completely different** from the existing commodity cupping screen.

- **Commodity screen (today, `src/app/cupping/page.tsx`):** a dense attribute *spreadsheet* — rows of attributes (Frag/Arom/Body/Acid/Swet/Bal/Fin) with steppers on a 1–10 scale + a taints/faults modal. Built for ripping through volume.
- **Specialty CVA screen (this spec):** an immersive, guided **tasting journey** — one section at a time, with a flavor-wheel-driven description layer and a premium "Coffee Profile" payoff at the end.

The two screens coexist. A sample is routed to one or the other by a **methodology flag** (see §6).

### Locked decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Organizing principle | **Guided journey** (one section at a time) + **flavor wheel** as showpiece |
| Devices | **Both co-equal** — every interaction works as a pointer effect *and* a touch gesture |
| Describe vs score | **Fast affective spine** + **one shared "describe the cup"** layer (not per section) |
| Standardization | **Strict SCA CVA** — fixed 8 sections, 9-point scale, official 0–100 formula |
| Input model | **No sliders anywhere.** Click/tap-to-pick + a numeric field. Tap, never drag. |

---

## 2. The CVA standard — canonical reference

Source PDFs: `Documents/Specialty/AW_SCA-102…104_*.pdf` (Sample Prep, Descriptive, Affective).

### 2.1 Affective assessment (the score)

Eight **cupping sections**, each rated on a **9-point impression-of-quality scale**:

| # | Section | | Scale point | Label |
|---|---|---|---|---|
| 1 | Fragrance | | 1 | Extremely Low |
| 2 | Aroma | | 2 | Very Low |
| 3 | Flavor | | 3 | Moderately Low |
| 4 | Aftertaste | | 4 | Slightly Low |
| 5 | Acidity | | 5 | Neither High nor Low (**neutral / default**) |
| 6 | Sweetness | | 6 | Slightly High |
| 7 | Mouthfeel | | 7 | Moderately High |
| 8 | Overall | | 8 | Very High |
| | | | 9 | Extremely High |

- Values are **whole numbers 1–9** (no decimals).
- **Cooling shift:** a section's impression may change as the cup cools. Record an *initial* value and an optional *final* value; the **final value (if set) is what scores**.

**Cupping score formula:**

```
S = 0.65625 × Σ(h_i, i = 1..8) + 52.75 − 2u − 4d      (round to nearest 0.25)
```

- `h_i` = the 9-point value of each of the 8 sections (final-if-shifted).
- `u` = number of **non-uniform** cups (out of 5). Penalty −2 each.
- `d` = number of **defective** cups. Penalty −4 each.
- All sections = 5, no defects → **79.00**. All sections = 9 → **100.00**. Σ = 31 → **73.00**.
- The SCA Appendix 7.1 **two-way table** (sum 8–72 → score) is the exact test oracle — see §9.

**Cups / defects:** 5 cups per sample. Each cup can be **non-uniform** and/or **defective**. Defect types: **Moldy, Phenolic, Potato**.

### 2.2 Descriptive assessment (the profile — no score)

Total **intensity** per section on a **15-point** scale (Low / Medium / High) **+ CATA descriptors**. The descriptive form has **three CATA boxes** (not eight):

- **Aroma box** (orthonasal = fragrance + aroma) — olfactory descriptors, **≤ 5**.
- **Flavor & Aftertaste box** (retronasal) — olfactory descriptors **≤ 5**, **plus Main Tastes ≤ 2**.
- **Mouthfeel box** — mouthfeel CATA **≤ 2**.
- **Acidity & Sweetness** — no CATA; freely-elicited descriptors only.

**Olfactory CATA list** (Aroma + Flavor/Aftertaste boxes):
Floral · Berry · Dried Fruit · Citrus Fruit · Fruity · Sour/Fermented (Sour, Fermented) · Green/Vegetative · Other (Chemical, Musty/Earthy, Woody) · Roasted · Cereal · Burnt · Tobacco · Nutty/Cocoa (Nutty, Cocoa) · Spice · Sweet (Vanilla/Vanillin, Brown Sugar).

**Main Tastes** (Flavor/Aftertaste, ≤ 2): Salty · Sour · Sweet · Bitter · Umami.

**Mouthfeel CATA** (≤ 2): Rough (Gritty/Chalky/Sandy) · Oily · Smooth (Velvety/Silky/Syrupy) · Mouth-Drying · Metallic.

Reference wheel: **SCA / WCR / UC Davis Coffee Taster's Flavor Wheel** (2-ring: category → descriptor).

### 2.3 Roast level & prep (recorded, not enforced by the screen)

- **Roast level** recorded visually before tasting. Cupping level ≈ CIELAB L\* 26–29; Agtron "Gourmet" ≈ 63.
- Prep (for reference): 8.25 g / 150 mL, 5 cups per sample, grind 70–75% through 20-mesh, water 93 ± 3 °C.

---

## 3. The experience

### 3.1 Journey flow

```
ROAST → [ 8 quick score screens ] → CUPS → COFFEE PROFILE (reveal + certificate)
            Fragrance … Overall          ▲
            each has a persistent "Describe" button
            that opens ONE shared describe-the-cup panel
```

- Full-bleed immersive canvas — no left sidebar / table. Thin **progress path** on top (tap any step to jump back and revise). Gentle back/next at the bottom. **Light + dark mode** toggle.
- Per-section **ambient accent** from the Wolthers chart palette (Fragrance olive `#556b2f`, Aroma `#a9a454`, Flavor `#b07946`, Acidity `#445763`, …) — you always know where you are by color.
- **Autosave** after every interaction.

### 3.2 Section screen (affective — the fast spine)

Each of the 8 section screens shows **only**: the 9-point impression control + the live "score so far" + the Describe button + nav. Deliberately clean and fast.

**The 9-point impression widget:**
- A row of **nine big color blocks** (diverging `#ef4444` red → neutral gray at 5 → `#22c55e` green). Pick by **click/tap**.
- A **numeric field** beside the row, two-way synced (type 1–9, or click a block).
- **Keys 1–9** set the current section and auto-advance.
- **Pointer:** the block under the cursor **magnifies/swells** (dock-style); selection springs.
- **No slider, no drag.**
- **Cooling shift (click-only):** pick initial → toggle "changed as it cooled?" → click the final block → an animated arrow draws initial → final. Final value scores.

### 3.3 Describe the cup (descriptive — one shared, persistent panel)

- **One shared, cup-level** describe state (NOT per section, never reset). A persistent **Describe** button sits on **every screen** (sections + cups) showing an indicator of how much has been captured. Open it from anywhere; selections persist and stay editable.
- Organized into **three groups** matching the CVA boxes: **Aroma · Flavor & Aftertaste · Mouthfeel**.
  - Each group: **flavor wheel** CATA + **15-point intensity** (clickable buttons + numeric, no slider) + **voice**.
  - Flavor & Aftertaste also has **Main Tastes** (≤ 2). Mouthfeel uses the **mouthfeel CATA** (≤ 2), not the aroma wheel.
  - SCA **caps enforced per group** (≤ 5 olfactory, ≤ 2 main tastes, ≤ 2 mouthfeel) with gentle feedback / replace-oldest.
- **Flavor wheel:** interactive 2-ring radial selector (inner category → outer descriptor). Picks fly into a chip tray; non-hovered categories dim; expandable to full size to hunt a precise descriptor.

### 3.4 Voice describe (Daniel's idea)

- A **hold-to-talk** mic inside the active describe group, with a **PT / ES / EN** language selector (the labs are in Brazil, Colombia, Guatemala, Peru — cuppers describe in their own language).
- Press-and-hold → recording state (pulsing ring + waveform). On release, transcribe into the group's notes and surface **2–3 suggested descriptor chips** mapped from the speech (e.g. "lemon" → Citrus, "jasmine" → Floral, "honey" → Sweet) the cupper taps to confirm (respecting caps).
- **Tech:** browser **Web Speech API** for live in-browser transcription; fall back to / optionally upgrade with **server transcription (Whisper / Gemini)** for accuracy + reliable multi-language. Maps transcript → suggested CATA descriptors (keyword map, optionally AI-assisted).

### 3.5 Cups & uniformity

A dedicated step near the end: the **5 cups as 5 tappable icons**. Mark each **non-uniform** (amber) or **defective** (red, type: Moldy / Phenolic / Potato). Each non-uniform −2, each defective −4, applied live to the score.

### 3.6 Coffee Profile — the end screen (peak-end payoff)

The reveal is not just a number — it's a premium, shareable **Coffee Profile** the cupper *and Wolthers' sales team* can use:

1. **Hero score** — the 0–100 counts up and lands in a quality band, with the sample header.
2. **Your flavor path** — the SCA wheel rendered with **only the chosen descriptors lit** (rest dimmed), words labelled — a visual fingerprint of the cup.
3. **The words** — descriptors grouped Aroma / Flavor / Mouthfeel, each with a small **vector icon** (curated, on-brand SVG set mapped to wheel descriptors — chosen over per-note AI image generation for consistency and speed).
4. **Highlights (AI)** — a short generated tasting **narrative** + ready-to-use **"notes of X, hints of Y"** phrasing, output-able in **PT / ES / EN**. Generated from the structured assessment (scores + descriptors + voice transcript). Doubles as **marketing/offer-sheet copy** for the lot. In production this is a **Claude API call** (see §6.6); the prototype simulates it from selections.
5. **Whiskey-style tasting label** — **NOSE / PALATE / FINISH** + the "Notes of… hints of…" line, in elegant label typography. Premium, shareable.
6. **Generate certificate** — bundles score + flavor-path + highlights + label + icons + traceability into the certificate, hooking into the existing WAQC certificate / unified tracking-number pipeline (§6.5).

### 3.7 Cross-cutting

- Color carries meaning (diverging scale, per-section accents, the wheel as the one color-burst).
- Psychology: one decision per screen, neutral-anchored default, goal-gradient progress, recognition over recall, peak-end reveal.
- Both devices co-equal; keyboard path for power cuppers; autosave; accessible contrast; no emojis; Inter; card radius 20px.

---

## 4. Interactive prototype (reference)

A clickable HTML prototype was built during the brainstorm and validated in-browser (no sliders, click-1–9 + numeric, cooling shift, flavor wheel, hold-to-talk voice with PT/ES/EN, cups, exact score math, light/dark, count-up reveal).

- Latest standalone file: `docs/superpowers/specs/prototypes/cva-cupping-prototype.html` (to be copied from the final build).
- It is a **fidelity reference for the look & interactions only** — this spec is the source of truth. The prototype does **not** include the Coffee Profile / AI highlights end screen yet (§3.6) — that is to be built.

---

## 5. Out of scope (v1)

- Real-time multi-cupper calibration / live alignment view (Phase 6 / later).
- Native iPad app (this is the web app; it must be iPad-touch-friendly but not native).
- OCR card entry for CVA (commodity OCR stays as-is).
- Editing the CVA structure (strict standard; no per-lab customization UI).

---

## 6. Architecture & integration (proposed — confirm during planning)

Built on the existing Supabase + Next.js stack. **Reuses the existing cupping tables** rather than new ones.

### 6.1 Routing & entry

- New immersive route, e.g. `src/app/cupping/cva/[sessionId]/page.tsx` (optionally `/[sessionId]/[sampleId]`), separate from the commodity `/cupping` table.
- A sample is routed to CVA vs commodity by a **methodology flag**. Proposed: `methodology` (`'commodity' | 'cva'`) on the quality template / `client_qualities` (and mirrored onto `cupping_sessions`). Intake/assignment reads it; the "Cup" action opens the CVA route when `methodology = 'cva'`.
- The existing `session_type` enum already includes `'q_grading'` — either reuse it or add `'cva'`.

### 6.2 Data model

Reuse `cupping_sessions` and `cupping_scores`. Store the CVA payload in `cupping_scores.scores` (JSONB), versioned:

```jsonc
{
  "protocol": "cva",
  "roast": { "level": "medium", "agtron": 63 },
  "sections": {                       // 8 affective sections
    "fragrance": { "impression": 7, "impression_final": 8 },
    "aroma":     { "impression": 7 },
    "flavor":    { "impression": 8 },
    "aftertaste":{ "impression": 7 },
    "acidity":   { "impression": 7 },
    "sweetness": { "impression": 7 },
    "mouthfeel": { "impression": 7 },
    "overall":   { "impression": 7 }
  },
  "describe": {                        // one shared, 3 groups
    "aroma":             { "descriptors": ["Floral","Jasmine"], "intensity": 11, "notes": "...", "transcript": "..." },
    "flavor_aftertaste": { "descriptors": ["Citrus","Lemon","Stone Fruit"], "main_tastes": ["Sweet"], "intensity": 12, "notes": "...", "transcript": "..." },
    "mouthfeel":         { "cata": ["Smooth"], "intensity": 9, "notes": "...", "transcript": "..." }
  },
  "cups": { "non_uniform": [2], "defective": [{ "cup": 4, "type": "phenolic" }] },
  "score": 86.5, "u": 1, "d": 1,
  "highlights": { "narrative": "...", "label": { "nose": "...", "palate": "...", "finish": "...", "one_liner": "..." }, "lang": "en" }
}
```

- Add `protocol text` + `cva_score numeric` columns to `cupping_scores` for querying/reporting (or roll the final score up to `quality_assessments` on finalize, as commodity does today).
- `entry_method` reused (`'manual'`). Multi-cupper = one `cupping_scores` row per cupper (existing model).

### 6.3 Scoring

- Pure function `src/lib/cva/scoring.ts` — implements §2.1 formula + 0.25 rounding. Used live on the client and **re-verified server-side on finalize**.
- Unit-tested against the SCA two-way table (§9).

### 6.4 Multi-cupper

- v1: reuse per-cupper rows; aggregate at **finalize** (mean impression per section → consensus score; flag discrepancies via existing `discrepancy_detected` / validation fields). Respect `min_cuppers_required` / `allow_single_cupper`.
- Realtime calibration view = later phase.

### 6.5 Certificate / pass-fail

- On finalize/approval, the CVA **0–100 score** feeds the existing pass/fail + certificate pipeline (`auto_generate_certificate_on_approval`), with a **per-client minimum score** (e.g. ≥ 84) configured in `qc_client_settings`.
- Reuses the **unified tracking-number = certificate-number** scheme (per project memory) — no new numbering.
- The **Coffee Profile** (flavor-path, highlights, whiskey label, icons) renders into the certificate PDF.

### 6.6 AI highlights

- Server route `src/app/api/cupping/cva/highlights/route.ts` → **Claude API** (latest Opus/Sonnet). Input = structured assessment (scores + descriptors + transcripts). Output (JSON) = `{ narrative, label: { nose, palate, finish, one_liner }, marketing_copy }` in the requested language (PT/ES/EN). Cached/stored on the assessment (`scores.highlights`).
- Prompt should constrain to the actual descriptors/scores (no hallucinated notes) and to a house tone.

### 6.7 Icons

- Curated **inline-SVG icon set** in the repo, keyed by flavor-wheel descriptor (flower, citrus, berry, stone-fruit, cocoa, nut, spice, honey, …). A `descriptor → icon` map. (Not runtime AI image generation.)

### 6.8 Voice transcription

- v1: **Web Speech API** (in-browser, free) with the sample-transcript fallback.
- Optional upgrade: server transcription (Whisper / Gemini) for accuracy + reliable PT/ES/EN. Transcript → suggested descriptors via a keyword map (optionally AI-assisted).

### 6.9 Proposed component / file layout

```
src/app/cupping/cva/[sessionId]/page.tsx        route + session load
src/app/api/cupping/cva/[id]/route.ts           save / load assessment
src/app/api/cupping/cva/highlights/route.ts     AI highlights (Claude)
src/components/cupping/cva/
  CvaJourney.tsx        orchestrator (progress, nav, autosave)
  RoastStep.tsx         preset tiles + Agtron field
  SectionScreen.tsx     one affective section
  ImpressionScale.tsx   9-pt magnetic blocks + numeric + cooling shift
  DescribeButton.tsx    persistent button + captured indicator
  DescribePanel.tsx     shared overlay, 3 groups, persistent state
  FlavorWheel.tsx       interactive radial CATA selector
  IntensityPicker.tsx   15-pt buttons + numeric
  MainTastes.tsx        ≤2 selector
  MouthfeelPicker.tsx   ≤2 CATA selector
  VoiceRecorder.tsx     hold-to-talk + PT/ES/EN + suggestions
  CupsStep.tsx          5 cups, non-uniform / defective
  CoffeeProfile.tsx     reveal: score, flavor-path, words+icons, highlights, whiskey label, certificate
src/lib/cva/
  scoring.ts            formula + rounding (+ tests)
  sections.ts           8 sections + accent colors
  flavor-wheel.ts       wheel data (categories → descriptors → colors)
  descriptors.ts        CATA lists + caps
  icons.ts              descriptor → SVG icon map
src/hooks/
  useCvaAssessment.ts   state + autosave
  useCvaScore.ts        live score
supabase migration:     methodology + protocol + cva_score columns; (extend session_type)
```

---

## 7. Build sequence (for tomorrow)

- **Phase 0 — Scaffolding:** route, migration (methodology/protocol/cva_score), CVA constants (`sections`, `descriptors`, `flavor-wheel`), `scoring.ts` + tests.
- **Phase 1 — Affective spine (usable on its own):** RoastStep, 8 SectionScreens, ImpressionScale (click + numeric + keys + magnetic + cooling shift), live score, progress path, autosave, light/dark.
- **Phase 2 — Describe the cup:** DescribePanel (3 groups), FlavorWheel, IntensityPicker, MainTastes, MouthfeelPicker, persistent DescribeButton, shared cup-level state.
- **Phase 3 — Voice:** VoiceRecorder (Web Speech) + transcript → suggested descriptors.
- **Phase 4 — Cups & finalize:** CupsStep, validation, server score re-verify, save to `cupping_scores`, finalize → `quality_assessments`, pass/fail.
- **Phase 5 — Coffee Profile + AI:** CoffeeProfile end screen (flavor-path, words+icons, whiskey label), `/highlights` API (Claude), certificate integration.
- **Phase 6 — Later:** multi-cupper calibration + realtime.

---

## 8. Testing

- **Unit:** `scoring.ts` against the SCA two-way table — every sum 8–72 → expected score; penalties −2u/−4d; rounding to 0.25. Checkpoints: all-5 → 79.00, all-9 → 100.00, Σ31 → 73.00.
- **Component:** ImpressionScale (click/keys/numeric sync, cooling shift), per-group caps, describe persistence across sections.
- **E2E:** full journey → score → finalize → certificate.
- **Cross-device:** touch (iPad) + pointer (laptop).

---

## 9. SCA two-way score table (test oracle, Appendix 7.1)

Add up the eight 9-point sections; look up the score; deduct 2/non-uniform, 4/defective.

| Σ | Score | Σ | Score | Σ | Score |
|---|---|---|---|---|---|
| 8 | 58.00 | 31 | 73.00 | 53 | 87.50 |
| 9 | 58.75 | 32 | 73.75 | 54 | 88.25 |
| 10 | 59.25 | 33 | 74.50 | 55 | 88.75 |
| 11 | 60.00 | 34 | 75.00 | 56 | 89.50 |
| 12 | 60.75 | 35 | 75.75 | 57 | 90.25 |
| 13 | 61.25 | 36 | 76.50 | 58 | 90.75 |
| 14 | 62.00 | 37 | 77.00 | 59 | 91.50 |
| 15 | 62.50 | 38 | 77.75 | 60 | 92.25 |
| 16 | 63.25 | 39 | 78.25 | 61 | 92.75 |
| 17 | 64.00 | 40 | 79.00 | 62 | 93.50 |
| 18 | 64.50 | 41 | 79.75 | 63 | 94.00 |
| 19 | 65.25 | 42 | 80.25 | 64 | 94.75 |
| 20 | 66.00 | 43 | 81.00 | 65 | 95.50 |
| 21 | 66.50 | 44 | 81.75 | 66 | 96.00 |
| 22 | 67.25 | 45 | 82.25 | 67 | 96.75 |
| 23 | 67.75 | 46 | 83.00 | 68 | 97.50 |
| 24 | 68.50 | 47 | 83.50 | 69 | 98.00 |
| 25 | 69.25 | 48 | 84.25 | 70 | 98.75 |
| 26 | 69.75 | 49 | 85.00 | 71 | 99.25 |
| 27 | 70.50 | 50 | 85.50 | 72 | 100.00 |
| 28 | 71.25 | 51 | 86.25 | | |
| 29 | 71.75 | 52 | 87.00 | | |
| 30 | 72.50 | | | | |

---

## 10. Open questions (resolve at start of build)

1. **Methodology routing:** where does the `cva` flag live — quality template, sample, or session? (Match how intake assigns specs.) Does CVA fully replace commodity for a specialty sample, or per-sample choice?
2. **Pass threshold:** per-client minimum CVA score (e.g. ≥ 84) — confirm and where configured (`qc_client_settings`).
3. **Intensity granularity:** per-describe-group (3, as grouped here) vs strict per-section (7)? (Spec currently uses 3 to match the describe grouping.)
4. **AI highlights:** model + cost; default language per lab; house tone; storage/caching policy.
5. **Voice:** ship v1 with Web Speech only, add server transcription later?
6. **Multi-cupper aggregation:** how the consensus score is formed (mean per section? each cupper own score + session consensus?).

---

## 11. References

- SCA standards: `Documents/Specialty/AW_SCA-102_Sample-Preparation`, `AW_SCA-103_Descriptive-Assessment`, `AW_SCA-104_Affective-Assessment`.
- Existing commodity cupping: `src/app/cupping/page.tsx`; data in `cupping_sessions` / `cupping_scores` / `quality_assessments`; templates in `src/types/cupping-templates.ts`.
- Unified tracking#/certificate# & counterparty consolidation: project memory (`MEMORY.md`).
- Interactive prototype: `docs/superpowers/specs/prototypes/cva-cupping-prototype.html` (to be persisted from the final build).

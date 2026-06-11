# CVA Phase 2 — Describe the Cup + SCA Flavor Wheel (design)

**Date:** 2026-06-11 · **Status:** approved in brainstorm (live-demo iterations v1–v8 with Daniel)
**Reference implementation (locked):** [prototypes/cva-flavor-wheel-prototype.html](prototypes/cva-flavor-wheel-prototype.html) — the final v8 demo. The wheel's geometry, interaction, timings, and label treatment in that file ARE the design; port it, don't reinterpret it.
**Protocol source:** SCA-103 Descriptive Assessment Sept 2024 (`Documents/Specialty/AW_SCA-103_Descriptive-Assessment_Sept2024_Secured.pdf`) — CATA rules §6.3, descriptor-expansion rule §6.3.4, form p.10, wheel p.11.
**Related:** journey prototype [prototypes/cva-cupping-prototype.html](prototypes/cva-cupping-prototype.html); Phase-1 plan `../plans/2026-06-02-specialty-cva-cupping-phase1.md`.

## Summary

Phase 2 adds the descriptive half of SCA CVA 2024 to the existing journey (roast → 8 affective sections → score): per-section **intensity ratings (0–15)**, the **interactive 3-ring SCA flavor wheel** (full 110-node taxonomy) feeding the official CATA boxes, **Main Tastes** (≤2), **Mouthfeel CATA** (≤2), and free-text notes for Acidity/Sweetness. Everything stores in the existing per-sample `CvaAssessment.describe` blob and autosaves through `useCvaSession` — **no API or DB changes**.

## Scope

**In:** full Describe step (wheel + intensities + main tastes + mouthfeel CATA + acidity/sweetness notes), wired into the journey and persisted.
**Out (later phases):** hold-to-talk voice (Phase 3, `describe.voice` stays empty), Cups & uniformity screen (Phase 4), Coffee Profile / AI highlights (Phase 5), multi-cupper calibration (Phase 6).

## 1. Where Describe lives in the journey (approved)

No new journey steps. Each section screen gains a slim descriptive block under the 1–9 impression scale:

| Section | Intensity (0–15) | Extra |
|---|---|---|
| Fragrance, Aroma | yes | **Describe** button → overlay, *Aroma* group |
| Flavor, Aftertaste | yes | **Describe** button → overlay, *Flavor & Aftertaste* group (wheel + Main Tastes ≤2) |
| Acidity, Sweetness | yes | free-text note field (SCA: no CATA; freely elicited only) |
| Mouthfeel | yes | **Describe** button → overlay, *Mouthfeel* group (CATA ≤2, no wheel) |
| Overall | no intensity | — |

- Intensity control = **tap-track of 16 cells (0–15)** with LOW / MEDIUM / HIGH zone labels (per the SCA form's 15-point scale) + a small numeric field. Tap or type — **no sliders** (locked project rule). Fragrance & Aroma have separate intensities but share one CATA list (SCA §6.3.1), as do Flavor & Aftertaste (§6.3.2).
- The Acidity/Sweetness descriptive note is a **second, separately-labeled field** ("Descriptors — freely elicited") inside the new descriptive block, bound to `describe.notes.{acidity|sweetness}`. The existing affective-note textarea ("Affective note (optional)", bound to `sections[key].note`) stays untouched on all 8 sections — two fields, two labels, two bindings.
- The overlay is one shared full-screen component with the 3 group tabs across the top, following the **journey prototype's** `wheelpanel` layout ([cva-cupping-prototype.html](prototypes/cva-cupping-prototype.html)) **minus its voicebox** (Phase 3); cuppers can switch groups without closing. Opening from a section lands on that section's group. Each group panel also gets a small optional **free-text descriptor input** for off-taxonomy notes (SCA §6.3.4's "dried tomato" case) — see §2.
- If the sample's quality template has `requires_descriptors = true`, a confirm dialog ("No descriptors recorded — reveal anyway?") fires on **any first transition into the score step for that sample** — footer Reveal button, progress-path jump, or live-score pill — when olfactory picks AND intensities are all empty. Confirming proceeds and the gate doesn't re-fire for that sample. Soft gate only; never hard-block.

## 2. Data model (approved)

`CvaDescribe` evolves **additively** (all existing `describe` blobs are empty — the UI never shipped — so no migration):

```ts
export interface WheelPick { path: string[] }   // e.g. ["Fruity","Berry","Blueberry"]; length 1–3

export interface CvaDescribe {
  intensities: Record<Exclude<CvaSectionKey, 'overall'>, number>  // 0–15 (was already 0–15)
  aroma:             { picks: WheelPick[]; cata: string[] }        // picks ≤5; cata DERIVED
  flavor_aftertaste: { picks: WheelPick[]; cata: string[]; main_tastes: string[] }  // ≤5 / derived / ≤2
  mouthfeel:         { cata: string[] }                            // ≤2 of the 5 official options
  notes: { fragrance_aroma?: string; flavor_aftertaste?: string; mouthfeel?: string;
           acidity?: string; sweetness?: string }                  // freely elicited, ALL sections (SCA §6.3.4)
  voice: Record<string, string>                                    // Phase 3, untouched
}
```

Per SCA-103 §6.3.4 a taster must be able to write an off-taxonomy note (their example: "dried tomato") in **any** cupping section — hence the five `notes` keys, not two. The three olfactory/mouthfeel ones surface as small optional inputs in the overlay's group panels; acidity/sweetness surface on their section screens (§1).

- **`picks` is the source of truth** (full wheel path). **`cata` is derived** at every change via `cataForPicks()` — the official box names for the form/certificate. Per SCA-103 §6.3.4, a precise pick (Blueberry) checks its parent boxes (Berry + Fruity) and the leaf name itself is the freely-elicited descriptor. **Exception:** three ring-3 leaves are themselves official boxes — **Fermented, Woody, Musty/Earthy** — picking one checks its own box plus matching ancestors (Woody → [Other, Woody]) and stores **no** free descriptor (the leaf name isn't "more precise" than its box).
- **Caps:** 5 picks per olfactory group (replace-oldest with toast — behavior and copy from the journey prototype's `OLF_CAP`, [cva-cupping-prototype.html](prototypes/cva-cupping-prototype.html); the wheel prototype itself is uncapped, the cap is added in the port); 2 main tastes; 2 mouthfeel options. The derived box list is not separately capped in storage — a documented **interpretive deviation**: SCA-103 §6.3.1/6.3.2 literally cap *checked options* at 5, while we cap *picks* at 5, and §6.3.4's own blueberry example shows one perception checking two boxes. (§7 of the standard recommends "a cupping app or cupping platform specifically designed for the CVA data structure".) On **certificates/official-form rendering**, print at most 5 boxes per group (derived in pick order); the precise descriptors are always printed in full. UI counters always count **picks** ("Picks 3/5") — never the derived boxes; the wheel prototype's "CATA n/5" tray label is stale demo copy, do not port it.
- Picking at **any ring is valid** (tapping the Fruity ring-1 wedge = checking the Fruity box, path length 1).
- `createEmptyAssessment()` updated accordingly; a defensive normalizer maps any legacy `{cata:[...]}`-only blob to `{picks:[], cata:[...]}` on read.

### Official CATA boxes (24, from the SCA form p.10) and mapping

`Floral · Fruity · Berry · Dried Fruit · Citrus Fruit · Sour/Fermented · Sour · Fermented · Green/Vegetative · Other · Chemical · Musty/Earthy · Woody · Roasted · Cereal · Burnt · Tobacco · Spice · Nutty/Cocoa · Nutty · Cocoa · Sweet · Vanilla/Vanillin · Brown Sugar`

Wheel-node → box aliases (nodes whose names differ from their box): `Alcohol/Fermented → Fermented`, `Spices → Spice`, `Vanilla → Vanilla/Vanillin`, `Vanillin → Vanilla/Vanillin`, `Pipe Tobacco → Tobacco`. The rule is uniform: **every path element (any ring) that matches a box name — directly or via alias — checks that box**; elements matching no box (e.g. `Other Fruit`, `Papery/Musty`, most ring-3 leaves) contribute none, and a leaf that matched no box becomes the precise free descriptor (see the Fermented/Woody/Musty-Earthy exception above). Main Tastes: `Salty, Sour, Sweet, Bitter, Umami`. Mouthfeel CATA: `Rough (Gritty, Chalky, Sandy), Oily, Smooth (Velvety, Silky, Syrupy), Mouth-Drying, Metallic` with sub-qualifiers displayed under the parent (journey prototype's `MOUTH_CATA`). Box list order above and sub-qualifier punctuation are display-only; when rendering the official form/certificate, mirror the p.10 form order (… Roasted group → Nutty/Cocoa group → Spice → Sweet group) and comma-separated sub-qualifiers.

## 3. The wheel — locked interaction (v8, do not redesign)

Full SCA/WCR taxonomy: **9 families → 28 mid-ring → 73 leaves = 110 selectable nodes**, equal angular share per leaf (85 leaves), childless mid-ring nodes (Olive Oil, Beany, Vanilla…) span rings 2–3. Geometry in a 440-unit viewBox: hub r 58, rings at 58–106 / 106–158 / 158–212.

| State | Scale · focus | Entered by |
|---|---|---|
| Rest | 1.3×, centered | initial; hub dwell; Esc; back pill; background click |
| Half-out | 1.75× @ family angle, r 80 | dwell 200ms on the focused family's ring-1 wedge |
| Focused | 2.4× @ family angle, r 130 | from rest: dwell 190ms on any family; from focused: 240ms on a different family; from half-out: 180ms on any family's ring 2/3 or another family; click/tap |

Five dwell constants, one place: `DWELL_IN 190 · DWELL_BACKIN 180 · DWELL_MID 200 · DWELL_OUT 220 · DWELL_SWITCH 240` (ms). Hub dwell → rest uses 220 from focused but 180 from half-out. The prototype's JS constants are normative everywhere (its on-page hint text has been corrected to match).

- **Rest:** rings 1–2 fill the stage (frosted ring 3 bleeds off the edges). Ring 3 is **frosted**: `blur(1.5px) saturate(.75) opacity(.6)`, one `<g>` per family so it frosts as a unit. Hovering a family lifts its whole slice (`scale(1.055)` from wheel center + drop-shadow, siblings fade to .32) and **unfrosts its ring 3** as a preview; the frost also lifts whenever the family is focused or half-out (`.hot` or `.focusedbranch`).
- **Fluid hover zoom (no clicks needed):** dwell timers as in the table; hovering a different family while focused re-aims directly; pointer entering the hub region (r < 58) breathes out. A pulsing **"center · zoom out"** pill marks the hub direction, clamped inside the stage.
- **Pan with the pointer:** while focused, hovering each note re-centers the view on that note's mid-angle, clamped to `[a0+pad, a1−pad]`, `pad = min(0.10rad, span/4)` — edge notes (Rubber, Stale) glide into frame.
- **Note pop-out:** hovered wedge + its label scale 1.045 (spring), brighten, drop-shadow, and are raised above siblings (re-append). Pop only in the focused family.
- **Selection:** click/tap toggles; picked = text-colored stroke + saturate. Hub counter shows pick count at rest.
- **Touch (iPad):** all hover-driven behavior is skipped on touch — in the port, guard the pointermove dwell logic AND the branch `pointerenter`/`pointerover` handlers (lift, note pop, pointer-pan) with `pointerType !== 'touch'`. (The prototype only guards pointermove; unguarded, a tap pans the view before the click lands and the finger picks the wrong note.) Tap family = zoom, tap note = pick, tap back pill / background / center marker = out — in the port the center marker is a **real button** (the prototype's is `pointer-events:none` decoration). Same component, no separate mode.
- **Labels:** every label lives in a per-family **top label layer** — wedges can never paint over text. Ring 1 radial 7px, **except `Green/Vegetative` and `Sour/Fermented`, which curve along the ring** (textPath, flipped upright on the lower half, font auto-fit to arc length, min 5px). True ring 2 radial 5.6px, wrapped to 2 lines at the slash/space when > 11 chars; childless-mid (ring 2.5) 5.4px and ring 3 4.9px wrap only past 22 chars (effectively never — `Pipe Tobacco`, `Sweet Aromatics` stay on one line). Ring 3 hidden except for the focused family. Label text color by wedge luminance (>0.62 → dark text).
- Esc always returns to rest; the chip tray below/beside the wheel lists picks (path shown, click to remove) and the live derived-CATA line.

**Implementation notes (from demo debugging — keep):**
- Hand-rolled SVG in React. No D3.
- Zoom = CSS transform on the `<svg>` element (`scale(S) translate(-bx,-by)`, origin 50% 50%, transition ~.65s); `bx = cos(mid)·r·f` with `f = stageRect.width/440` (stage is untransformed — stable mid-transition).
- Branch/wedge transforms use `transform-box: view-box; transform-origin: 50% 50%`.
- **Gotcha:** never set CSS `transform-origin` on the `<text>` elements — it re-centers their `rotate(deg x y)` attribute around the viewBox center and scatters every label (the v2 bug). Labels sit in plain `<g class="lw">` wrappers; the wrapper takes the pop transform, the text keeps its own rotation.
- Hit-testing for hover logic is mathematical (`nodeAt(x,y)` via atan2 + radius against precomputed spans), not DOM-target-based; pointer→viewBox mapping stays linear under scale+translate.
- A static pointer does not re-fire `pointerover` when the view pans beneath it, so per-note re-centering cannot oscillate.

## 4. Components & files

| File | Role | Est. size |
|---|---|---|
| `src/lib/cva/flavor-wheel-data.ts` (new) | Full taxonomy (110 nodes, colors), CATA box list + aliases, `layoutWheel()` (angles), `cataForPicks()`, caps. Pure data + pure functions. | ~220 |
| `src/components/cupping/cva/wheel/FlavorWheel.tsx` (new) | The SVG wheel. Controlled: `picks: WheelPick[]`, `onToggle(pick)`. All v8 interaction. | ~500 |
| `src/components/cupping/cva/wheel/DescribeOverlay.tsx` (new) | Full-screen overlay host: 3 group tabs, FlavorWheel (olfactory groups), MouthfeelCata, MainTastes (flavor group), per-group free-text descriptor input (`describe.notes`), chip tray + derived-CATA line (counter = "Picks n/5", boxes listed without a denominator), close. | ~350 |
| `src/components/cupping/cva/wheel/MouthfeelCata.tsx` (new) | 5 options + sub-qualifiers, ≤2. | ~80 |
| `src/components/cupping/cva/IntensityTrack.tsx` (new) | 16-cell tap-track 0–15 + numeric field, LOW/MED/HIGH zones. | ~120 |
| `src/components/cupping/cva/SectionScreen.tsx` (modify) | Add intensity track + Describe button / note field per the table in §1. | +60 |
| `src/components/cupping/cva/CvaJourney.tsx` (modify) | Mount DescribeOverlay; open-state + group routing; reveal soft-gate. | +40 |
| `src/hooks/useCvaSession.ts` (modify) | `setDescribe(patch)` setter (same debounced per-sample persist). | +25 |
| `src/types/cva.ts` (modify) | §2 type changes + normalizer. | +25 |

Wheel colors: the prototype's per-node hexes are approximations; during the build do one comparison pass against the official wheel (PDF p.11) and adjust obvious mismatches. Iconic nodes (Blackberry near-black, Lemon yellow, Blueberry blue-violet…) already match.

## 5. Full-screen & responsive rules

- Overlay is **full-viewport (100dvw × 100dvh)** below 1280px width — laptops, iPads, small monitors (Daniel's explicit requirement). At ≥1280px: inset rounded panel (24px margin, `border-radius:20px`, dimmed backdrop), same internals.
- **≥1024px / landscape iPad:** two columns — square wheel stage left (`min(58vw, 86dvh − chrome)`), group panel right (tabs, intensity context, main tastes / mouthfeel, chip tray, notes).
- **Portrait / <1024px:** stacked — wheel on top (`min(94vw, 60dvh)` square), panel scrolls beneath.
- The CVA journey already renders outside `MainLayout` (full viewport) — the overlay mounts inside the journey root, inheriting `.cva-root` tokens and the active section accent.
- `color-mix`/`dvh` usage consistent with Phase 1 (iPad Safari 16.2+ fine).

## 6. Persistence & validation

- Picks/intensities/notes mutate the per-sample `CvaAssessment.describe`; `useCvaSession.persist()` autosaves (debounced, serialized per sample, `flushAll` on tab switch — all existing).
- PUT `/api/cupping/cva/[id]` already stores the whole assessment blob; **no route changes required**. Optional hardening (nice-to-have, not required): server-side clamp of array lengths to caps.
- `cata` derivation runs client-side on every change; certificates and future AI highlights read `cata` (official boxes) + leaf names from `picks` (narrative).

## 7. Testing

- **Unit (`flavor-wheel-data.test.ts`):** taxonomy counts (9/28/73, 85 leaves, angles sum to 2π); `cataForPicks` table — Blueberry → [Fruity, Berry] + free "Blueberry"; Pipe Tobacco → [Roasted, Tobacco]; Vanilla & Vanillin both → Vanilla/Vanillin; Other Fruit leaf (Peach) → [Fruity] + free "Peach"; Winey → [Sour/Fermented, Fermented] + free "Winey"; **box-named leaves: Woody → [Other, Woody] no free; Musty/Earthy → [Other, Musty/Earthy] no free; Fermented leaf → [Sour/Fermented, Fermented] no free**; ring-1 pick (Floral) → [Floral], no free descriptor; dedupe across picks. Caps: 6th pick replaces oldest. Certificate rendering caps boxes at 5 per group, pick order.
- **Unit:** `nodeAt` boundary cases (hub, rim, family edges); label `splitLabel`.
- **Component:** FlavorWheel toggles call `onToggle` with the full path; picked stroke renders; touch-tap zoom→pick flow (fire `pointerType:'touch'`). IntensityTrack tap + typed entry clamp 0–15. DescribeOverlay group switching preserves per-group state.
- Keep the 5 existing ImpressionScale test selectors untouched. Verify with `npx tsc --noEmit` + `npx vitest run` (NOT `npm run build` locally — offline Google Fonts failure).

## Locked decisions (do not relitigate)

1. Interaction = **v8 prototype exactly**: flat Lift & Focus (no 3D tilt — considered and dropped), fluid graded hover zoom (rest 1.3 / half-out 1.75 / focused 2.4), pointer-following pan, note pop-out, frosted outer ring at rest, hub-dwell zoom-out.
2. Full 110-node SCA/WCR taxonomy; selection valid at any ring; outer-ring picks auto-check parent CATA boxes + store the leaf as the precise descriptor (SCA-103 §6.3.4).
3. `picks` (paths) = source of truth; `cata` = derived; caps 5/2/2 with replace-oldest; certificates print ≤5 boxes per group; counters count picks, never boxes.
4. Intensities live on the section screens (16-cell tap-track, 0–15), not inside the overlay; Acidity/Sweetness get free-text notes, no wheel.
5. One shared overlay, 3 group tabs, full-screen <1280px.
6. Curved (arc) family labels ONLY for Green/Vegetative and Sour/Fermented; all other labels radial; labels always on a top layer, wrapped, never occluded.
7. No new API routes, no DB migration; `requires_descriptors` is a soft confirm-gate at reveal only.
8. No mock data; no emojis; files under ~2000 lines.

## Open items (small, resolve during build)

- One color-fidelity pass of node hexes against the official wheel (p.11).
- Dwell timings (180/190/200/220/240ms incl. `DWELL_BACKIN`) may get ±50ms tuning after on-device iPad testing — constants in one place.
- Replace-oldest toast: start from the journey prototype's existing copy (`Cap of 5 reached — replaced "X"`).

# Handoff — CVA Phase 2: built + live UI polish on the describe wheel (2026-06-12)

Supersedes `2026-06-11-cva-phase2-flavor-wheel-execution-handoff.md` (that doc's "Tasks 5–14 built" content still stands; this one continues into the **smoke-test visual tuning** that followed).

**Resume point:** The whole CVA Phase-2 feature (describe-the-cup + 110-node flavor wheel) is **built, tested (219 green, tsc clean), and committed to LOCAL `main`** — but **NOT pushed**. Daniel is **smoke-testing the live UI in the browser and tuning the visuals with me iteratively** (the dev server is/was running on **http://localhost:3100**, route `/cupping/cva`). Resume = **keep refining the describe-wheel / section-screen visuals to Daniel's eye**, then do the **color-fidelity pass** (SCA-103 PDF) and **`git push`** (trunk-based → prod). Do NOT push until Daniel okays the look. One visual item from this session may still be unsettled — see "Open visual items" below.

## The work (one paragraph)

Phase 2 adds the SCA-103 descriptive assessment to the specialty CVA cupping journey: the interactive flavor wheel (the "Describe this cup" full-screen overlay), per-section 0–15 intensity tap-tracks, main tastes / mouthfeel CATA, and free notes — all riding the existing per-sample autosave (no API/DB changes). The build (Tasks 5–14) landed earlier; **this session was a live fidelity pass**: Daniel opened the screen, found it "not how we prototyped," and we reskinned the **section screens** to the cupping prototype and reworked the **describe overlay** into a full-screen, chromeless wheel through a rapid back-and-forth.

## Repo state right now (2026-06-12)

- **Repo:** WAQC (`/Users/danielwolthers/Documents/GitHub/WAQC`), branch `main`, **working tree CLEAN**.
- **Local `main` is 15 commits AHEAD of `origin/main`** (upstream still `1f81066`). **NOTHING pushed.** Range `5c601ba..7618f5e` = Tasks 5–14 + 2 review fixes + 2 handoff commits + 2 UI-polish commits (`73d7874` + Daniel's hand-tuned `7618f5e`). Verify with `git log --oneline @{u}..HEAD`.
- **No migrations, no API/DB changes** this whole phase (describe rides the existing `CvaAssessment` autosave blob).
- **Deploy:** trunk-based — a push auto-deploys `main` → prod (qc.wolthers.com). This changeset is **LIVE once pushed** (the describe feature is wired into the journey). That's why the push is held for Daniel's manual smoke + color check.
- **Verify locally with** `npx tsc --noEmit` + `npx vitest run` (NOT `npm test` = watch; NOT `npm run build` = fails offline on Google Fonts).
- **Dev server:** `npx next dev -p 3100` (Daniel asked for a non-3000 port). May still be running in the background; relaunch if not.

## What's done

| SHA | What |
|---|---|
| `5c601ba` | Task 5 — `wheel/zoom-machine.ts` pure dwell/zoom machine |
| `219dcd7` | Task 6 — `IntensityTrack.tsx` (0–15 tap-track, no sliders) |
| `2b70740` | Task 7 — `wheel/MainTastes.tsx` + `wheel/MouthfeelCata.tsx` |
| `deecba1` | Task 8 — `wheel/FlavorWheel.tsx` render + tap + `.cva-wheel-*` CSS |
| `cecf11d` | Task 9 — FlavorWheel hover layer (dwell zoom, lift, pop, pan) |
| `0b67768` | Task 10 — `wheel/DescribeOverlay.tsx` (tabs/chips/caps-toast/notes) |
| `ed615d2` | Task 11 — `useCvaSession.setDescribe` + normalize-on-hydrate |
| `4ceae0a` | Task 12 — `SectionScreen` intensity track + `descriptorSlot` |
| `8cf76da` | Task 13 — `CvaJourney` overlay mount, `GROUP_FOR` routing, reveal soft-gate |
| `1aa19f3` | Review fix — popped-label z-order + mid-zoom shadow fidelity |
| `b5269a8` | Review fix — `CvaJourney.test.tsx` backfills the soft-gate (mutation-checked) |
| `29f4923` | docs — prior Phase-2 handoff update |
| `73d7874` | UI polish — section-screen reskin + full-screen describe wheel (see below) |
| `5f38cdc` | docs — this handoff |
| `7618f5e` | **Daniel's hand-tune** — wheel frame is the screen: `overflow:visible` stage/svg + 130% edge-to-edge glow + floating describe card (see below) |

**Verification:** every change red→green→commit with real `vitest`/`tsc`; full suite **219/219 green, tsc 0 errors**. (Pre-existing `ApprovalSendView` `act()` warnings are baseline noise, unrelated.) A 4-lens adversarial review workflow ran earlier (Task 14): 8 findings → 3 confirmed + fixed, 5 refuted.

### What `73d7874` changed (the live polish this session)

**Section screens** (`SectionScreen.tsx`, `ImpressionScale.tsx`, `sections.ts`):
- Root cause of "too tiny": `ImpressionScale` had no width, so inside the `items-center` column it shrink-wrapped and the `flex-1` blocks collapsed to number-width. Fixed → `mx-auto w-full max-w-[820px]`; blocks now hit their **78px squares** (108px when selected).
- `IMPRESSION_COLORS` swapped from hard red/gray/green to the **prototype's smooth diverging ramp** `rgb(239,68,68)…rgb(34,197,94)`.
- Numeric box moved **inline at the row end** (64px, "1–9"); the separate "TYPE 1–9" box is gone. Ends show `1 · Extremely Low / 5 · Neutral / 9 · Extremely High`. Cooling toggle in a clean readout.
- Eyebrow `SECTION n OF 8 · AFFECTIVE IMPRESSION`, **accent-colored title**, evocative subtitles (the `hint` field in `sections.ts`).
- `CvaJourney` Describe button → styled **"Describe this cup"** pill (target icon, total count, 3 group dots, "Shared across all sections · edit anytime").
- `CvaJourney` journey footer + content centered as one group (the "Begin tasting" was stranded at the screen bottom).

**Describe overlay** (`DescribeOverlay.tsx`, `FlavorWheel.tsx`, `zoom-machine.ts`, `globals.css`):
- Overlay is **full-bleed** (dropped the `xl:` inset module). The flavor wheel is the **chromeless hero**.
- Wheel sized **`min(100vw, calc(100dvh - 200px))`** so the **whole wheel stays visible** (no over-zoom / outer-ring cut), centered.
- Zoom dialed down: `REST_S 1.06`, `DEPTHS.full {s:1.6,r:92}`, `mid {s:1.32,r:56}`.
- **Continuous flow:** focusing a family keeps its two **neighbours** visible (`.is-adjacent` opacity .62) with only light frost (`.is-semiclear`), and **reveals the neighbours' leaf labels** too (not just the focused family's).
- **Pointer-leave springs the wheel back to rest** (`onPointerLeave` → `applyZoom(rest)`).
- **`7618f5e` (Daniel's hand-tune) — "the wheel's frame is the screen":** `.cva-wheel-stage` AND `.cva-wheel-svg` are now `overflow:visible` so the zoomed/panned wheel spills past its square and is clipped only by the overlay region (this fixed a faint square-cut on popped wedges / drop-shadows / blur when zoomed — **do NOT revert these to `overflow:hidden`**). The accent glow is a **130% radial** (`radial-gradient(130% 130% at 50% 50%, var(--cva-accent-soft) 0%, transparent 96%)`) so its falloff never shows a seam. The descriptors are a **floating bottom-anchored card** (`absolute inset-x-0 bottom-6`, `pointer-events-none` wrapper / `pointer-events-auto` card, `max-h-[min(46dvh,340px)]`) above the wheel's lower edge — i.e. back to floating, not stacked-below.

## Locked decisions (do NOT relitigate)

1. **No API/DB changes** in Phase 2 — describe rides the existing autosave blob. Picks (paths) are source of truth; `cata` is derived (SCA-103 §6.3.4); caps 5/2/2 replace-oldest; counters count **picks**, never derived boxes.
2. **NO sliders** — tap-tracks + numeric only. Touch = taps only (all hover handlers guarded `pointerType !== 'touch'`).
3. `requires_descriptors` = **soft** confirm gate on the first entry into the score step (footer / progress-jump / live-pill all gate via `goToStep`; "Reveal anyway" doesn't re-ask, per-sample). `describeIsEmpty` counts picks + intensities + main-tastes + mouthfeel (deliberately broader than the spec wording — it's the more-correct behavior; a review "finding" against this was correctly refuted).
4. **Section screens follow the cupping prototype** `../specs/prototypes/cva-cupping-prototype.html` (impression blocks = its `.blk`/`blockColor`; layout = its `.scalerow`/`.scaleends`/`describebtn`). **Wheel interaction follows** `../specs/prototypes/cva-flavor-wheel-prototype.html` — BUT Daniel has **explicitly overridden the wheel sizing/zoom this session** (full-screen, less zoom, neighbours visible). Honor Daniel's live direction over the prototype where they conflict on the wheel presentation.
5. **Describe overlay is full-bleed, chromeless, full-screen** — the wheel is the hero (no card/module box), descriptors centered below. Daniel's sequence of asks: "completely full screen wheel, not a container/module" → "width should go all the way" → "less zoom on outer segments / move descriptions up" → "whole wheel this size, the WHEEL's border goes all the way (not the descriptor bar), descriptors as a centered card pushed up".
6. **Test selectors are load-bearing** — keep: `data-testid="impression-scale"`, block `aria-label="Impression n — …"`, `aria-label="Impression value"`, the "Changed as it cooled?" control; `data-testid="flavor-wheel-stage"`, `data-testid="derived-cata"`, `data-testid="intensity-track"`; the three group `role="tab"`s; the gate dialog text "No descriptors recorded" / "Reveal anyway" / "Keep describing".

## Codebase anchors

- [DescribeOverlay.tsx](../../../src/components/cupping/cva/wheel/DescribeOverlay.tsx) — overlay shell, tabs, **wheel region (130% glow + wheel size `min(100vw, calc(100dvh-200px))`)**, **floating bottom-anchored describe card** (`absolute … bottom-6`). Body layout is the most-edited spot this session.
- [FlavorWheel.tsx](../../../src/components/cupping/cva/wheel/FlavorWheel.tsx) — `neighbours()` + `adjacent` memo, `branchClass` (is-focused/is-adjacent/is-faded), `renderLabel` `showLeaf` (focused+neighbours), `onPointerLeave` zoom-out, `poppedLast` sort on wedges+labels.
- [zoom-machine.ts](../../../src/components/cupping/cva/wheel/zoom-machine.ts) — `REST_S`, `DEPTHS` (the zoom knobs Daniel is tuning).
- [ImpressionScale.tsx](../../../src/components/cupping/cva/ImpressionScale.tsx) — full-width scale row, inline numeric, gradient blocks, cooling readout.
- [SectionScreen.tsx](../../../src/components/cupping/cva/SectionScreen.tsx) — eyebrow/title/subtitle, intensity track, `descriptorSlot`.
- [CvaJourney.tsx](../../../src/components/cupping/cva/CvaJourney.tsx) — `descriptorSlotFor` (the "Describe this cup" pill), `goToStep` gate, the centered content+footer group.
- [sections.ts](../../../src/lib/cva/sections.ts) — `IMPRESSION_COLORS` (gradient), `CVA_SECTIONS` accents + `hint` subtitles.
- [globals.css](../../../src/app/globals.css) — the `.cva-wheel-*` block: `.cva-wheel-stage` + `.cva-wheel-svg` are **`overflow:visible`** (intentional — see gotcha), `.is-adjacent` (.62), `.cva-wheel-w3.is-semiclear`, `.cva-l3.is-visible`.
- Prototypes (source of truth): [cva-cupping-prototype.html](../specs/prototypes/cva-cupping-prototype.html) (section screens; `.blk`/`blockColor` ~140–169/686, `.scalerow` ~124–169, `describebtn` ~194–209/922), [cva-flavor-wheel-prototype.html](../specs/prototypes/cva-flavor-wheel-prototype.html) (wheel interaction — but Daniel overrode sizing/zoom live).
- Plan (complete code, mostly transcribed): [2026-06-11-cva-phase2-describe-flavor-wheel.md](../plans/2026-06-11-cva-phase2-describe-flavor-wheel.md).

## Open visual items (what may still need tuning)

- **"The wheel's border should go all the way" — RESOLVED by Daniel in `7618f5e`** (overflow:visible wheel clipped by the screen + 130% glow + floating card). Treat the describe-overlay visuals as **Daniel's current preferred baseline**; don't reopen unless he asks.
- **Wheel-size tension (inherent, still true):** a round wheel can't fill a much-wider-than-tall window without the top/bottom bleeding off. Current = **whole wheel visible** at `min(100vw, calc(100dvh-200px))` (small side margins on very wide windows). The lever if Daniel wants it bigger is that size value in `DescribeOverlay.tsx`.
- Possible follow-ups he hasn't asked for yet: descriptor card auto-shifting to the opposite side when a low family is focused; the intensity-track cell size on section screens.

## Gotchas

- **Do NOT set `.cva-wheel-stage` / `.cva-wheel-svg` back to `overflow:hidden`** — they're intentionally `overflow:visible` (`7618f5e`) so the zoomed/panned wheel spills past its square and is clipped only by the overlay. `overflow:hidden` reintroduces a faint square-cut on popped wedges / drop-shadows / blur when zoomed. The overlay region (`relative … overflow-hidden`) is the real clip.
- **Don't push** — held for Daniel's manual browser smoke + SCA-103 **color-fidelity pass** (compare `cva-flavor-wheel-prototype.html` to p.11 of `Documents/Specialty/AW_SCA-103_Descriptive-Assessment_Sept2024_Secured.pdf`; nudge any off hex in `flavor-wheel-data.ts` `WHEEL` — colors are data, no test changes).
- **WAQC is a single repo** with its own `.git`; the handoff docs live in it too (not a separate outer repo for this project). Commit docs to the same `main`.
- `npm run build` fails locally on offline Google Fonts only — use `tsc` + `vitest run`.
- Files under ~2000 lines; no mock data; no emojis in UI. Daniel applies migrations himself / prefers pasted SQL (none needed here).
- `--cva-accent-soft` is `color-mix` based; cascades into the fixed overlay because it's a DOM descendant of the journey's `.cva-root`.
- The `session_type='cva'` enum guard may still be unverified from earlier phases — harmless to re-run before cupping: `ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'cva';`.

## Things Daniel said that should shape future work

- He drives the visuals by eye in a tight loop — **show him, let him react, iterate**; don't over-ask. He pushed hard for an immersive **full-screen wheel** and a **continuous-flow** feel (neighbours visible, gentle zoom).
- "Looking better" was his verdict on the whole-wheel-visible + neighbour-labels + less-zoom state (the good baseline to build on).
- The push is **his call after smoke-testing**; everything is staged locally so nothing is lost.
- Next he may want to **"try things with Fable 5"** (open-ended, from an earlier session) — let him drive.

## Next / suggested next-up

1. **Resume the live tuning loop** with Daniel on `/cupping/cva` (dev server on :3100). Likely first: confirm/adjust the "wheel's border goes all the way" interpretation (Open visual items).
2. **Color-fidelity pass** (plan Task 14 §2) — needs the SCA-103 PDF + a browser.
3. **Manual smoke** (plan Task 14 §3, 8 steps) on a laptop + iPad/touch emulation.
4. **`git push`** (trunk-based → prod). Then Phase 2 is live.
5. After push: Cup-button auto-routing from the samples list; Phases 3–6; feed `describe` into the Descriptive-Form print cards + certificates (cert rule: ≤5 boxes/group, always print precise descriptors).

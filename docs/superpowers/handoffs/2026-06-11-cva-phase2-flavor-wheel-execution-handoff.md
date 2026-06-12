# Handoff — CVA Phase 2: Describe + Flavor Wheel, plan execution in progress (2026-06-11)

Supersedes `2026-06-11-specialty-cva-cupping-handoff.md` for the Phase-2 thread (that doc's Phase-1 content still stands).

**Resume point (updated 2026-06-12):** Phase 2 is **fully BUILT** — Tasks 5–14 implemented via TDD, adversarially reviewed (multi-lens workflow), all three confirmed findings fixed, **219 tests green, tsc clean**. Everything is committed to **LOCAL `main`** (this session's commits `5c601ba..b5269a8`) but **NOT pushed** — Daniel is holding the push for a **manual browser smoke test + SCA-103 color-fidelity pass** (both need a browser / the PDF, which the agent can't drive). **Resume = run the plan's Task-14 manual smoke (8 steps) + color check, then `git push`** (trunk-based → Vercel prod at qc.wolthers.com). No migrations this phase. If a defect surfaces in smoke, it's a normal bugfix on `main`.

> Original resume point (now done): execute the plan at Task 5. Tasks 1–4 were already pushed (`8a229aa`); Tasks 5–14 were completed this follow-up session inline (TDD red→green→commit) rather than via subagents, for transcription fidelity and real local verification.

## The work (one paragraph)

Phase 2 of the specialty CVA cupping screen adds the SCA-103 descriptive assessment to the existing journey: an interactive **110-node SCA flavor wheel** (the session's centerpiece — design iterated live with Daniel through 8 prototype versions and locked), per-section **0–15 intensity tap-tracks**, main tastes (≤2), mouthfeel CATA (≤2), and freely-elicited notes for every section. Everything persists through the existing per-sample `CvaAssessment` autosave — **no API or DB changes anywhere in this phase**.

## Repo state right now (2026-06-12)

- **Repo:** WAQC (`/Users/danielwolthers/Documents/GitHub/WAQC`), branch `main`. Tasks 5–14 + review fixes = **11 commits `5c601ba..b5269a8`**; plus this handoff update, local `main` is **12 ahead of `origin/main`** (upstream still `1f81066`). **Working tree clean. NOT pushed** (Daniel's choice — holding for manual smoke).
- **Deploy:** trunk-based; a push auto-deploys to prod (qc.wolthers.com). **Unlike Tasks 1–4 (inert), this changeset is LIVE once pushed** — Task 13 wires the DescribeOverlay, intensity tracks, Describe buttons, and the reveal soft-gate into the journey. So the smoke test matters before pushing.
- **No migrations, no API/DB changes** this phase (describe rides the existing autosave blob).
- **Verify locally with** `npx tsc --noEmit` + `npx vitest run` (NOT `npm test` = watch, NOT `npm run build` = fails offline on Google Fonts).

## What's done

| SHA | What |
|---|---|
| `ce8bebd` | **Spec** `../specs/2026-06-11-cva-flavor-wheel-describe-design.md` + locked wheel prototype `../specs/prototypes/cva-flavor-wheel-prototype.html` (v8 — its JS constants are NORMATIVE). Spec was adversarially reviewed by a 3-lens workflow (vs prototype code, vs the SCA-103 PDF, vs session decisions); 12 real findings folded in. |
| `81ded4f` | **Plan** — 14 bite-sized TDD tasks, complete code in every step. |
| `30f7d32` + `0a899fa` | **Task 1**: `CvaDescribe` v2 in `src/types/cva.ts` (WheelPick paths = source of truth, derived `cata`, five-key `notes`), `normalizeAssessment`, `describeIsEmpty` + review fixes. 4 tests. |
| `4f83b2a` + `8a229aa` | **Tasks 2–4**: `src/lib/cva/flavor-wheel-data.ts` — full taxonomy (verified character-identical to the prototype), geometry, `nodeAt`, 24-box CATA derivation + aliases + box-named-leaf exception, replace-oldest caps + review fixes (readonly exports, exclusive `nodeAt` bounds, family-boundary test). 16 tests. |

### Follow-up session 2026-06-12 — Tasks 5–14 (LOCAL `main`, NOT pushed)

| SHA | What |
|---|---|
| `5c601ba` | **Task 5** — `wheel/zoom-machine.ts` pure dwell/zoom state machine. 7 tests. |
| `219dcd7` | **Task 6** — `IntensityTrack.tsx` 0–15 tap-track (no sliders). 3 tests. |
| `2b70740` | **Task 7** — `wheel/MainTastes.tsx` + `wheel/MouthfeelCata.tsx` pickers. 4 tests. |
| `deecba1` | **Task 8** — `wheel/FlavorWheel.tsx` render + tap path + `.cva-wheel-*` CSS. |
| `cecf11d` | **Task 9** — FlavorWheel hover layer (graded dwell zoom, lift, note pop, pan). 11 tests total. |
| `0b67768` | **Task 10** — `wheel/DescribeOverlay.tsx` tabs/chips/caps-toast/notes. 6 tests. **Fixed a plan bug:** `togglePick` called `setToast` inside the `onDescribe` updater (setState-during-render warning); moved the toast outside the updater. |
| `ed615d2` | **Task 11** — `useCvaSession` gains `setDescribe` + normalizes legacy blobs on hydrate. 1 test. |
| `4ceae0a` | **Task 12** — `SectionScreen` gains intensity track + `descriptorSlot`. 3 tests (5 locked ImpressionScale selectors still green). |
| `8cf76da` | **Task 13** — `CvaJourney` mounts the overlay, `GROUP_FOR` routing, `goToStep` reveal soft-gate. |
| `1aa19f3` | **Review fix** — popped-label z-order (sort `famLabels` `poppedLast`) + mid-zoom focused-branch shadow fidelity. |
| `b5269a8` | **Review fix** — `CvaJourney.test.tsx` backfills the reveal soft-gate (3 entry points + ack memory + re-arm + short-circuit); mutation-checked. |

**Verification actually run (2026-06-12):** every task red→green→commit with real `vitest`/`tsc`; **full suite `npx vitest run` → 219/219 green; `npx tsc --noEmit` → 0 errors.** Only console noise is pre-existing `ApprovalSendView` act() warnings (in the baseline, unrelated to CVA). `npm run build` deliberately NOT run (offline Google-Fonts failure).

**Adversarial review (Task 14):** ran a 4-lens review workflow (spec-fidelity / correctness / test-adequacy / integration) then a refute pass. 8 findings → **3 confirmed** (all medium/low, all fixed above), 5 correctly refuted — including one that flagged the shipped `describeIsEmpty` as a "divergence" when it's the deliberately-broadened, more-correct decision-7 behavior.

## Locked decisions (do NOT relitigate)

1. **Wheel interaction = the v8 prototype exactly** (`../specs/prototypes/cva-flavor-wheel-prototype.html`): flat Lift & Focus (3D tilt explicitly DROPPED by Daniel), fluid hover-driven graded zoom — rest 1.3× (big center, frosted outer ring bleeding off the stage), inner-ring dwell → half-out 1.75×, hub dwell → rest; focused 2.4×; **screen pans with the pointer** inside a focused family; per-note pop-out; curved arc labels ONLY for Green/Vegetative + Sour/Fermented; labels on a top layer, wrapped. Dwells 180/190/200/220/240ms.
2. **Picks (paths) are the source of truth; `cata` is derived** per SCA-103 §6.3.4. Exception: leaves Fermented/Woody/Musty-Earthy ARE official boxes → check their box, no free descriptor. Caps 5/2/2 replace-oldest; UI counters count picks ("Picks n/5"), NEVER derived boxes; certs (future) print ≤5 boxes/group.
3. **Full Describe scope** (not wheel-only): 7 intensity tap-tracks 0–15 on section screens (NO sliders), main tastes, mouthfeel CATA, per-group free notes (all 5 keys — off-taxonomy "dried tomato" rule).
4. **Overlay full-screen below 1280px** — Daniel reinforced mid-session: "it must be fullscreen on small screens, ipads and notebooks". Inset panel only at `xl:`. Verify this explicitly at Task 10 review + Task 14 smoke.
5. **Touch = taps only**: ALL hover handlers guarded `pointerType !== 'touch'`; the center marker is a real button in the port (decorative in the demo).
6. **No API/DB changes**; describe rides the existing autosave blob; `requires_descriptors` = soft confirm gate on any first entry into the score step.
7. `describeIsEmpty` counts mouthfeel CATA + main tastes too (review refinement, deliberate deviation from the spec's narrower wording).

## Files created / modified by the plan (remaining)

- **New** `src/components/cupping/cva/wheel/zoom-machine.ts` (+test) — Task 5, pure dwell logic.
- **New** `src/components/cupping/cva/IntensityTrack.tsx` (+test) — Task 6.
- **New** `src/components/cupping/cva/wheel/MainTastes.tsx`, `MouthfeelCata.tsx` (+`SmallCata.test.tsx`) — Task 7.
- **New** `src/components/cupping/cva/wheel/FlavorWheel.tsx` (+test) + `.cva-wheel-*` CSS block appended to `src/app/globals.css` — Tasks 8–9.
- **New** `src/components/cupping/cva/wheel/DescribeOverlay.tsx` (+test) — Task 10.
- **Modify** `src/hooks/useCvaSession.ts` (+new test) — Task 11 (`setDescribe`, normalize on hydrate).
- **Modify** `src/components/cupping/cva/SectionScreen.tsx` (+new test) — Task 12 (intensity + `descriptorSlot`).
- **Modify** `src/components/cupping/cva/CvaJourney.tsx` — Task 13 (overlay mount, `GROUP_FOR` routing, `goToStep` gate on all three forward entries).

The plan has the COMPLETE code for every one of these — implementer subagents transcribe, they don't design.

## Execution protocol (what worked this session)

- Batches: tightly-coupled tasks share one implementer (2–4 were one batch; 8+9 should be one batch with two commits). Sequential dispatch only — never two implementers in parallel.
- Prompt templates: `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/subagent-driven-development/*.md` (implementer / spec-reviewer / code-quality-reviewer) + `requesting-code-review/code-reviewer.md`. Paste FULL task text into prompts (don't make subagents read the plan file).
- Models: haiku for mechanical single-file tasks, sonnet for multi-file/long-transcription tasks and ALL reviewers.
- Hard rules given to every subagent: verify ONLY with `npx vitest run <file>` + `npx tsc --noEmit` (NEVER `npm test` = watch, NEVER `npm run build` = fails offline on Google Fonts); commit on `main`, do NOT push; stage only listed files; report BLOCKED on foreign tsc errors.
- Fix loops: review findings → fix agent (or controller inline for one-liners) → re-review. Both reviews must be ✅ before the next batch.

## Gotchas

- **Subagent empty-commit trap (bit us in Tasks 2–4):** an implementer wrote all code in one pass then made the plan's 3 commits — 2 were EMPTY. Caught because it self-reported. Watch `git show --stat` per claimed commit; nothing was pushed, so `git reset --soft` + one honest commit fixed it. Tell multi-commit implementers to verify each commit is non-empty, or accept a single batch commit.
- **SVG label transform-origin trap:** never set CSS `transform-origin` on SVG `<text>` carrying a `rotate(deg x y)` attribute — it re-centers the rotation on the viewBox center and scatters all labels (cost a prototype iteration). Labels live in plain `<g class="cva-wheel-lw">` wrappers that take the pop transform. The FlavorWheel plan code already encodes this.
- WAQC migrations live in `database/migrations/` (none needed this phase). Daniel applies SQL himself; always paste SQL, never run it.
- Files under ~2000 lines; no mock data; no emojis in UI.
- The `session_type='cva'` enum check from the Phase-1 handoff may STILL be unverified — harmless to re-run: `ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'cva';`
- Brainstorm artifacts in `.superpowers/brainstorm/` are gitignored throwaways; the COMMITTED prototype in `docs/superpowers/specs/prototypes/` is the reference. The visual-companion server (port 56791, pinned) is likely dead — that's fine, it's not needed for execution.

## Next / suggested next-up (2026-06-12)

The build + automated gates + review are all DONE. What remains needs a human/browser:

1. **Manual smoke test** — the plan's Task 14 §3, 8 steps, on a laptop at `/cupping/cva`: pick a CVA sample → start → Describe opens the wheel overlay (full-bleed <1280px); rest = big frosted center, hover Fruity lifts+unfrosts, dwell zooms, sweep notes → pop + pan, inner-ring dwell → half-out, center marker → rest; pick Blueberry → chip + "Official form auto-fill · Fruity, Berry · precise notes: Blueberry" + "Picks 1/5"; 6 picks → cap toast; Flavor&Aftertaste main-tastes cap 2; Mouthfeel CATA cap 2; Acidity intensity + free-note; reload → describe restored; on a `requires_descriptors` quality with nothing described, footer/progress-jump/live-pill each raise the gate and "Reveal anyway" doesn't re-ask; iPad/touch-emulation → taps only, no hover artifacts.
2. **Color-fidelity pass** — plan Task 14 §2: open `docs/superpowers/specs/prototypes/cva-flavor-wheel-prototype.html` next to p.11 of `Documents/Specialty/AW_SCA-103_Descriptive-Assessment_Sept2024_Secured.pdf`; nudge any obviously-off hex in `src/lib/cva/flavor-wheel-data.ts` `WHEEL` (colors are data, no test changes). Anchors: Blackberry near-black, Blueberry blue-violet, Lemon yellow, Lime green, Winey dark red, Molasses near-black, Jasmine cream.
3. **Push** — `git push` (trunk-based → prod). Then Phase 2 is live.

After push, the remaining roadmap (separate efforts): Cup-button auto-routing from the samples list; Phase 3 voice (`describe.voice`); Phase 4 cups screen; Phase 5 Coffee Profile + AI; Phase 6 multi-cupper calibration; feeding `describe` into the Descriptive-Form print cards + certificates (cert rule: ≤5 boxes/group, always print precise descriptors).

## Things the user (Daniel) said that should shape future work

- "it must be fullscreen on small screens, ipads and notebooks" (mid-execution reminder — decision 4).
- Picked **flat** (no tilt) after trying both live; wanted hover-zoom fluid in AND out, inner ring = partial zoom-out, frosted outer ring at rest, "zoom in so we have a bigger view of the center", and the screen panning so edge notes (Rubber, Stale) aren't cut off — ALL already encoded in the locked v8 prototype + plan.
- Visual-companion mockups must be built from real design tokens (past mockups diverged from builds — see memory `visual-companion-keep-mockups-faithful`).
- Daniel reviews specs/plans quickly and says "go ahead" — don't over-ask; pause only at real decision points.

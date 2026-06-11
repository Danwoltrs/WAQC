# Handoff — CVA Phase 2: Describe + Flavor Wheel, plan execution in progress (2026-06-11)

Supersedes `2026-06-11-specialty-cva-cupping-handoff.md` for the Phase-2 thread (that doc's Phase-1 content still stands).

**Resume point:** CONTINUE subagent-driven execution of [`../plans/2026-06-11-cva-phase2-describe-flavor-wheel.md`](../plans/2026-06-11-cva-phase2-describe-flavor-wheel.md) at **Task 5 (zoom-machine)**. Tasks 1–4 are implemented, two-stage-reviewed, fixed, and PUSHED. Use the superpowers:subagent-driven-development skill: fresh implementer per task batch → spec reviewer → quality reviewer → fix loop. Remaining batches: 5, 6, 7, 8+9, 10, 11, 12, 13, 14.

## The work (one paragraph)

Phase 2 of the specialty CVA cupping screen adds the SCA-103 descriptive assessment to the existing journey: an interactive **110-node SCA flavor wheel** (the session's centerpiece — design iterated live with Daniel through 8 prototype versions and locked), per-section **0–15 intensity tap-tracks**, main tastes (≤2), mouthfeel CATA (≤2), and freely-elicited notes for every section. Everything persists through the existing per-sample `CvaAssessment` autosave — **no API or DB changes anywhere in this phase**.

## Repo state right now

- **Repo:** WAQC (`/Users/danielwolthers/Documents/GitHub/WAQC`), branch `main`, **in sync with origin/main at `8a229aa`** (everything pushed). Working tree clean except the untracked `docs/superpowers/handoffs/` dir (this file + the morning's Phase-1 handoff live there).
- **Deploy:** trunk-based; pushes auto-deploy to prod (qc.wolthers.com). The pushed Tasks 1–4 code is inert — nothing imports it yet — so prod is unaffected.
- **No stashes.** Daniel committed unrelated work mid-session (`3468c4d` print cards, `36fe01b` samples column) — not part of this thread.

## What's done

| SHA | What |
|---|---|
| `ce8bebd` | **Spec** `../specs/2026-06-11-cva-flavor-wheel-describe-design.md` + locked wheel prototype `../specs/prototypes/cva-flavor-wheel-prototype.html` (v8 — its JS constants are NORMATIVE). Spec was adversarially reviewed by a 3-lens workflow (vs prototype code, vs the SCA-103 PDF, vs session decisions); 12 real findings folded in. |
| `81ded4f` | **Plan** — 14 bite-sized TDD tasks, complete code in every step. |
| `30f7d32` + `0a899fa` | **Task 1**: `CvaDescribe` v2 in `src/types/cva.ts` (WheelPick paths = source of truth, derived `cata`, five-key `notes`), `normalizeAssessment`, `describeIsEmpty` + review fixes. 4 tests. |
| `4f83b2a` + `8a229aa` | **Tasks 2–4**: `src/lib/cva/flavor-wheel-data.ts` — full taxonomy (verified character-identical to the prototype), geometry, `nodeAt`, 24-box CATA derivation + aliases + box-named-leaf exception, replace-oldest caps + review fixes (readonly exports, exclusive `nodeAt` bounds, family-boundary test). 16 tests. |

**Verification actually run:** `npx tsc --noEmit` → 0 errors; `npx vitest run` on the two new test files → 4 + 16 green; full suite was 156 before this work (only added since).

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

## Next / suggested next-up

1. **Task 5** (zoom-machine) — pure logic, haiku-able, 10 minutes.
2. Tasks 6, 7 — small components, fast.
3. **Tasks 8+9** (FlavorWheel) — the big one; sonnet implementer, expect the test file to need jsdom care (mocked `getBoundingClientRect`, `act()`-wrapped timer advances — the plan's test code already handles this).
4. Task 10 (overlay — check the <1280px full-bleed against decision 4), 11, 12, 13.
5. **Task 14**: full gates, color-fidelity pass vs SCA-103 PDF p.11, the 8-step manual smoke (in the plan), final whole-feature review subagent, push.

## Things the user (Daniel) said that should shape future work

- "it must be fullscreen on small screens, ipads and notebooks" (mid-execution reminder — decision 4).
- Picked **flat** (no tilt) after trying both live; wanted hover-zoom fluid in AND out, inner ring = partial zoom-out, frosted outer ring at rest, "zoom in so we have a bigger view of the center", and the screen panning so edge notes (Rubber, Stale) aren't cut off — ALL already encoded in the locked v8 prototype + plan.
- Visual-companion mockups must be built from real design tokens (past mockups diverged from builds — see memory `visual-companion-keep-mockups-faithful`).
- Daniel reviews specs/plans quickly and says "go ahead" — don't over-ask; pause only at real decision points.

> **Implemented** 2026-09-01 by `../plans/2026-09-01-cva-cupper-panel.md`.
> Migrations `20260901000000` and `20260901000001` must be applied before the
> code is deployed.

# Cupper comparison on specialty lots — the CVA Panel

**Date:** 2026-09-01
**Builds on:** `../specs/2026-08-28-cva-affective-cards-design.md` (which created the
roster session and listed this work as out of scope).
**Followed by:** full SCA calibration sessions — a separate spec, not this one.

## Why

A specialty (CVA) lot is cupped by several people, but the journey gives each of
them their **own** session. `POST /api/cupping/cva/session` matches on
`created_by = me` plus an exact sample-set match, so three cuppers on one lot
produce three sessions, each holding one score row.

Two things follow, and both are bugs rather than choices:

1. **The cupper minimum is toothless.** `assertCanFinalize` sets
   `isSingleCupperSession` when `cupper_ids.length === 1`, which is always true
   for a journey session, so `minCuppersRequired` collapses to 1. Any specialty
   lot can be certified by one cupper alone, whatever the lab's rule says.
2. **Nobody can be compared to anybody.** `GET /api/cupping/scores/aggregate`
   finds no session for a specialty lot at all (its lookup applies
   `excludeCvaSessions`), so it has no assigned-cupper list and **no master
   cupper** — there is no authoritative reading and no discrepancy detection.

The machinery to fix this is already written and merely starved.
`cva/finalize` reads every score row for its session, picks the authoritative
one with `pickAuthoritativeCvaRow(rows, session.master_cupper_id)`, and feeds
the cupper count to the gate. Its own comment says the scoping is deliberate —
"a CVA row written in some other session is not a second opinion in this one".
That is correct, and it becomes powerful the moment the session is shared.

The roster session already exists (`session_type 'cva'`, `status 'setup'`,
created at assignment, holding staff and guests). It is currently inert. This
spec makes the journey bind it.

**Daniel's decisions (2026-09-01):** comparison now, calibration as its own
later cycle; cuppers are **blind until they have scored**; the comparison is a
new **Panel step** between Score and Certify; existing part-cupped lots have
their scores **adopted into the roster** by migration; discrepancy is the
**spread of the final CVA score**, and the two-cupper minimum **does** start
applying to specialty lots.

## Session binding

`POST /api/cupping/cva/session` resolves in this order when a cupper opens a
specialty lot:

1. A roster session holding the lot whose `cupper_ids` include the caller —
   bind it. This is the normal path once a lot has been assigned.
2. No roster — mint one, seeded with the caller, exactly as a session is minted
   today.

The exact-sample-set match (`sameSet`) goes. A roster accumulates `sample_ids`
across assignments, so requiring an exact match would miss the roster the
moment a second lot joined it. Binding is now "the roster that holds this lot",
matching how `pickRosterSession` already reads.

A cupper **not** on the roster's `cupper_ids` (someone opening a lot they were
never assigned) falls to case 2 and gets their own session, as today. They are
not silently added to another panel.

### The roster stays `'setup'`

The tempting move is to promote the roster to `'active'` on binding. Don't.
`status === 'setup'` is the **sole** marker four readers use to refuse a roster
(`isRosterSession`, `lib/cupping/roster.ts`), and flipping it silently disarms
all four at once.

Instead the three places that use `isRosterSession` to **refuse** a session
lose that guard, and each call site gets the rule it actually wanted. They were
bundled only because rosters were inert; they are four different questions:

| Call site | What it actually wants | Becomes |
|---|---|---|
| `finalize-gate.ts:78` | "this session has never been cupped" | drop the check — the existing count gate already refuses a session with no scores, with a better message |
| `cva/finalize:114` | "this is a real journey session" | drop the check — same reason; the gate below it covers it |
| `cva/[id]:81` (`loadSession`) | "this session is openable in the journey" | now **true** for a roster — the guard goes |
| `sample-assignments:42` | "prefer the roster, it knows everybody" | unchanged; keeps its own local predicate |

The net effect is that three guards disappear because the thing they defended
against — binding a roster — becomes the intended behaviour, and the fourth is
a display preference that was never about safety. `ROSTER_SESSION_STATUS` and
`excludeRosterSessions` in `cupping-protocol-scope.ts` go with them, since
nothing refuses a roster any more.

**`isRosterSession` itself stays.** Beyond the three guards it also backs
`pickRosterSession`, which `session-cuppers` and `samples-assigned` both use to
*prefer* the roster over a per-cupper session — a preference, not a refusal,
and still correct. It keeps its definition and loses three callers.

**This is the riskiest edit in the spec.** Those guards were added on
2026-08-30 after a whole-branch review found `cva/[id]`'s slug resolver would
bind a roster. Removing them is only safe because the count gate now does the
real work: a session with no score rows cannot be finalized regardless of its
status. The plan must prove that with a test before deleting anything.

### The minimum becomes real

`samples-assigned` hardcodes `min_cuppers_required: 1` on the roster because
rosters never gated anything. It becomes `Math.min(cupper_ids.length, 2)` —
the same expression the commodity session two lines above already uses.

**Behaviour change, deliberate:** a specialty lot assigned to two or more
cuppers now needs two of them to have scored before it can be certified. A lot
assigned to one cupper still certifies on one (`allow_single_cupper`). This
closes gap #1 above.

## The Panel step

The journey runs Roast (0) → eight sections (1–8) → Score (9) → Certify (10).
Certify moves to 11 and **Panel** takes step 10.

`ProgressPath`, the footer buttons and the `SCORE_STEP` soft-jump rules in
`CvaJourney.tsx` all index off step numbers, so each needs updating together;
`CertifyStep`'s own keying by sample is unaffected.

### `GET /api/cupping/cva/panel?session_id=&sample_id=`

Returns, for the lot resolved through `resolveLabSourceId` (a contract sibling
reports the cupping of the row it points at, as everywhere else):

```
{
  cuppers: [{ cupper_id, full_name, cva_score, sections: {…}, is_master, is_you }],
  guests:  [{ id, name }],          // never scored; see below
  mean, spread, threshold,
  outliers: [cupper_id],
  flagged: boolean,
  authoritative_cupper_id
}
```

- **Blind gate, server-side.** Other cuppers' entries are returned **only** if
  the caller's own assessment for this lot is complete (all eight sections
  rated — the same completeness test `LiveScore` uses). Until then the route
  returns the caller's own row and a `blind: true` marker, and the step renders
  "Your assessment is not complete yet". Enforced in the route, never in the
  component: a UI-only gate is not a gate.
- **Master cupper** — `session.master_cupper_id`, else the assigned cupper
  whose profile has `is_master_cupper = true`. This mirrors what
  `scores/aggregate` already does when a session names none, and it is the same
  id `pickAuthoritativeCvaRow` consumes, so the Panel and the certificate can
  never disagree about whose reading is authoritative.
- **Guests are listed and never scored.** `cupping_scores.cupper_id` is an FK
  to `profiles`, so a guest's Affective card is paper-only. The Panel shows
  them as "not recorded" rather than omitting them — the paper exists and
  somebody has to reconcile it by hand.

### Discrepancy

Pure module `src/lib/cupping/cva-panel.ts`:

```ts
panelStats(scores: {cupper_id: string, cva_score: number|null}[], threshold: number)
  -> { mean, spread, outliers, flagged }
```

- `spread = max − min` over the **recorded** scores; rows with a null
  `cva_score` (opened but not finished) are excluded from mean and spread
  rather than counted as zero. `parseCvaNumber` is the one parser, as
  everywhere else — `Number('') === 0` is a printable zero and must not become
  a score.
- `flagged` when `spread > threshold`.
- `outliers` = the cuppers furthest from the mean, only when flagged.
- Fewer than two recorded scores → `spread: 0`, `flagged: false`.

Threshold default **3.0**, overridable per quality template via a new nullable
`quality_templates.cva_score_spread_max`, resolved the same way `cva_min_score`
already is (`samples.quality_spec_id → client_qualities → quality_templates`).

The eight section impressions come back with each cupper so the step can show
them, but **no per-section flagging** — that is calibration's job.

## Migration

`database/migrations/20260901000000_cva_adopt_roster_sessions.sql`, pasted for
Daniel to apply. Forward-only, re-runnable.

1. **Lots with a roster** — re-point `cupping_scores.session_id` from their CVA
   journey sessions onto the roster; union those sessions' `created_by` into
   the roster's `cupper_ids`; recompute `min_cuppers_required`.
2. **Lots with no roster** (cupped before 2026-08-30, when rosters did not
   exist) — promote the **oldest** journey session in place: set
   `status = 'setup'`, union every sibling session's cupper into its
   `cupper_ids`, and move their score rows onto it.
3. **Delete the emptied journey sessions.** This is not tidiness:
   `load-cva-certificate-inputs.ts` scopes to the **newest** session holding
   the lot, so a surviving empty journey session would shadow the roster and
   render a certificate with no assessment. Sessions that still hold rows after
   the move are left alone and reported.

Per `supabase-sql-runner-drops-temp-tables`, the runner autocommits and
`CREATE TEMP TABLE … ON COMMIT DROP` self-destructs mid-migration — so the
migration does **not** self-verify. Verification is a separate `SELECT` Daniel
runs afterwards, supplied alongside it. Supabase's SQL editor hides `NOTICE`
output, so counts are returned as rows, not raised.

**Deploy order:** apply the migration, confirm the verification query, *then*
push. The new code binds rosters; if scores have not moved, an in-flight lot
hits the gate with "0 of 2 required cuppers".

## Testing

Unit:

- `cva-panel.test.ts` — spread, mean, outliers, the null-score exclusion, the
  fewer-than-two case, threshold from template vs default.
- Session binding resolution: roster found / caller not on it / no roster.
- The blind gate: incomplete caller gets no peer scores.
- **A session with no score rows cannot be finalized** — the test that has to
  exist before the three roster guards are deleted.

Integration: the panel route's privacy rule end to end.

Baseline to hold, measured 2026-09-01 on `2d5bbf0`: **tsc 0 errors; 121 test
files / 1458 tests passing.** Quote before-and-after counts in the commit.

Visual: the Panel step rendered with three cuppers, one flagged, and with a
guest present.

## Out of scope

- **Full SCA calibration sessions** — reference lots, cupper drift over time,
  performance history. The next cycle; this spec's shared session is its
  foundation.
- Per-section discrepancy flagging.
- Recording scores against guests (needs `cupping_scores.cupper_id` to stop
  being an FK to `profiles`).
- Refusing specialty samples in `scores/submit` — still open from the
  2026-08-28 handoff, still unguarded, unrelated to this change.
- Splitting `qc/page.tsx` (2306 lines).
- The commodity `CuppingValidationModal` — untouched; specialty gets its own
  surface rather than sharing that one.
- `GET /api/cupping/scores/aggregate` — untouched. It keeps `excludeCvaSessions`
  and stays the commodity path. Specialty comparison lives in the new panel
  route instead of widening a 750-line route that already splits two protocols
  apart by hand. The consequence to accept: the two protocols compute their
  discrepancies in different places, and a future change to "what counts as
  disagreement" has to be made twice.

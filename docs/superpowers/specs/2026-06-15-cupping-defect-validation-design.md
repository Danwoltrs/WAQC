# Cupping defect validation — intensity-based + single-count cup entry

Date: 2026-06-15
Status: Approved

## Problem

Two coupled issues in the CVA cupping defect ("taints & faults") flow:

1. **False rejection.** A quality spec that allows a defect up to a taint
   threshold (e.g. Dunkin: Past crop taint threshold 2, "2 taints, 0 faults")
   still showed a low-intensity Past crop (I:1) as rejected with
   "maximum 0 allowed (zero tolerance)". Root cause: `getDefectTolerance` in
   `src/app/cupping/page.tsx` invents a per-defect *cup* tolerance that does not
   exist in the spec, then falls back to returning `0` whenever
   `rules.max_faults === 0` — for **every** defect, including taints. The
   "(zero tolerance)" text was also hardcoded into the message.

2. **Manual per-cup entry.** Recording a defect that affects many cups required
   adding it once per cup. The "Affected Cups" modal built an array of per-cup
   intensities (`modalCupIntensities`) and `handleAddDefectConfirm` created one
   `CuppingDefect` entry per cup (`cups_affected: 1` each). 12 cups of past crop
   became 12 separate taint entries, which also blew past "max 2 taints".

## Domain model (confirmed with user)

- A defect is recorded with a single **intensity** and a **cups_affected** count.
- Acceptance is **intensity-based**: intensity within the defect's taint range
  (`<= taint_range.max`, the "taint threshold") → acceptable **taint**;
  above it → **fault**. Cup count does not change this classification.
- `rules.max_taints` / `rules.max_faults` count **distinct defect entries**
  (types), not cups. E.g. Past crop + Green = 2 taints.
- `cups_affected` records spread and feeds the deduction formula
  (`deducted = (cups_affected / total) * intensity * multiplier`); it is not a
  pass/fail gate on its own.

This already matches the downstream contract: `save-digital`, the score
aggregator (`api/cupping/scores/aggregate` does MAX consolidation per defect
name with a single `cups_affected`), and certificate-data all expect one entry
per defect with a `cups_affected` count. The per-cup UI was the anomaly.

## Part A — Validation (the bug)

Remove the cups-vs-tolerance model. Replace with a pure, testable helper in
`src/types/taint-fault-configuration.ts`:

```
evaluateDefectAgainstRules(rules, isTaint): { outOfSpec, reason }
```

A defect entry is out-of-spec only when its category is categorically disallowed:

- `rules.zero_tolerance === true` → out of spec ("not allowed (zero tolerance)")
- fault (`isTaint === false`) and `rules.max_faults === 0` → out of spec
- taint (`isTaint === true`) and `rules.max_taints === 0` → out of spec
- otherwise in-spec at the per-defect level.

`isDefectOutOfSpec` in `page.tsx` calls this helper (passing the defect's
`is_taint` and intensity for the message). `getDefectTolerance` is removed.

Aggregate limits stay in `validateCuppingDefects`, counting distinct entries
(`defects.filter(d => d.is_taint).length` vs `max_taints`, faults vs
`max_faults`). With Part B each defect is a single entry, so 12 cups of one
defect = 1 taint.

Messages are accurate: e.g. "Past crop: fault-level intensity (4.0), no faults
allowed"; zero-tolerance reads "Past crop: not allowed (zero tolerance)". No
hardcoded "(zero tolerance)" on non-zero-tolerance specs.

## Part B — Single count + one intensity entry

Modal state changes from `modalCupIntensities: number[]` to:
`modalIntensity: number` + `modalCups: number`.

Modal UI:
- one intensity stepper (− value +), step = defect increment, max = max_intensity,
  with a live Taint/Fault badge driven by `classifyDefectAsTaint`.
- one "Cups affected" number field, range 1…total cups for the sample.

`handleAddDefectConfirm` makes a single `addDefect(sampleId, name, modalCups,
modalIntensity)` call → one entry with `cups_affected = modalCups`. The
zero-tolerance pre-check at confirm uses the same classification rule (block when
the single classification is categorically disallowed). The chip already renders
`{cups_affected}/{cups} cups · I:{intensity}`.

## Scope / files

- `src/types/taint-fault-configuration.ts` — add `evaluateDefectAgainstRules`.
- `src/types/taint-fault-configuration.test.ts` (new) — unit tests for the helper.
- `src/app/cupping/page.tsx` — remove `getDefectTolerance`; rewrite
  `isDefectOutOfSpec`; adjust modal state, modal UI, `handleAddDefectClick`,
  `addCupToModal`/`removeCupFromModal`/`updateCupIntensity` (replaced),
  `handleAddDefectConfirm`.

No DB migration, no API changes.

## Testing

- Unit-test `evaluateDefectAgainstRules` across: zero_tolerance; fault with
  max_faults 0 vs >0; taint with max_taints 0 vs >0; no rules.
- Manual smoke: Dunkin sample — Past crop I:1.5 across all 12 cups passes;
  Past crop at fault-level intensity rejects; Green added as a 2nd taint OK;
  a 3rd distinct taint trips the aggregate "max 2 taints".

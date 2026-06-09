# Contract → Quality auto-fill (server-side resolver)

**Date:** 2026-06-09
**Status:** Design approved (pending spec review)
**Branch (current work):** `fix/sample-intake-scroll-and-qc-source`

## Problem

The shared Supabase DB holds **two unrelated "quality" vocabularies**:

| | sys.wolthers.com | WAQC |
|---|---|---|
| Tables | `quality_master` (canonical specs, e.g. `"NY2 17/18 SS FC SDM"`) + `company_qualities` (per-buyer) | `quality_templates` (rich: cupping/defect `parameters` JSONB) + `client_qualities` (per-client) |
| Purpose | commercial identity (what was contracted), display names, price-report / contract-clause text | QC evaluation criteria that pass/fail a sample and drive certs |
| On a contract | `contracts.quality_description` = **free text** (`"NY 2/3 17/18 FC"`) | — |
| On a sample | — | `samples.quality_spec_id` → `client_qualities.id` |

When a QC sample-intake links a sys contract today, `mapContractToFormData` copies `contracts.quality_description` into the free-text `quality_name` only. It does **not** touch the structured **Quality Specification** dropdown (`importerQualities`, loaded from the resolved client's `client_qualities`). Result: the contract says `"NY 2/3 17/18 FC"` but the lab must still hand-pick the matching spec (`"17/18 FC"`) from an unlinked list.

## Goal

When a QC intake links a contract, **auto-select the matching WAQC quality spec** in the dropdown (`quality_spec_id`), with a conservative match and a visible, overridable hint. WAQC keeps its own QC templates.

## Non-goals (explicitly out of scope)

- **No persistent cross-reference** between WAQC specs and sys `quality_master` (the "map once" option was declined). Matching is computed at resolve time.
- **No schema change / migration.** Pure code.
- **Other-Sample flow** is unaffected — it writes `shipment_samples` on the sys side and already carries quality natively.
- We do **not** unify the dropdown onto sys's list (that would lose WAQC's QC scoring params).

## Approach: server-side resolver in `/api/contracts/[id]`

Matching runs once, server-side, when the contract is resolved — not on every component render.

### Data flow

1. User links a contract in **Contract Search step** → `GET /api/contracts/[id]`.
2. The route already computes `resolved_client_id` (buyer → WAQC client). **New:** if `resolved_client_id` and `contract.quality_description` are both present, fetch that client's active `client_qualities` (`id, custom_name, quality_code, template:quality_templates(name)`) and run `matchQuality(quality_description, specs)`.
3. The route adds the match result to the `ContractResolution` payload (new fields below).
4. `mapContractToFormData(contract, resolution)` sets `quality_spec_id` (and keeps setting `quality_name`) when a confident match exists; adds `quality_spec_id` to the returned `prefilled[]`.
5. The Quality step's existing `importerQualities` loader is unchanged. Because the resolver returns an **id that exists in the same `client_qualities` list** the dropdown loads, the value is preselected automatically. The step's "single spec auto-select" effect already guards on `!formData.quality_spec_id`, so it won't clobber the prefilled value.

### API contract change

`ContractResolution` (in `src/lib/contract-intake-mapping.ts`) gains:

```ts
resolved_quality_spec_id: string | null   // client_qualities.id of the matched spec, or null
quality_match: {
  matched: boolean
  spec_id: string | null
  spec_label: string | null               // custom_name || quality_code of the match
  source_text: string                      // the contract.quality_description we matched from
  confidence: 'high' | 'low' | 'none'      // only 'high' auto-selects
} | null
```

`mapContractToFormData`:
- If `resolution.resolved_quality_spec_id` is set → `set('quality_spec_id', id)` and add to `prefilled`.
- Keep `if (c.quality_description) set('quality_name', c.quality_description)` (unchanged — the free-text label is still useful, and is the fallback when no match).

### The matcher: `matchQuality(contractText, specs)` (pure, unit-tested)

New module `src/lib/quality-matching.ts`. No I/O — takes the contract text and the spec list, returns the result object. Reused by the resolver (and trivially testable).

**Normalization** (applied to both the contract text and each spec's `custom_name`/`quality_code`/`template.name`):
- lowercase, collapse whitespace, strip punctuation except `/` and `+`.
- Extract a **screen-size token**: regex `\d{1,2}\/\d{1,2}` (e.g. `17/18`, `14/16`) or `\d{1,2}\+` (e.g. `16+`).
- Expand **cup/prep abbreviations** to canonical tokens via a small dictionary:
  `fc`→`fine cup`, `gc`→`good cup`, `ss`→`strictly soft`, `s`→`soft`, `sdm`→`strictly drinkable mild`, `rio`→`rio`, etc. (start small; extend as real data demands — log misses).
- **Drop commercial-only qualifiers** that don't appear in QC specs so they neither help nor penalize: New York defect grades (`ny 2/3`, `ny2`, `2/3`), `up`, `screen`/`scr`.

**Scoring** between contract tokens and a spec's tokens:
- Screen-size match = strong signal (weight 3). Mismatched screen sizes (both present but different) → disqualify that spec.
- Each shared cup/prep token = weight 1.
- Normalize to a 0–1 score.

**Decision:**
- `high` (auto-select) only when: exactly one spec has the **top** score, that score clears a threshold (screen-size match **plus** ≥1 cup token, or an exact normalized-string equality), and no other spec ties it.
- `low` / `none` → do **not** auto-select; leave `quality_spec_id` empty and rely on the free-text `quality_name` hint. **Under-match beats mis-match.**

Worked example: `"NY 2/3 17/18 FC"` vs specs `["17/18 FC", "14/16 Fine Cup"]`
→ drop `ny 2/3`; screen `17/18`; cup `fine cup` (from `fc`). `"17/18 FC"` → screen `17/18` ✓ + `fine cup` ✓ = high, unique. `"14/16 Fine Cup"` → screen `14/16` ✗ (disqualified). Result: auto-select `"17/18 FC"`, confidence `high`.

### UX

In the Quality step, when `quality_match.confidence === 'high'` and the value is still the auto-filled one, show a subtle muted hint under the dropdown:
> Auto-selected from contract quality "NY 2/3 17/18 FC" — change if needed.

Changing the dropdown clears the hint. When confidence is `low`/`none`, no auto-select; the existing free-text quality remains available as before. (Hint vs silent is the one open UX toggle for spec review — default: **show the hint**.)

## Edge cases

- `resolved_client_id` null (importer not a QC client / unresolved) → no spec list, `quality_match: null`, behaves as today.
- Client has zero `client_qualities` → `quality_match: { matched:false, confidence:'none' }`.
- `quality_description` null/empty → `quality_match: null`.
- Screen sizes present but differing on every spec → no match (correct: a 14/16 contract must not auto-pick a 17/18 spec).
- User re-links a different contract → prefill re-runs; if new match is `high`, it overwrites; if `none`, it should **not** wipe a value the user already chose manually (only auto-set when the field is empty or was itself auto-set — track with the existing `prefilled` mechanism).

## Optional future refinements (NOT in v1)

- **Canonicalize via `quality_master`:** when direct matching is `low`, look up the buyer's `company_qualities` → `quality_master.main_spec` (a cleaner token string than free text) and re-match. Best-effort, still no persistent link.
- **Map-once cross-reference:** if text matching proves unreliable in production, add a `client_qualities.sys_quality_master_id` FK and an admin mapping UI. This design is a strict subset and does not block that upgrade.

## Files to touch

- `src/lib/quality-matching.ts` — **new.** `matchQuality()` + normalization + dictionary. Unit-tested.
- `src/lib/contract-intake-mapping.ts` — extend `ContractResolution`; set `quality_spec_id` in `mapContractToFormData`.
- `src/app/api/contracts/[id]/route.ts` — after client resolution, fetch `client_qualities`, call `matchQuality`, populate the new resolution fields.
- `src/components/samples/intake/quality-step.tsx` — render the auto-select hint (read `formData.contract_resolution` / a small new field for the match label).
- `src/components/samples/intake/types.ts` — carry the match label/confidence if the hint needs it in `FormData`.
- Tests: `src/lib/__tests__/quality-matching.test.ts` (matcher cases incl. the worked example, abbreviations, screen-size disqualify, ambiguity, empty list).

## Testing strategy

- **Unit (primary):** `matchQuality` against a table of real-world strings — exact, abbreviation expansion (`FC`/`Fine Cup`), screen-size disqualify, `NY` grade stripping, ambiguous ties (→ no auto-select), empty/null inputs.
- **Integration:** resolver returns `resolved_quality_spec_id` for a contract whose `quality_description` matches one of the resolved client's specs; returns null when ambiguous or client has no specs.
- **Manual:** link contract 42250/26 (`"NY 2/3 17/18 FC"`) for Floriana → `"17/18 FC"` preselected with hint; confirm override clears the hint and that a 14/16 contract does not mis-select.

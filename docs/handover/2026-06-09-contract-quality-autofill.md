# Handover — Contract → Quality auto-fill (server-side resolver)

**Date:** 2026-06-09
**Branch / state:** `fix/sample-intake-scroll-and-qc-source` (pushed). Design **approved**, spec **written + committed** (`cc93acf`), **NOT implemented yet.**
**Design source of truth:** [`docs/superpowers/specs/2026-06-09-contract-quality-autofill-design.md`](../superpowers/specs/2026-06-09-contract-quality-autofill-design.md) — read it first; this handover is state + verified facts + pointers, the spec has the full matcher/algorithm detail.

---

## 1. TL;DR — what's done vs. what's left

**DONE this session (pushed on `fix/sample-intake-scroll-and-qc-source`):**
- Intake modal fixes — commit `91246c4`: adaptive height (content-basis `flex-auto` chain, fixes both the clipped footer *and* the over-stretched short steps) + full-screen breakpoint raised `lg → 2xl` (laptops <1536px get the full-screen sheet). *Unrelated to the quality feature; just shipped in the same branch.*
- Quality auto-fill **design + spec** — commit `cc93acf`.

**LEFT — implement the quality auto-fill feature:**
1. **Spec review (BLOCKING, user):** two open questions in §5 — matching/confidence rules, and hint-vs-silent UX (default = show hint). Get the user's notes before coding.
2. **writing-plans:** turn the approved spec into an implementation plan.
3. **Build:** the matcher + resolver + mapping + hint (files in §4).

**Decisions already locked (do not relitigate):** auto-fill on contract link · **server-side resolver** · WAQC keeps its own QC templates · **QC flow only** (Other-Sample out of scope) · **no schema change / migration** · **no persistent cross-reference** (the "map once" option was declined — it's a noted future upgrade, not v1).

---

## 2. The core problem (one sentence)

Two unrelated "quality" vocabularies live in the same DB; a linked sys contract carries quality as **free text** that never reaches WAQC's **structured** dropdown — so the lab re-picks it by hand.

| | sys.wolthers.com | WAQC (this repo) |
|---|---|---|
| Tables | `quality_master` (canonical, e.g. `"NY2 17/18 SS FC SDM"`) + `company_qualities` (per-buyer) | `quality_templates` (rich: cupping/defect `parameters` JSONB) + `client_qualities` (per-client) |
| Purpose | commercial identity / price-report / contract-clause text | QC evaluation criteria → pass/fail + certs |
| On a contract | `contracts.quality_description` = **free text** (`"NY 2/3 17/18 FC"`) | — |
| On a sample | — | `samples.quality_spec_id` → `client_qualities.id` |

**Why not just unify on sys's list:** `quality_master` has no cupping/defect params; WAQC's templates do. They serve different purposes → bridge, don't merge.

---

## 3. Critical facts (verified this session — with line refs)

- **WAQC + sys share ONE Supabase DB** (`ojyonxplpmhvcgaycznc`). WAQC reads the `contracts` table directly (`src/app/api/contracts/search/route.ts:40`).
- **Current behavior:** on contract link, `mapContractToFormData` copies the free-text quality into `quality_name` only — **`src/lib/contract-intake-mapping.ts:175`** (`if (c.quality_description) set('quality_name', c.quality_description)`). It does **not** set `quality_spec_id`. ← this is the gap the feature closes.
- **The dropdown** (`importerQualities`) is the resolved client's `client_qualities`, loaded client-side in **`src/components/samples/intake/quality-step.tsx:200-253`** from **`GET /api/clients/[id]/quality-specifications`** (selects `client_qualities` + joined `template:quality_templates(*)`, `…/quality-specifications/route.ts:28-36`). Dropdown renders `custom_name || quality_code` (`quality-step.tsx:528-531`); matchable fields = **`custom_name`, `quality_code`** (both confirmed present on `client_qualities`) + `template.name`.
- **The resolver hook point:** `GET /api/contracts/[id]` already computes **`resolved_client_id`** (`src/app/api/contracts/[id]/route.ts:154`) and returns `{ contract, resolution }` (`:215`). The `ContractResolution` interface is **`src/lib/contract-intake-mapping.ts:40-48`**. → add the `client_qualities` fetch + `matchQuality()` call right after `resolved_client_id` is known, and extend `ContractResolution` with `resolved_quality_spec_id` + `quality_match` (shapes in the spec).
- **Prefill plumbing:** `contract-search-step.tsx:112-139` (`handleSelect`) calls `mapContractToFormData(contract, resolution)` → `{ patch, prefilled }`, then `applyContract(fullPatch, [...prefilled, …])`. So setting `quality_spec_id` in `patch` + adding it to `prefilled` is all that's needed for the form to pick it up.
- **No clobber risk:** the quality step's single-spec auto-select is guarded `if (filtered.length === 1 && !formData.quality_spec_id)` (**`sample-intake-form.tsx:230`**), and the `importerQualities` loader never resets `quality_spec_id`. A prefilled id whose value exists in the loaded list shows as preselected automatically.
- **sys canonical vocabulary** (optional future refinement only): `quality_master.main_spec` / `display_name`, `company_qualities(company_id→buyer, quality_id→quality_master, full_description)` — defined in `~/Documents/GitHub/Wolthers-system/supabase/migrations/015_phase3_conditions_qualities.sql`. The contract has **no** `quality_id` FK (only `quality_description` text), so using this means a *second* fuzzy hop — keep it out of v1.

---

## 4. Files to touch (from the spec)

- **NEW** `src/lib/quality-matching.ts` — pure `matchQuality(contractText, specs)` + normalization + abbreviation dict. Unit-tested.
- **NEW** `src/lib/__tests__/quality-matching.test.ts` — table of cases (abbrev `FC`↔`Fine Cup`, screen-size disqualify `14/16` vs `17/18`, `NY 2/3` stripping, ambiguous tie → no auto-select, empty list/null).
- `src/lib/contract-intake-mapping.ts` — extend `ContractResolution` (`:40-48`); set `quality_spec_id` + push to `prefilled` in `mapContractToFormData` (near `:175`).
- `src/app/api/contracts/[id]/route.ts` — after `:154`, fetch `client_qualities` for `resolved_client_id`, call `matchQuality`, populate new resolution fields (`:205-213`).
- `src/components/samples/intake/quality-step.tsx` — render the auto-select hint near the dropdown (`:502-534`).
- `src/components/samples/intake/types.ts` — carry match label/confidence into `FormData` if the hint needs it.

---

## 5. Open questions for spec review (resolve BEFORE writing-plans)

1. **Matching/confidence rules** — current spec: extract screen size (`17/18`), expand cup/prep abbreviations, drop commercial qualifiers (`NY 2/3`); auto-select **only** on a unique high-confidence match (screen-size match **+** ≥1 cup token, or exact normalized equality); else leave manual. *Under-match beats mis-match.* OK as-is, or tune the threshold / abbreviation dictionary?
2. **Hint vs silent** — default is a muted "Auto-selected from contract quality '…' — change if needed." hint under the dropdown. Keep the hint, or auto-select silently?

---

## 6. Resume checklist (next session)
1. Read the **spec** (link at top). Get the user's answers to §5 (matching rules + hint-vs-silent).
2. Invoke **writing-plans** to produce the implementation plan from the approved spec.
3. Implement: `quality-matching.ts` + tests **first** (TDD), then the resolver, then mapping, then the hint.
4. Manual check: link contract **42250/26** (`"NY 2/3 17/18 FC"`, Floriana) → expect `"17/18 FC"` preselected with hint; confirm a 14/16 contract does **not** mis-select, and that overriding clears the hint.
5. `tsc --noEmit` + `vitest run` green before pushing.

Memory: see `contract-quality-autofill.md` in the project memory dir.

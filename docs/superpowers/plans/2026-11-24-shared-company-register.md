# Shared company register — index

**Spec:** `docs/superpowers/specs/2026-11-24-shared-company-register-lab-scope-design.md`

| Part | Plan | Repo | SQL to apply | Depends on |
|---|---|---|---|---|
| 1 Data and lab rules | `2026-11-24-shared-company-register-part-1-data.md` | WAQC + sys | WAQC `20261124000000`, then sys `0960` | — |
| 2 QC settings per lab | `2026-11-24-shared-company-register-part-2-qc-settings-per-lab.md` | WAQC | WAQC `20261124000001` | 1 |
| 3 QC screens | `2026-11-24-shared-company-register-part-3-qc-screens.md` | WAQC | — | 1, 2 (Task 3) |
| 4 sys | `2026-11-24-shared-company-register-part-4-sys.md` | sys | — | 1 (Task 3 only) |

Order: 1 → 2 → 3; 4 can run beside 2–3.

## Rules for every part

- Daniel applies every migration; the SQL is pasted in the reply. No code that needs a migration is pushed before Daniel confirms it applied and its check passed.
- Trunk-based: each part lands on `main` in both repos once its tests, `npx tsc --noEmit` and `npm run build` pass.
- Never render `samples.tracking_number`.
- Each part ends with a whole-part review before push.

## Changes from the spec made while planning

- `created_lab_id` → `owner_lab_id`, and NULL means sys **or** Santos (HQ). Santos's QC additions no longer carry Santos's lab. Same visibility and recipient rules, and it keeps sys's contact RPCs and merge working with one per-owner email index (Part 1 Task 3).
- The spec listed "a QC-wide company directory page" as a non-goal. Daniel's first message asked for "the same matrix we have on contacts" in QC with the company name opening the company, so Part 3 Task 6 builds a QC Contacts directory. Confirm with Daniel before executing Part 3 Task 6.
- Portal users see a client's specs from every lab, labelled with the lab (Part 2 Task 6).

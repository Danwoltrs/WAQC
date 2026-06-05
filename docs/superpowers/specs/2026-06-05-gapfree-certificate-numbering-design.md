# Gap-free certificate numbering — design spec

**Date:** 2026-06-05
**Branch context:** `feat/approval-send-view`
**Status:** Approved (design), pending implementation plan

## Problem

Today the **certificate number is generated at sample intake** and stored as
`samples.tracking_number`; the certificate reuses it (one unified number per
sample, drawn from `certificate_sequences` per `(client, laboratory, year)`).

Two consequences:

1. **Gaps in the certificate sequence.** Every registered sample consumes a
   number at intake. Samples that are rejected, deleted, or never certified
   leave permanent holes in the sequence (e.g. 692, 695, 698…). Buyers (Ahold,
   Dunkin) and auditors expect consecutive official certificate numbers.
2. (Separate, already fixed) A display bug made a multi-contract PSS render the
   last sub-contract's number on the mother certificate. Fixed in commit
   `20ecd34` (added `sample_contract_id IS NULL` filter in
   `getCertificateData`). **Not** part of this spec — listed only so the two
   issues aren't conflated.

This spec addresses **#1**: make official certificate numbers gap-free by
minting them at certification time, decoupled from the internal sample number.

## Goal

Split the single number into **two numbers with distinct lifecycles**:

| | Internal lab number | Official certificate number |
|---|---|---|
| Stored on | `samples.tracking_number` (+ `sample_contracts.tracking_number` for subs) | `certificates.certificate_number` |
| Format | `SAN-00219/26` — lab prefix + per-lab seq + `/YY` | `SAG-000456/26` — existing `certificate_pattern` |
| Counter | **new** `sample_sequences` (per `laboratory`, `year`) | existing `certificate_sequences` (per `client`, `laboratory`, `year`) |
| Minted at | intake | certificate record creation (approval **or** rejection) |
| Gaps | allowed (internal, never seen by buyers) | **none** |
| Drives | sleeve label, storage position, URL slug, lookups, QR | official PDF, header, email filename |

## Decisions (locked with the user)

1. **Internal lab number** is created at intake with a **lab-coded prefix**
   (`SAN-`, `BUN-`, `GUA-`, `PER-`), a **per-lab** counter that **resets each
   year**.
2. **Official certificate number** is minted **at certification** (the moment a
   `certificates` row is created), gap-free, per `(client, laboratory, year)`,
   using the existing `certificate_pattern` (quality/origin prefix etc.) and
   continuing the current `certificate_sequences` line.
3. **Every certificate consumes a number at the decision point** — both
   approvals and rejections produce an official document and take the next
   number. Samples deleted/abandoned before a decision consume nothing.
4. **Forward-only migration.** Existing and in-progress samples keep their
   current numbers; only samples created after deploy use the split. Zero
   renumbering.
5. **Both numbers appear on the certificate PDF** — official number in the
   header (as today), internal lab number as a small "Lab Ref" for physical
   traceability.
6. **Slugs / QR unchanged** — the sleeve QR and `/certificate/[slug]` keep
   resolving by `tracking_number` (now the internal number) → sample → its
   minted certificate.

## Design

### 1. Data model

- **`laboratories.sample_prefix TEXT`** — short prefix for the internal number
  (`'SAN-'`, `'BUN-'`, `'GUA-'`, `'PER-'`). Seed existing labs. Fallback when
  null: derive from `code` first token or `'S-'`.
- **`sample_sequences`** — new table:
  ```
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  year          INT  NOT NULL,
  last_sequence INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (laboratory_id, year)
  ```
- **`samples.split_numbering BOOLEAN NOT NULL DEFAULT false`** — grandfather
  flag. Intake sets `true` for new samples. Drives whether the cert trigger
  mints a fresh number (`true`) or reuses `tracking_number` (`false`, legacy).

### 2. Function: `generate_sample_number(p_laboratory_id UUID) RETURNS TEXT`

- Resolve `v_prefix` from `laboratories.sample_prefix` (fallback `'S-'`).
- `v_year = EXTRACT(YEAR FROM NOW())`.
- Atomic per-`(lab, year)` increment:
  ```sql
  INSERT INTO sample_sequences (laboratory_id, year, last_sequence)
  VALUES (p_laboratory_id, v_year, 1)
  ON CONFLICT (laboratory_id, year)
  DO UPDATE SET last_sequence = sample_sequences.last_sequence + 1
  RETURNING last_sequence INTO v_seq;
  ```
- Format: `v_prefix || LPAD(v_seq::text, 5, '0') || '/' || TO_CHAR(NOW(),'YY')`.
  Padding default **5** (per-lab annual volume is well under 100k).

### 3. Trigger: mint the certificate number centrally

A **`BEFORE INSERT` trigger on `certificates`** (`assign_certificate_number`):

- If `NEW.certificate_number IS NOT NULL` → return unchanged (explicit/legacy
  set; also makes re-issue idempotent).
- Load the sample: `client_id, origin, quality_spec_id, laboratory_id,
  tracking_number, split_numbering` from `samples WHERE id = NEW.sample_id`.
- **Legacy (`split_numbering = false`):** reuse the existing number —
  `NEW.certificate_number := COALESCE(sub_contract.tracking_number,
  sample.tracking_number)` (sub-contract uses its own when
  `NEW.sample_contract_id` is set). Preserves today's behavior exactly.
- **Split (`split_numbering = true`):** mint
  `NEW.certificate_number := generate_certificate_number(client_id, origin,
  quality_spec_id, NEW.is_rejected, laboratory_id)`.
- **Sub-contract write-back:** when `NEW.sample_contract_id IS NOT NULL`, also
  `UPDATE sample_contracts SET tracking_number = NEW.certificate_number WHERE
  id = NEW.sample_contract_id` so the sub-contract's stored number matches its
  minted cert number.

Centralizing here means **every** cert-creation path becomes gap-free with no
per-caller change: the approval trigger, cupping finalize, manual generate,
quality-assessment, and sub-contract creation all just insert with a null
number and the trigger fills it in.

### 4. Approval trigger

`auto_generate_certificate_on_approval` currently inserts
`certificate_number = NEW.tracking_number`. Change it to insert
**`certificate_number = NULL`** (let `assign_certificate_number` decide). For
legacy samples it reuses `tracking_number` (unchanged result); for split
samples it mints a gap-free number.

### 5. App changes

- **Intake** (`src/app/api/samples/route.ts` POST, and
  `src/app/api/samples/[id]/duplicate/route.ts`): call
  `generate_sample_number(laboratory_id)` instead of
  `generate_certificate_number(...)`; set `split_numbering = true`. Keep the
  existing type-sample path (`WA-` / `type_sample_sequence_start`) unchanged.
- **Cert-creation routes** stop passing `certificate_number` (let the trigger
  mint): `src/app/api/cupping/finalize/route.ts`,
  `src/app/api/samples/[id]/certificate/route.ts` (fresh-gen insert),
  `src/app/api/samples/[id]/quality-assessment/route.ts`,
  `src/app/api/samples/[id]/contracts/route.ts`. The contracts route drops its
  own `generate_certificate_number` call for `sample_contracts.tracking_number`
  — the trigger now writes it back.
- **Rendering** (`src/lib/certificate-data.ts`): the official number always
  comes from the `certificates` row. The "no certificate yet" placeholder must
  **not** fall back to `tracking_number` as the official number for split
  samples — show the internal number as a lab ref + "pending". Legacy samples
  (no cert, `split_numbering=false`) keep showing `tracking_number`.
- **PDF** (`src/components/pdf/certificate/`): surface the internal lab number
  (`sample.tracking_number`) as a small "Lab Ref" near the header / in the
  details row, alongside the official certificate number.

### 6. Deploy ordering

1. Apply the DB migration (table, column, `generate_sample_number`,
   `assign_certificate_number` trigger, modified approval trigger, seed
   `laboratories.sample_prefix`). Safe to apply before app deploy: with
   `split_numbering` defaulting to `false`, the cert trigger reuses
   `tracking_number` for everything → identical current behavior.
2. Deploy the app. New intake now uses `generate_sample_number` + sets
   `split_numbering=true`; certification mints gap-free numbers.

No backfill. `certificate_sequences` continues from its current per-lab values
(e.g. Ahold/Santos resumes from 11701 at the first split-sample certification).

## Edge cases

- **Approve → override to rejected:** the cert already has its number; the
  override only toggles `is_rejected` (no R- prefix, per the current rule). No
  new number minted.
- **Re-issue / re-download:** `certificate_number` already set → trigger skips →
  idempotent.
- **Delete after cert exists:** the number was a real issued document; it stays
  consumed (acceptable). Delete *before* any cert → no number consumed (the
  whole point).
- **Type samples:** `split_numbering=false`, keep `WA-`/type sequence; they
  don't get client certificates.

## Out of scope (future, noted not built)

- Public buyer lookup by **official certificate number** (today `/certificate/[slug]`
  resolves by the internal number via the sleeve QR).
- Per-lab configurable padding / starting sequence for the internal number.

## Risks / call-outs

- **Two numbers per sample** — UI must clearly label internal vs official to
  avoid confusion.
- **Official number doesn't exist until decision** — pre-decision screens must
  not display an official number for split samples.
- **Sub-contract ordering** within a PSS follows cert-insert order (already
  sequential today).

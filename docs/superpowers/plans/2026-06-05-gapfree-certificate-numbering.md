# Gap-free Certificate Numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple the internal lab sample number (minted at intake) from the official certificate number (minted gap-free at certification), so rejected/deleted/abandoned samples no longer leave holes in the certificate sequence buyers see.

**Architecture:** Two numbers, two counters. Intake assigns an internal lab number (`SAN-00219/26`) from a new per-lab `sample_sequences` counter and flags the sample `split_numbering=true`. A centralized `BEFORE INSERT` trigger on `certificates` mints the official number (`SAG-000456/26`) from the existing `certificate_sequences` at the moment any certificate row is created — for split samples it mints gap-free; for legacy samples it reuses `tracking_number` (today's behavior). Forward-only: existing/in-progress samples are untouched.

**Tech Stack:** Postgres (Supabase) functions + triggers; Next.js 14 App Router API routes (TypeScript); `@react-pdf/renderer` certificate components.

**Spec:** `docs/superpowers/specs/2026-06-05-gapfree-certificate-numbering-design.md`

**Conventions for this repo:**
- The user applies all migrations manually and prefers SQL pasted in full. Task 1 delivers one complete migration file; the worker writes the file but does **not** run it — hand the SQL to the user to apply.
- No route-level test harness exists (vitest covers `src/lib` helpers only). DB behavior is verified with a `BEGIN; … ROLLBACK;` SQL block; route changes are verified with `npx tsc --noEmit` + `npm run build` + a manual smoke test. This is the correct verification level for this work — do not invent a route test framework.
- No emojis in UI. Keep files under ~2000 lines.

---

## File Structure

**Create:**
- `database/migrations/20260605000001_gapfree_certificate_numbering.sql` — all DB changes (table, columns, functions, triggers, seed).

**Modify:**
- `src/app/api/samples/route.ts` — intake: use `generate_sample_number`, set `split_numbering=true`.
- `src/app/api/samples/[id]/duplicate/route.ts` — duplicate: same as intake.
- `src/app/api/samples/[id]/quality-assessment/route.ts` — insert certs with `certificate_number: null`; drop number derivation; create sub-certs even when sub tracking is null.
- `src/app/api/samples/[id]/certificate/route.ts` — same insert change for mother + sub-certs.
- `src/app/api/cupping/finalize/route.ts` — same insert change for mother + sub-certs.
- `src/app/api/samples/[id]/contracts/route.ts` — create contract with null tracking for split; drop the `generate_certificate_number` call; insert cert with null number; re-select contract after cert mint.
- `src/lib/certificate-data.ts` — fetch `split_numbering`; placeholder no longer uses `tracking_number` as the official number for split samples; expose internal ref.
- `src/components/pdf/certificate/quality-certificate.tsx` + `certificate-header.tsx` — render the internal lab number as "Lab Ref" when it differs from the certificate number.

---

## Task 1: DB migration — internal sequence + centralized cert minting

**Files:**
- Create: `database/migrations/20260605000001_gapfree_certificate_numbering.sql`

- [ ] **Step 1: Write the migration file**

Create `database/migrations/20260605000001_gapfree_certificate_numbering.sql` with exactly this content:

```sql
-- Migration 20260605000001: Gap-free certificate numbering
--
-- Splits the single unified number into two:
--   * Internal lab number (samples.tracking_number) minted at intake from a new
--     per-lab sample_sequences counter (gaps allowed, never seen by buyers).
--   * Official certificate number (certificates.certificate_number) minted at
--     certificate creation from the existing per-(client,lab,year)
--     certificate_sequences counter (gap-free).
--
-- Forward-only: samples.split_numbering defaults false; the cert trigger reuses
-- tracking_number for legacy/in-progress samples (identical current behavior)
-- and mints a fresh number only for split (post-deploy) samples. Safe to apply
-- before deploying the app code.

BEGIN;

-- 1. Short lab prefix for the internal sample number ----------------------------
ALTER TABLE laboratories ADD COLUMN IF NOT EXISTS sample_prefix TEXT;
-- Seed known labs; others fall back to 'S-' in the function until configured.
UPDATE laboratories SET sample_prefix = 'SAN-'
  WHERE code = 'SANTOS_HQ' AND (sample_prefix IS NULL OR sample_prefix = '');

-- 2. Per-lab internal sample sequence ------------------------------------------
CREATE TABLE IF NOT EXISTS sample_sequences (
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  year          INT  NOT NULL,
  last_sequence INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (laboratory_id, year)
);

-- 3. Grandfather flag ----------------------------------------------------------
ALTER TABLE samples ADD COLUMN IF NOT EXISTS split_numbering BOOLEAN NOT NULL DEFAULT false;

-- 4. Sub-contract number is filled in after its cert mints ----------------------
ALTER TABLE sample_contracts ALTER COLUMN tracking_number DROP NOT NULL;

-- 5. generate_sample_number(p_laboratory_id) -----------------------------------
CREATE OR REPLACE FUNCTION generate_sample_number(p_laboratory_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix TEXT;
  v_year   INT;
  v_seq    INT;
BEGIN
  IF p_laboratory_id IS NULL THEN
    RAISE EXCEPTION 'generate_sample_number requires p_laboratory_id';
  END IF;

  SELECT NULLIF(sample_prefix, '') INTO v_prefix
  FROM laboratories WHERE id = p_laboratory_id;
  v_prefix := COALESCE(v_prefix, 'S-');

  v_year := EXTRACT(YEAR FROM NOW())::INT;

  INSERT INTO sample_sequences (laboratory_id, year, last_sequence)
  VALUES (p_laboratory_id, v_year, 1)
  ON CONFLICT (laboratory_id, year)
  DO UPDATE SET last_sequence = sample_sequences.last_sequence + 1
  RETURNING last_sequence INTO v_seq;

  RETURN v_prefix || LPAD(v_seq::TEXT, 5, '0') || '/' || TO_CHAR(NOW(), 'YY');
END;
$$;

COMMENT ON FUNCTION generate_sample_number(UUID) IS
  'Internal lab sample number: per-(lab,year) atomic sequence, prefix from '
  'laboratories.sample_prefix. Gaps allowed; not the certificate number.';

-- 6. assign_certificate_number(): mint or reuse at cert INSERT ------------------
CREATE OR REPLACE FUNCTION assign_certificate_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client       UUID;
  v_origin       TEXT;
  v_quality      UUID;
  v_lab          UUID;
  v_tracking     TEXT;
  v_split        BOOLEAN;
  v_sub_tracking TEXT;
BEGIN
  -- Already set (explicit value, legacy caller, or re-issue): idempotent.
  IF NEW.certificate_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT client_id, origin, quality_spec_id, laboratory_id, tracking_number, split_numbering
    INTO v_client, v_origin, v_quality, v_lab, v_tracking, v_split
  FROM samples WHERE id = NEW.sample_id;

  IF NEW.sample_contract_id IS NOT NULL THEN
    SELECT tracking_number INTO v_sub_tracking
    FROM sample_contracts WHERE id = NEW.sample_contract_id;
  END IF;

  IF COALESCE(v_split, false) = false THEN
    -- Legacy: reuse the existing number (sub-contract's own when present).
    NEW.certificate_number := COALESCE(v_sub_tracking, v_tracking);
    -- Fallback so the NOT NULL/UNIQUE column always gets a value.
    IF NEW.certificate_number IS NULL AND v_lab IS NOT NULL AND v_client IS NOT NULL THEN
      NEW.certificate_number := generate_certificate_number(v_client, v_origin, v_quality, false, v_lab);
    END IF;
  ELSE
    -- Split: mint a gap-free official number. No R- prefix (is_rejected flag
    -- on the row carries rejection; matches the unified-numbering rule).
    NEW.certificate_number := generate_certificate_number(v_client, v_origin, v_quality, false, v_lab);
  END IF;

  -- Mirror the number onto the sub-contract for display/back-compat.
  IF NEW.sample_contract_id IS NOT NULL AND NEW.certificate_number IS NOT NULL THEN
    UPDATE sample_contracts
    SET tracking_number = NEW.certificate_number
    WHERE id = NEW.sample_contract_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_certificate_number ON certificates;
CREATE TRIGGER trg_assign_certificate_number
  BEFORE INSERT ON certificates
  FOR EACH ROW
  EXECUTE FUNCTION assign_certificate_number();

-- 7. Approval trigger: insert NULL number, let assign_certificate_number decide -
CREATE OR REPLACE FUNCTION auto_generate_certificate_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_cert_id UUID;
  v_issued_to        TEXT;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    IF NEW.tracking_number IS NULL OR NEW.tracking_number = '' THEN
      RAISE WARNING 'auto_generate_certificate: sample % has no tracking_number, skipping cert', NEW.id;
      RETURN NEW;
    END IF;

    SELECT id INTO v_existing_cert_id
    FROM certificates
    WHERE sample_id = NEW.id AND sample_contract_id IS NULL
    LIMIT 1;

    IF v_existing_cert_id IS NULL THEN
      SELECT COALESCE(fantasy_name, name, 'Pending')
      INTO v_issued_to FROM companies WHERE id = NEW.client_id;

      INSERT INTO certificates (sample_id, certificate_number, issued_to, status)
      VALUES (NEW.id, NULL, COALESCE(v_issued_to, 'Pending'), 'issued');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
```

- [ ] **Step 2: Hand the migration to the user to apply**

Do not execute it. Tell the user: "Migration `20260605000001_gapfree_certificate_numbering.sql` is ready — please apply it." Wait for confirmation before relying on the new objects.

- [ ] **Step 3: Verify trigger behavior (user runs this, or run read-only after apply)**

After apply, run this self-rolling-back verification. It proves: (a) legacy sample reuses tracking_number, (b) split sample mints the next gap-free number, (c) the counter advances correctly. Replace the two UUIDs with a real Ahold (client) + Santos (lab) pair if different.

```sql
BEGIN;
-- counter before
SELECT last_sequence FROM certificate_sequences
WHERE client_id = '7e288918-6188-4d47-9a74-e49332720a5f'
  AND laboratory_id = '9346551b-f8c1-4fd8-b4b0-8dd1eac72ee0'
  AND year = 2026;  -- expect 11701

-- LEGACY: insert a sample with split_numbering=false, approve -> cert reuses tracking
INSERT INTO samples (id, tracking_number, client_id, laboratory_id, origin, status, split_numbering)
VALUES ('00000000-0000-0000-0000-000000000001', 'SAG-099999/26',
        '7e288918-6188-4d47-9a74-e49332720a5f', '9346551b-f8c1-4fd8-b4b0-8dd1eac72ee0',
        'Brazil', 'pending', false);
INSERT INTO certificates (sample_id, certificate_number, issued_to, status)
VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'Test', 'issued');
SELECT certificate_number FROM certificates WHERE sample_id = '00000000-0000-0000-0000-000000000001';
-- expect SAG-099999/26 (reused, no mint)

-- SPLIT: insert a sample with split_numbering=true -> cert mints next number
INSERT INTO samples (id, tracking_number, client_id, laboratory_id, origin, status, split_numbering)
VALUES ('00000000-0000-0000-0000-000000000002', 'SAN-00001/26',
        '7e288918-6188-4d47-9a74-e49332720a5f', '9346551b-f8c1-4fd8-b4b0-8dd1eac72ee0',
        'Brazil', 'pending', true);
INSERT INTO certificates (sample_id, certificate_number, issued_to, status)
VALUES ('00000000-0000-0000-0000-000000000002', NULL, 'Test', 'issued');
SELECT certificate_number FROM certificates WHERE sample_id = '00000000-0000-0000-0000-000000000002';
-- expect SAG-011702/26 (minted, gap-free continuation)

-- internal sequence advanced for the lab
SELECT * FROM sample_sequences WHERE laboratory_id = '9346551b-f8c1-4fd8-b4b0-8dd1eac72ee0';
ROLLBACK;
```

Expected: legacy cert = `SAG-099999/26`; split cert = `SAG-011702/26`; `certificate_sequences` ends back at 11701 after ROLLBACK.

- [ ] **Step 4: Commit the migration file**

```bash
git add database/migrations/20260605000001_gapfree_certificate_numbering.sql
git commit -m "feat(certs): migration for gap-free numbering (sample_sequences + cert-mint trigger)"
```

---

## Task 2: Intake route uses the internal sample number

**Files:**
- Modify: `src/app/api/samples/route.ts:316-337` (RPC selection) and `:368-369` (sampleData)

- [ ] **Step 1: Switch the intake number generator**

In `src/app/api/samples/route.ts`, replace the `if (clientId && body.laboratory_id) { … generate_certificate_number … } else { … generate_tracking_number … }` block (currently lines 316-337) with a call to `generate_sample_number` when a lab is present, keeping the legacy `generate_tracking_number` only as the no-lab fallback:

```ts
      let trackingNumberData: any
      let trackingError: any
      if (body.laboratory_id) {
        // Internal lab number (gaps allowed). The official certificate number is
        // minted gap-free at certification by the certificates BEFORE INSERT trigger.
        ;({ data: trackingNumberData, error: trackingError } = await supabase
          .rpc('generate_sample_number', {
            p_laboratory_id: body.laboratory_id,
          } as any))
      } else {
        ;({ data: trackingNumberData, error: trackingError } = await supabase
          .rpc('generate_tracking_number', {
            p_client_id: clientId,
            p_laboratory_id: body.laboratory_id,
            p_origin: body.origin,
            p_quality_template_id: qualitySpecId,
            p_is_rejected: false,
            p_sample_type: body.sample_type || 'pss'
          } as any))
      }
```

- [ ] **Step 2: Flag the sample as split-numbered**

In the same file, in the `sampleData` object (currently starts line 368), add `split_numbering: true` right after `tracking_number`:

```ts
      const sampleData: Record<string, any> = {
        tracking_number: trackingNumber,
        split_numbering: true,
        client_id: clientId,
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/samples/route.ts
git commit -m "feat(certs): intake assigns internal lab number, sets split_numbering"
```

---

## Task 3: Duplicate route uses the internal sample number

**Files:**
- Modify: `src/app/api/samples/[id]/duplicate/route.ts:124-133` (RPC) and the inserted sample payload (~line 161)

- [ ] **Step 1: Switch the generator and set the flag**

In `src/app/api/samples/[id]/duplicate/route.ts`, replace the `generate_certificate_number` RPC call (line ~124) with `generate_sample_number` keyed on the laboratory, mirroring Task 2 Step 1 (keep the `generate_tracking_number` fallback for the no-lab case). Then in the duplicated sample insert payload (the object that sets `tracking_number: trackingNumber`, ~line 161) add `split_numbering: true`.

Read the surrounding lines first (`src/app/api/samples/[id]/duplicate/route.ts:115-170`) and apply the same two edits as Task 2: (1) call `generate_sample_number({ p_laboratory_id })` when a lab id is available; (2) add `split_numbering: true` next to `tracking_number` in the insert.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/samples/[id]/duplicate/route.ts
git commit -m "feat(certs): duplicated samples get internal lab number, split_numbering"
```

---

## Task 4: Cert-creation routes insert a null number (trigger mints)

All four routes currently compute a number from `tracking_number` and pass it. The trigger now owns numbering, so each insert passes `certificate_number: null`. The post-insert `.select(... certificate_number ...)` returns the trigger-assigned value, so downstream messages stay correct.

### Task 4a: quality-assessment route

**Files:**
- Modify: `src/app/api/samples/[id]/quality-assessment/route.ts` (lines ~258-261, ~281, ~322-324, ~344)

- [ ] **Step 1: Mother cert — null number**

At line ~281 change `certificate_number: certificateNumber,` to `certificate_number: null,`. Then delete the now-unused derivation at lines ~258-261:

```ts
    // Certificate number uses tracking_number (R- prefix for rejected)
    const certificateNumber = isRejected
      ? `R-${sample.tracking_number}`
      : sample.tracking_number
```

(Leave `isRejected` — it's still used for the `is_rejected` column.)

- [ ] **Step 2: Sub-contract cert — null number, no skip**

At line ~344 change `certificate_number: subCertNumber,` to `certificate_number: null,`, and delete the unused `subCertNumber` derivation at lines ~322-324. If a guard `if (!sc.tracking_number) { … continue }` precedes this insert (it exists in sibling routes), remove that guard so split sub-contracts (null tracking until minted) still get a cert; the trigger fills the number.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. If `certificateNumber`/`subCertNumber` is now reported unused elsewhere, remove the remaining reference.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/samples/[id]/quality-assessment/route.ts
git commit -m "feat(certs): quality-assessment lets trigger mint cert number"
```

### Task 4b: certificate route

**Files:**
- Modify: `src/app/api/samples/[id]/certificate/route.ts` (lines ~332, ~348, ~435, ~455)

- [ ] **Step 1: Mother cert — null number**

At line ~348 change `certificate_number: certificateNumber,` to `certificate_number: null,`. Delete the unused `const certificateNumber = sample.tracking_number as string` at line ~332.

- [ ] **Step 2: Sub-contract cert — null number, no skip**

At line ~455 change `certificate_number: subCertNumber,` to `certificate_number: null,`. Delete `const subCertNumber = sc.tracking_number as string` (~435) and remove the preceding `if (!sc.tracking_number) { … continue }` guard (~430-432) so split sub-contracts still get a cert.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/samples/[id]/certificate/route.ts
git commit -m "feat(certs): certificate route lets trigger mint cert number"
```

### Task 4c: cupping finalize route

**Files:**
- Modify: `src/app/api/cupping/finalize/route.ts` (lines ~436, ~452, ~572, ~592)

- [ ] **Step 1: Mother cert — null number**

At line ~452 change `certificate_number: certificateNumber,` to `certificate_number: null,`. Delete `const certificateNumber = sample.tracking_number as string` (~436). Keep the `if (!sample.tracking_number …)` validity guard at ~426 — the sample must still have an internal number.

- [ ] **Step 2: Sub-contract cert — null number, no skip**

At line ~592 change `certificate_number: subCertNumber,` to `certificate_number: null,`. Delete `const subCertNumber = sc.tracking_number as string` (~572) and remove the `if (!sc.tracking_number) { … continue }` guard (~567-569).

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cupping/finalize/route.ts
git commit -m "feat(certs): cupping finalize lets trigger mint cert number"
```

### Task 4d: contracts route

**Files:**
- Modify: `src/app/api/samples/[id]/contracts/route.ts` (lines ~140-157 generator, ~159-161 contractData, ~205-216 sub-cert derivation, ~244 insert)

- [ ] **Step 1: Stop generating the sub-contract number at contract creation**

Delete the `generate_certificate_number` RPC call and its error handling (lines ~140-157) plus `const trackingNumber = String(trackingNumberData)`. In `contractData` (line ~159) change `tracking_number: trackingNumber,` to `tracking_number: null,` — the trigger fills it when the cert mints.

- [ ] **Step 2: Insert the sub-cert with a null number**

In the "Auto-create certificate if mother sample already has one" block, change `certificate_number: subCertNumber,` (line ~244) to `certificate_number: null,` and delete the `const subCertNumber = isRejected ? \`R-${contract.tracking_number}\` : contract.tracking_number` derivation (~213-215).

- [ ] **Step 3: Return the minted number to the client**

After the sub-cert insert succeeds, re-select the contract so the response carries the trigger-written `tracking_number`. Immediately after the `await supabase.from('certificates').insert({...})` block, add:

```ts
        const { data: refreshed } = await supabase
          .from('sample_contracts')
          .select('tracking_number')
          .eq('id', contract.id)
          .single()
        if (refreshed?.tracking_number) {
          (contract as any).tracking_number = refreshed.tracking_number
        }
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/samples/[id]/contracts/route.ts
git commit -m "feat(certs): contracts route defers sub-contract number to mint trigger"
```

---

## Task 5: Rendering — official number from the cert row, internal as pending/ref

**Files:**
- Modify: `src/lib/certificate-data.ts` (sample select; placeholder block ~952-965)

- [ ] **Step 1: Fetch `split_numbering` on the sample**

Find the main sample `select(...)` in `getCertificateData` (the query that loads the `sample` object near the top of the function). Add `split_numbering` to the selected columns so it's available below. Read the file around the sample fetch to place it correctly.

- [ ] **Step 2: Placeholder must not present the internal number as official**

In the certificate placeholder object (currently line ~957, `certificate_number: sample.tracking_number,`), change it so split samples without a cert show a pending marker rather than their internal number:

```ts
          certificate_number: (sample as any).split_numbering ? 'PENDING' : sample.tracking_number,
```

Legacy samples keep showing `tracking_number` (unchanged behavior).

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/certificate-data.ts
git commit -m "feat(certs): split samples show PENDING until certified, not the internal number"
```

---

## Task 6: PDF shows the internal lab number as "Lab Ref"

The internal number (`sample.tracking_number`) should appear on the certificate as a small reference so the physical sleeve maps to the document — but only when it differs from the official number (i.e. split samples; legacy samples have them equal).

**Files:**
- Modify: `src/components/pdf/certificate/certificate-header.tsx` (add prop + render)
- Modify: `src/components/pdf/certificate/quality-certificate.tsx` (pass the prop)

- [ ] **Step 1: Add a `labRef` prop to the header**

In `src/components/pdf/certificate/certificate-header.tsx`, add an optional prop `labRef?: string | null` to the props interface. Below the existing `#{certificateNumber}` line (and the `buyerReference` line added earlier), render it when present, reusing the muted small style:

```tsx
{labRef && (
  <Text style={styles.buyerReference}>Lab Ref: {labRef}</Text>
)}
```

(Use the same `buyerReference` style already defined for the buyer-ref line, or duplicate it as `labRef` with identical attributes.)

- [ ] **Step 2: Pass the internal number only when it differs from the cert number**

In `src/components/pdf/certificate/quality-certificate.tsx`, where `CertificateHeader` is rendered, pass:

```tsx
labRef={
  sample?.tracking_number && sample.tracking_number !== certificate?.certificate_number
    ? sample.tracking_number
    : null
}
```

Use the prop names already in scope in that component for the sample tracking number and certificate number (read the file to confirm the exact identifiers; the data shape comes from `getCertificateData` → `sample.tracking_number` and `certificate.certificate_number`).

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/pdf/certificate/certificate-header.tsx src/components/pdf/certificate/quality-certificate.tsx
git commit -m "feat(certs): show internal lab ref on certificate when it differs from cert number"
```

---

## Task 7: Full verification

- [ ] **Step 1: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 2: Run the helper test suite (no regressions)**

Run: `npm run test:run`
Expected: all existing tests pass (this change touches no `src/lib` helper covered by vitest, so the count should match the prior run of 125).

- [ ] **Step 3: Manual smoke test (after migration applied + app running)**

Verify end-to-end:
1. Register a new sample for Ahold/Santos → its number is `SAN-000NN/26` (internal), and `split_numbering=true` in the DB.
2. Approve it → a certificate row is created with the next gap-free `SAG-…/26` (continuing from 11701), distinct from the internal number.
3. Open the certificate PDF → header shows the official `SAG-…/26` and a small "Lab Ref: SAN-000NN/26".
4. Register two samples, reject one, approve the other → the two official numbers are consecutive (the rejected sample did NOT skip a number for the approved one; rejected still consumed exactly one in decision order).
5. Multi-contract PSS: create a mother + sub-contracts, certify → mother and each sub-contract get consecutive gap-free official numbers; the mother's PDF shows its own number (not a sub-contract's).
6. Open an existing/legacy sample's certificate → unchanged number (no "Lab Ref" line, since internal == official).

- [ ] **Step 4: Final summary commit (if any stray changes)**

```bash
git status
# commit anything outstanding with a descriptive message
git push origin feat/approval-send-view
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** Task 1 covers data model + functions + triggers + forward-only; Tasks 2-3 intake/duplicate; Task 4 all four cert-creation paths; Task 5 rendering placeholder; Task 6 PDF Lab Ref. Slugs/QR need no change (verified in spec). Buyer-lookup-by-cert-number and per-lab padding config are explicitly out of scope.
- **Collision safety:** `certificate_number` is `UNIQUE NOT NULL`. The shared `certificate_sequences` counter only increases, so legacy intake-reserved numbers (≤ current counter) never collide with later split mints (counter+1…). Deploy app promptly after the migration to minimize legacy reservations that may become gaps.
- **No R- prefix on mint:** the trigger passes `p_is_rejected => false` to `generate_certificate_number`; the rejection is recorded by the `is_rejected` column, matching the unified-numbering rule. (The manual override route's R- behavior is unchanged and out of scope.)
- **Trigger ordering:** the only other `certificates` trigger is `update_certificates_updated_at` (BEFORE UPDATE) — no conflict with the new BEFORE INSERT trigger.

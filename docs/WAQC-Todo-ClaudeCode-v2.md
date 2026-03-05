# WAQC – Claude Code Task List v2
_Created: 02 Mar 2026 | New fixes after QA pass_

---

## 🔴 Bug Fixes

### 1. Screen Size Inputs – Remove Pre-filled Zero
- Screen size input boxes (Scr. 16, 15, 14, Pan) are showing `0` as a pre-filled value.
- **Fix:** Fields must start empty/blank. User enters the value manually. Do not default to `0` — it causes confusion and requires an extra clear step before typing.

### 2. Sub-Contracts – Only Allowed on PSS, Not SS
- Sub-contracts are currently available on both PSS and SS sample types, but the logic should differ:
  - **PSS (Pre-Shipment Sample):** One sample → multiple contracts. Use the existing sub-contract flow.
  - **SS (Shipment Sample):** One contract → multiple samples. Use a **duplicate** flow instead — create a new independent sample record that shares the same contract number, not a sub-contract.
- **Fix:** On the intake form, detect sample type. If PSS → show "+ Add Sub-Contracts" as today. If SS → replace with "+ Duplicate Sample" which clones the record with the same contract but a new sample entry.

### 3. Sub-Contract Creation Generates 3 Cupping Cards Instead of 1
- When a sub-contract is created, the system is generating one cupping card per container (3 containers = 3 cards), but a sub-contract should produce **only 1 cupping card** regardless of how many containers are linked.
- **Fix:** Card generation logic for sub-contracts must output a single card. The multi-card loop (from task #7 of v1) should only apply to SS duplicates, not PSS sub-contracts.

### 4. Client Inactivation/Deletion Blocked by Linked Records
- Users cannot inactivate or delete a client that has samples or qualities assigned to it.
- **Expected behavior:** Users should always be able to inactivate or delete a client, even with linked records. The system should:
  - On **inactivation:** mark the client inactive, keep all linked records intact (samples, qualities, certs remain visible historically).
  - On **deletion:** warn the user that linked records exist and ask for confirmation, then proceed if confirmed. Alternatively, reassign or orphan linked records gracefully.
- **Fix:** Remove the hard block on delete/inactivate. Implement a confirmation dialog for deletion that lists what is linked. Inactivation should never be blocked.

---

## 🟡 UX Improvements

### 5. Crop Year Field on Sample Intake – Quality Step
- When adding a new sample, there is no field to record the **crop year**.
- **Fix:** Add a "Crop Year" input to the quality/sample intake step with pre-filled dropdown options.
  - Format: `25/26`, `26/27`, `27/28`, etc.
  - Auto-generate options: always show current crop year + next 1–2 years. New options are added automatically each season (July marks the start of a new crop year).
  - User can still type freely if needed.
  - Current crop years to include at launch: `23/24`, `24/25`, `25/26`, `26/27`.

### 6. Cupping – Attribute Input Boxes Too Far Apart
- The input fields for cupping attributes (Sweetness, Acidity, Flavor, Body, etc.) have too much spacing between them.
- **Fix:** Reduce the gap between attribute rows/columns so more attributes are visible without scrolling and the form feels tighter and more usable.

### 7. Cupping – Attribute Inputs Don't Accept Decimals
- Score input fields for cupping attributes are not accepting decimal values — only whole numbers.
- Hard blocker for quality specs that use increments of 0.25, 0.05, or 0 (already the case for several client specs in the system).
- **Fix:** Change input type/validation to allow decimals. Step value should match the quality spec's defined increment (e.g. `step="0.05"` or `step="0.25"`). If no increment is defined on the spec, default to `step="0.01"`. Validate on save that the entered value falls within the attribute's min/max range.

---

### 8. Cupping & Grading – Samples Not Sorted by Creation Order
- Sample tabs on both the Cupping and Grading views appear in a random order instead of the order they were added.
- **Fix:** Sort samples by `created_at` ascending in both views. First sample registered should always be the leftmost tab.

---

## 📋 Notes for Dev

- Bug #3 interacts with the v1 fix for task #7 (multi-container card printing). The multi-card loop must only trigger for SS duplicates, not PSS sub-contracts — make sure the two flows are cleanly separated.
- For bug #4, check both the toggle (inactivate) and the delete (trash icon) — both were reported as blocked.
- Crop year field (#5) should be saved to Supabase and surfaced on the certificate output.

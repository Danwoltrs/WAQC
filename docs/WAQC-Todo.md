# WAQC – Claude Code Task List
_Updated: 26 Feb 2026 | Based on QC Manager feedback_

---

## 🔴 Bug Fixes (Priority)

### 1. Certificates – Missing Sample Number
- Certificates for Grano Trading shipments (both the Blaser Alfenas and the Dunkin' lots) are not showing the sample number on the issued certificate.
- **Fix:** Ensure the sample number field is correctly mapped, saved on Supabase, and rendered in the certificate PDF output.

### 2. Certificates – Duplicate "Hard/Riado" Taint Entry
- When two cuppers independently score the same taint at different intensity levels (e.g., one marks Hard(riado) level 2, another marks level 3), the certificate prints **two separate taint lines** instead of consolidating them.
- **Expected behavior:** Deduplicate taint entries by type. If the difference between cuppers is ≤1, show the higher value. If the difference is >1, flag it — the cuppers should discuss and the master cupper adjusts the level before the cert is issued.
- **Current output on cert #R-QC-890234/26:** Shows "Hard (riado) (3)" and "Hard (riado) (2)" as separate lines.

### 3. Clients – Duplicate "Rich Coop" Entry
- There are 2 Rich Coop records in the clients list and the user cannot delete one.
- **Fix:** Investigate why delete is failing (permissions? foreign key constraint?). Add proper error feedback if deletion is blocked due to linked records, otherwise fix the delete action.
- _Note: One is tagged "Final Buyer", the other has a different role — confirm whether they're genuinely duplicates or should be merged._

### 4. Cupping – Flavor/Bebida Score Aggregation Logic
- In both Dunkin' and Alfenas cupping sheets, the bebida/flavor score is being averaged incorrectly across cuppers.
- **Expected behavior:** Apply a 0.5 threshold — if all cuppers are within 0.5 of each other, average is fine. If the spread exceeds 0.5, flag it so the master cupper discusses with the other cuppers and sets the final score manually.
- **Fix:** Review and reimplement the aggregation logic for flavor/bebida with this threshold rule.

### 5. Defects & Screens – Zero Value Display
- Defect counts and screen percentages with a value of zero are not displaying correctly (likely rendering as blank or null).
- **Fix:** Ensure `0` values render explicitly as `0` in both the UI and certificate output.

### 6. Sample Intake – Duplicate Contract Number Blocks Registration
- When registering multiple samples that share the same exporter contract number (real scenario: Cooxupe ships multiple containers under one contract), the system throws:
  `"duplicate key value violates unique constraint idx_unique_exporter_sample_number"`
- This makes it impossible to register samples individually for each container.
- **Fix:** The unique constraint on `(exporter, sample_number)` is too strict for this use case. Revise to allow multiple samples under the same contract number, differentiating by container number or an auto-incremented suffix.

### 7. Sample Intake – Multi-Container Registration Only Prints 1 Card
- When registering 1 sample and adding 2 extra containers via the intake form (the "+ Add Sub-Contracts" flow), the system saves all 3 containers correctly and they show up in the UI — but when printing the sample card, only 1 card is generated.
- **Fix:** The card print logic needs to loop over all containers and generate one card per container (or a multi-container card, depending on the intended design).

---

## 🟡 Search & Filter Improvements

### 8. Certificates – Expand Search Scope
- Current search is limited to certificate number only.
- **Requested:** Free-text search across **Wolthers contract number, client name, sample number, seller/shipper**.
- _Example: typing "41427" should surface all certs tied to that Wolthers contract._

### 9. Certificates – Add Quality Sub-filter When Filtering by Client
- When filtering by client (e.g., Blaser), add a secondary filter for **quality** (e.g., "Alfenas Dulce", "NY 2/3", etc.).
- Could be a cascading dropdown or a free-text quality field in the filter bar.

### 10. Sample Tracking – Expand Search Scope
- Search should work across **tracking number, supplier, contract, ICO, container, and sample number**.
- Sample number search is currently missing — add it to the search index.

---

## 🟢 UX / Feature Improvements

### 11. Cupping – Allow Manual Text Input on All Cupping Tables
- On any cupping table, users want to type scores directly instead of only using +/− buttons.
- For scales that use descriptive labels (e.g., bebida), show the numeric score in the input field AND display the label alongside it (e.g., input shows `5`, label next to it shows `Hardish`).
- **Fix:** Make score inputs editable text fields, keep +/− as helpers.

### 12. Cupping – Add Flavor Descriptor Field (General Cupping)
- For general cupping (non-Dunkin'), add an additional select field next to the Flavor attribute to record the flavor descriptor.
- _Example: Flavor score = 3, descriptor = "Rio"._
- Descriptor options mirror the existing Dunkin' bebida dropdown: Special, S.Soft, Soft, Softish, Hard, Hardish, Rioy, Rioy/Rio, Rio, Strong Rio.
- This field should also appear on the certificate output.

---

## 📋 Notes for Dev

- Certs **#R-QC-890233/26** and **#R-QC-890234/26** → test cases for bugs #1 and #2.
- Cert **#BR-025816/26** (Dunkin'/Cocatrel) → test case for bug #4.
- Cooxupe case → test cases for bugs #6 and #7 (same contract, 3 containers).
- For task #12, the bebida/flavor descriptor component already exists in the Blaser cupping form — reuse it.

### 13. Sample Tabs – Horizontal Scroll / Overflow Not Working
- When a cupping session has more than ~10 samples, the tab bar at the top cuts off and the remaining samples are not accessible (14 added, only 10 visible).
- **Fix:** Implement horizontal scrolling on the sample tab bar:
  - Auto-scroll: as the user navigates to the 3rd or 4th tab, shift the view so earlier tabs slide out to the left and new ones come into view.
  - Add left/right arrow buttons on the tab bar for manual scrolling.
  - Ensure the active/selected tab is always visible in the viewport.

### 14. Sample Intake – PSS Link Should Be Step 1, Not Step 2
- Currently the "Link to Approved Pre-Shipment Sample" option only appears on step 2 of the intake form — after the user has already manually filled in Sample Type, Laboratory, Origin, Micro-Origin, Processing Method, Certifications, and Quality Specification.
- **Problem:** All of those fields could be auto-populated from the linked PSS. By the time the user sees the link option, they've already done redundant work.
- **Fix:** Move the PSS link selector to **step 1** (first screen of the intake wizard). When a PSS is selected, auto-fill all matching fields (origin, micro-origin, quality spec, processing method, certifications, ICO number, etc.) so the user only needs to confirm or override them.

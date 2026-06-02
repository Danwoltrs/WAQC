# Master-Cupper-Gated Sample / Certificate Editing

Date: 2026-06-02
Status: Approved (pending master cupper sign-off, communicated in Portuguese)

## Goal

Restrict who can edit samples and certificates, and control which fields can be
edited and for how long after a certificate is generated.

## Decisions (locked)

1. **Who can edit:** Only **master cuppers** and **global admins**. Regular lab
   personnel can *create* samples but can never *edit* them, at any stage.
2. **Two field classes:**
   - **Lock-sensitive (quality content):** editable before a certificate exists
     and within 7 days of `certificate_generated_at`; frozen afterward.
   - **Always-editable (commercial / logistics):** editable at any time by an
     editor, with no time lock.
3. **Enforcement is server-side**, not UI-only.

## Field classification

**Always editable** (commercial / logistics — no time lock):
`seller_id, exporter_id, importer_id, roaster_id, end_client_id, client_id,
same_seller_shipper, importer_is_qc_client, supplier_type`,
all `*_contract_nr` plus `contract_number`,
`container_nr, ico_number, shipment_month, storage_position`,
bag quantities: `bags, bag_type, bag_weight_kg, bags_quantity_mt, bag_count,
equivalent_60kg_bags`,
workflow / assignment: `workflow_stage, status, assigned_to, laboratory_id`.

**Lock-sensitive** (frozen after 7 days):
`quality_spec_id, quality_name, origin, micro_origin, crop_year,
processing_method, certifications, sample_type`, and **defects** (cupping scores).

Note: bag quantities were moved to always-editable per master cupper feedback
(2026-06-02). Origin / micro-origin remain lock-sensitive (affect spec eval).

## Lock rules (unchanged from existing `check-edit-permission`)

1. `locked && scanned_at` -> content locked (locked after OCR scan).
2. `certificate_generated_at IS NULL` -> not locked (no certificate yet).
3. `certificate_generated_at + 7 days > now` -> not locked (within window).
4. otherwise -> content locked (7 days elapsed).

The lock only ever restricts **lock-sensitive** fields. Always-editable fields
are governed by the role gate alone.

## Architecture

Single source of truth: `src/lib/sample-edit-permissions.ts`
- `isSampleEditor(profile)` — `is_master_cupper || is_global_admin ||
  qc_role === 'global_admin'`.
- `LOCK_SENSITIVE_FIELDS`, `ALWAYS_EDITABLE_FIELDS` sets.
- `computeContentLock(sample)` -> `{ contentLocked, reason, lockExpiresAt, message }`.
- `authorizeSampleEdit({ profile, sample, changedFields })` ->
  `{ ok, status, error }`. Rejects non-editors (403); rejects lock-sensitive
  changes when content is locked (423/403).

### Server enforcement points

- `PATCH /api/samples/[id]` — main path (used by sample-detail modal and
  certificate-edit dialog). Loads profile + lock fields, calls
  `authorizeSampleEdit`.
- Content sub-routes require editor role and respect the lock:
  `quality-assessment` POST, `cupping-score` POST, `quality-spec` write,
  `cupping/scores/[id]` PATCH (defects — already master-cupper-gated, add lock).
- `contracts` write requires editor role only (always-editable class).

### API surface

`GET /api/cupping/check-edit-permission?sampleId=...` returns:
```
{
  isEditor: boolean,
  canEditContent: boolean,        // editor && !contentLocked
  canEditCounterparties: boolean, // editor (any time)
  canEdit: boolean,               // alias = canEditContent (back-compat)
  reason, lockExpiresAt, message
}
```

### UI

- `sample-detail-modal` & `certificate-edit-dialog`: Edit button visible only to
  editors; in edit mode, lock-sensitive inputs disabled when content is locked,
  with a "locked after 7 days" hint; always-editable inputs stay enabled.
- `cupping-grading-section`: already gated; align to the shared helper.

## Out of scope

- No new audit-trail UI (edit history already exists in the model).
- No migration — all gating is application-level (RLS unchanged).

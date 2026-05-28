# Counterparty Consolidation Plan

**Date:** 2026-05-28
**Status:** Draft — pending review
**Author:** Claude (with Daniel)
**Context:** WAQC currently maintains its own `clients`, `exporters`, `buyers`, `roasters` tables. sys.wolthers.com (same Supabase project `ojyonxplpmhvcgaycznc`) has a unified `companies` table that already contains all these counterparties (Rothfos, Minasul, Ahold, Dunkin, etc.) with role tagging via `trading_roles[]` and `company_types[]`. The duplication forces lab staff to re-register companies that already exist on the trading side, and causes the contract-link auto-resolve to fail (e.g. seller "Rothfos GMBH" not found in WAQC.exporters).

---

## 1. Goals

- Single source of truth for counterparty data across sys.wolthers.com and qc.wolthers.com.
- When a contract is created on sys with `wa_qc_approved = true`, sample intake on WAQC resolves seller/buyer/exporter automatically from `companies` — no re-registration.
- WAQC-specific settings (cert pattern, pricing model, billing basis, quality specs, notification emails) preserved without polluting `companies`.
- Backward-compatible during transition so nothing breaks mid-migration.

## 2. Current state (verified)

### sys.wolthers.com — `companies` table
Single canonical entity. Relevant columns:
- `id UUID`, `name`, `fantasy_name`, address, contact fields
- `trading_roles CompanyRole[]` — `'buyer' | 'seller' | 'freight_forwarder' | 'qc_client'`
- `company_types CompanyType[]` — `'coop' | 'exporter' | 'multinational' | 'local' | 'trader' | 'single_estate' | 'farm'`
- `is_qc_client BOOLEAN` — already populated for Ahold etc.; not set for final buyers like Dunkin
- `certifications[]`, `flo_id`, `eudr_status`, `domains[]`
- `legacy_client_id INTEGER` — backwards compat with old numeric IDs
- `logo_url`, `is_active`

### WAQC counterparty tables
| Table | FK columns pointing to it |
|---|---|
| `clients` | `samples.client_id`, `samples.end_client_id`, `client_qualities.client_id`, `certificates` (via samples), `certificate_sequences.client_id`, `exporters.client_id`, `roasters.client_id`, `profiles.client_id` |
| `exporters` | `samples.seller_id`, `samples.exporter_id` (two FKs both pointing here) |
| `buyers` | `samples.buyer_id`, `samples.importer_id` |
| `roasters` | `samples.roaster_id` |

### Pre-existing partial work
- Migration `011_extend_clients_table.sql` already added `clients.company_id UUID REFERENCES companies(id)` — **but** the column is unpopulated and the accompanying `client_search_view` is **broken** because it references columns (`c.category`, `c.subcategories`, `c.admin_approval_required`) that no longer exist on the current `companies` schema.
- `clients.legacy_client_id` exists, matching `companies.legacy_client_id` — useful for backfill.

### WAQC-specific client fields (cannot live on `companies`)
- `qc_enabled` (overlaps with `companies.is_qc_client` — needs reconciliation)
- `default_quality_specs UUID[]`
- `certificate_pattern JSONB`
- `certificate_config JSONB`
- `pricing_model`, `billing_basis`
- `notification_emails TEXT[]`
- `vat_number`, `address fields` (companies has these too — pick one)
- `client_types client_type[]` (overlaps with `companies.company_types`)

## 3. Target architecture

```
companies (sys.wolthers.com - canonical)
   ├─ id, name, trading_roles[], company_types[], is_qc_client, ...
   │
   ├─ qc_client_settings (WAQC-only side table) [NEW]
   │     ├─ company_id UUID PK → companies(id)
   │     ├─ default_quality_specs UUID[]
   │     ├─ certificate_pattern JSONB
   │     ├─ certificate_config JSONB
   │     ├─ pricing_model
   │     ├─ billing_basis
   │     └─ notification_emails TEXT[]
   │
   └─ all WAQC FKs (samples.client_id, samples.exporter_id, etc.) → companies(id)
```

Legacy WAQC tables (`clients`, `exporters`, `buyers`, `roasters`) become either:
- **Backwards-compat views** over `companies` filtered by role/type (transitional), OR
- **Dropped entirely** once all code is migrated.

## 4. Migration phases

### Phase 0 — Pre-flight (no code changes)
- [x] Sample + cert nuke (done — clean slate).
- [ ] Audit: list every `companies` row that has `is_qc_client = true`. Confirm with Daniel which final buyers (Dunkin etc.) need the flag added.
- [ ] Confirm RLS on `companies`: WAQC authenticated users need at least `SELECT`. May already be the case since sys.wolthers.com users overlap.

### Phase 1 — Add side table for WAQC-only settings
New migration `database/migrations/20260601000000_create_qc_client_settings.sql`:

```sql
CREATE TABLE IF NOT EXISTS qc_client_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  default_quality_specs UUID[] DEFAULT '{}',
  certificate_pattern JSONB DEFAULT '{}'::jsonb,
  certificate_config JSONB DEFAULT '{}'::jsonb,
  pricing_model pricing_model DEFAULT 'per_sample',
  billing_basis billing_basis DEFAULT 'approved_only',
  notification_emails TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE qc_client_settings ENABLE ROW LEVEL SECURITY;
-- RLS policies: QC staff full access; clients read-only on their own row
```

### Phase 2 — Backfill `clients.company_id`
For every row in WAQC `clients`, find the matching `companies` row and populate `company_id`.

Matching strategy (in priority order):
1. `clients.legacy_client_id = companies.legacy_client_id` (cleanest)
2. Exact `LOWER(TRIM(name))` match
3. Email domain match (fallback)
4. Manual review for anything unmatched

Migration `20260601001000_backfill_clients_company_id.sql`:
```sql
-- Strategy 1: legacy_client_id
UPDATE clients c
SET company_id = co.id
FROM companies co
WHERE c.company_id IS NULL
  AND c.legacy_client_id IS NOT NULL
  AND co.legacy_client_id = c.legacy_client_id;

-- Strategy 2: exact name
UPDATE clients c
SET company_id = co.id
FROM companies co
WHERE c.company_id IS NULL
  AND LOWER(TRIM(c.name)) = LOWER(TRIM(co.name));

-- Report unmatched
-- SELECT id, name FROM clients WHERE company_id IS NULL;
```

After backfill, Daniel manually resolves remaining unmatched rows (likely a small handful).

### Phase 3 — Migrate WAQC-only settings into side table
```sql
INSERT INTO qc_client_settings (company_id, default_quality_specs, certificate_pattern, certificate_config, pricing_model, billing_basis, notification_emails)
SELECT
  company_id,
  default_quality_specs,
  certificate_pattern,
  certificate_config,
  pricing_model,
  billing_basis,
  notification_emails
FROM clients
WHERE company_id IS NOT NULL
  AND qc_enabled = true
ON CONFLICT (company_id) DO UPDATE SET ...;
```

Also: ensure every clients-with-qc_enabled has its `companies.is_qc_client = true`:
```sql
UPDATE companies co
SET is_qc_client = true
FROM clients c
WHERE c.company_id = co.id
  AND c.qc_enabled = true
  AND co.is_qc_client = false;
```

### Phase 4 — Repoint FKs (the big one)
For each WAQC FK column, add a new `_company_id` column pointing to `companies`, backfill from the old FK chain, then later drop the old column.

Example for `samples.client_id`:
```sql
ALTER TABLE samples ADD COLUMN client_company_id UUID REFERENCES companies(id);

UPDATE samples s
SET client_company_id = c.company_id
FROM clients c
WHERE s.client_id = c.id;

-- After code migration is done:
-- ALTER TABLE samples DROP COLUMN client_id;
-- ALTER TABLE samples RENAME COLUMN client_company_id TO client_id;
```

Do the same for: `samples.end_client_id`, `samples.seller_id`, `samples.exporter_id`, `samples.buyer_id`, `samples.importer_id`, `samples.roaster_id`, `client_qualities.client_id`, `certificate_sequences.client_id`.

For `exporters` / `buyers` / `roasters` — since these aren't keyed by `company_id` yet, we need a matching strategy similar to Phase 2 first (exact name match against `companies` where appropriate role/type).

### Phase 5 — Compat views (optional, eases code migration)
Replace physical `exporters` / `buyers` / `roasters` tables with views over `companies`:

```sql
DROP TABLE exporters CASCADE; -- after FKs are repointed
CREATE VIEW exporters AS
SELECT
  id,
  name,
  country,
  -- ... mapped columns
FROM companies
WHERE 'seller' = ANY(trading_roles)
   OR 'exporter' = ANY(company_types);
```

Code that does `from('exporters').select(...)` continues to work. Inserts/updates would need to go to `companies` directly (views aren't writable without rules), so this is read-only compat. New code should query `companies` directly.

### Phase 6 — Code migration
- Update API routes: `/api/clients`, `/api/exporters`, `/api/buyers`, `/api/roasters` → query `companies` filtered by `trading_roles` / `company_types` / `is_qc_client`.
- Update React components: importer dropdown, seller dropdown, exporter dropdown all source from `companies`.
- Update intake form supply-chain step to resolve from `companies`.
- Update sample list joins.
- Update memory note about "seller_id + exporter_id both reference exporters table" → "both reference companies(id)".

### Phase 7 — Drop legacy tables
Once code is fully migrated and views are no longer needed:
- Drop `exporters`, `buyers`, `roasters` tables.
- Either drop `clients` table or keep it as a thin "QC enrollment marker" — TBD with Daniel.
- Fix or drop the broken `client_search_view`.

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Unmatched companies during backfill (typos, defunct entities) | Medium | Phase 2 ends with manual review of unmatched rows before moving forward. |
| RLS blocking WAQC user reads on `companies` | High | Audit + add explicit policy in Phase 0. Test with a non-admin QC user. |
| sys.wolthers.com renames/deletes a company mid-migration | Low | Both systems share the same DB — sys engineering should be looped in before Phase 4. |
| WAQC code expects writable `exporters` table (inserts of new exporters) | Medium | Phase 5 compat views are read-only. Audit all `INSERT INTO exporters` writers before dropping the table; redirect them to `companies` inserts. |
| `qc_enabled` vs `is_qc_client` divergence — which is authoritative? | Medium | Decide in Phase 0. Recommend `companies.is_qc_client` as authoritative going forward; `qc_enabled` becomes a derived field or is dropped. |
| `client_search_view` is already broken (refs missing columns) | Low | Drop it in Phase 1 if no code uses it; otherwise rewrite to use current `companies` schema. |
| Contract auto-link feature being built in parallel — may write to legacy tables | Medium | Coordinate sequencing: counterparty consolidation lands before contract-queue feature is built. |

## 6. Open questions for Daniel

1. **`qc_enabled` vs `is_qc_client`** — which wins? Recommend dropping `qc_enabled` and using `companies.is_qc_client` as the single source of truth.
2. **Final buyers as QC clients** — Dunkin etc. don't currently have `is_qc_client = true` on sys. Should we set the flag, or keep "final buyer" as a separate concept (`samples.end_client_id` distinct from `samples.client_id`)?
3. **`clients` table fate** — drop entirely (replace with `qc_client_settings`), or keep as a thin "QC enrollment" wrapper for historical FK stability?
4. **Migration cadence** — Phases 1–3 are safe and reversible. Phases 4–7 touch every API route and component. Single big-bang or feature-by-feature?
5. **Who owns `companies` writes** — currently sys.wolthers.com presumably owns this. Does WAQC ever need to *create* a new company (e.g., a producer that only appears in QC samples and never in a trade)? If yes, we need write access + a "draft / unverified" flag.

## 7. Sequencing relative to other in-flight work

- ✅ Cert + sample nuke — done.
- ⏳ sys.wolthers.com adds `wa_qc_approved` to contracts (column equivalent already on inquiries).
- ⏳ **This consolidation** — should land before:
  - Contract queue page on WAQC (needs counterparties to resolve cleanly).
  - Auto-import of samples from approved contracts.

## 8. Estimated effort

- Phases 0–3 (data prep, side table, backfill): ~1 day, mostly SQL.
- Phase 4 (FK repointing migrations): ~1 day, mechanical.
- Phase 5–6 (compat views + code migration): ~3–5 days depending on how many components touch these tables.
- Phase 7 (cleanup): ~half day.

Total: roughly 1 week of focused work, assuming Daniel can answer the open questions quickly and applies migrations as we go.

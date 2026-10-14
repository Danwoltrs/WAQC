# Client Portal Accounts — Part B: Gate, QC access table, invitations, email (Tasks 8–11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read first: the plan index `docs/superpowers/plans/2026-10-14-client-portal-accounts.md` and the spec `docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md`. Part A must be done (Tasks 2, 6, 7 provide `qc-keys.ts`, `new-profile.ts`, `access-kind.ts`; Task 3 was dropped by ruling R11).

**Ruling R11 (2026-10-14):** QC access lives in WAQC's own table `qc_portal_access` (Task 9 creates it), never in sys's `external_user_company_grants`. sys opens a company's data to anyone who has a grant row for it, whatever keys the row holds, so a grant row holding only `qc_` keys would leak sys data. Identity stays on sys's model (`auth.users` + `user_profiles`, `user_type = 'external'`).

---

### Task 8: Portal gate `requireQcPortal`

QC access comes only from the person's rows in WAQC's own table `qc_portal_access`: one row per person and company, holding only `qc_` keys (ruling R11 of 2026-10-14; the table is created by Task 9's SQL). The gate never reads sys's company grants: a person's sys grants neither open nor close the QC portal. The QC company admin is `qc_manage_users` in the row's `capabilities`; sys's `manage_users` plays no part.

**Files:**
- Create: `src/lib/portal/qc-portal-gate.ts`, `src/lib/portal/qc-portal-gate.test.ts`

**Interfaces:**
- Consumes: `AccessKind`, `accessKindForUser` (Task 7); `QC_VIEWS`, `QC_MANAGE_USERS`, `hasQcView`, `qcKeysOf`, `isCompanyAdmin`, `QcView`, `QcCapability`, `QcKeySet` (Task 2); table `qc_portal_access` (Task 9 Step 2; read at run time only, the unit tests need no database).
- Produces:
  - `interface QcAccessRow { company_id: string; views: string[] | null; capabilities: string[] | null }`
  - `interface PortalNeed { view?: QcView; capability?: QcCapability | typeof QC_MANAGE_USERS; write?: boolean }`
  - `type PortalAccessDecision = { ok: true; companyId: string; keys: QcKeySet; isCompanyAdmin: boolean; isStaffViewAs: boolean } | { ok: false; status: 400 | 401 | 403; error: string }`
  - `evaluatePortalAccess(input: { signedIn: boolean; kind: AccessKind; userStatus: string | null; requestedCompanyId: string | null; access: QcAccessRow[]; need: PortalNeed }): PortalAccessDecision`
  - `interface QcPortalContext { userId: string; companyId: string; keys: QcKeySet; isCompanyAdmin: boolean; isStaffViewAs: boolean; admin: SupabaseClient<any> }`
  - `requireQcPortal(request: Request, need?: PortalNeed): Promise<{ ok: true; ctx: QcPortalContext } | { ok: false; response: NextResponse }>` — company from `?company=`
  - `portalServiceClient(): SupabaseClient<any>` (throws when the service key is missing)
  - `isUuid(value: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/qc-portal-gate.test.ts
import { describe, expect, it } from 'vitest'
import { evaluatePortalAccess, type QcAccessRow } from './qc-portal-gate'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const rowA: QcAccessRow = { company_id: A, views: ['qc_samples', 'qc_certificates'], capabilities: ['qc_cupping_score'] }
const adminRowB: QcAccessRow = { company_id: B, views: ['qc_samples'], capabilities: ['qc_manage_users'] }
const noViewC: QcAccessRow = { company_id: C, views: [], capabilities: ['qc_spec_edit'] }

const base = { signedIn: true, kind: 'external' as const, userStatus: 'active', requestedCompanyId: null, access: [rowA], need: {} }

describe('evaluatePortalAccess', () => {
  it('401 when not signed in', () => {
    expect(evaluatePortalAccess({ ...base, signedIn: false })).toMatchObject({ ok: false, status: 401 })
  })

  it('picks the only QC company when none is asked for', () => {
    expect(evaluatePortalAccess({ ...base, access: [rowA, noViewC] })).toEqual({
      ok: true, companyId: A, keys: { views: ['qc_samples', 'qc_certificates'], capabilities: ['qc_cupping_score'] },
      isCompanyAdmin: false, isStaffViewAs: false,
    })
  })

  it('asks to choose when there are several QC companies', () => {
    expect(evaluatePortalAccess({ ...base, access: [rowA, adminRowB] })).toMatchObject({ ok: false, status: 400 })
    expect(evaluatePortalAccess({ ...base, access: [rowA, adminRowB], requestedCompanyId: B })).toMatchObject({ ok: true, companyId: B, isCompanyAdmin: true })
  })

  it('refuses a company whose row holds no QC view, or that has no row', () => {
    expect(evaluatePortalAccess({ ...base, access: [rowA, noViewC], requestedCompanyId: C })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, requestedCompanyId: B })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, access: [noViewC] })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, access: [] })).toMatchObject({ ok: false, status: 403 })
  })

  it('400 on a malformed company id', () => {
    expect(evaluatePortalAccess({ ...base, requestedCompanyId: "x' or 1=1" })).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses an external user who is not active', () => {
    expect(evaluatePortalAccess({ ...base, userStatus: 'invited' })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, userStatus: 'disabled' })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, userStatus: null })).toMatchObject({ ok: false, status: 403 })
  })

  it('checks the view and the capability the route needs', () => {
    expect(evaluatePortalAccess({ ...base, need: { view: 'qc_certificates' } })).toMatchObject({ ok: true })
    expect(evaluatePortalAccess({ ...base, need: { view: 'qc_dashboard' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_cupping_score' } })).toMatchObject({ ok: true })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_spec_edit' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, access: [adminRowB], need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: true })
  })

  it("only qc_manage_users makes a company admin; sys's manage_users never does", () => {
    // The table's CHECK refuses non-qc_ keys; the gate would ignore one anyway.
    const stray: QcAccessRow = { company_id: B, views: ['contracts', 'qc_samples'], capabilities: ['manage_users'] }
    expect(evaluatePortalAccess({ ...base, access: [stray] })).toMatchObject({
      ok: true, isCompanyAdmin: false, keys: { views: ['qc_samples'], capabilities: [] },
    })
    expect(evaluatePortalAccess({ ...base, access: [stray], need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: false, status: 403 })
  })

  it('lets staff view any company read-only', () => {
    const staff = { ...base, kind: 'staff' as const, userStatus: null, access: [] }
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { view: 'qc_dashboard' } })).toMatchObject({
      ok: true, companyId: A, isStaffViewAs: true, isCompanyAdmin: false,
    })
    expect(evaluatePortalAccess({ ...staff })).toMatchObject({ ok: false, status: 400 })
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { write: true } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { capability: 'qc_manage_users' } })).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses everyone else', () => {
    expect(evaluatePortalAccess({ ...base, kind: 'none' })).toMatchObject({ ok: false, status: 403 })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/portal/qc-portal-gate.test.ts`
Expected: FAIL, cannot resolve `./qc-portal-gate`.

- [ ] **Step 3: Implement**

```ts
// src/lib/portal/qc-portal-gate.ts
import { NextResponse } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { accessKindForUser, type AccessKind } from '@/lib/auth/access-kind'
import {
  QC_MANAGE_USERS, QC_VIEWS, hasQcView, isCompanyAdmin, qcKeysOf,
  type QcCapability, type QcKeySet, type QcView,
} from './qc-keys'

/**
 * The one gate in front of every /api/portal/* data and team route (spec
 * §7.1). The company comes from `?company=` and is always checked against
 * the caller's rows in qc_portal_access, WAQC's own table (one row per
 * person and company, qc_ keys only; ruling R11). sys's company grants play
 * no part: they neither open nor close the QC portal. Nothing else from the
 * request names a company. Data is then read with the service role,
 * filtered by ctx.companyId.
 */

export interface QcAccessRow {
  company_id: string
  views: string[] | null
  capabilities: string[] | null
}

export interface PortalNeed {
  view?: QcView
  capability?: QcCapability | typeof QC_MANAGE_USERS
  write?: boolean
}

export type PortalAccessDecision =
  | { ok: true; companyId: string; keys: QcKeySet; isCompanyAdmin: boolean; isStaffViewAs: boolean }
  | { ok: false; status: 400 | 401 | 403; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

function fail(status: 400 | 401 | 403, error: string): PortalAccessDecision {
  return { ok: false, status, error }
}

export function evaluatePortalAccess(input: {
  signedIn: boolean
  kind: AccessKind
  userStatus: string | null
  requestedCompanyId: string | null
  access: QcAccessRow[]
  need: PortalNeed
}): PortalAccessDecision {
  if (!input.signedIn) return fail(401, 'Unauthorized')
  const { need } = input
  const requested = input.requestedCompanyId
  if (requested !== null && !isUuid(requested)) return fail(400, 'Invalid company')

  if (input.kind === 'staff') {
    if (need.write || need.capability) return fail(403, 'The staff view of the portal is read-only')
    if (!requested) return fail(400, 'Choose a company')
    return {
      ok: true,
      companyId: requested,
      keys: { views: [...QC_VIEWS], capabilities: [] },
      isCompanyAdmin: false,
      isStaffViewAs: true,
    }
  }

  if (input.kind !== 'external') return fail(403, 'No access')
  if (input.userStatus !== 'active') return fail(403, 'Your access is not active')

  // A row opens the portal only with at least one QC view.
  const open = input.access.filter(hasQcView)
  let row: QcAccessRow | undefined
  if (requested) {
    row = open.find((r) => r.company_id === requested)
    if (!row) return fail(403, 'No access to this company')
  } else if (open.length === 1) {
    row = open[0]
  } else if (open.length === 0) {
    return fail(403, 'No QC portal access')
  } else {
    return fail(400, 'Choose a company')
  }

  const keys = qcKeysOf(row)
  const admin = isCompanyAdmin(row)
  if (need.view && !keys.views.includes(need.view)) return fail(403, 'This page is not part of your access')
  if (need.capability === QC_MANAGE_USERS) {
    if (!admin) return fail(403, 'Only company admins can do this')
  } else if (need.capability && !keys.capabilities.includes(need.capability)) {
    return fail(403, 'This action is not part of your access')
  }
  return { ok: true, companyId: row.company_id, keys, isCompanyAdmin: admin, isStaffViewAs: false }
}

export function portalServiceClient(): SupabaseClient<any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role is not configured')
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface QcPortalContext {
  userId: string
  companyId: string
  keys: QcKeySet
  isCompanyAdmin: boolean
  isStaffViewAs: boolean
  admin: SupabaseClient<any>
}

export async function requireQcPortal(
  request: Request,
  need: PortalNeed = {},
): Promise<{ ok: true; ctx: QcPortalContext } | { ok: false; response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const requestedCompanyId = new URL(request.url).searchParams.get('company')
  const admin = portalServiceClient()

  let kind: AccessKind = 'none'
  let userStatus: string | null = null
  let access: QcAccessRow[] = []
  if (user) {
    kind = await accessKindForUser(admin, user.id)
    if (kind === 'external') {
      const [{ data: profile }, { data: rows }] = await Promise.all([
        admin.from('user_profiles').select('status').eq('id', user.id).maybeSingle(),
        admin.from('qc_portal_access').select('company_id, views, capabilities').eq('user_id', user.id),
      ])
      userStatus = profile?.status ?? null
      // A failed read leaves no rows: the gate then refuses (fail closed).
      access = (rows ?? []) as QcAccessRow[]
    }
  }

  const decision = evaluatePortalAccess({ signedIn: !!user, kind, userStatus, requestedCompanyId, access, need })
  if (!decision.ok) {
    return { ok: false, response: NextResponse.json({ error: decision.error }, { status: decision.status }) }
  }
  return {
    ok: true,
    ctx: {
      userId: user!.id,
      companyId: decision.companyId,
      keys: decision.keys,
      isCompanyAdmin: decision.isCompanyAdmin,
      isStaffViewAs: decision.isStaffViewAs,
      admin,
    },
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/portal/qc-portal-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/qc-portal-gate.ts src/lib/portal/qc-portal-gate.test.ts
git commit -m "feat(portal): requireQcPortal — company from the person's qc_portal_access row, keys per route, qc_manage_users for admin routes, staff view-as read-only"
```

---

### Task 9: QC access table `qc_portal_access` and its writes — `setQcAccess`, `removeQcAccess`, members

Rules this task owns (spec §5, §5.1, §6.6; ruling R11 of 2026-10-14, which replaces the earlier grant-row rules R2 and R3):
- **QC access lives in WAQC's own table `public.qc_portal_access`**, one row per person (`user_profiles.id`) and company. WAQC never reads or writes sys's `external_user_company_grants`. Why: sys opens a company's data (contracts with prices, documents, shipments) to anyone who has a grant row for that company, whatever keys the row holds (its RLS helper `current_user_company_ids()`, `/api/shipments`, `requirePortalRead` without a capability), and its group trigger copies rows to sister companies. A grant row holding only `qc_` keys would leak all of that. A person who also uses the sys portal keeps their sys grant exactly as it is; their QC access is a separate row here.
- The row holds only `qc_` keys: the table's CHECK refuses anything else, and `setQcAccess` normalizes the keys itself (`normalizeQcKeys`), so only registry keys reach the table whatever a caller passes.
- The QC company admin is `qc_manage_users` in `capabilities`. It is set or cleared only through the explicit `manageUsers` flag (staff); a write that does not mention the flag keeps what the row had. Presets and the ceiling clamp never yield it (Task 2).
- `setQcAccess` upserts the row on `(user_id, company_id)`; `created_by` is written when the row is created and kept on updates. `removeQcAccess` deletes the row. The login, the `user_profiles` row and any sys grant stay as they are.
- There are no group rows, no `source`, `group_access` or `staff_locked`, and no `manage_users` handling: none of them exist in this table.
- Code and comments in `src` never spell out sys's grant table name (Task 22 greps `src` for it and expects no hits); write "sys's company grants".
- The table is service role only (RLS on, no policies, no rights for `anon` and `authenticated`). Every reader and writer in this plan uses the service-role client.
- The last sign-in shown in member lists comes from `auth.users` through the admin API: sys's `user_profiles.last_sign_in_at` is a mirror its staff heartbeat refreshes, and it is stale for portal users (sys 0818).

**Files:**
- Create: `database/checks/20261014000006_precheck.sql`
- Create: `database/migrations/20261014000006_qc_portal_access.sql`
- Create: `src/lib/portal/qc-grants.ts`, `src/lib/portal/qc-grants.test.ts`
- Modify: `src/lib/portal/qc-keys.ts`, `src/lib/portal/qc-keys.test.ts` (drop `mergeQcKeys`, `isQcAccessRow` and `holdsQcKey`: nothing uses them any more)

**Interfaces:**
- Consumes: `QC_MANAGE_USERS`, `normalizeQcKeys`, `qcKeysOf`, `isCompanyAdmin`, `QcKeySet` (Task 2); sys tables `user_profiles`, `companies`; `auth.users`.
- Produces:
  - SQL: `public.qc_keys_only(text[]) RETURNS boolean` (IMMUTABLE); table `public.qc_portal_access (user_id uuid → user_profiles(id) ON DELETE CASCADE, company_id uuid → companies(id) ON DELETE CASCADE, views text[], capabilities text[], created_by uuid → auth.users(id) ON DELETE SET NULL, created_at, updated_at, PRIMARY KEY (user_id, company_id))`, both arrays CHECKed with `qc_keys_only`; index `qc_portal_access_company (company_id)`; RLS on, no policies, `REVOKE ALL FROM anon, authenticated`
  - `interface QcAccess { views: string[]; capabilities: string[] }`
  - `planQcAccess(existing: QcAccess | null, next: { keys: QcKeySet; manageUsers?: boolean }): QcAccess`
  - `readQcAccess(admin, userId: string, companyId: string): Promise<QcAccess | null>`
  - `setQcAccess(admin, args: { userId: string; companyId: string; keys: QcKeySet; manageUsers?: boolean; createdBy: string | null }): Promise<{ before: QcAccess | null; after: QcAccess }>`
  - `removeQcAccess(admin, args: { userId: string; companyId: string }): Promise<{ before: QcAccess | null }>` (`before: null` = there was nothing to remove)
  - `interface QcMember { userId: string; email: string | null; fullName: string | null; status: string | null; keys: QcKeySet; isCompanyAdmin: boolean; lastSignInAt: string | null }`
  - `toQcMembers(rows: any[], lastSignIns?: ReadonlyMap<string, string | null>): QcMember[]`, `listQcMembers(admin, companyId: string): Promise<QcMember[]>`

- [ ] **Step 1: The pre-check** (read-only; Daniel runs it before the migration)

```sql
-- Pre-check for 20261014000006_qc_portal_access.sql.
-- Read-only. Run it BEFORE the migration. One result set: check | value.
-- Expected: qc_portal_access absent (present when re-running), no
-- qc_keys_only function yet (1 when re-running), both id columns uuid and
-- each the whole primary key, auth.users present.

SELECT 'qc_portal_access regclass' AS check_name,
       coalesce(to_regclass('public.qc_portal_access')::text, 'absent') AS value
UNION ALL
SELECT 'pg_proc named qc_keys_only (count)',
       count(*)::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'qc_keys_only'
UNION ALL
SELECT 'user_profiles.id data type',
       coalesce((
         SELECT c.data_type FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = 'user_profiles' AND c.column_name = 'id'
       ), 'absent')
UNION ALL
SELECT 'user_profiles primary key',
       coalesce((
         SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.user_profiles') AND k.contype = 'p'
       ), 'absent')
UNION ALL
SELECT 'companies.id data type',
       coalesce((
         SELECT c.data_type FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = 'companies' AND c.column_name = 'id'
       ), 'absent')
UNION ALL
SELECT 'companies primary key',
       coalesce((
         SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.companies') AND k.contype = 'p'
       ), 'absent')
UNION ALL
SELECT 'auth.users regclass',
       coalesce(to_regclass('auth.users')::text, 'absent');
```

Save it as `database/checks/20261014000006_precheck.sql`. Expected values, in order: `absent`, `0`, `uuid`, `PRIMARY KEY (id)`, `uuid`, `PRIMARY KEY (id)`, `auth.users`. Anything else: stop and tell Daniel before the migration.

- [ ] **Step 2: The migration**

```sql
-- QC portal access (spec 2026-10-14-client-portal-accounts-design.md §5.1;
-- ruling R11 of 2026-10-14).
--
-- One row per person and company: the QC portal pages (views) and actions
-- (capabilities) that person has for that company. qc_manage_users in
-- capabilities makes them the company's QC admin. Only qc_ keys are stored.
--
-- Why WAQC's own table: sys opens a company's data (contracts with prices,
-- documents, shipments) to anyone who has a row for that company in its
-- company grants table, whatever keys the row holds, and copies rows to
-- sister companies. A grant row holding only qc_ keys would therefore open
-- sys data to a QC-only client. QC access lives here instead; WAQC never
-- reads or writes sys's grants.
--
-- Identity stays on sys's model: user_id is the person's user_profiles row
-- (user_type 'external'). Deleting the person or the company deletes their
-- QC access with it.
--
-- Service role only: RLS on, no policies, no rights for anon or
-- authenticated.
--
-- Run database/checks/20261014000006_precheck.sql first and read its result.
-- Apply together with 20261014000001, before the WAQC push.
--
-- Paste-safe for the Supabase editor; safe to run again.

-- True when every element is a QC key: qc_ followed by lowercase letters,
-- digits or underscores (the key format of src/lib/portal/qc-keys.ts). An
-- empty array passes; a NULL element does not.
CREATE OR REPLACE FUNCTION public.qc_keys_only(keys text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(bool_and(coalesce(k ~ '^qc_[a-z0-9_]+$', false)), true)
  FROM unnest(keys) AS k
$$;

CREATE TABLE IF NOT EXISTS public.qc_portal_access (
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  views text[] NOT NULL DEFAULT '{}',
  capabilities text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id),
  CONSTRAINT qc_portal_access_views_qc_only CHECK (public.qc_keys_only(views)),
  CONSTRAINT qc_portal_access_capabilities_qc_only CHECK (public.qc_keys_only(capabilities))
);

CREATE INDEX IF NOT EXISTS qc_portal_access_company
  ON public.qc_portal_access (company_id);

COMMENT ON TABLE public.qc_portal_access IS
  'WAQC QC portal access: one row per person and company, qc_ keys only (qc_manage_users = QC company admin). Not a sys company grant and gives no sys access. Service role only. Owned by WAQC (qc.wolthers.com).';

ALTER TABLE public.qc_portal_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qc_portal_access FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qc_portal_access TO service_role;

-- Let the REST API see the new table straight away.
NOTIFY pgrst, 'reload schema';

-- Verification: one row per check, every ok = true.
SELECT 'qc_portal_access exists' AS check_name,
       to_regclass('public.qc_portal_access') IS NOT NULL AS ok
UNION ALL
SELECT 'primary key is (user_id, company_id)',
       EXISTS (
         SELECT 1 FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.qc_portal_access')
           AND k.contype = 'p'
           AND pg_get_constraintdef(k.oid) = 'PRIMARY KEY (user_id, company_id)'
       )
UNION ALL
SELECT 'user_id references user_profiles, ON DELETE CASCADE',
       EXISTS (
         SELECT 1 FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.qc_portal_access')
           AND k.contype = 'f'
           AND k.confrelid = to_regclass('public.user_profiles')
           AND k.confdeltype = 'c'
       )
UNION ALL
SELECT 'company_id references companies, ON DELETE CASCADE',
       EXISTS (
         SELECT 1 FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.qc_portal_access')
           AND k.contype = 'f'
           AND k.confrelid = to_regclass('public.companies')
           AND k.confdeltype = 'c'
       )
UNION ALL
SELECT 'created_by references auth.users, ON DELETE SET NULL',
       EXISTS (
         SELECT 1 FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.qc_portal_access')
           AND k.contype = 'f'
           AND k.confrelid = to_regclass('auth.users')
           AND k.confdeltype = 'n'
       )
UNION ALL
SELECT 'views and capabilities are CHECKed for qc_ keys only',
       (
         SELECT count(*) FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.qc_portal_access')
           AND k.contype = 'c'
           AND k.conname IN ('qc_portal_access_views_qc_only', 'qc_portal_access_capabilities_qc_only')
       ) = 2
UNION ALL
SELECT 'qc_keys_only accepts qc_ keys and refuses anything else',
       public.qc_keys_only(ARRAY['qc_samples', 'qc_manage_users'])
       AND public.qc_keys_only(ARRAY[]::text[])
       AND NOT public.qc_keys_only(ARRAY['qc_samples', 'contracts'])
       AND NOT public.qc_keys_only(ARRAY['manage_users'])
       AND NOT public.qc_keys_only(ARRAY['qc_samples', NULL])
UNION ALL
SELECT 'index on company_id',
       EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'qc_portal_access' AND indexname = 'qc_portal_access_company'
       )
UNION ALL
SELECT 'RLS on',
       coalesce((SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.qc_portal_access')), false)
UNION ALL
SELECT 'no policies',
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'qc_portal_access')
UNION ALL
SELECT 'anon has no rights',
       NOT has_table_privilege('anon', 'public.qc_portal_access', 'SELECT,INSERT,UPDATE,DELETE')
UNION ALL
SELECT 'authenticated has no rights',
       NOT has_table_privilege('authenticated', 'public.qc_portal_access', 'SELECT,INSERT,UPDATE,DELETE')
UNION ALL
SELECT 'service_role reads and writes',
       has_table_privilege('service_role', 'public.qc_portal_access', 'SELECT')
       AND has_table_privilege('service_role', 'public.qc_portal_access', 'INSERT')
       AND has_table_privilege('service_role', 'public.qc_portal_access', 'UPDATE')
       AND has_table_privilege('service_role', 'public.qc_portal_access', 'DELETE');
```

Save it as `database/migrations/20261014000006_qc_portal_access.sql`. Lint both files: `grep -n -i '\binto\b' database/checks/20261014000006_precheck.sql database/migrations/20261014000006_qc_portal_access.sql` → no hits. Commit the SQL on its own, so the controller can hand it to Daniel at once:

```bash
git add database/checks/20261014000006_precheck.sql database/migrations/20261014000006_qc_portal_access.sql
git commit -m "feat(db): qc_portal_access — QC portal access in WAQC's own table, qc_ keys only, service role only (sys gates data on grant rows)"
```

Tell the controller: Daniel runs the pre-check, then applies `20261014000006` together with `20261014000001`, before the WAQC push. Every verification row must say `ok = true`.

- [ ] **Step 3: Write the failing test**

```ts
// src/lib/portal/qc-grants.test.ts
import { describe, expect, it } from 'vitest'
import { listQcMembers, planQcAccess, removeQcAccess, setQcAccess, toQcMembers } from './qc-grants'

/**
 * Records every call. `existing` answers maybeSingle (readQcAccess), `rows`
 * an awaited select (listQcMembers), `deleted` an awaited delete().select().
 * auth.admin.getUserById answers from `signIns`, or with an error when
 * `failSignIn` is set.
 */
function fakeAdmin(opts: {
  existing?: any
  rows?: any[]
  deleted?: any[]
  signIns?: Record<string, string | null>
  failSignIn?: boolean
} = {}) {
  const calls: any[] = []
  return {
    calls,
    auth: {
      admin: {
        getUserById: async (id: string) =>
          opts.failSignIn
            ? { data: { user: null }, error: { message: 'auth down' } }
            : { data: { user: { id, last_sign_in_at: opts.signIns?.[id] ?? null } }, error: null },
      },
    },
    from(table: string) {
      const call: any = { table, op: 'select', filters: [] }
      calls.push(call)
      const chain: any = {
        select(columns?: string) { call.columns = columns; return chain },
        upsert(values: any, options: any) { call.op = 'upsert'; call.values = values; call.options = options; return chain },
        delete() { call.op = 'delete'; return chain },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return chain },
        maybeSingle() { return Promise.resolve({ data: opts.existing ?? null, error: null }) },
        then(ok: any, bad: any) {
          const data = call.op === 'delete' ? opts.deleted ?? [] : call.op === 'select' ? opts.rows ?? [] : null
          return Promise.resolve({ data, error: null }).then(ok, bad)
        },
      }
      return chain
    },
  } as any
}

describe('planQcAccess', () => {
  it('writes both arrays explicitly', () => {
    expect(planQcAccess(null, { keys: { views: ['qc_samples'], capabilities: [] } })).toEqual({ views: ['qc_samples'], capabilities: [] })
  })

  it('keeps only registry QC keys, whatever the caller passes: no sys key, no unknown key, no admin key without the flag', () => {
    const keys = {
      views: ['contracts', 'qc_reports', 'qc_samples', 'qc_samples', 'qc_unknown'],
      capabilities: ['manage_users', 'qc_manage_users', 'see_prices', 'qc_spec_edit'],
    } as any
    expect(planQcAccess(null, { keys })).toEqual({ views: ['qc_samples', 'qc_reports'], capabilities: ['qc_spec_edit'] })
  })

  it('adds qc_manage_users for a staff-made company admin', () => {
    expect(planQcAccess(null, { keys: { views: ['qc_samples'], capabilities: ['qc_spec_edit'] }, manageUsers: true }).capabilities)
      .toEqual(['qc_spec_edit', 'qc_manage_users'])
  })

  it('keeps qc_manage_users when the write does not mention it, and clears it only when told', () => {
    const existing = { views: ['qc_samples'], capabilities: ['qc_manage_users'] }
    expect(planQcAccess(existing, { keys: { views: ['qc_samples'], capabilities: [] } }).capabilities).toEqual(['qc_manage_users'])
    expect(planQcAccess(existing, { keys: { views: ['qc_samples'], capabilities: [] }, manageUsers: false }).capabilities).toEqual([])
  })
})

describe('setQcAccess', () => {
  it('creates the row with both arrays, the creator and a timestamp, and touches no other table', async () => {
    const admin = fakeAdmin()
    const result = await setQcAccess(admin, {
      userId: 'u1', companyId: 'co-1', keys: { views: ['qc_samples'], capabilities: [] }, manageUsers: true, createdBy: 'staff-1',
    })
    expect(admin.calls[0]).toMatchObject({ op: 'select', filters: [['user_id', 'u1'], ['company_id', 'co-1']] })
    const write = admin.calls.find((c: any) => c.op === 'upsert')
    expect(write.values).toEqual({
      user_id: 'u1', company_id: 'co-1', views: ['qc_samples'], capabilities: ['qc_manage_users'],
      updated_at: expect.any(String), created_by: 'staff-1',
    })
    expect(write.options).toEqual({ onConflict: 'user_id,company_id' })
    expect(result).toEqual({ before: null, after: { views: ['qc_samples'], capabilities: ['qc_manage_users'] } })
    expect(new Set(admin.calls.map((c: any) => c.table))).toEqual(new Set(['qc_portal_access']))
  })

  it('updates an existing row: new keys, the admin flag kept, the creator kept', async () => {
    const admin = fakeAdmin({ existing: { views: ['qc_samples'], capabilities: ['qc_manage_users'] } })
    const result = await setQcAccess(admin, {
      userId: 'u1', companyId: 'co-1', keys: { views: ['qc_samples', 'qc_reports'], capabilities: ['qc_cupping_score'] }, createdBy: 'm-1',
    })
    const write = admin.calls.find((c: any) => c.op === 'upsert')
    expect(write.values).not.toHaveProperty('created_by')
    expect(write.values).toMatchObject({ views: ['qc_samples', 'qc_reports'], capabilities: ['qc_cupping_score', 'qc_manage_users'] })
    expect(result.before).toEqual({ views: ['qc_samples'], capabilities: ['qc_manage_users'] })
  })
})

describe('removeQcAccess', () => {
  it('deletes the row and reports what it held', async () => {
    const admin = fakeAdmin({ deleted: [{ views: ['qc_samples'], capabilities: ['qc_manage_users'] }] })
    expect(await removeQcAccess(admin, { userId: 'u1', companyId: 'co-1' }))
      .toEqual({ before: { views: ['qc_samples'], capabilities: ['qc_manage_users'] } })
    expect(admin.calls).toHaveLength(1)
    expect(admin.calls[0]).toMatchObject({ table: 'qc_portal_access', op: 'delete', filters: [['user_id', 'u1'], ['company_id', 'co-1']] })
  })

  it('reports nothing removed when there was no row', async () => {
    expect(await removeQcAccess(fakeAdmin({ deleted: [] }), { userId: 'u1', companyId: 'co-1' })).toEqual({ before: null })
  })
})

describe('members', () => {
  const rows = [
    { user_id: 'u2', views: ['qc_samples'], capabilities: ['qc_manage_users'], user_profiles: { email: 'b@c.com', full_name: 'Bea', status: 'active' } },
    { user_id: 'u1', views: ['qc_samples'], capabilities: ['qc_spec_edit'], user_profiles: { email: 'a@c.com', full_name: 'Ana', status: 'active' } },
    { user_id: 'u3', views: [], capabilities: [], user_profiles: null },
  ]

  it('lists every row of the company, sorted by name, with keys, the admin flag and the last sign-in', () => {
    const members = toQcMembers(rows, new Map([['u1', '2026-10-01T00:00:00Z']]))
    expect(members.map((m) => [m.userId, m.isCompanyAdmin, m.lastSignInAt])).toEqual([
      ['u3', false, null], ['u1', false, '2026-10-01T00:00:00Z'], ['u2', true, null],
    ])
    expect(members[1]).toEqual({
      userId: 'u1', email: 'a@c.com', fullName: 'Ana', status: 'active',
      keys: { views: ['qc_samples'], capabilities: ['qc_spec_edit'] }, isCompanyAdmin: false, lastSignInAt: '2026-10-01T00:00:00Z',
    })
  })

  it("reads the company's rows with their profiles, and the last sign-in from the auth admin API", async () => {
    const admin = fakeAdmin({ rows: rows.slice(0, 2), signIns: { u2: '2026-10-10T00:00:00Z' } })
    const members = await listQcMembers(admin, 'co-1')
    expect(admin.calls[0]).toMatchObject({ table: 'qc_portal_access', op: 'select', filters: [['company_id', 'co-1']] })
    expect(admin.calls[0].columns).toContain('user_profiles(')
    expect(members.find((m) => m.userId === 'u2')?.lastSignInAt).toBe('2026-10-10T00:00:00Z')
    expect(new Set(admin.calls.map((c: any) => c.table))).toEqual(new Set(['qc_portal_access']))
  })

  it('a failed sign-in lookup leaves the date empty instead of failing the list', async () => {
    const admin = fakeAdmin({ rows: rows.slice(0, 1), failSignIn: true })
    expect((await listQcMembers(admin, 'co-1'))[0].lastSignInAt).toBeNull()
  })
})
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run src/lib/portal/qc-grants.test.ts`
Expected: FAIL, cannot resolve `./qc-grants`.

- [ ] **Step 5: Implement**

```ts
// src/lib/portal/qc-grants.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { QC_MANAGE_USERS, isCompanyAdmin, normalizeQcKeys, qcKeysOf, type QcKeySet } from './qc-keys'

/**
 * QC portal access (spec §5.1, ruling R11 of 2026-10-14): one row per person
 * and company in WAQC's own table qc_portal_access, holding only qc_ keys.
 *
 * WAQC never reads or writes sys's company grants. sys opens a company's
 * data to anyone who has a grant row for it, whatever keys the row holds, so
 * a QC-only grant row would leak sys data. A person who also uses the sys
 * portal keeps their sys grant exactly as it is; their QC access is this row.
 *
 *   * QC company admin = qc_manage_users in capabilities, set or cleared only
 *     by the explicit manageUsers flag (staff). A write that does not mention
 *     the flag keeps what the row had.
 *   * Keys are normalized here as well, so only registry keys reach the
 *     table (its CHECK refuses anything that is not a qc_ key).
 *   * Removing access deletes the row. The login, user_profiles and any sys
 *     grant stay.
 *   * Service role only: the table has RLS on and no policies.
 */

const TABLE = 'qc_portal_access'

export interface QcAccess {
  views: string[]
  capabilities: string[]
}

function accessOf(row: { views?: string[] | null; capabilities?: string[] | null }): QcAccess {
  return { views: row.views ?? [], capabilities: row.capabilities ?? [] }
}

export function planQcAccess(existing: QcAccess | null, next: { keys: QcKeySet; manageUsers?: boolean }): QcAccess {
  const keys = normalizeQcKeys(next.keys)
  const admin = next.manageUsers ?? (existing ? isCompanyAdmin(existing) : false)
  return {
    views: [...keys.views],
    capabilities: admin ? [...keys.capabilities, QC_MANAGE_USERS] : [...keys.capabilities],
  }
}

export async function readQcAccess(admin: SupabaseClient<any>, userId: string, companyId: string): Promise<QcAccess | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select('views, capabilities')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) throw error
  return data ? accessOf(data) : null
}

export async function setQcAccess(
  admin: SupabaseClient<any>,
  args: { userId: string; companyId: string; keys: QcKeySet; manageUsers?: boolean; createdBy: string | null },
): Promise<{ before: QcAccess | null; after: QcAccess }> {
  const before = await readQcAccess(admin, args.userId, args.companyId)
  const after = planQcAccess(before, { keys: args.keys, manageUsers: args.manageUsers })
  const { error } = await admin.from(TABLE).upsert(
    {
      user_id: args.userId,
      company_id: args.companyId,
      views: after.views,
      capabilities: after.capabilities,
      updated_at: new Date().toISOString(),
      // created_by records who first gave access; an update keeps it.
      ...(before ? {} : { created_by: args.createdBy }),
    },
    { onConflict: 'user_id,company_id' },
  )
  if (error) throw error
  return { before, after }
}

export async function removeQcAccess(
  admin: SupabaseClient<any>,
  args: { userId: string; companyId: string },
): Promise<{ before: QcAccess | null }> {
  const { data, error } = await admin
    .from(TABLE)
    .delete()
    .eq('user_id', args.userId)
    .eq('company_id', args.companyId)
    .select('views, capabilities')
  if (error) throw error
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null
  return { before: row ? accessOf(row) : null }
}

export interface QcMember {
  userId: string
  email: string | null
  fullName: string | null
  status: string | null
  keys: QcKeySet
  isCompanyAdmin: boolean
  lastSignInAt: string | null
}

export function toQcMembers(rows: any[], lastSignIns: ReadonlyMap<string, string | null> = new Map()): QcMember[] {
  return rows
    .map((row) => ({
      userId: row.user_id as string,
      email: row.user_profiles?.email ?? null,
      fullName: row.user_profiles?.full_name ?? null,
      status: row.user_profiles?.status ?? null,
      keys: qcKeysOf(row),
      isCompanyAdmin: isCompanyAdmin(row),
      lastSignInAt: lastSignIns.get(row.user_id) ?? null,
    }))
    .sort((a, b) => (a.fullName || a.email || '').localeCompare(b.fullName || b.email || ''))
}

/**
 * auth.users.last_sign_in_at per person. sys's user_profiles copy is only
 * refreshed by its staff heartbeat, so it is stale for portal users. Never
 * throws: a failed lookup leaves the date empty.
 */
async function lastSignInsOf(admin: SupabaseClient<any>, userIds: string[]): Promise<Map<string, string | null>> {
  const entries = await Promise.all(
    userIds.map(async (id): Promise<[string, string | null]> => {
      try {
        const { data } = await admin.auth.admin.getUserById(id)
        return [id, data?.user?.last_sign_in_at ?? null]
      } catch {
        return [id, null]
      }
    }),
  )
  return new Map(entries)
}

export async function listQcMembers(admin: SupabaseClient<any>, companyId: string): Promise<QcMember[]> {
  const { data, error } = await admin
    .from(TABLE)
    .select('user_id, views, capabilities, user_profiles(email, full_name, status)')
    .eq('company_id', companyId)
  if (error) throw error
  const rows = data ?? []
  return toQcMembers(rows, await lastSignInsOf(admin, rows.map((r: any) => r.user_id as string)))
}
```

(The `user_profiles(...)` embed works because `qc_portal_access.user_id` is the table's only foreign key to `user_profiles`; `created_by` points at `auth.users`.)

- [ ] **Step 6: Drop the helpers nothing uses any more from `qc-keys.ts`**

`mergeQcKeys` (merging QC keys into a sys grant row), `isQcAccessRow` (the direct-row rule) and `holdsQcKey` (any `qc_` key on a mixed row) served sys grant rows. With QC access in its own table they have no caller (Tasks 8, 12 and 14 use `hasQcView`, a row's existence and `isCompanyAdmin`). Keep `isQcKey`: it is the TypeScript side of the table's CHECK and stays tested.

In `src/lib/portal/qc-keys.ts`, replace the header comment

```ts
/**
 * QC keys on sys's external_user_company_grants rows (spec §5). QC owns every
 * key that starts with `qc_`; sys owns every other key and never adds or
 * removes a qc_ key (sys keepForeignKeys).
 *
 * QC's company admin is `qc_manage_users`, a QC key. sys's `manage_users` is
 * sys's own: WAQC never grants it, removes it or reads it as QC admin
 * (decision 5, revised 2026-10-14 after sys D3 let any sys portal admin grant
 * manage_users). Only Wolthers staff set qc_manage_users, through the explicit
 * company-admin flag; it never comes out of normalizeQcKeys or clampQcKeys.
 */
```

with

```ts
/**
 * QC access keys (spec §5). They live in WAQC's own table qc_portal_access
 * (one row per person and company, qc_ keys only; ruling R11 of 2026-10-14),
 * never in sys's company grants: sys opens a company's data to anyone with a
 * grant row for it, so a QC-only grant row would leak sys data.
 *
 * QC's company admin is `qc_manage_users`, a QC key. sys's `manage_users` is
 * sys's own: WAQC never grants it, removes it or reads it as QC admin
 * (decision 5). Only Wolthers staff set qc_manage_users, through the explicit
 * company-admin flag; it never comes out of normalizeQcKeys or clampQcKeys.
 */
```

replace `/** The grantable QC keys a grant row holds (the admin flag is read with isCompanyAdmin). */` with `/** The grantable QC keys of a QC access row (the admin flag is read with isCompanyAdmin). */`, and `/** A grant opens the QC portal only with at least one QC view. */` with `/** A QC access row opens the portal only with at least one QC view. */`.

Then delete these three blocks entirely:

```ts
/** Any qc_ key on the row, the admin key included. */
export function holdsQcKey(grant: { views?: readonly string[] | null; capabilities?: readonly string[] | null }): boolean {
  return (grant.views ?? []).some(isQcKey) || (grant.capabilities ?? []).some(isQcKey)
}

/**
 * The only kind of row that gives QC portal access: a direct grant (not a
 * source = 'group' copy, which sys's 0770 trigger makes of a sister
 * company's grant) holding a QC view. QC access is granted per company.
 */
export function isQcAccessRow(row: {
  source?: string | null
  views?: readonly string[] | null
  capabilities?: readonly string[] | null
}): boolean {
  return row.source !== 'group' && hasQcView(row)
}

/**
 * Replace the QC part of a key array; every other key stays, in its order.
 * qc_manage_users is a QC key like any other: a caller that wants to keep it
 * passes it in nextQc.
 */
export function mergeQcKeys(existing: readonly string[] | null | undefined, nextQc: readonly string[]): string[] {
  const kept = (existing ?? []).filter((k) => !isQcKey(k))
  const qc = nextQc.filter(isQcKey)
  return [...kept, ...qc.filter((k, i) => qc.indexOf(k) === i)]
}
```

In `src/lib/portal/qc-keys.test.ts`, replace the import

```ts
import {
  QC_CAPABILITIES, QC_MANAGE_USERS, QC_PRESETS, QC_VIEWS, clampQcKeys, hasQcView, holdsQcKey, isCompanyAdmin,
  isQcAccessRow, isQcKey, mergeQcKeys, normalizeQcKeys, qcKeysOf,
} from './qc-keys'
```

with

```ts
import {
  QC_CAPABILITIES, QC_MANAGE_USERS, QC_PRESETS, QC_VIEWS, clampQcKeys, hasQcView, isCompanyAdmin, isQcKey,
  normalizeQcKeys, qcKeysOf,
} from './qc-keys'
```

and delete the whole `describe('mergeQcKeys', () => { ... })` block, the test `it('holdsQcKey sees any qc_ key, the admin key included', ...)` and the test `it('only a direct row with a QC view opens the portal; a group copy never does', ...)` (each with its closing `})`). Every other test stays as it is.

- [ ] **Step 7: Run the tests, typecheck, grep**

Run: `npx vitest run src/lib/portal/qc-grants.test.ts src/lib/portal/qc-keys.test.ts src/lib/portal/qc-portal-gate.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit -p .` → no errors.

Run: `grep -rn "mergeQcKeys\|isQcAccessRow\|holdsQcKey\|external_user_company_grants" src`
Expected: no hits.

- [ ] **Step 8: Commit**

```bash
git add src/lib/portal/qc-grants.ts src/lib/portal/qc-grants.test.ts src/lib/portal/qc-keys.ts src/lib/portal/qc-keys.test.ts
git commit -m "feat(portal): QC access writes on qc_portal_access — upsert with qc_manage_users by flag, delete on removal, members with auth last sign-in; drop the sys grant-row helpers"
```

---

### Task 10: Invitation tokens and store

**Files:**
- Create: `src/lib/portal/portal-invitations.ts`, `src/lib/portal/portal-invitations.test.ts`

**Interfaces:**
- Consumes: `QcKeySet`, `normalizeQcKeys` (Task 2); table `portal_invitations` (Task 4).
- Produces:
  - `INVITATION_TTL_DAYS = 7`
  - `normalizeEmail(raw: string): string`, `isValidEmail(email: string): boolean`, `escapeLike(value: string): string`
  - `createInvitationToken(): { token: string; tokenHash: string }`, `hashInvitationToken(token: string): string`
  - `interface PortalInvitationRow { id; company_id; email; first_name; last_name; views: string[]; capabilities: string[]; is_company_admin: boolean; invited_by: string; invited_by_kind: 'staff' | 'manager'; status: 'pending' | 'accepted' | 'cancelled' | 'expired'; expires_at: string; accepted_at: string | null; accepted_user_id: string | null; created_at: string }`
  - `type InvitationState = 'usable' | 'expired' | 'used' | 'cancelled'`; `invitationState(row, now: Date): InvitationState`
  - `interface InvitationSummary { id: string; email: string; firstName: string; lastName: string; keys: QcKeySet; isCompanyAdmin: boolean; invitedByKind: 'staff' | 'manager'; expiresAt: string; createdAt: string }`; `toInvitationSummary(row): InvitationSummary`
  - `createPortalInvitation(admin, args: { companyId: string; email: string; firstName: string; lastName: string; keys: QcKeySet; isCompanyAdmin: boolean; invitedBy: string; invitedByKind: 'staff' | 'manager'; now?: Date }): Promise<{ invitation: PortalInvitationRow; token: string }>`
  - `findInvitationByToken(admin, token: string): Promise<PortalInvitationRow | null>`
  - `findCompanyInvitation(admin, args: { invitationId: string; companyId: string }): Promise<PortalInvitationRow | null>`
  - `listPendingInvitations(admin, companyId: string, now?: Date): Promise<PortalInvitationRow[]>`
  - `cancelInvitation(admin, args: { invitationId: string; companyId: string }): Promise<PortalInvitationRow | null>`
  - `reissueInvitation(admin, args: { invitationId: string; companyId: string; now?: Date }): Promise<{ invitation: PortalInvitationRow; token: string } | null>`
  - `claimInvitation(admin, args: { invitationId: string; now?: Date }): Promise<boolean>`
  - `releaseInvitation(admin, invitationId: string): Promise<void>`
  - `recordAcceptedUser(admin, args: { invitationId: string; userId: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/portal-invitations.test.ts
import { describe, expect, it } from 'vitest'
import {
  claimInvitation, createInvitationToken, createPortalInvitation, escapeLike, hashInvitationToken,
  invitationState, isValidEmail, normalizeEmail, toInvitationSummary,
} from './portal-invitations'

/** Records every call; `results[table]` answers the awaited chain. */
function fakeAdmin(results: Record<string, any> = {}) {
  const calls: Array<{ table: string; op: string; values?: any; filters: Array<[string, unknown]> }> = []
  return {
    calls,
    from(table: string) {
      const call: any = { table, op: 'select', filters: [] }
      calls.push(call)
      const chain: any = {
        select() { return chain },
        insert(v: any) { call.op = 'insert'; call.values = v; return chain },
        update(v: any) { call.op = 'update'; call.values = v; return chain },
        eq(c: string, v: unknown) { call.filters.push([c, v]); return chain },
        gt(c: string, v: unknown) { call.filters.push([`${c}>`, v]); return chain },
        is(c: string, v: unknown) { call.filters.push([`${c} is`, v]); return chain },
        order() { return chain },
        single() { return Promise.resolve({ data: { id: 'inv-new', ...call.values }, error: null }) },
        maybeSingle() { return Promise.resolve({ data: results[`${table}:${call.op}`] ?? null, error: null }) },
        then(ok: any, bad: any) {
          return Promise.resolve({ data: results[`${table}:${call.op}`] ?? null, error: null }).then(ok, bad)
        },
      }
      return chain
    },
  } as any
}

describe('email helpers', () => {
  it('normalizes and validates', () => {
    expect(normalizeEmail('  John.Doe@Client.COM ')).toBe('john.doe@client.com')
    expect(isValidEmail('john.doe@client.com')).toBe(true)
    expect(isValidEmail('john@client')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('a_b%c\\d@x.com')).toBe('a\\_b\\%c\\\\d@x.com')
  })
})

describe('tokens', () => {
  it('stores only a SHA-256 hash of a random 32-byte token', () => {
    const a = createInvitationToken()
    const b = createInvitationToken()
    expect(a.token).not.toBe(b.token)
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.tokenHash).toBe(hashInvitationToken(a.token))
  })
})

describe('invitationState', () => {
  const now = new Date('2026-10-14T12:00:00Z')
  it('is usable only while pending and unexpired', () => {
    expect(invitationState({ status: 'pending', expires_at: '2026-10-15T00:00:00Z' }, now)).toBe('usable')
    expect(invitationState({ status: 'pending', expires_at: '2026-10-14T12:00:00Z' }, now)).toBe('expired')
    expect(invitationState({ status: 'expired', expires_at: '2026-10-20T00:00:00Z' }, now)).toBe('expired')
    expect(invitationState({ status: 'accepted', expires_at: '2026-10-20T00:00:00Z' }, now)).toBe('used')
    expect(invitationState({ status: 'cancelled', expires_at: '2026-10-20T00:00:00Z' }, now)).toBe('cancelled')
  })
})

describe('createPortalInvitation', () => {
  it('cancels the pending one for the same company and email, then inserts a hashed, 7-day invitation', async () => {
    const admin = fakeAdmin()
    const now = new Date('2026-10-14T12:00:00Z')
    const { invitation, token } = await createPortalInvitation(admin, {
      companyId: 'co-1', email: ' Ana@Client.com ', firstName: ' Ana ', lastName: 'Lima',
      keys: { views: ['qc_samples'], capabilities: [] }, isCompanyAdmin: true, invitedBy: 'staff-1', invitedByKind: 'staff', now,
    })
    expect(admin.calls.map((c: any) => c.op)).toEqual(['update', 'insert'])
    expect(admin.calls[0]).toMatchObject({ values: { status: 'cancelled' }, filters: [['company_id', 'co-1'], ['email', 'ana@client.com'], ['status', 'pending']] })
    expect(admin.calls[1].values).toMatchObject({
      company_id: 'co-1', email: 'ana@client.com', first_name: 'Ana', last_name: 'Lima', views: ['qc_samples'], capabilities: [],
      is_company_admin: true, invited_by: 'staff-1', invited_by_kind: 'staff', status: 'pending',
      token_hash: hashInvitationToken(token), expires_at: '2026-10-21T12:00:00.000Z',
    })
    expect(invitation.id).toBe('inv-new')
  })
})

describe('claimInvitation', () => {
  it('is true only when the pending row flipped', async () => {
    expect(await claimInvitation(fakeAdmin({ 'portal_invitations:update': [{ id: 'i' }] }), { invitationId: 'i' })).toBe(true)
    expect(await claimInvitation(fakeAdmin({ 'portal_invitations:update': [] }), { invitationId: 'i' })).toBe(false)
  })
})

describe('toInvitationSummary', () => {
  it('never carries the token hash', () => {
    const summary = toInvitationSummary({
      id: 'i', company_id: 'c', email: 'a@b.com', first_name: 'A', last_name: 'B', views: ['qc_samples', 'contracts'], capabilities: [],
      is_company_admin: false, invited_by: 'u', invited_by_kind: 'manager', status: 'pending', expires_at: 'x',
      accepted_at: null, accepted_user_id: null, created_at: 'y', token_hash: 'secret',
    } as any)
    expect(JSON.stringify(summary)).not.toContain('secret')
    expect(summary.keys).toEqual({ views: ['qc_samples'], capabilities: [] })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/portal/portal-invitations.test.ts`
Expected: FAIL, cannot resolve `./portal-invitations`.

- [ ] **Step 3: Implement**

```ts
// src/lib/portal/portal-invitations.ts
import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeQcKeys, type QcKeySet } from './qc-keys'

/**
 * QC portal invitations (spec §6.5). The token is 32 random bytes; only its
 * SHA-256 is stored, so a database read never reveals a working link. One
 * pending invitation per company and email: a new one cancels the old one.
 */

export const INVITATION_TTL_DAYS = 7
const TABLE = 'portal_invitations'
const COLUMNS =
  'id, company_id, email, first_name, last_name, views, capabilities, is_company_admin, invited_by, invited_by_kind, status, expires_at, accepted_at, accepted_user_id, created_at'

export interface PortalInvitationRow {
  id: string
  company_id: string
  email: string
  first_name: string
  last_name: string
  views: string[]
  capabilities: string[]
  is_company_admin: boolean
  invited_by: string
  invited_by_kind: 'staff' | 'manager'
  status: 'pending' | 'accepted' | 'cancelled' | 'expired'
  expires_at: string
  accepted_at: string | null
  accepted_user_id: string | null
  created_at: string
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL.test(email)
}

/** For .ilike(): an email may contain "_", which LIKE reads as a wildcard. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInvitationToken(token) }
}

export type InvitationState = 'usable' | 'expired' | 'used' | 'cancelled'

export function invitationState(row: Pick<PortalInvitationRow, 'status' | 'expires_at'>, now: Date): InvitationState {
  if (row.status === 'accepted') return 'used'
  if (row.status === 'cancelled') return 'cancelled'
  if (row.status === 'expired' || new Date(row.expires_at).getTime() <= now.getTime()) return 'expired'
  return 'usable'
}

function expiresAt(now: Date): string {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000).toISOString()
}

export interface InvitationSummary {
  id: string
  email: string
  firstName: string
  lastName: string
  keys: QcKeySet
  isCompanyAdmin: boolean
  invitedByKind: 'staff' | 'manager'
  expiresAt: string
  createdAt: string
}

export function toInvitationSummary(row: PortalInvitationRow): InvitationSummary {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    keys: normalizeQcKeys(row),
    isCompanyAdmin: row.is_company_admin,
    invitedByKind: row.invited_by_kind,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

export async function createPortalInvitation(
  admin: SupabaseClient<any>,
  args: {
    companyId: string
    email: string
    firstName: string
    lastName: string
    keys: QcKeySet
    isCompanyAdmin: boolean
    invitedBy: string
    invitedByKind: 'staff' | 'manager'
    now?: Date
  },
): Promise<{ invitation: PortalInvitationRow; token: string }> {
  const now = args.now ?? new Date()
  const email = normalizeEmail(args.email)
  const { error: cancelError } = await admin
    .from(TABLE)
    .update({ status: 'cancelled' })
    .eq('company_id', args.companyId)
    .eq('email', email)
    .eq('status', 'pending')
  if (cancelError) throw cancelError

  const { token, tokenHash } = createInvitationToken()
  const { data, error } = await admin
    .from(TABLE)
    .insert({
      company_id: args.companyId,
      email,
      first_name: args.firstName.trim(),
      last_name: args.lastName.trim(),
      views: args.keys.views,
      capabilities: args.keys.capabilities,
      is_company_admin: args.isCompanyAdmin && args.invitedByKind === 'staff',
      invited_by: args.invitedBy,
      invited_by_kind: args.invitedByKind,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt(now),
    })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return { invitation: data as PortalInvitationRow, token }
}

export async function findInvitationByToken(admin: SupabaseClient<any>, token: string): Promise<PortalInvitationRow | null> {
  if (!token || token.length < 20) return null
  const { data, error } = await admin.from(TABLE).select(COLUMNS).eq('token_hash', hashInvitationToken(token)).maybeSingle()
  if (error) throw error
  return (data as PortalInvitationRow | null) ?? null
}

export async function findCompanyInvitation(
  admin: SupabaseClient<any>,
  args: { invitationId: string; companyId: string },
): Promise<PortalInvitationRow | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select(COLUMNS)
    .eq('id', args.invitationId)
    .eq('company_id', args.companyId)
    .maybeSingle()
  if (error) throw error
  return (data as PortalInvitationRow | null) ?? null
}

export async function listPendingInvitations(
  admin: SupabaseClient<any>,
  companyId: string,
  now: Date = new Date(),
): Promise<PortalInvitationRow[]> {
  const { data, error } = await admin
    .from(TABLE)
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PortalInvitationRow[]
}

export async function cancelInvitation(
  admin: SupabaseClient<any>,
  args: { invitationId: string; companyId: string },
): Promise<PortalInvitationRow | null> {
  const { data, error } = await admin
    .from(TABLE)
    .update({ status: 'cancelled' })
    .eq('id', args.invitationId)
    .eq('company_id', args.companyId)
    .eq('status', 'pending')
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw error
  return (data as PortalInvitationRow | null) ?? null
}

export async function reissueInvitation(
  admin: SupabaseClient<any>,
  args: { invitationId: string; companyId: string; now?: Date },
): Promise<{ invitation: PortalInvitationRow; token: string } | null> {
  const { token, tokenHash } = createInvitationToken()
  const { data, error } = await admin
    .from(TABLE)
    .update({ token_hash: tokenHash, expires_at: expiresAt(args.now ?? new Date()) })
    .eq('id', args.invitationId)
    .eq('company_id', args.companyId)
    .eq('status', 'pending')
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data ? { invitation: data as PortalInvitationRow, token } : null
}

/** Flip pending → accepted before creating anything, so a second click finds nothing to claim. */
export async function claimInvitation(admin: SupabaseClient<any>, args: { invitationId: string; now?: Date }): Promise<boolean> {
  const now = args.now ?? new Date()
  const { data, error } = await admin
    .from(TABLE)
    .update({ status: 'accepted', accepted_at: now.toISOString() })
    .eq('id', args.invitationId)
    .eq('status', 'pending')
    .gt('expires_at', now.toISOString())
    .select('id')
  if (error) throw error
  return Array.isArray(data) && data.length === 1
}

/** Undo a claim when accepting failed half-way, so the link works again. */
export async function releaseInvitation(admin: SupabaseClient<any>, invitationId: string): Promise<void> {
  const { error } = await admin
    .from(TABLE)
    .update({ status: 'pending', accepted_at: null })
    .eq('id', invitationId)
    .eq('status', 'accepted')
    .is('accepted_user_id', null)
  if (error) console.error('[portal] could not release invitation', invitationId, error)
}

export async function recordAcceptedUser(admin: SupabaseClient<any>, args: { invitationId: string; userId: string }): Promise<void> {
  const { error } = await admin.from(TABLE).update({ accepted_user_id: args.userId }).eq('id', args.invitationId)
  if (error) throw error
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/portal/portal-invitations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/portal-invitations.ts src/lib/portal/portal-invitations.test.ts
git commit -m "feat(portal): portal invitations — hashed tokens, one pending per company and email, claim/release on accept"
```

---

### Task 11: Invitation email, head-office copy, team activity and notifications

Two rules from 2026-10-14 shape this task:
- **The accept link is a credential** (it sets the account's password). The invitee's email therefore goes to the invitee alone, with no CC. Head office still sees every invitation (house rule) through a separate, link-free copy: "<inviter> invited <email> to <company>'s QC portal". sys removed the same kind of credential copy the same day (`bf7e59985`).
- **`portal_activity.user_id` is NOT NULL and references sys `user_profiles`.** WAQC staff often have no `user_profiles` row, and WAQC never creates one for them (an internal row would open sys). The activity row uses the actor's id when the actor has a `user_profiles` row, else the target member's id when there is one, else no `portal_activity` row is written (the `portal_invitations` row is then the record). The actor's id and name always go in the payload.

**Files:**
- Create: `src/lib/portal/invite-email.ts`, `src/lib/portal/invite-email.test.ts`
- Create: `src/lib/portal/team-action-labels.ts` (pure: safe to import from client components)
- Create: `src/lib/portal/team-activity.ts`, `src/lib/portal/team-activity.test.ts`

**Interfaces:**
- Consumes: `sendMail` (`src/lib/graph/send.ts`), `HOUSE_CC` (`src/lib/approval-notification/resolve-panels.ts`), `createNotification` (`src/lib/notifications.ts`), `QC_KEY_LABELS`, `QcKeySet` (Task 2).
- Produces:
  - `portalBaseUrl(): string`, `portalInviteLink(token: string): string`, `portalSignInLink(companyId: string): string`
  - `interface InviteEmailInput { kind: 'invitation' | 'access_added'; firstName: string; companyName: string; inviterName: string; keys: QcKeySet; isCompanyAdmin: boolean; link: string; expiresAt: string | null }`
  - `interface BuiltEmail { subject: string; text: string; html: string }`
  - `accessLines(keys: QcKeySet, isCompanyAdmin: boolean): string[]`
  - `buildPortalInviteEmail(input: InviteEmailInput): BuiltEmail`
  - `sendPortalInviteEmail(to: string, email: BuiltEmail): Promise<void>` (invitee only, no CC; throws on a failed send)
  - `interface HouseCopyInput { kind: 'invitation' | 'resend' | 'access_added'; inviterName: string; email: string; companyName: string; keys: QcKeySet; isCompanyAdmin: boolean }`
  - `buildPortalHouseCopy(input: HouseCopyInput): BuiltEmail` (no link, no token)
  - `sendPortalHouseCopy(input: HouseCopyInput): Promise<boolean>` (to `HOUSE_CC`; never throws)
  - in `team-action-labels.ts`: `type QcTeamAction = 'team_invite' | 'team_invite_revoked' | 'team_invite_accepted' | 'team_update' | 'team_remove'` and `TEAM_ACTION_VERBS: Record<QcTeamAction, string>` (the one label map; the Portal access card imports it from here, because `team-activity.ts` pulls in server-only modules)
  - `team-activity.ts` re-exports the type `QcTeamAction`
  - `interface QcTeamActivityInput { actorUserId: string; actorName: string; companyId: string; companyName: string; action: QcTeamAction; targetEmail: string; targetUserId?: string | null; keysBefore?: QcKeySet | null; keysAfter?: QcKeySet | null }`
  - `describeTeamActivity(input: QcTeamActivityInput): string`
  - `recordQcTeamActivity(admin, input: QcTeamActivityInput): Promise<void>` (never throws)
  - `interface QcTeamActivityRow { id: string; occurredAt: string; action: QcTeamAction; actorName: string | null; targetEmail: string | null }`
  - `listQcTeamActivity(admin, companyId: string, limit?: number): Promise<QcTeamActivityRow[]>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/portal/invite-email.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => ({ calls: [] as any[], fail: false }))
vi.mock('@/lib/graph/send', () => ({
  sendMail: async (p: any) => {
    if (sent.fail) throw new Error('graph down')
    sent.calls.push(p)
  },
}))

import {
  buildPortalHouseCopy, buildPortalInviteEmail, portalInviteLink, sendPortalHouseCopy, sendPortalInviteEmail,
} from './invite-email'

beforeEach(() => {
  sent.calls = []
  sent.fail = false
  delete process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
})

const input = {
  kind: 'invitation' as const,
  firstName: 'Ana',
  companyName: 'Roastery <One>',
  inviterName: 'Daniel Wolthers',
  keys: { views: ['qc_samples', 'qc_certificates'] as any, capabilities: ['qc_cupping_score'] as any },
  isCompanyAdmin: true,
  link: 'https://qc.wolthers.com/auth/portal-invite?token=abc',
  expiresAt: '2026-10-21T12:00:00.000Z',
}

const house = {
  kind: 'invitation' as const,
  inviterName: 'Daniel Wolthers',
  email: 'ana@client.com',
  companyName: 'Roastery <One>',
  keys: input.keys,
  isCompanyAdmin: true,
}

describe('buildPortalInviteEmail', () => {
  it('names the company, the inviter, what they can use and when it expires', () => {
    const mail = buildPortalInviteEmail(input)
    expect(mail.subject).toBe('Invitation to the Wolthers QC portal for Roastery <One>')
    expect(mail.text).toContain('Daniel Wolthers has invited you to the Wolthers QC portal for Roastery <One>.')
    expect(mail.text).toContain('- Samples and contracts')
    expect(mail.text).toContain('- Score in cupping sessions')
    expect(mail.text).toContain("- Manage your company's team")
    expect(mail.text).toContain('21 October 2026')
    expect(mail.text).toContain(input.link)
  })

  it('escapes names in the HTML', () => {
    expect(buildPortalInviteEmail(input).html).toContain('Roastery &lt;One&gt;')
    expect(buildPortalInviteEmail(input).html).not.toContain('<One>')
  })

  it('an access-added email has no expiry', () => {
    const mail = buildPortalInviteEmail({ ...input, kind: 'access_added', expiresAt: null, isCompanyAdmin: false })
    expect(mail.subject).toBe('The Wolthers QC portal is open to you for Roastery <One>')
    expect(mail.text).not.toContain('expires')
    expect(mail.text).not.toContain('Manage your company')
  })
})

describe('portalInviteLink', () => {
  it('points at the accept page and encodes the token', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://qc.wolthers.com/'
    expect(portalInviteLink('a+b')).toBe('https://qc.wolthers.com/auth/portal-invite?token=a%2Bb')
  })
})

describe('sendPortalInviteEmail', () => {
  it('goes to the invitee alone: the link sets a password, so nobody is copied', async () => {
    await sendPortalInviteEmail('ana@client.com', { subject: 'S', text: 'T', html: 'H' })
    expect(sent.calls[0]).toMatchObject({ to: ['ana@client.com'], subject: 'S' })
    expect(sent.calls[0].cc).toBeUndefined()
    expect(sent.calls[0].bcc).toBeUndefined()
  })

  it('redirects to the test recipient in sandbox mode', async () => {
    process.env.MICROSOFT_GRAPH_TEST_RECIPIENT = 'test@wolthers.com'
    await sendPortalInviteEmail('ana@client.com', { subject: 'S', text: 'T', html: 'H' })
    expect(sent.calls[0]).toMatchObject({ to: ['test@wolthers.com'], subject: '[TEST] S' })
  })
})

describe('head-office copy', () => {
  it('says who invited whom to which company, with what access, and carries no link', () => {
    const copy = buildPortalHouseCopy(house)
    expect(copy.subject).toBe("Daniel Wolthers invited ana@client.com to Roastery <One>'s QC portal")
    expect(copy.text).toContain("Daniel Wolthers invited ana@client.com to Roastery <One>'s QC portal.")
    expect(copy.text).toContain('- Samples and contracts')
    expect(copy.text).toContain("- Manage your company's team")
    expect(`${copy.text}${copy.html}`).not.toMatch(/https?:|token|href/i)
    expect(copy.html).toContain('Roastery &lt;One&gt;')
  })

  it('words a resend and an access change', () => {
    expect(buildPortalHouseCopy({ ...house, kind: 'resend' }).subject)
      .toBe("Daniel Wolthers sent ana@client.com a new invitation link for Roastery <One>'s QC portal")
    expect(buildPortalHouseCopy({ ...house, kind: 'access_added' }).subject)
      .toBe("Daniel Wolthers opened Roastery <One>'s QC portal to ana@client.com")
  })

  it('goes to head office only, and reports a failed send instead of throwing', async () => {
    expect(await sendPortalHouseCopy(house)).toBe(true)
    expect(sent.calls[0]).toMatchObject({ to: ['wolthers@wolthers.com'] })
    expect(sent.calls[0].cc).toBeUndefined()
    sent.fail = true
    expect(await sendPortalHouseCopy(house)).toBe(false)
  })

  it('redirects to the test recipient in sandbox mode', async () => {
    process.env.MICROSOFT_GRAPH_TEST_RECIPIENT = 'test@wolthers.com'
    await sendPortalHouseCopy(house)
    expect(sent.calls[0]).toMatchObject({ to: ['test@wolthers.com'] })
    expect(sent.calls[0].subject.startsWith('[TEST] ')).toBe(true)
  })
})
```

```ts
// src/lib/portal/team-activity.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notes = vi.hoisted(() => ({ calls: [] as any[] }))
vi.mock('@/lib/notifications', () => ({ createNotification: async (p: any) => { notes.calls.push(p); return { success: true } } }))

import { describeTeamActivity, recordQcTeamActivity } from './team-activity'

/** `withUserProfile`: ids that have a sys user_profiles row. Global admins come from profiles. */
function fakeAdmin(withUserProfile: string[]) {
  const inserts: any[] = []
  return {
    inserts,
    from(table: string) {
      let id: unknown = null
      const chain: any = {
        insert(v: any) { inserts.push({ table, v }); return Promise.resolve({ error: null }) },
        select() { return chain },
        eq(_c: string, v: unknown) {
          if (table === 'profiles') return Promise.resolve({ data: [{ id: 'admin-1' }, { id: 'admin-2' }], error: null })
          id = v
          return chain
        },
        maybeSingle() { return Promise.resolve({ data: withUserProfile.includes(id as string) ? { id } : null, error: null }) },
      }
      return chain
    },
  } as any
}

const input = {
  actorUserId: 'u-1', actorName: 'Bea Costa', companyId: 'co-1', companyName: 'Roastery One',
  action: 'team_invite' as const, targetEmail: 'ana@client.com', keysAfter: { views: ['qc_samples'] as any, capabilities: [] },
}

beforeEach(() => { notes.calls = [] })

describe('recordQcTeamActivity', () => {
  it('logs as the actor when they have a user_profiles row, marked as QC, and notifies every global admin', async () => {
    const admin = fakeAdmin(['u-1'])
    await recordQcTeamActivity(admin, input)
    expect(admin.inserts).toEqual([{
      table: 'portal_activity',
      v: {
        user_id: 'u-1', company_id: 'co-1', action: 'team_invite',
        payload: {
          app: 'qc', actor_user_id: 'u-1', actor_name: 'Bea Costa', target_email: 'ana@client.com',
          keys_before: null, keys_after: { views: ['qc_samples'], capabilities: [] },
        },
      },
    }])
    expect(notes.calls.map((n) => n.user_id)).toEqual(['admin-1', 'admin-2'])
    expect(notes.calls[0]).toMatchObject({ title: 'Portal invitation sent', link: '/clients/co-1' })
  })

  it('a staff actor without a user_profiles row is logged under the target member, with the actor in the payload', async () => {
    const admin = fakeAdmin(['m-9'])
    await recordQcTeamActivity(admin, { ...input, actorUserId: 'staff-1', actorName: 'Daniel', action: 'team_update', targetUserId: 'm-9' })
    expect(admin.inserts[0].v).toMatchObject({
      user_id: 'm-9', action: 'team_update', payload: { actor_user_id: 'staff-1', actor_name: 'Daniel' },
    })
  })

  it('with neither, writes no activity row and still notifies', async () => {
    const admin = fakeAdmin([])
    await recordQcTeamActivity(admin, { ...input, actorUserId: 'staff-1', actorName: 'Daniel' })
    expect(admin.inserts).toEqual([])
    expect(notes.calls).toHaveLength(2)
  })

  it('describes the action in one line', () => {
    expect(describeTeamActivity(input)).toBe('Bea Costa invited ana@client.com to the QC portal for Roastery One')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/portal/invite-email.test.ts src/lib/portal/team-activity.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the emails**

```ts
// src/lib/portal/invite-email.ts
import { sendMail } from '@/lib/graph/send'
import { HOUSE_CC } from '@/lib/approval-notification/resolve-panels'
import { QC_KEY_LABELS, type QcKeySet } from './qc-keys'

/**
 * QC portal emails (spec §6.3). Sent from the QC mailbox through Graph;
 * MICROSOFT_GRAPH_TEST_RECIPIENT redirects every send, as on every QC email.
 *
 * The invitee's email goes to the invitee alone: its link sets the account's
 * password, so a copy would be a credential leak. Head office (house rule)
 * gets a separate, link-free copy instead (sendPortalHouseCopy).
 */

const QC_MAILBOX = process.env.MICROSOFT_GRAPH_MAILBOX || 'qualitycontrol@wolthers.com'

export function portalBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://qc.wolthers.com').replace(/\/+$/, '')
}

export function portalInviteLink(token: string): string {
  return `${portalBaseUrl()}/auth/portal-invite?token=${encodeURIComponent(token)}`
}

export function portalSignInLink(companyId: string): string {
  return `${portalBaseUrl()}/portal?company=${encodeURIComponent(companyId)}`
}

export interface InviteEmailInput {
  kind: 'invitation' | 'access_added'
  firstName: string
  companyName: string
  inviterName: string
  keys: QcKeySet
  isCompanyAdmin: boolean
  link: string
  expiresAt: string | null
}

export interface BuiltEmail {
  subject: string
  text: string
  html: string
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}

const SIGNATURE = 'Wolthers & Associates, Quality Control'
const BODY_OPEN =
  '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111111">'

export function accessLines(keys: QcKeySet, isCompanyAdmin: boolean): string[] {
  const lines = [...keys.views, ...keys.capabilities].map((k) => QC_KEY_LABELS[k])
  if (isCompanyAdmin) lines.push("Manage your company's team")
  return lines
}

export function buildPortalInviteEmail(input: InviteEmailInput): BuiltEmail {
  const name = input.firstName.trim()
  const greeting = name ? `Hello ${name},` : 'Hello,'
  const invitation = input.kind === 'invitation'
  const intro = invitation
    ? `${input.inviterName} has invited you to the Wolthers QC portal for ${input.companyName}.`
    : `${input.inviterName} has opened the Wolthers QC portal to you for ${input.companyName}. Sign in with your existing account.`
  const action = invitation ? 'Accept the invitation' : 'Open the portal'
  const subject = invitation
    ? `Invitation to the Wolthers QC portal for ${input.companyName}`
    : `The Wolthers QC portal is open to you for ${input.companyName}`
  const lines = accessLines(input.keys, input.isCompanyAdmin)
  const expiry = invitation && input.expiresAt ? `This invitation expires on ${formatDate(input.expiresAt)}.` : null

  const text = [
    greeting,
    '',
    intro,
    '',
    'You will be able to use:',
    ...lines.map((l) => `- ${l}`),
    '',
    `${action}: ${input.link}`,
    ...(expiry ? ['', expiry] : []),
    '',
    SIGNATURE,
  ].join('\n')

  const html = [
    BODY_OPEN,
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    '<p>You will be able to use:</p>',
    `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
    `<p><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#556b2f;color:#ffffff;text-decoration:none">${escapeHtml(action)}</a></p>`,
    expiry ? `<p style="color:#666666">${escapeHtml(expiry)}</p>` : '',
    `<p style="color:#666666">${escapeHtml(SIGNATURE)}</p>`,
    '</body></html>',
  ].join('')

  return { subject, text, html }
}

function sandboxed(to: string, subject: string): { to: string[]; subject: string } {
  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  return testTo ? { to: [testTo], subject: `[TEST] ${subject}` } : { to: [to], subject }
}

/** The invitee's email: to them alone, never copied (its link is a credential). */
export async function sendPortalInviteEmail(to: string, email: BuiltEmail): Promise<void> {
  const target = sandboxed(to, email.subject)
  await sendMail({
    mailbox: QC_MAILBOX,
    to: target.to,
    subject: target.subject,
    bodyText: email.text,
    bodyHtml: email.html,
    saveToSentItems: true,
  })
}

export interface HouseCopyInput {
  kind: 'invitation' | 'resend' | 'access_added'
  inviterName: string
  email: string
  companyName: string
  keys: QcKeySet
  isCompanyAdmin: boolean
}

/** What head office sees: who invited whom, to which company, with what access. No link. */
export function buildPortalHouseCopy(input: HouseCopyInput): BuiltEmail {
  const company = `${input.companyName}'s QC portal`
  const headline =
    input.kind === 'invitation'
      ? `${input.inviterName} invited ${input.email} to ${company}`
      : input.kind === 'resend'
        ? `${input.inviterName} sent ${input.email} a new invitation link for ${company}`
        : `${input.inviterName} opened ${company} to ${input.email}`
  const lines = accessLines(input.keys, input.isCompanyAdmin)
  const note = 'The link in their email sets their password, so it is not copied here.'

  const text = [`${headline}.`, '', 'Access:', ...lines.map((l) => `- ${l}`), '', note, '', SIGNATURE].join('\n')
  const html = [
    BODY_OPEN,
    `<p>${escapeHtml(`${headline}.`)}</p>`,
    '<p>Access:</p>',
    `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
    `<p style="color:#666666">${escapeHtml(note)}</p>`,
    `<p style="color:#666666">${escapeHtml(SIGNATURE)}</p>`,
    '</body></html>',
  ].join('')
  return { subject: headline, text, html }
}

/** Head office's link-free copy (house rule). Never throws; false when the send failed. */
export async function sendPortalHouseCopy(input: HouseCopyInput): Promise<boolean> {
  const mail = buildPortalHouseCopy(input)
  const target = sandboxed(HOUSE_CC, mail.subject)
  try {
    await sendMail({
      mailbox: QC_MAILBOX,
      to: target.to,
      subject: target.subject,
      bodyText: mail.text,
      bodyHtml: mail.html,
      saveToSentItems: true,
    })
    return true
  } catch (error) {
    console.error('[portal] head-office copy failed:', error)
    return false
  }
}
```

- [ ] **Step 4: Implement the labels and the activity log**

```ts
// src/lib/portal/team-action-labels.ts
/** QC team actions and the one label map for them. Pure: client components import it too. */

export type QcTeamAction = 'team_invite' | 'team_invite_revoked' | 'team_invite_accepted' | 'team_update' | 'team_remove'

export const TEAM_ACTION_VERBS: Record<QcTeamAction, string> = {
  team_invite: 'invited',
  team_invite_revoked: 'cancelled the invitation of',
  team_invite_accepted: 'accepted the invitation as',
  team_update: 'changed the access of',
  team_remove: 'removed the access of',
}
```

```ts
// src/lib/portal/team-activity.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import type { QcKeySet } from './qc-keys'
import { TEAM_ACTION_VERBS, type QcTeamAction } from './team-action-labels'

export type { QcTeamAction }

/**
 * Every QC team change is written to sys's portal_activity (payload.app =
 * 'qc') and announced to WAQC global admins in-app (spec §6.8). Logging must
 * never fail the action it records.
 *
 * portal_activity.user_id is NOT NULL and references user_profiles. WAQC
 * staff often have no user_profiles row, and WAQC never creates one for them
 * (an internal row would open sys). So the row is written under the actor
 * when they have a user_profiles row, else under the target member, else not
 * at all (the portal_invitations row is then the record). The actor's id and
 * name always travel in the payload.
 */

const TITLES: Record<QcTeamAction, string> = {
  team_invite: 'Portal invitation sent',
  team_invite_revoked: 'Portal invitation cancelled',
  team_invite_accepted: 'Portal invitation accepted',
  team_update: 'Portal access changed',
  team_remove: 'Portal access removed',
}

export interface QcTeamActivityInput {
  actorUserId: string
  actorName: string
  companyId: string
  companyName: string
  action: QcTeamAction
  targetEmail: string
  /** The member acted on, when the action is on an existing account (members always have a user_profiles row). */
  targetUserId?: string | null
  keysBefore?: QcKeySet | null
  keysAfter?: QcKeySet | null
}

export function describeTeamActivity(input: QcTeamActivityInput): string {
  const preposition = input.action === 'team_invite' ? 'to' : 'on'
  return `${input.actorName} ${TEAM_ACTION_VERBS[input.action]} ${input.targetEmail} ${preposition} the QC portal for ${input.companyName}`
}

export async function recordQcTeamActivity(admin: SupabaseClient<any>, input: QcTeamActivityInput): Promise<void> {
  try {
    const { data: actorProfile } = await admin.from('user_profiles').select('id').eq('id', input.actorUserId).maybeSingle()
    const logAs = actorProfile ? input.actorUserId : input.targetUserId ?? null
    if (logAs) {
      const { error } = await admin.from('portal_activity').insert({
        user_id: logAs,
        company_id: input.companyId,
        action: input.action,
        payload: {
          app: 'qc',
          actor_user_id: input.actorUserId,
          actor_name: input.actorName,
          target_email: input.targetEmail,
          keys_before: input.keysBefore ?? null,
          keys_after: input.keysAfter ?? null,
        },
      })
      if (error) console.error('[portal] activity log failed:', error)
    }

    const { data: admins } = await admin.from('profiles').select('id').eq('is_global_admin', true)
    await Promise.all(
      (admins ?? []).map((a: { id: string }) =>
        createNotification({
          type: 'info',
          priority: 'info',
          title: TITLES[input.action],
          message: describeTeamActivity(input),
          link: `/clients/${input.companyId}`,
          user_id: a.id,
          metadata: { source: 'portal_team', company_id: input.companyId, action: input.action },
        }),
      ),
    )
  } catch (error) {
    console.error('[portal] activity/notification failed:', error)
  }
}

export interface QcTeamActivityRow {
  id: string
  occurredAt: string
  action: QcTeamAction
  actorName: string | null
  targetEmail: string | null
}

export async function listQcTeamActivity(admin: SupabaseClient<any>, companyId: string, limit = 20): Promise<QcTeamActivityRow[]> {
  const { data, error } = await admin
    .from('portal_activity')
    .select('id, occurred_at, action, actor_name, payload')
    .eq('company_id', companyId)
    .eq('payload->>app', 'qc')
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    action: row.action,
    // The row may be filed under the target member (see above): the payload names the real actor.
    actorName: row.payload?.actor_name ?? row.actor_name ?? null,
    targetEmail: row.payload?.target_email ?? null,
  }))
}
```

Check `describeTeamActivity` against the test: for `team_invite` it reads "Bea Costa invited ana@client.com to the QC portal for Roastery One". For the other actions it reads, for example, "Bea Costa removed the access of ana@client.com on the QC portal for Roastery One".

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/portal/invite-email.test.ts src/lib/portal/team-activity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/portal/invite-email.ts src/lib/portal/invite-email.test.ts src/lib/portal/team-action-labels.ts \
  src/lib/portal/team-activity.ts src/lib/portal/team-activity.test.ts
git commit -m "feat(portal): invitation email to the invitee alone plus a link-free head-office copy; team activity filed under a real user_profiles row"
```

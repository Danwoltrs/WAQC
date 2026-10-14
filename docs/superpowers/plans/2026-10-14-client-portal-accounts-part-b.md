# Client Portal Accounts — Part B: Gate, grants, invitations, email (Tasks 8–11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read first: the plan index `docs/superpowers/plans/2026-10-14-client-portal-accounts.md` and the spec `docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md`. Part A must be done (Tasks 2, 6, 7 provide `qc-keys.ts`, `new-profile.ts`, `access-kind.ts`).

---

### Task 8: Portal gate `requireQcPortal`

**Files:**
- Create: `src/lib/portal/qc-portal-gate.ts`, `src/lib/portal/qc-portal-gate.test.ts`

**Interfaces:**
- Consumes: `AccessKind`, `accessKindForUser` (Task 7); `QC_VIEWS`, `MANAGE_USERS`, `hasQcView`, `qcKeysOf`, `isCompanyAdmin`, `QcView`, `QcCapability`, `QcKeySet` (Task 2).
- Produces:
  - `interface QcGrantRow { company_id: string; views: string[] | null; capabilities: string[] | null; source: string | null }`
  - `interface PortalNeed { view?: QcView; capability?: QcCapability | 'manage_users'; write?: boolean }`
  - `type PortalAccessDecision = { ok: true; companyId: string; keys: QcKeySet; isCompanyAdmin: boolean; isStaffViewAs: boolean } | { ok: false; status: 400 | 401 | 403; error: string }`
  - `evaluatePortalAccess(input: { signedIn: boolean; kind: AccessKind; userStatus: string | null; requestedCompanyId: string | null; grants: QcGrantRow[]; need: PortalNeed }): PortalAccessDecision`
  - `interface QcPortalContext { userId: string; companyId: string; keys: QcKeySet; isCompanyAdmin: boolean; isStaffViewAs: boolean; admin: SupabaseClient<any> }`
  - `requireQcPortal(request: Request, need?: PortalNeed): Promise<{ ok: true; ctx: QcPortalContext } | { ok: false; response: NextResponse }>` — company from `?company=`
  - `portalServiceClient(): SupabaseClient<any>` (throws when the service key is missing)
  - `isUuid(value: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/qc-portal-gate.test.ts
import { describe, expect, it } from 'vitest'
import { evaluatePortalAccess, type QcGrantRow } from './qc-portal-gate'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const grantA: QcGrantRow = { company_id: A, views: ['contracts', 'qc_samples', 'qc_certificates'], capabilities: ['qc_cupping_score'], source: 'admin' }
const adminGrantB: QcGrantRow = { company_id: B, views: ['qc_samples'], capabilities: ['manage_users'], source: 'admin' }
const sysOnly: QcGrantRow = { company_id: B, views: ['contracts'], capabilities: ['manage_users'], source: 'admin' }

const base = { signedIn: true, kind: 'external' as const, userStatus: 'active', requestedCompanyId: null, grants: [grantA], need: {} }

describe('evaluatePortalAccess', () => {
  it('401 when not signed in', () => {
    expect(evaluatePortalAccess({ ...base, signedIn: false })).toMatchObject({ ok: false, status: 401 })
  })

  it('picks the only QC company when none is asked for', () => {
    expect(evaluatePortalAccess({ ...base, grants: [grantA, sysOnly] })).toEqual({
      ok: true, companyId: A, keys: { views: ['qc_samples', 'qc_certificates'], capabilities: ['qc_cupping_score'] },
      isCompanyAdmin: false, isStaffViewAs: false,
    })
  })

  it('asks to choose when there are several QC companies', () => {
    expect(evaluatePortalAccess({ ...base, grants: [grantA, adminGrantB] })).toMatchObject({ ok: false, status: 400 })
    expect(evaluatePortalAccess({ ...base, grants: [grantA, adminGrantB], requestedCompanyId: B })).toMatchObject({ ok: true, companyId: B, isCompanyAdmin: true })
  })

  it('refuses a company without a QC view, or not granted at all', () => {
    expect(evaluatePortalAccess({ ...base, grants: [grantA, sysOnly], requestedCompanyId: B })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, grants: [sysOnly] })).toMatchObject({ ok: false, status: 403 })
  })

  it('400 on a malformed company id', () => {
    expect(evaluatePortalAccess({ ...base, requestedCompanyId: "x' or 1=1" })).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses an external user who is not active', () => {
    expect(evaluatePortalAccess({ ...base, userStatus: 'invited' })).toMatchObject({ ok: false, status: 403 })
  })

  it('checks the view and the capability the route needs', () => {
    expect(evaluatePortalAccess({ ...base, need: { view: 'qc_certificates' } })).toMatchObject({ ok: true })
    expect(evaluatePortalAccess({ ...base, need: { view: 'qc_dashboard' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_cupping_score' } })).toMatchObject({ ok: true })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'qc_spec_edit' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, need: { capability: 'manage_users' } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...base, grants: [adminGrantB], need: { capability: 'manage_users' } })).toMatchObject({ ok: true })
  })

  it('lets staff view any company read-only', () => {
    const staff = { ...base, kind: 'staff' as const, userStatus: null, grants: [] }
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { view: 'qc_dashboard' } })).toMatchObject({
      ok: true, companyId: A, isStaffViewAs: true, isCompanyAdmin: false,
    })
    expect(evaluatePortalAccess({ ...staff })).toMatchObject({ ok: false, status: 400 })
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { write: true } })).toMatchObject({ ok: false, status: 403 })
    expect(evaluatePortalAccess({ ...staff, requestedCompanyId: A, need: { capability: 'manage_users' } })).toMatchObject({ ok: false, status: 403 })
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
  MANAGE_USERS, QC_VIEWS, hasQcView, isCompanyAdmin, qcKeysOf,
  type QcCapability, type QcKeySet, type QcView,
} from './qc-keys'

/**
 * The one gate in front of every /api/portal/* route (spec §7.1). The company
 * comes from `?company=` and is always checked against the caller's grants;
 * nothing else from the request names a company. Data is then read with the
 * service role, filtered by ctx.companyId.
 */

export interface QcGrantRow {
  company_id: string
  views: string[] | null
  capabilities: string[] | null
  source: string | null
}

export interface PortalNeed {
  view?: QcView
  capability?: QcCapability | typeof MANAGE_USERS
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
  grants: QcGrantRow[]
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

  const qcGrants = input.grants.filter(hasQcView)
  let grant: QcGrantRow | undefined
  if (requested) {
    grant = qcGrants.find((g) => g.company_id === requested)
    if (!grant) return fail(403, 'No access to this company')
  } else if (qcGrants.length === 1) {
    grant = qcGrants[0]
  } else if (qcGrants.length === 0) {
    return fail(403, 'No QC portal access')
  } else {
    return fail(400, 'Choose a company')
  }

  const keys = qcKeysOf(grant)
  const admin = isCompanyAdmin(grant)
  if (need.view && !keys.views.includes(need.view)) return fail(403, 'This page is not part of your access')
  if (need.capability === MANAGE_USERS) {
    if (!admin) return fail(403, 'Only company admins can do this')
  } else if (need.capability && !keys.capabilities.includes(need.capability)) {
    return fail(403, 'This action is not part of your access')
  }
  return { ok: true, companyId: grant.company_id, keys, isCompanyAdmin: admin, isStaffViewAs: false }
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
  let grants: QcGrantRow[] = []
  if (user) {
    kind = await accessKindForUser(admin, user.id)
    if (kind === 'external') {
      const [{ data: profile }, { data: rows }] = await Promise.all([
        admin.from('user_profiles').select('status').eq('id', user.id).maybeSingle(),
        admin.from('external_user_company_grants').select('company_id, views, capabilities, source').eq('user_id', user.id),
      ])
      userStatus = profile?.status ?? null
      grants = (rows ?? []) as QcGrantRow[]
    }
  }

  const decision = evaluatePortalAccess({ signedIn: !!user, kind, userStatus, requestedCompanyId, grants, need })
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
git commit -m "feat(portal): requireQcPortal — company from the grant, keys per route, staff view-as read-only"
```

---

### Task 9: Grant writes — `setQcAccess`, `removeQcAccess`, members

**Files:**
- Create: `src/lib/portal/qc-grants.ts`, `src/lib/portal/qc-grants.test.ts`

**Interfaces:**
- Consumes: `MANAGE_USERS`, `mergeQcKeys`, `qcKeysOf`, `isCompanyAdmin`, `QcKeySet` (Task 2).
- Produces:
  - `interface GrantArrays { views: string[]; capabilities: string[] }`
  - `interface ExistingGrant { views: string[] | null; capabilities: string[] | null; source: string | null }`
  - `class GroupGrantError extends Error`
  - `planQcGrantWrite(existing: ExistingGrant | null, next: { keys: QcKeySet; manageUsers?: boolean }): { kind: 'insert' | 'update'; arrays: GrantArrays }`
  - `planQcGrantRemoval(existing: ExistingGrant | null, opts: { alsoManageUsers: boolean }): { kind: 'none' } | { kind: 'delete' } | { kind: 'update'; arrays: GrantArrays }`
  - `setQcAccess(admin, args: { userId: string; companyId: string; keys: QcKeySet; manageUsers?: boolean; source: 'admin' | 'manager'; createdBy: string }): Promise<{ before: GrantArrays | null; after: GrantArrays }>`
  - `removeQcAccess(admin, args: { userId: string; companyId: string; alsoManageUsers: boolean }): Promise<{ before: GrantArrays | null; after: GrantArrays | null }>`
  - `interface QcMember { userId: string; email: string | null; fullName: string | null; status: string | null; keys: QcKeySet; isCompanyAdmin: boolean; source: string | null; lastSignInAt: string | null }`
  - `toQcMembers(rows: any[]): QcMember[]`, `listQcMembers(admin, companyId: string): Promise<QcMember[]>`
  - `readGrant(admin, userId: string, companyId: string): Promise<ExistingGrant | null>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/qc-grants.test.ts
import { describe, expect, it } from 'vitest'
import { GroupGrantError, planQcGrantRemoval, planQcGrantWrite, toQcMembers } from './qc-grants'

const sysUser = { views: ['contracts', 'shipments'], capabilities: ['fixation_request', 'manage_users'], source: 'admin' }

describe('planQcGrantWrite', () => {
  it('inserts a QC-only grant with both arrays explicit', () => {
    expect(planQcGrantWrite(null, { keys: { views: ['qc_samples'], capabilities: [] } })).toEqual({
      kind: 'insert', arrays: { views: ['qc_samples'], capabilities: [] },
    })
  })

  it('adds manage_users for a staff-made company admin', () => {
    expect(planQcGrantWrite(null, { keys: { views: ['qc_samples'], capabilities: ['qc_spec_edit'] }, manageUsers: true }).arrays.capabilities)
      .toEqual(['qc_spec_edit', 'manage_users'])
  })

  it('leaves every sys key of a sys portal user exactly as it was', () => {
    const plan = planQcGrantWrite(sysUser, { keys: { views: ['qc_samples', 'qc_reports'], capabilities: ['qc_cupping_score'] } })
    expect(plan).toEqual({
      kind: 'update',
      arrays: {
        views: ['contracts', 'shipments', 'qc_samples', 'qc_reports'],
        capabilities: ['fixation_request', 'manage_users', 'qc_cupping_score'],
      },
    })
  })

  it('keeps manage_users when the write does not mention it, and clears it only when told', () => {
    const existing = { views: ['qc_samples'], capabilities: ['manage_users'], source: 'admin' }
    expect(planQcGrantWrite(existing, { keys: { views: ['qc_samples'], capabilities: [] } }).arrays.capabilities).toEqual(['manage_users'])
    expect(planQcGrantWrite(existing, { keys: { views: ['qc_samples'], capabilities: [] }, manageUsers: false }).arrays.capabilities).toEqual([])
  })

  it('refuses a group-copied row', () => {
    expect(() => planQcGrantWrite({ ...sysUser, source: 'group' }, { keys: { views: ['qc_samples'], capabilities: [] } }))
      .toThrow(GroupGrantError)
  })
})

describe('planQcGrantRemoval', () => {
  it('does nothing without a grant', () => {
    expect(planQcGrantRemoval(null, { alsoManageUsers: true })).toEqual({ kind: 'none' })
  })

  it('deletes a QC-only grant', () => {
    expect(planQcGrantRemoval({ views: ['qc_samples'], capabilities: ['qc_spec_edit'], source: 'admin' }, { alsoManageUsers: false }))
      .toEqual({ kind: 'delete' })
  })

  it('a staff removal also drops manage_users when nothing else is left', () => {
    expect(planQcGrantRemoval({ views: ['qc_samples'], capabilities: ['manage_users'], source: 'admin' }, { alsoManageUsers: true }))
      .toEqual({ kind: 'delete' })
  })

  it('keeps a sys portal user\'s keys, manage_users included, when removing QC access', () => {
    expect(planQcGrantRemoval({ ...sysUser, views: [...sysUser.views, 'qc_samples'] }, { alsoManageUsers: true })).toEqual({
      kind: 'update', arrays: { views: ['contracts', 'shipments'], capabilities: ['fixation_request', 'manage_users'] },
    })
  })

  it('refuses a group-copied row', () => {
    expect(() => planQcGrantRemoval({ ...sysUser, source: 'group' }, { alsoManageUsers: false })).toThrow(GroupGrantError)
  })
})

describe('toQcMembers', () => {
  it('lists people holding any QC key, sorted by name, and skips sys-only people', () => {
    const rows = [
      { user_id: 'u2', views: ['qc_samples'], capabilities: ['manage_users'], source: 'admin', user_profiles: { email: 'b@c.com', full_name: 'Bea', status: 'active', last_sign_in_at: null } },
      { user_id: 'u3', views: ['contracts'], capabilities: [], source: 'admin', user_profiles: { email: 'sys@c.com', full_name: 'Sys', status: 'active', last_sign_in_at: null } },
      { user_id: 'u1', views: ['qc_samples'], capabilities: ['qc_spec_edit'], source: 'manager', user_profiles: { email: 'a@c.com', full_name: 'Ana', status: 'active', last_sign_in_at: '2026-10-01T00:00:00Z' } },
    ]
    expect(toQcMembers(rows).map((m) => [m.userId, m.isCompanyAdmin])).toEqual([['u1', false], ['u2', true]])
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/portal/qc-grants.test.ts`
Expected: FAIL, cannot resolve `./qc-grants`.

- [ ] **Step 3: Implement**

```ts
// src/lib/portal/qc-grants.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { MANAGE_USERS, isCompanyAdmin, mergeQcKeys, qcKeysOf, type QcKeySet } from './qc-keys'

/**
 * Writes of QC access on sys's external_user_company_grants (spec §5, §6.6).
 * Both arrays are always written explicitly (the column defaults hand out
 * every sys view); every non-QC key is preserved; group-copied rows are
 * sys's to manage.
 */

const GRANTS = 'external_user_company_grants'

export interface GrantArrays {
  views: string[]
  capabilities: string[]
}

export interface ExistingGrant {
  views: string[] | null
  capabilities: string[] | null
  source: string | null
}

export class GroupGrantError extends Error {
  constructor() {
    super("This access comes from the company group. Change it on the group's main company in sys.")
    this.name = 'GroupGrantError'
  }
}

function setManageUsers(capabilities: string[], manageUsers: boolean | undefined): string[] {
  if (manageUsers === undefined) return capabilities
  const without = capabilities.filter((c) => c !== MANAGE_USERS)
  return manageUsers ? [...without, MANAGE_USERS] : without
}

export function planQcGrantWrite(
  existing: ExistingGrant | null,
  next: { keys: QcKeySet; manageUsers?: boolean },
): { kind: 'insert' | 'update'; arrays: GrantArrays } {
  if (existing?.source === 'group') throw new GroupGrantError()
  const views = mergeQcKeys(existing?.views, next.keys.views)
  const capabilities = setManageUsers(mergeQcKeys(existing?.capabilities, next.keys.capabilities), next.manageUsers)
  return { kind: existing ? 'update' : 'insert', arrays: { views, capabilities } }
}

export function planQcGrantRemoval(
  existing: ExistingGrant | null,
  opts: { alsoManageUsers: boolean },
): { kind: 'none' } | { kind: 'delete' } | { kind: 'update'; arrays: GrantArrays } {
  if (!existing) return { kind: 'none' }
  if (existing.source === 'group') throw new GroupGrantError()
  const views = mergeQcKeys(existing.views, [])
  let capabilities = mergeQcKeys(existing.capabilities, [])
  // manage_users is shared with the sys portal: drop it only when nothing of
  // the sys portal is left on this grant.
  if (opts.alsoManageUsers && views.length === 0 && capabilities.every((c) => c === MANAGE_USERS)) {
    capabilities = []
  }
  if (views.length === 0 && capabilities.length === 0) return { kind: 'delete' }
  return { kind: 'update', arrays: { views, capabilities } }
}

export async function readGrant(admin: SupabaseClient<any>, userId: string, companyId: string): Promise<ExistingGrant | null> {
  const { data, error } = await admin
    .from(GRANTS)
    .select('views, capabilities, source')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) throw error
  return (data as ExistingGrant | null) ?? null
}

function arraysOf(grant: ExistingGrant | null): GrantArrays | null {
  return grant ? { views: grant.views ?? [], capabilities: grant.capabilities ?? [] } : null
}

export async function setQcAccess(
  admin: SupabaseClient<any>,
  args: { userId: string; companyId: string; keys: QcKeySet; manageUsers?: boolean; source: 'admin' | 'manager'; createdBy: string },
): Promise<{ before: GrantArrays | null; after: GrantArrays }> {
  const existing = await readGrant(admin, args.userId, args.companyId)
  const plan = planQcGrantWrite(existing, { keys: args.keys, manageUsers: args.manageUsers })
  if (plan.kind === 'insert') {
    const { error } = await admin.from(GRANTS).insert({
      user_id: args.userId,
      company_id: args.companyId,
      source: args.source,
      created_by: args.createdBy,
      views: plan.arrays.views,
      capabilities: plan.arrays.capabilities,
    })
    if (error) throw error
  } else {
    const { error } = await admin
      .from(GRANTS)
      .update(plan.arrays)
      .eq('user_id', args.userId)
      .eq('company_id', args.companyId)
    if (error) throw error
  }
  return { before: arraysOf(existing), after: plan.arrays }
}

export async function removeQcAccess(
  admin: SupabaseClient<any>,
  args: { userId: string; companyId: string; alsoManageUsers: boolean },
): Promise<{ before: GrantArrays | null; after: GrantArrays | null }> {
  const existing = await readGrant(admin, args.userId, args.companyId)
  const plan = planQcGrantRemoval(existing, { alsoManageUsers: args.alsoManageUsers })
  if (plan.kind === 'none') return { before: null, after: null }
  if (plan.kind === 'delete') {
    const { error } = await admin.from(GRANTS).delete().eq('user_id', args.userId).eq('company_id', args.companyId)
    if (error) throw error
    return { before: arraysOf(existing), after: null }
  }
  const { error } = await admin
    .from(GRANTS)
    .update(plan.arrays)
    .eq('user_id', args.userId)
    .eq('company_id', args.companyId)
  if (error) throw error
  return { before: arraysOf(existing), after: plan.arrays }
}

export interface QcMember {
  userId: string
  email: string | null
  fullName: string | null
  status: string | null
  keys: QcKeySet
  isCompanyAdmin: boolean
  source: string | null
  lastSignInAt: string | null
}

export function toQcMembers(rows: any[]): QcMember[] {
  return rows
    .map((row) => ({
      userId: row.user_id as string,
      email: row.user_profiles?.email ?? null,
      fullName: row.user_profiles?.full_name ?? null,
      status: row.user_profiles?.status ?? null,
      keys: qcKeysOf(row),
      isCompanyAdmin: isCompanyAdmin(row),
      source: row.source ?? null,
      lastSignInAt: row.user_profiles?.last_sign_in_at ?? null,
    }))
    .filter((m) => m.keys.views.length + m.keys.capabilities.length > 0)
    .sort((a, b) => (a.fullName || a.email || '').localeCompare(b.fullName || b.email || ''))
}

export async function listQcMembers(admin: SupabaseClient<any>, companyId: string): Promise<QcMember[]> {
  const { data, error } = await admin
    .from(GRANTS)
    .select('user_id, views, capabilities, source, user_profiles(email, full_name, status, last_sign_in_at)')
    .eq('company_id', companyId)
  if (error) throw error
  return toQcMembers(data ?? [])
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/portal/qc-grants.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/qc-grants.ts src/lib/portal/qc-grants.test.ts
git commit -m "feat(portal): QC grant writes that keep every sys key; group rows refused; member list"
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
    expect(a.tokenHash).not.toContain(a.token)
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

### Task 11: Invitation email, team activity and notifications

**Files:**
- Create: `src/lib/portal/invite-email.ts`, `src/lib/portal/invite-email.test.ts`
- Create: `src/lib/portal/team-activity.ts`, `src/lib/portal/team-activity.test.ts`

**Interfaces:**
- Consumes: `sendMail` (`src/lib/graph/send.ts`), `HOUSE_CC` (`src/lib/approval-notification/resolve-panels.ts`), `createNotification` (`src/lib/notifications.ts`), `QC_KEY_LABELS`, `QcKeySet` (Task 2).
- Produces:
  - `portalBaseUrl(): string`, `portalInviteLink(token: string): string`, `portalSignInLink(companyId: string): string`
  - `interface InviteEmailInput { kind: 'invitation' | 'access_added'; firstName: string; companyName: string; inviterName: string; keys: QcKeySet; isCompanyAdmin: boolean; link: string; expiresAt: string | null }`
  - `interface BuiltEmail { subject: string; text: string; html: string }`
  - `accessLines(keys: QcKeySet, isCompanyAdmin: boolean): string[]`
  - `buildPortalInviteEmail(input: InviteEmailInput): BuiltEmail`
  - `sendPortalInviteEmail(to: string, email: BuiltEmail): Promise<void>`
  - `type QcTeamAction = 'team_invite' | 'team_invite_revoked' | 'team_invite_accepted' | 'team_update' | 'team_remove'`
  - `interface QcTeamActivityInput { actorUserId: string; actorName: string; companyId: string; companyName: string; action: QcTeamAction; targetEmail: string; keysBefore?: QcKeySet | null; keysAfter?: QcKeySet | null }`
  - `describeTeamActivity(input: QcTeamActivityInput): string`
  - `recordQcTeamActivity(admin, input: QcTeamActivityInput): Promise<void>` (never throws)
  - `interface QcTeamActivityRow { id: string; occurredAt: string; action: QcTeamAction; actorName: string | null; targetEmail: string | null }`
  - `listQcTeamActivity(admin, companyId: string, limit?: number): Promise<QcTeamActivityRow[]>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/portal/invite-email.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => ({ calls: [] as any[] }))
vi.mock('@/lib/graph/send', () => ({ sendMail: async (p: any) => { sent.calls.push(p) } }))

import { buildPortalInviteEmail, portalInviteLink, sendPortalInviteEmail } from './invite-email'

beforeEach(() => {
  sent.calls = []
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
  it('copies head office', async () => {
    await sendPortalInviteEmail('ana@client.com', { subject: 'S', text: 'T', html: 'H' })
    expect(sent.calls[0]).toMatchObject({ to: ['ana@client.com'], cc: ['wolthers@wolthers.com'], subject: 'S' })
  })

  it('redirects to the test recipient without the CC in sandbox mode', async () => {
    process.env.MICROSOFT_GRAPH_TEST_RECIPIENT = 'test@wolthers.com'
    await sendPortalInviteEmail('ana@client.com', { subject: 'S', text: 'T', html: 'H' })
    expect(sent.calls[0]).toMatchObject({ to: ['test@wolthers.com'], cc: undefined, subject: '[TEST] S' })
  })
})
```

```ts
// src/lib/portal/team-activity.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notes = vi.hoisted(() => ({ calls: [] as any[] }))
vi.mock('@/lib/notifications', () => ({ createNotification: async (p: any) => { notes.calls.push(p); return { success: true } } }))

import { describeTeamActivity, recordQcTeamActivity } from './team-activity'

function fakeAdmin() {
  const inserts: any[] = []
  return {
    inserts,
    from(table: string) {
      const chain: any = {
        insert(v: any) { inserts.push({ table, v }); return Promise.resolve({ error: null }) },
        select() { return chain },
        eq() { return Promise.resolve({ data: [{ id: 'admin-1' }, { id: 'admin-2' }], error: null }) },
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
  it('logs to portal_activity marked as QC and notifies every global admin', async () => {
    const admin = fakeAdmin()
    await recordQcTeamActivity(admin, input)
    expect(admin.inserts[0]).toEqual({
      table: 'portal_activity',
      v: {
        user_id: 'u-1', company_id: 'co-1', action: 'team_invite',
        payload: { app: 'qc', target_email: 'ana@client.com', keys_before: null, keys_after: { views: ['qc_samples'], capabilities: [] } },
      },
    })
    expect(notes.calls.map((n) => n.user_id)).toEqual(['admin-1', 'admin-2'])
    expect(notes.calls[0]).toMatchObject({ title: 'Portal invitation sent', link: '/clients/co-1' })
  })

  it('describes the action in one line', () => {
    expect(describeTeamActivity(input)).toBe('Bea Costa invited ana@client.com to the QC portal for Roastery One')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/portal/invite-email.test.ts src/lib/portal/team-activity.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the email**

```ts
// src/lib/portal/invite-email.ts
import { sendMail } from '@/lib/graph/send'
import { HOUSE_CC } from '@/lib/approval-notification/resolve-panels'
import { QC_KEY_LABELS, type QcKeySet } from './qc-keys'

/**
 * QC portal invitation emails (spec §6.3). Sent from the QC mailbox through
 * Graph; head office is always copied (house rule); MICROSOFT_GRAPH_TEST_RECIPIENT
 * redirects the send, as on every QC email.
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
  const signature = 'Wolthers & Associates, Quality Control'

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
    signature,
  ].join('\n')

  const html = [
    '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111111">',
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    '<p>You will be able to use:</p>',
    `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
    `<p><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#556b2f;color:#ffffff;text-decoration:none">${escapeHtml(action)}</a></p>`,
    expiry ? `<p style="color:#666666">${escapeHtml(expiry)}</p>` : '',
    `<p style="color:#666666">${escapeHtml(signature)}</p>`,
    '</body></html>',
  ].join('')

  return { subject, text, html }
}

export async function sendPortalInviteEmail(to: string, email: BuiltEmail): Promise<void> {
  const testTo = process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
  await sendMail({
    mailbox: QC_MAILBOX,
    to: [testTo || to],
    cc: testTo ? undefined : [HOUSE_CC],
    subject: testTo ? `[TEST] ${email.subject}` : email.subject,
    bodyText: email.text,
    bodyHtml: email.html,
    saveToSentItems: true,
  })
}
```

- [ ] **Step 4: Implement the activity log**

```ts
// src/lib/portal/team-activity.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import type { QcKeySet } from './qc-keys'

/**
 * Every QC team change is written to sys's portal_activity (payload.app =
 * 'qc') and announced to WAQC global admins in-app (spec §6.8). Logging must
 * never fail the action it records.
 */

export type QcTeamAction = 'team_invite' | 'team_invite_revoked' | 'team_invite_accepted' | 'team_update' | 'team_remove'

const TITLES: Record<QcTeamAction, string> = {
  team_invite: 'Portal invitation sent',
  team_invite_revoked: 'Portal invitation cancelled',
  team_invite_accepted: 'Portal invitation accepted',
  team_update: 'Portal access changed',
  team_remove: 'Portal access removed',
}

const VERBS: Record<QcTeamAction, string> = {
  team_invite: 'invited',
  team_invite_revoked: 'cancelled the invitation of',
  team_invite_accepted: 'accepted the invitation as',
  team_update: 'changed the access of',
  team_remove: 'removed the access of',
}

export interface QcTeamActivityInput {
  actorUserId: string
  actorName: string
  companyId: string
  companyName: string
  action: QcTeamAction
  targetEmail: string
  keysBefore?: QcKeySet | null
  keysAfter?: QcKeySet | null
}

export function describeTeamActivity(input: QcTeamActivityInput): string {
  const preposition = input.action === 'team_invite' ? 'to' : 'on'
  return `${input.actorName} ${VERBS[input.action]} ${input.targetEmail} ${preposition} the QC portal for ${input.companyName}`
}

export async function recordQcTeamActivity(admin: SupabaseClient<any>, input: QcTeamActivityInput): Promise<void> {
  try {
    const { error } = await admin.from('portal_activity').insert({
      user_id: input.actorUserId,
      company_id: input.companyId,
      action: input.action,
      payload: {
        app: 'qc',
        target_email: input.targetEmail,
        keys_before: input.keysBefore ?? null,
        keys_after: input.keysAfter ?? null,
      },
    })
    if (error) console.error('[portal] activity log failed:', error)

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
    actorName: row.actor_name ?? null,
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
git add src/lib/portal/invite-email.ts src/lib/portal/invite-email.test.ts src/lib/portal/team-activity.ts src/lib/portal/team-activity.test.ts
git commit -m "feat(portal): invitation email with head-office CC; team activity log and global-admin notifications"
```

# Client Portal Accounts — Part C: Staff, accept, team and me routes (Tasks 12–14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read first: the plan index `docs/superpowers/plans/2026-10-14-client-portal-accounts.md` and the spec `docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md`. Parts A and B must be done.

---

### Task 12: Invite service and staff routes

**Files:**
- Create: `src/lib/portal/staff-gate.ts`, `src/lib/portal/staff-gate.test.ts`
- Create: `src/lib/portal/invite-service.ts`, `src/lib/portal/invite-service.test.ts`
- Create: `src/app/api/clients/[id]/portal-access/route.ts` (GET, POST)
- Create: `src/app/api/clients/[id]/portal-access/[userId]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/clients/[id]/portal-access/invitations/[invitationId]/route.ts` (POST resend, DELETE cancel)
- Test: `src/app/api/clients/[id]/portal-access/route.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 7, 8, 9, 10, 11; `companyDisplayName` (`src/lib/contract-intake-mapping.ts`); `isExternalQcRole` (Task 6).
- Produces:
  - `canManageClientPortal(profile: { qc_role: string | null; is_global_admin: boolean | null } | null): boolean`
  - `interface StaffContext { userId: string; name: string; admin: SupabaseClient<any> }`
  - `requirePortalStaff(): Promise<{ ok: true; ctx: StaffContext } | { ok: false; response: NextResponse }>`
  - `type InviteOutcome = { outcome: 'invited'; invitationId: string; emailSent: boolean } | { outcome: 'access_added'; userId: string; emailSent: boolean } | { outcome: 'refused'; status: 400 | 409; error: string }`
  - `inviteToCompany(admin, args: { companyId: string; email: string; firstName: string; lastName: string; keys: QcKeySet; isCompanyAdmin: boolean; inviter: { userId: string; name: string; kind: 'staff' | 'manager' } }): Promise<InviteOutcome>`
  - `inviteOutcomeResponse(outcome: InviteOutcome): NextResponse`
  - `loadCompanyName(admin, companyId: string): Promise<string | null>`
  - `resendInvitation(admin, args: { invitation: PortalInvitationRow; companyName: string; inviterName: string; actorUserId: string }): Promise<{ emailSent: boolean } | null>`

- [ ] **Step 1: Write the failing tests for the staff gate and the invite service**

```ts
// src/lib/portal/staff-gate.test.ts
import { describe, expect, it } from 'vitest'
import { canManageClientPortal } from './staff-gate'

describe('canManageClientPortal', () => {
  it('admins, quality admins and lab admins', () => {
    expect(canManageClientPortal({ qc_role: 'global_admin', is_global_admin: true })).toBe(true)
    expect(canManageClientPortal({ qc_role: 'global_quality_admin', is_global_admin: true })).toBe(true)
    expect(canManageClientPortal({ qc_role: 'lab_quality_manager', is_global_admin: false })).toBe(true)
    expect(canManageClientPortal({ qc_role: 'lab_personnel', is_global_admin: false })).toBe(false)
    expect(canManageClientPortal({ qc_role: 'client', is_global_admin: false })).toBe(false)
    expect(canManageClientPortal(null)).toBe(false)
  })
})
```

```ts
// src/lib/portal/invite-service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  setQcAccess: vi.fn(),
  createPortalInvitation: vi.fn(),
  sendPortalInviteEmail: vi.fn(),
  recordQcTeamActivity: vi.fn(),
}))
vi.mock('./qc-grants', async (orig) => ({ ...(await orig<any>()), setQcAccess: m.setQcAccess }))
vi.mock('./portal-invitations', async (orig) => ({ ...(await orig<any>()), createPortalInvitation: m.createPortalInvitation }))
vi.mock('./invite-email', async (orig) => ({ ...(await orig<any>()), sendPortalInviteEmail: m.sendPortalInviteEmail }))
vi.mock('./team-activity', () => ({ recordQcTeamActivity: m.recordQcTeamActivity }))

import { GroupGrantError } from './qc-grants'
import { inviteToCompany } from './invite-service'

/** Rows per table; .ilike matches case-insensitively without wildcards. */
function fakeAdmin(rows: Record<string, any[]>) {
  return {
    from(table: string) {
      const preds: Array<(r: any) => boolean> = []
      const chain: any = {
        select() { return chain },
        eq(c: string, v: unknown) { preds.push((r) => r[c] === v); return chain },
        ilike(c: string, v: string) { const want = v.replace(/\\(.)/g, '$1').toLowerCase(); preds.push((r) => String(r[c]).toLowerCase() === want); return chain },
        maybeSingle() { return Promise.resolve({ data: (rows[table] ?? []).find((r) => preds.every((p) => p(r))) ?? null, error: null }) },
      }
      return chain
    },
  } as any
}

const company = { id: 'co-1', name: 'Roastery One Ltda', fantasy_name: 'Roastery One' }
const keys = { views: ['qc_samples'] as any, capabilities: [] as any }
const staff = { userId: 'staff-1', name: 'Daniel Wolthers', kind: 'staff' as const }

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.createPortalInvitation.mockResolvedValue({ invitation: { id: 'inv-1', expires_at: '2026-10-21T00:00:00Z' }, token: 'tok' })
  m.setQcAccess.mockResolvedValue({ before: null, after: { views: ['qc_samples'], capabilities: [] } })
})

describe('inviteToCompany', () => {
  it('invites a new person with a normalized email', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    const out = await inviteToCompany(admin, { companyId: 'co-1', email: ' Ana.Lima@Client.COM ', firstName: 'Ana', lastName: 'Lima', keys, isCompanyAdmin: true, inviter: staff })
    expect(out).toEqual({ outcome: 'invited', invitationId: 'inv-1', emailSent: true })
    expect(m.createPortalInvitation.mock.calls[0][1]).toMatchObject({ email: 'ana.lima@client.com', isCompanyAdmin: true, invitedByKind: 'staff' })
    expect(m.sendPortalInviteEmail.mock.calls[0][0]).toBe('ana.lima@client.com')
    expect(m.sendPortalInviteEmail.mock.calls[0][1].subject).toContain('Roastery One')
  })

  it('a company admin can never create another admin', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    await inviteToCompany(admin, { companyId: 'co-1', email: 'b@client.com', firstName: 'B', lastName: '', keys, isCompanyAdmin: true, inviter: { ...staff, kind: 'manager' } })
    expect(m.createPortalInvitation.mock.calls[0][1]).toMatchObject({ isCompanyAdmin: false, invitedByKind: 'manager' })
  })

  it('adds keys directly for an active external user and sends an access email', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [{ id: 'u-9', email: 'sys@client.com', user_type: 'external', status: 'active' }], profiles: [] })
    const out = await inviteToCompany(admin, { companyId: 'co-1', email: 'SYS@client.com', firstName: 'S', lastName: '', keys, isCompanyAdmin: false, inviter: staff })
    expect(out).toEqual({ outcome: 'access_added', userId: 'u-9', emailSent: true })
    expect(m.setQcAccess.mock.calls[0][1]).toMatchObject({ userId: 'u-9', companyId: 'co-1', keys, manageUsers: undefined, source: 'admin' })
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
  })

  it('refuses Wolthers and partner accounts', async () => {
    const internal = fakeAdmin({ companies: [company], user_profiles: [{ id: 'u-1', email: 'x@wolthers.com', user_type: 'internal', status: 'active' }], profiles: [] })
    expect(await inviteToCompany(internal, { companyId: 'co-1', email: 'x@wolthers.com', firstName: 'X', lastName: '', keys, isCompanyAdmin: false, inviter: staff }))
      .toMatchObject({ outcome: 'refused', status: 409 })
    const staffProfile = fakeAdmin({ companies: [company], user_profiles: [], profiles: [{ id: 'u-2', email: 'Lab@Partner.com', qc_role: 'lab_personnel' }] })
    expect(await inviteToCompany(staffProfile, { companyId: 'co-1', email: 'lab@partner.com', firstName: 'L', lastName: '', keys, isCompanyAdmin: false, inviter: staff }))
      .toMatchObject({ outcome: 'refused', status: 409 })
  })

  it('validates email, name and pages', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    expect(await inviteToCompany(admin, { companyId: 'co-1', email: 'nope', firstName: 'A', lastName: '', keys, isCompanyAdmin: false, inviter: staff })).toMatchObject({ status: 400 })
    expect(await inviteToCompany(admin, { companyId: 'co-1', email: 'a@b.com', firstName: ' ', lastName: '', keys, isCompanyAdmin: false, inviter: staff })).toMatchObject({ status: 400 })
    expect(await inviteToCompany(admin, { companyId: 'co-1', email: 'a@b.com', firstName: 'A', lastName: '', keys: { views: [], capabilities: [] }, isCompanyAdmin: false, inviter: staff })).toMatchObject({ status: 400 })
  })

  it('reports a failed email without losing the invitation', async () => {
    m.sendPortalInviteEmail.mockRejectedValue(new Error('graph down'))
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    expect(await inviteToCompany(admin, { companyId: 'co-1', email: 'a@b.com', firstName: 'A', lastName: '', keys, isCompanyAdmin: false, inviter: staff }))
      .toEqual({ outcome: 'invited', invitationId: 'inv-1', emailSent: false })
  })

  it('turns a group-copied grant into a 409', async () => {
    m.setQcAccess.mockRejectedValue(new GroupGrantError())
    const admin = fakeAdmin({ companies: [company], user_profiles: [{ id: 'u-9', email: 'g@client.com', user_type: 'external', status: 'active' }], profiles: [] })
    expect(await inviteToCompany(admin, { companyId: 'co-1', email: 'g@client.com', firstName: 'G', lastName: '', keys, isCompanyAdmin: false, inviter: staff }))
      .toMatchObject({ outcome: 'refused', status: 409 })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/portal/staff-gate.test.ts src/lib/portal/invite-service.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the staff gate**

```ts
// src/lib/portal/staff-gate.ts
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { accessKindForUser } from '@/lib/auth/access-kind'
import { portalServiceClient } from './qc-portal-gate'

/** Staff who manage client portal access from /clients/[id] (spec §6.1). */
const PORTAL_MANAGER_ROLES = new Set(['global_admin', 'global_quality_admin', 'lab_quality_manager'])

export function canManageClientPortal(profile: { qc_role: string | null; is_global_admin: boolean | null } | null): boolean {
  if (!profile) return false
  return profile.is_global_admin === true || PORTAL_MANAGER_ROLES.has(profile.qc_role ?? '')
}

export interface StaffContext {
  userId: string
  name: string
  admin: SupabaseClient<any>
}

export async function requirePortalStaff(): Promise<{ ok: true; ctx: StaffContext } | { ok: false; response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = portalServiceClient()
  if ((await accessKindForUser(admin, user.id)) !== 'staff') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const { data: profile } = await admin
    .from('profiles')
    .select('qc_role, is_global_admin, full_name, email')
    .eq('id', user.id)
    .maybeSingle()
  if (!canManageClientPortal(profile)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Only admins and lab admins manage client portal access' }, { status: 403 }),
    }
  }
  return { ok: true, ctx: { userId: user.id, name: profile?.full_name || profile?.email || 'Wolthers QC', admin } }
}
```

- [ ] **Step 4: Implement the invite service**

```ts
// src/lib/portal/invite-service.ts
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { isExternalQcRole } from '@/lib/auth/new-profile'
import { GroupGrantError, setQcAccess } from './qc-grants'
import {
  createPortalInvitation, escapeLike, isValidEmail, normalizeEmail, reissueInvitation,
  type PortalInvitationRow,
} from './portal-invitations'
import {
  buildPortalInviteEmail, portalInviteLink, portalSignInLink, sendPortalInviteEmail,
} from './invite-email'
import { recordQcTeamActivity } from './team-activity'
import { normalizeQcKeys, qcKeysOf, type QcKeySet } from './qc-keys'

/**
 * One invite path for staff (/clients/[id]) and company admins (/portal/team),
 * spec §6.1–6.2:
 *   * an active external user gets the keys on their grant + an access email
 *   * a Wolthers or partner account is refused
 *   * anyone else gets a portal_invitations row + an invitation email
 */

export type InviteOutcome =
  | { outcome: 'invited'; invitationId: string; emailSent: boolean }
  | { outcome: 'access_added'; userId: string; emailSent: boolean }
  | { outcome: 'refused'; status: 400 | 409; error: string }

function refused(status: 400 | 409, error: string): InviteOutcome {
  return { outcome: 'refused', status, error }
}

export async function loadCompanyName(admin: SupabaseClient<any>, companyId: string): Promise<string | null> {
  const { data } = await admin.from('companies').select('id, name, fantasy_name').eq('id', companyId).maybeSingle()
  return data ? companyDisplayName(data) : null
}

async function trySend(to: string, mail: Parameters<typeof sendPortalInviteEmail>[1]): Promise<boolean> {
  try {
    await sendPortalInviteEmail(to, mail)
    return true
  } catch (error) {
    console.error('[portal] invitation email failed:', error)
    return false
  }
}

export async function inviteToCompany(
  admin: SupabaseClient<any>,
  args: {
    companyId: string
    email: string
    firstName: string
    lastName: string
    keys: QcKeySet
    isCompanyAdmin: boolean
    inviter: { userId: string; name: string; kind: 'staff' | 'manager' }
  },
): Promise<InviteOutcome> {
  const email = normalizeEmail(args.email)
  const keys = normalizeQcKeys(args.keys)
  if (!isValidEmail(email)) return refused(400, 'Enter a valid email address')
  if (!args.firstName.trim()) return refused(400, 'Enter a first name')
  if (keys.views.length === 0) return refused(400, 'Choose at least one page')
  const isCompanyAdmin = args.inviter.kind === 'staff' && args.isCompanyAdmin

  const companyName = await loadCompanyName(admin, args.companyId)
  if (!companyName) return refused(400, 'Company not found')

  const pattern = escapeLike(email)
  const [{ data: account }, { data: staffProfile }] = await Promise.all([
    admin.from('user_profiles').select('id, user_type, status').ilike('email', pattern).maybeSingle(),
    admin.from('profiles').select('id, qc_role').ilike('email', pattern).maybeSingle(),
  ])
  const isStaffProfile = !!staffProfile?.qc_role && !isExternalQcRole(staffProfile.qc_role)
  if (isStaffProfile || (account && account.user_type !== 'external')) {
    return refused(409, 'This email belongs to a Wolthers or partner account and cannot be invited as a client')
  }

  if (account && account.status === 'active') {
    let result
    try {
      result = await setQcAccess(admin, {
        userId: account.id,
        companyId: args.companyId,
        keys,
        manageUsers: isCompanyAdmin ? true : undefined,
        source: args.inviter.kind === 'staff' ? 'admin' : 'manager',
        createdBy: args.inviter.userId,
      })
    } catch (error) {
      if (error instanceof GroupGrantError) return refused(409, error.message)
      throw error
    }
    const mail = buildPortalInviteEmail({
      kind: 'access_added', firstName: args.firstName, companyName, inviterName: args.inviter.name,
      keys, isCompanyAdmin, link: portalSignInLink(args.companyId), expiresAt: null,
    })
    const emailSent = await trySend(email, mail)
    await recordQcTeamActivity(admin, {
      actorUserId: args.inviter.userId, actorName: args.inviter.name, companyId: args.companyId, companyName,
      action: 'team_update', targetEmail: email,
      keysBefore: result.before ? qcKeysOf(result.before) : null, keysAfter: qcKeysOf(result.after),
    })
    return { outcome: 'access_added', userId: account.id, emailSent }
  }

  const { invitation, token } = await createPortalInvitation(admin, {
    companyId: args.companyId, email, firstName: args.firstName, lastName: args.lastName, keys,
    isCompanyAdmin, invitedBy: args.inviter.userId, invitedByKind: args.inviter.kind,
  })
  const mail = buildPortalInviteEmail({
    kind: 'invitation', firstName: args.firstName, companyName, inviterName: args.inviter.name,
    keys, isCompanyAdmin, link: portalInviteLink(token), expiresAt: invitation.expires_at,
  })
  const emailSent = await trySend(email, mail)
  await recordQcTeamActivity(admin, {
    actorUserId: args.inviter.userId, actorName: args.inviter.name, companyId: args.companyId, companyName,
    action: 'team_invite', targetEmail: email, keysAfter: keys,
  })
  return { outcome: 'invited', invitationId: invitation.id, emailSent }
}

export function inviteOutcomeResponse(outcome: InviteOutcome): NextResponse {
  if (outcome.outcome === 'refused') return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json(outcome)
}

/** New token + 7 more days for a pending invitation, emailed again. */
export async function resendInvitation(
  admin: SupabaseClient<any>,
  args: { invitation: PortalInvitationRow; companyName: string; inviterName: string; actorUserId: string },
): Promise<{ emailSent: boolean } | null> {
  const fresh = await reissueInvitation(admin, { invitationId: args.invitation.id, companyId: args.invitation.company_id })
  if (!fresh) return null
  const keys = normalizeQcKeys(fresh.invitation)
  const mail = buildPortalInviteEmail({
    kind: 'invitation', firstName: fresh.invitation.first_name, companyName: args.companyName, inviterName: args.inviterName,
    keys, isCompanyAdmin: fresh.invitation.is_company_admin, link: portalInviteLink(fresh.token), expiresAt: fresh.invitation.expires_at,
  })
  const emailSent = await trySend(fresh.invitation.email, mail)
  await recordQcTeamActivity(admin, {
    actorUserId: args.actorUserId, actorName: args.inviterName, companyId: args.invitation.company_id, companyName: args.companyName,
    action: 'team_invite', targetEmail: fresh.invitation.email, keysAfter: keys,
  })
  return { emailSent }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/portal/staff-gate.test.ts src/lib/portal/invite-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the staff routes**

```ts
// src/app/api/clients/[id]/portal-access/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requirePortalStaff } from '@/lib/portal/staff-gate'
import { listQcMembers } from '@/lib/portal/qc-grants'
import { listPendingInvitations, toInvitationSummary } from '@/lib/portal/portal-invitations'
import { listQcTeamActivity } from '@/lib/portal/team-activity'
import { inviteOutcomeResponse, inviteToCompany } from '@/lib/portal/invite-service'
import { normalizeQcKeys } from '@/lib/portal/qc-keys'
import { isUuid } from '@/lib/portal/qc-portal-gate'

/** GET: who has QC portal access to this company, pending invitations, recent activity. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePortalStaff()
  if (!gate.ok) return gate.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid company' }, { status: 400 })
  const { admin } = gate.ctx
  const [members, invitations, activity] = await Promise.all([
    listQcMembers(admin, id),
    listPendingInvitations(admin, id),
    listQcTeamActivity(admin, id),
  ])
  return NextResponse.json({ members, invitations: invitations.map(toInvitationSummary), activity })
}

/** POST: invite a person (body: email, first_name, last_name, views, capabilities, is_company_admin). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePortalStaff()
  if (!gate.ok) return gate.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid company' }, { status: 400 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const outcome = await inviteToCompany(gate.ctx.admin, {
    companyId: id,
    email: String(body.email ?? ''),
    firstName: String(body.first_name ?? ''),
    lastName: String(body.last_name ?? ''),
    keys: normalizeQcKeys(body),
    isCompanyAdmin: body.is_company_admin === true,
    inviter: { userId: gate.ctx.userId, name: gate.ctx.name, kind: 'staff' },
  })
  return inviteOutcomeResponse(outcome)
}
```

```ts
// src/app/api/clients/[id]/portal-access/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requirePortalStaff } from '@/lib/portal/staff-gate'
import { GroupGrantError, removeQcAccess, setQcAccess } from '@/lib/portal/qc-grants'
import { normalizeQcKeys, qcKeysOf } from '@/lib/portal/qc-keys'
import { isUuid } from '@/lib/portal/qc-portal-gate'
import { loadCompanyName } from '@/lib/portal/invite-service'
import { recordQcTeamActivity } from '@/lib/portal/team-activity'

async function targetEmail(admin: any, userId: string): Promise<string> {
  const { data } = await admin.from('user_profiles').select('email').eq('id', userId).maybeSingle()
  return data?.email ?? userId
}

/** PATCH: set a person's QC keys (body: views, capabilities, is_company_admin?). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const gate = await requirePortalStaff()
  if (!gate.ok) return gate.response
  const { id, userId } = await params
  if (!isUuid(id) || !isUuid(userId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const keys = normalizeQcKeys(body)
  if (keys.views.length === 0) {
    return NextResponse.json({ error: 'Choose at least one page, or remove the access instead' }, { status: 400 })
  }
  const { admin } = gate.ctx
  try {
    const result = await setQcAccess(admin, {
      userId, companyId: id, keys,
      manageUsers: typeof body.is_company_admin === 'boolean' ? body.is_company_admin : undefined,
      source: 'admin', createdBy: gate.ctx.userId,
    })
    await recordQcTeamActivity(admin, {
      actorUserId: gate.ctx.userId, actorName: gate.ctx.name, companyId: id,
      companyName: (await loadCompanyName(admin, id)) ?? '', action: 'team_update',
      targetEmail: await targetEmail(admin, userId),
      keysBefore: result.before ? qcKeysOf(result.before) : null, keysAfter: qcKeysOf(result.after),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof GroupGrantError) return NextResponse.json({ error: error.message }, { status: 409 })
    throw error
  }
}

/** DELETE: remove a person's QC access (and company-admin status when nothing of sys is left). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const gate = await requirePortalStaff()
  if (!gate.ok) return gate.response
  const { id, userId } = await params
  if (!isUuid(id) || !isUuid(userId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin } = gate.ctx
  try {
    const result = await removeQcAccess(admin, { userId, companyId: id, alsoManageUsers: true })
    if (!result.before) return NextResponse.json({ error: 'No access to remove' }, { status: 404 })
    await recordQcTeamActivity(admin, {
      actorUserId: gate.ctx.userId, actorName: gate.ctx.name, companyId: id,
      companyName: (await loadCompanyName(admin, id)) ?? '', action: 'team_remove',
      targetEmail: await targetEmail(admin, userId), keysBefore: qcKeysOf(result.before), keysAfter: null,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof GroupGrantError) return NextResponse.json({ error: error.message }, { status: 409 })
    throw error
  }
}
```

```ts
// src/app/api/clients/[id]/portal-access/invitations/[invitationId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requirePortalStaff } from '@/lib/portal/staff-gate'
import { cancelInvitation, findCompanyInvitation } from '@/lib/portal/portal-invitations'
import { loadCompanyName, resendInvitation } from '@/lib/portal/invite-service'
import { recordQcTeamActivity } from '@/lib/portal/team-activity'
import { normalizeQcKeys } from '@/lib/portal/qc-keys'
import { isUuid } from '@/lib/portal/qc-portal-gate'

/** POST: resend (new link, 7 more days). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; invitationId: string }> }) {
  const gate = await requirePortalStaff()
  if (!gate.ok) return gate.response
  const { id, invitationId } = await params
  if (!isUuid(id) || !isUuid(invitationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin } = gate.ctx
  const invitation = await findCompanyInvitation(admin, { invitationId, companyId: id })
  if (!invitation || invitation.status !== 'pending') return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  const result = await resendInvitation(admin, {
    invitation, companyName: (await loadCompanyName(admin, id)) ?? '', inviterName: gate.ctx.name, actorUserId: gate.ctx.userId,
  })
  if (!result) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  return NextResponse.json({ ok: true, emailSent: result.emailSent })
}

/** DELETE: cancel. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; invitationId: string }> }) {
  const gate = await requirePortalStaff()
  if (!gate.ok) return gate.response
  const { id, invitationId } = await params
  if (!isUuid(id) || !isUuid(invitationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin } = gate.ctx
  const cancelled = await cancelInvitation(admin, { invitationId, companyId: id })
  if (!cancelled) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  await recordQcTeamActivity(admin, {
    actorUserId: gate.ctx.userId, actorName: gate.ctx.name, companyId: id,
    companyName: (await loadCompanyName(admin, id)) ?? '', action: 'team_invite_revoked',
    targetEmail: cancelled.email, keysBefore: normalizeQcKeys(cancelled), keysAfter: null,
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: Route test for the staff POST**

```ts
// src/app/api/clients/[id]/portal-access/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, invite: vi.fn() }))
vi.mock('@/lib/portal/staff-gate', () => ({ requirePortalStaff: async () => m.gate }))
vi.mock('@/lib/portal/invite-service', async () => ({
  inviteToCompany: m.invite,
  inviteOutcomeResponse: (o: any) => o.outcome === 'refused'
    ? NextResponse.json({ error: o.error }, { status: o.status })
    : NextResponse.json(o),
}))

import { POST } from './route'

const CO = '11111111-1111-4111-8111-111111111111'
const req = (body: unknown) => ({ json: async () => body }) as any
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  m.invite.mockReset()
  m.gate = { ok: true, ctx: { userId: 'staff-1', name: 'Daniel', admin: {} } }
})

describe('POST /api/clients/[id]/portal-access', () => {
  it('refuses non-staff', async () => {
    m.gate = { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    const res = await POST(req({}), params(CO))
    expect(res.status).toBe(403)
    expect(m.invite).not.toHaveBeenCalled()
  })

  it('passes only QC keys and the admin flag through, as a staff invitation', async () => {
    m.invite.mockResolvedValue({ outcome: 'invited', invitationId: 'inv-1', emailSent: true })
    const res = await POST(req({
      email: 'ana@client.com', first_name: 'Ana', last_name: 'Lima',
      views: ['qc_samples', 'contracts'], capabilities: ['manage_users', 'qc_spec_edit'], is_company_admin: true,
    }), params(CO))
    expect(res.status).toBe(200)
    expect(m.invite.mock.calls[0][1]).toEqual({
      companyId: CO, email: 'ana@client.com', firstName: 'Ana', lastName: 'Lima',
      keys: { views: ['qc_samples'], capabilities: ['qc_spec_edit'] }, isCompanyAdmin: true,
      inviter: { userId: 'staff-1', name: 'Daniel', kind: 'staff' },
    })
  })

  it('400 on a malformed company id', async () => {
    expect((await POST(req({}), params('nope'))).status).toBe(400)
  })
})
```

Run: `npx vitest run "src/app/api/clients/[id]/portal-access" src/app/api/route-exports.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit -p .` → no errors.

```bash
git add src/lib/portal/staff-gate.ts src/lib/portal/staff-gate.test.ts src/lib/portal/invite-service.ts \
  src/lib/portal/invite-service.test.ts "src/app/api/clients/[id]/portal-access"
git commit -m "feat(portal): staff invite, change and remove client portal access from the client page"
```

---

### Task 13: Accept routes `/api/portal/accept`

**Files:**
- Create: `src/lib/portal/accept-invitation.ts`, `src/lib/portal/accept-invitation.test.ts`
- Create: `src/app/api/portal/accept/route.ts` (GET, POST)

**Interfaces:**
- Consumes: Tasks 8 (`portalServiceClient`), 9 (`setQcAccess`), 10 (find/claim/release/record, `invitationState`, `escapeLike`), 11 (`recordQcTeamActivity`), 12 (`loadCompanyName`).
- Produces:
  - `INVALID_INVITATION: string`
  - `microsoftSignInEnabled(): boolean` (reads `NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN === 'true'`)
  - `interface InvitationDescription { email: string; firstName: string; companyName: string; inviterName: string; expiresAt: string; microsoft: boolean }`
  - `describeInvitation(admin, token: string): Promise<InvitationDescription | null>`
  - `acceptInvitation(admin, input: { token: string; method: 'password' | 'microsoft'; password: string | null }): Promise<{ status: number; body: Record<string, unknown> }>`
  - API: `GET /api/portal/accept?token=` → 200 `InvitationDescription` | 410; `POST /api/portal/accept` body `{ token, method, password? }` → 200 `{ ok: true, email, method }` | 400 | 409 | 410 | 500

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal/accept-invitation.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  find: vi.fn(), claim: vi.fn(), release: vi.fn(), record: vi.fn(), setQcAccess: vi.fn(), activity: vi.fn(),
}))
vi.mock('./portal-invitations', async (orig) => ({
  ...(await orig<any>()),
  findInvitationByToken: m.find, claimInvitation: m.claim, releaseInvitation: m.release, recordAcceptedUser: m.record,
}))
vi.mock('./qc-grants', () => ({ setQcAccess: m.setQcAccess }))
vi.mock('./team-activity', () => ({ recordQcTeamActivity: m.activity }))
vi.mock('./invite-service', () => ({ loadCompanyName: async () => 'Roastery One' }))

import { INVALID_INVITATION, acceptInvitation } from './accept-invitation'

const pending = {
  id: 'inv-1', company_id: 'co-1', email: 'ana@client.com', first_name: 'Ana', last_name: 'Lima',
  views: ['qc_samples'], capabilities: [], is_company_admin: true, invited_by: 'staff-1', invited_by_kind: 'staff',
  status: 'pending', expires_at: '2999-01-01T00:00:00Z', accepted_at: null, accepted_user_id: null, created_at: '2026-10-14T00:00:00Z',
}

function fakeAdmin(opts: { account?: any; createError?: any } = {}) {
  const auth = {
    createUser: vi.fn(async () => (opts.createError ? { data: null, error: opts.createError } : { data: { user: { id: 'new-user' } }, error: null })),
    updateUserById: vi.fn(async () => ({ data: {}, error: null })),
  }
  const writes: any[] = []
  const admin: any = {
    auth: { admin: auth },
    writes,
    from(table: string) {
      let op = 'select'
      let values: any = null
      const chain: any = {
        select() { return chain },
        update(v: any) { op = 'update'; values = v; return chain },
        insert(v: any) { writes.push({ table, op: 'insert', values: v }); return Promise.resolve({ error: null }) },
        eq() { return chain },
        ilike() { return chain },
        maybeSingle() { return Promise.resolve({ data: table === 'user_profiles' ? opts.account ?? null : null, error: null }) },
        then(ok: any, bad: any) {
          writes.push({ table, op, values })
          return Promise.resolve({ data: op === 'update' ? [{ id: 'row' }] : null, error: null }).then(ok, bad)
        },
      }
      return chain
    },
  }
  return admin
}

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.find.mockResolvedValue(pending)
  m.claim.mockResolvedValue(true)
  m.setQcAccess.mockResolvedValue({ before: null, after: { views: ['qc_samples'], capabilities: ['manage_users'] } })
})

describe('acceptInvitation', () => {
  it('410 for an unknown, used or expired link, without creating anything', async () => {
    for (const row of [null, { ...pending, status: 'accepted' }, { ...pending, expires_at: '2000-01-01T00:00:00Z' }, { ...pending, status: 'cancelled' }]) {
      m.find.mockResolvedValueOnce(row)
      const admin = fakeAdmin()
      expect(await acceptInvitation(admin, { token: 't'.repeat(43), method: 'password', password: 'long-enough' }))
        .toEqual({ status: 410, body: { error: INVALID_INVITATION } })
      expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
    }
  })

  it('410 when a second click finds the invitation already claimed', async () => {
    m.claim.mockResolvedValue(false)
    const admin = fakeAdmin()
    expect((await acceptInvitation(admin, { token: 't'.repeat(43), method: 'password', password: 'long-enough' })).status).toBe(410)
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it('400 on a short password, before claiming', async () => {
    const admin = fakeAdmin()
    expect((await acceptInvitation(admin, { token: 't'.repeat(43), method: 'password', password: 'short' })).status).toBe(400)
    expect(m.claim).not.toHaveBeenCalled()
  })

  it('400 for Microsoft while the flag is off', async () => {
    delete process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN
    expect((await acceptInvitation(fakeAdmin(), { token: 't'.repeat(43), method: 'microsoft', password: null })).status).toBe(400)
  })

  it('creates the login, marks it external and active, and grants the invitation keys', async () => {
    const admin = fakeAdmin()
    const res = await acceptInvitation(admin, { token: 't'.repeat(43), method: 'password', password: 'long-enough' })
    expect(res).toEqual({ status: 200, body: { ok: true, email: 'ana@client.com', method: 'password' } })
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'ana@client.com', email_confirm: true, password: 'long-enough', user_metadata: { full_name: 'Ana Lima' },
    })
    expect(admin.writes).toContainEqual({ table: 'user_profiles', op: 'update', values: { user_type: 'external', status: 'active', full_name: 'Ana Lima' } })
    expect(m.setQcAccess.mock.calls[0][1]).toEqual({
      userId: 'new-user', companyId: 'co-1', keys: { views: ['qc_samples'], capabilities: [] },
      manageUsers: true, source: 'admin', createdBy: 'staff-1',
    })
    expect(m.record).toHaveBeenCalledWith(admin, { invitationId: 'inv-1', userId: 'new-user' })
  })

  it('reuses an existing external login and sets its password', async () => {
    const admin = fakeAdmin({ account: { id: 'ext-1', user_type: 'external' } })
    await acceptInvitation(admin, { token: 't'.repeat(43), method: 'password', password: 'long-enough' })
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('ext-1', { password: 'long-enough', email_confirm: true })
  })

  it('409 for a Wolthers account, and the link works again', async () => {
    const admin = fakeAdmin({ account: { id: 'int-1', user_type: 'internal' } })
    expect((await acceptInvitation(admin, { token: 't'.repeat(43), method: 'password', password: 'long-enough' })).status).toBe(409)
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('500 and release when something fails half-way', async () => {
    const admin = fakeAdmin({ createError: { message: 'boom' } })
    expect((await acceptInvitation(admin, { token: 't'.repeat(43), method: 'password', password: 'long-enough' })).status).toBe(500)
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/portal/accept-invitation.test.ts`
Expected: FAIL, cannot resolve `./accept-invitation`.

- [ ] **Step 3: Implement**

```ts
// src/lib/portal/accept-invitation.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  claimInvitation, escapeLike, findInvitationByToken, invitationState, recordAcceptedUser, releaseInvitation,
} from './portal-invitations'
import { setQcAccess } from './qc-grants'
import { recordQcTeamActivity } from './team-activity'
import { loadCompanyName } from './invite-service'
import { normalizeQcKeys } from './qc-keys'

/**
 * Accepting a QC portal invitation (spec §6.4). The login is created here,
 * server-side, so the shared Supabase sign-up setting never matters. The
 * invitation is claimed before anything is created; a failure releases it.
 */

export const INVALID_INVITATION = 'This invitation is no longer valid. Ask the person who invited you to send a new one.'

export function microsoftSignInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN === 'true'
}

export interface InvitationDescription {
  email: string
  firstName: string
  companyName: string
  inviterName: string
  expiresAt: string
  microsoft: boolean
}

export async function describeInvitation(admin: SupabaseClient<any>, token: string): Promise<InvitationDescription | null> {
  const invitation = await findInvitationByToken(admin, token)
  if (!invitation || invitationState(invitation, new Date()) !== 'usable') return null
  const [companyName, { data: inviter }] = await Promise.all([
    loadCompanyName(admin, invitation.company_id),
    admin.from('user_profiles').select('full_name').eq('id', invitation.invited_by).maybeSingle(),
  ])
  return {
    email: invitation.email,
    firstName: invitation.first_name,
    companyName: companyName ?? '',
    inviterName: inviter?.full_name || 'Wolthers QC',
    expiresAt: invitation.expires_at,
    microsoft: microsoftSignInEnabled(),
  }
}

const gone = () => ({ status: 410, body: { error: INVALID_INVITATION } })

export async function acceptInvitation(
  admin: SupabaseClient<any>,
  input: { token: string; method: 'password' | 'microsoft'; password: string | null },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const now = new Date()
  const invitation = await findInvitationByToken(admin, input.token)
  if (!invitation || invitationState(invitation, now) !== 'usable') return gone()

  if (input.method === 'microsoft' && !microsoftSignInEnabled()) {
    return { status: 400, body: { error: 'Choose a password to continue' } }
  }
  const password = input.method === 'password' ? input.password ?? '' : null
  if (password !== null && (password.length < 8 || password.length > 72)) {
    return { status: 400, body: { error: 'Use a password of 8 to 72 characters' } }
  }

  if (!(await claimInvitation(admin, { invitationId: invitation.id, now }))) return gone()

  try {
    const fullName = `${invitation.first_name} ${invitation.last_name}`.trim()
    const { data: account } = await admin
      .from('user_profiles')
      .select('id, user_type')
      .ilike('email', escapeLike(invitation.email))
      .maybeSingle()
    if (account && account.user_type !== 'external') {
      await releaseInvitation(admin, invitation.id)
      return { status: 409, body: { error: 'This email belongs to a Wolthers account. Please contact Wolthers.' } }
    }

    let userId: string
    if (account) {
      userId = account.id
      if (password !== null) {
        const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true })
        if (error) throw error
      }
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: invitation.email,
        email_confirm: true,
        ...(password !== null ? { password } : {}),
        user_metadata: { full_name: fullName },
      })
      if (error || !data?.user) throw error ?? new Error('createUser returned no user')
      userId = data.user.id
    }

    // The sign-up trigger wrote external / pending; make it external / active.
    const { data: updated, error: updateError } = await admin
      .from('user_profiles')
      .update({ user_type: 'external', status: 'active', full_name: fullName || null })
      .eq('id', userId)
      .select('id')
    if (updateError) throw updateError
    if (!updated || updated.length === 0) {
      const { error } = await admin.from('user_profiles').insert({
        id: userId, email: invitation.email, full_name: fullName || null,
        user_type: 'external', status: 'active', permissions: [], department_ids: [],
      })
      if (error) throw error
    }

    const keys = normalizeQcKeys(invitation)
    await setQcAccess(admin, {
      userId,
      companyId: invitation.company_id,
      keys,
      manageUsers: invitation.is_company_admin && invitation.invited_by_kind === 'staff' ? true : undefined,
      source: invitation.invited_by_kind === 'staff' ? 'admin' : 'manager',
      createdBy: invitation.invited_by,
    })
    await recordAcceptedUser(admin, { invitationId: invitation.id, userId })
    await recordQcTeamActivity(admin, {
      actorUserId: userId, actorName: fullName || invitation.email, companyId: invitation.company_id,
      companyName: (await loadCompanyName(admin, invitation.company_id)) ?? '',
      action: 'team_invite_accepted', targetEmail: invitation.email, keysAfter: keys,
    })
    return { status: 200, body: { ok: true, email: invitation.email, method: input.method } }
  } catch (error) {
    console.error('[portal] accepting invitation failed:', error)
    await releaseInvitation(admin, invitation.id)
    return { status: 500, body: { error: 'Something went wrong. Please try the link again in a minute.' } }
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/portal/accept-invitation.test.ts`
Expected: PASS.

- [ ] **Step 5: The route**

```ts
// src/app/api/portal/accept/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { portalServiceClient } from '@/lib/portal/qc-portal-gate'
import { INVALID_INVITATION, acceptInvitation, describeInvitation } from '@/lib/portal/accept-invitation'

/** Public: what an invitation link is for (no token hash, no keys beyond what the page shows). */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const description = await describeInvitation(portalServiceClient(), token)
  if (!description) return NextResponse.json({ error: INVALID_INVITATION }, { status: 410 })
  return NextResponse.json(description)
}

/** Public: accept with a password or Microsoft. Body: { token, method, password? }. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const result = await acceptInvitation(portalServiceClient(), {
    token: typeof body?.token === 'string' ? body.token : '',
    method: body?.method === 'microsoft' ? 'microsoft' : 'password',
    password: typeof body?.password === 'string' ? body.password : null,
  })
  return NextResponse.json(result.body, { status: result.status })
}
```

- [ ] **Step 6: Typecheck, route-export guard, commit**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/lib/portal src/app/api/route-exports.test.ts` → PASS.

```bash
git add src/lib/portal/accept-invitation.ts src/lib/portal/accept-invitation.test.ts src/app/api/portal/accept/route.ts
git commit -m "feat(portal): accept an invitation — login created server-side, external + active, grant from the invitation; claim/release guards reuse"
```

---

### Task 14: Team routes and `/api/portal/me`

**Files:**
- Create: `src/lib/portal/portal-me.ts`, `src/lib/portal/portal-me.test.ts`
- Create: `src/app/api/portal/me/route.ts` (GET)
- Create: `src/lib/portal/team-rules.ts`, `src/lib/portal/team-rules.test.ts`
- Create: `src/app/api/portal/team/route.ts` (GET, POST)
- Create: `src/app/api/portal/team/[userId]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/portal/team/invitations/[invitationId]/route.ts` (POST resend, DELETE cancel)
- Test: `src/app/api/portal/team/[userId]/route.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 7–12.
- Produces:
  - `interface PortalCompany { id: string; name: string; keys: QcKeySet; isCompanyAdmin: boolean }`
  - `interface PortalMe { kind: 'external' | 'staff'; fullName: string | null; email: string | null; companies: PortalCompany[]; viewAs: boolean }`
  - `buildExternalMe(profile: { full_name: string | null; email: string | null }, grants: any[]): PortalMe` (grants embed `companies(id, name, fantasy_name)`)
  - `GET /api/portal/me[?company=]` → `PortalMe` | 401 | 403
  - `teamTargetError(args: { selfId: string; targetId: string; target: { capabilities: string[] | null; views: string[] | null } | null }): { status: 403 | 404; error: string } | null`
  - `GET /api/portal/team?company=` → `{ members: QcMember[]; invitations: InvitationSummary[]; ceiling: QcKeySet; selfId: string }`
  - `POST /api/portal/team?company=` body `{ email, first_name, last_name, views, capabilities }`
  - `PATCH|DELETE /api/portal/team/[userId]?company=`
  - `POST|DELETE /api/portal/team/invitations/[invitationId]?company=`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/portal/portal-me.test.ts
import { describe, expect, it } from 'vitest'
import { buildExternalMe } from './portal-me'

describe('buildExternalMe', () => {
  it('lists only companies with a QC view, by fantasy name, with keys and admin flag', () => {
    const me = buildExternalMe({ full_name: 'Ana Lima', email: 'ana@client.com' }, [
      { company_id: 'b', views: ['qc_samples'], capabilities: ['manage_users'], companies: { id: 'b', name: 'Zeta Ltda', fantasy_name: 'Beta Roasters' } },
      { company_id: 'c', views: ['contracts'], capabilities: [], companies: { id: 'c', name: 'Sys Only', fantasy_name: null } },
      { company_id: 'a', views: ['qc_certificates'], capabilities: [], companies: { id: 'a', name: 'Alpha Coffee SA', fantasy_name: '' } },
    ])
    expect(me).toEqual({
      kind: 'external', fullName: 'Ana Lima', email: 'ana@client.com', viewAs: false,
      companies: [
        { id: 'a', name: 'Alpha Coffee SA', keys: { views: ['qc_certificates'], capabilities: [] }, isCompanyAdmin: false },
        { id: 'b', name: 'Beta Roasters', keys: { views: ['qc_samples'], capabilities: [] }, isCompanyAdmin: true },
      ],
    })
  })
})
```

```ts
// src/lib/portal/team-rules.test.ts
import { describe, expect, it } from 'vitest'
import { teamTargetError } from './team-rules'

describe('teamTargetError', () => {
  const member = { views: ['qc_samples'], capabilities: [] }
  it('a company admin cannot act on themselves', () => {
    expect(teamTargetError({ selfId: 'u1', targetId: 'u1', target: member })).toMatchObject({ status: 403 })
  })
  it('nor on another company admin', () => {
    expect(teamTargetError({ selfId: 'u1', targetId: 'u2', target: { views: ['qc_samples'], capabilities: ['manage_users'] } })).toMatchObject({ status: 403 })
  })
  it('404 when the person has no QC access here', () => {
    expect(teamTargetError({ selfId: 'u1', targetId: 'u2', target: null })).toMatchObject({ status: 404 })
    expect(teamTargetError({ selfId: 'u1', targetId: 'u2', target: { views: ['contracts'], capabilities: [] } })).toMatchObject({ status: 404 })
  })
  it('allows an ordinary member', () => {
    expect(teamTargetError({ selfId: 'u1', targetId: 'u2', target: member })).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/portal/portal-me.test.ts src/lib/portal/team-rules.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

```ts
// src/lib/portal/portal-me.ts
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { hasQcView, isCompanyAdmin, qcKeysOf, type QcKeySet } from './qc-keys'

export interface PortalCompany {
  id: string
  name: string
  keys: QcKeySet
  isCompanyAdmin: boolean
}

export interface PortalMe {
  kind: 'external' | 'staff'
  fullName: string | null
  email: string | null
  companies: PortalCompany[]
  viewAs: boolean
}

/** The portal identity of an external user: one entry per company with a QC view. */
export function buildExternalMe(profile: { full_name: string | null; email: string | null }, grants: any[]): PortalMe {
  const companies = grants
    .filter(hasQcView)
    .map((g) => ({
      id: g.company_id as string,
      name: companyDisplayName(g.companies ?? null) || 'Company',
      keys: qcKeysOf(g),
      isCompanyAdmin: isCompanyAdmin(g),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { kind: 'external', fullName: profile.full_name, email: profile.email, companies, viewAs: false }
}
```

```ts
// src/lib/portal/team-rules.ts
import { isCompanyAdmin, qcKeysOf } from './qc-keys'

/**
 * What a company admin may not do on /portal/team (spec §6.2): act on
 * themselves, or on another company admin (staff do that), or on someone
 * with no QC access to this company.
 */
export function teamTargetError(args: {
  selfId: string
  targetId: string
  target: { capabilities: string[] | null; views: string[] | null } | null
}): { status: 403 | 404; error: string } | null {
  if (args.selfId === args.targetId) return { status: 403, error: 'You cannot change your own access' }
  if (!args.target) return { status: 404, error: 'This person has no QC portal access here' }
  const keys = qcKeysOf(args.target)
  if (keys.views.length + keys.capabilities.length === 0) {
    return { status: 404, error: 'This person has no QC portal access here' }
  }
  if (isCompanyAdmin(args.target)) return { status: 403, error: 'Only Wolthers can change a company admin' }
  return null
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/portal/portal-me.test.ts src/lib/portal/team-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: `/api/portal/me`**

```ts
// src/app/api/portal/me/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { accessKindForUser } from '@/lib/auth/access-kind'
import { isUuid, portalServiceClient } from '@/lib/portal/qc-portal-gate'
import { buildExternalMe, type PortalMe } from '@/lib/portal/portal-me'
import { loadCompanyName } from '@/lib/portal/invite-service'
import { QC_VIEWS } from '@/lib/portal/qc-keys'

/** Who is using the portal, and the companies and keys they have there. */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = portalServiceClient()
  const kind = await accessKindForUser(admin, user.id)

  if (kind === 'external') {
    const [{ data: profile }, { data: grants }] = await Promise.all([
      admin.from('user_profiles').select('full_name, email, status').eq('id', user.id).maybeSingle(),
      admin
        .from('external_user_company_grants')
        .select('company_id, views, capabilities, companies(id, name, fantasy_name)')
        .eq('user_id', user.id),
    ])
    if (profile?.status !== 'active') return NextResponse.json({ error: 'Your access is not active' }, { status: 403 })
    const me = buildExternalMe({ full_name: profile?.full_name ?? null, email: profile?.email ?? user.email ?? null }, grants ?? [])
    if (me.companies.length === 0) return NextResponse.json({ error: 'No QC portal access' }, { status: 403 })
    return NextResponse.json(me)
  }

  if (kind === 'staff') {
    const companyId = request.nextUrl.searchParams.get('company') ?? ''
    if (!isUuid(companyId)) return NextResponse.json({ error: 'Choose a company' }, { status: 400 })
    const name = await loadCompanyName(admin, companyId)
    if (!name) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    const { data: profile } = await admin.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()
    const me: PortalMe = {
      kind: 'staff',
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? user.email ?? null,
      companies: [{ id: companyId, name, keys: { views: [...QC_VIEWS], capabilities: [] }, isCompanyAdmin: false }],
      viewAs: true,
    }
    return NextResponse.json(me)
  }

  return NextResponse.json({ error: 'No access' }, { status: 403 })
}
```

- [ ] **Step 6: The team routes**

```ts
// src/app/api/portal/team/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { listQcMembers } from '@/lib/portal/qc-grants'
import { listPendingInvitations, toInvitationSummary } from '@/lib/portal/portal-invitations'
import { inviteOutcomeResponse, inviteToCompany } from '@/lib/portal/invite-service'
import { MANAGE_USERS, clampQcKeys, normalizeQcKeys } from '@/lib/portal/qc-keys'

async function selfName(admin: any, userId: string): Promise<string> {
  const { data } = await admin.from('user_profiles').select('full_name, email').eq('id', userId).maybeSingle()
  return data?.full_name || data?.email || 'Your colleague'
}

/** GET: the company's QC team, pending invitations, and what this admin may grant. */
export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { capability: MANAGE_USERS })
  if (!gate.ok) return gate.response
  const { admin, companyId, keys, userId } = gate.ctx
  const [members, invitations] = await Promise.all([listQcMembers(admin, companyId), listPendingInvitations(admin, companyId)])
  return NextResponse.json({ members, invitations: invitations.map(toInvitationSummary), ceiling: keys, selfId: userId })
}

/** POST: invite a colleague or partner, capped at this admin's own keys. */
export async function POST(request: NextRequest) {
  const gate = await requireQcPortal(request, { capability: MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const { admin, companyId, keys, userId } = gate.ctx
  const outcome = await inviteToCompany(admin, {
    companyId,
    email: String(body.email ?? ''),
    firstName: String(body.first_name ?? ''),
    lastName: String(body.last_name ?? ''),
    keys: clampQcKeys(normalizeQcKeys(body), keys),
    isCompanyAdmin: false,
    inviter: { userId, name: await selfName(admin, userId), kind: 'manager' },
  })
  return inviteOutcomeResponse(outcome)
}
```

```ts
// src/app/api/portal/team/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { isUuid, requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { GroupGrantError, readGrant, removeQcAccess, setQcAccess } from '@/lib/portal/qc-grants'
import { MANAGE_USERS, clampQcKeys, normalizeQcKeys, qcKeysOf } from '@/lib/portal/qc-keys'
import { teamTargetError } from '@/lib/portal/team-rules'
import { recordQcTeamActivity } from '@/lib/portal/team-activity'
import { loadCompanyName } from '@/lib/portal/invite-service'

async function names(admin: any, ids: string[]): Promise<Record<string, { name: string; email: string }>> {
  const { data } = await admin.from('user_profiles').select('id, full_name, email').in('id', ids)
  return Object.fromEntries((data ?? []).map((r: any) => [r.id, { name: r.full_name || r.email || r.id, email: r.email || r.id }]))
}

/** PATCH: change a member's QC keys within this admin's own keys. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireQcPortal(request, { capability: MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const { userId: targetId } = await params
  if (!isUuid(targetId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin, companyId, keys: ceiling, userId } = gate.ctx
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const target = await readGrant(admin, targetId, companyId)
  const refusal = teamTargetError({ selfId: userId, targetId, target })
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status })

  const keys = clampQcKeys(normalizeQcKeys(body), ceiling)
  if (keys.views.length === 0) {
    return NextResponse.json({ error: 'Choose at least one page, or remove the access instead' }, { status: 400 })
  }
  try {
    const result = await setQcAccess(admin, { userId: targetId, companyId, keys, source: 'manager', createdBy: userId })
    const who = await names(admin, [userId, targetId])
    await recordQcTeamActivity(admin, {
      actorUserId: userId, actorName: who[userId]?.name ?? '', companyId,
      companyName: (await loadCompanyName(admin, companyId)) ?? '', action: 'team_update',
      targetEmail: who[targetId]?.email ?? targetId,
      keysBefore: result.before ? qcKeysOf(result.before) : null, keysAfter: qcKeysOf(result.after),
    })
    return NextResponse.json({ ok: true, keys })
  } catch (error) {
    if (error instanceof GroupGrantError) return NextResponse.json({ error: error.message }, { status: 409 })
    throw error
  }
}

/** DELETE: remove a member's QC access (their sys access, if any, stays). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireQcPortal(request, { capability: MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const { userId: targetId } = await params
  if (!isUuid(targetId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin, companyId, userId } = gate.ctx

  const target = await readGrant(admin, targetId, companyId)
  const refusal = teamTargetError({ selfId: userId, targetId, target })
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status })

  try {
    const result = await removeQcAccess(admin, { userId: targetId, companyId, alsoManageUsers: false })
    const who = await names(admin, [userId, targetId])
    await recordQcTeamActivity(admin, {
      actorUserId: userId, actorName: who[userId]?.name ?? '', companyId,
      companyName: (await loadCompanyName(admin, companyId)) ?? '', action: 'team_remove',
      targetEmail: who[targetId]?.email ?? targetId,
      keysBefore: result.before ? qcKeysOf(result.before) : null, keysAfter: null,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof GroupGrantError) return NextResponse.json({ error: error.message }, { status: 409 })
    throw error
  }
}
```

```ts
// src/app/api/portal/team/invitations/[invitationId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { isUuid, requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { cancelInvitation, findCompanyInvitation } from '@/lib/portal/portal-invitations'
import { loadCompanyName, resendInvitation } from '@/lib/portal/invite-service'
import { recordQcTeamActivity } from '@/lib/portal/team-activity'
import { MANAGE_USERS, normalizeQcKeys } from '@/lib/portal/qc-keys'

async function selfName(admin: any, userId: string): Promise<string> {
  const { data } = await admin.from('user_profiles').select('full_name, email').eq('id', userId).maybeSingle()
  return data?.full_name || data?.email || 'Your colleague'
}

/** A company admin may resend or cancel any pending invitation of this company except a staff-issued admin one. */
async function loadManageable(admin: any, invitationId: string, companyId: string) {
  const invitation = await findCompanyInvitation(admin, { invitationId, companyId })
  if (!invitation || invitation.status !== 'pending') return { error: NextResponse.json({ error: 'Invitation not found' }, { status: 404 }) }
  if (invitation.is_company_admin) return { error: NextResponse.json({ error: 'Only Wolthers can change this invitation' }, { status: 403 }) }
  return { invitation }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ invitationId: string }> }) {
  const gate = await requireQcPortal(request, { capability: MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const { invitationId } = await params
  if (!isUuid(invitationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin, companyId, userId } = gate.ctx
  const loaded = await loadManageable(admin, invitationId, companyId)
  if ('error' in loaded) return loaded.error
  const result = await resendInvitation(admin, {
    invitation: loaded.invitation, companyName: (await loadCompanyName(admin, companyId)) ?? '',
    inviterName: await selfName(admin, userId), actorUserId: userId,
  })
  if (!result) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  return NextResponse.json({ ok: true, emailSent: result.emailSent })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ invitationId: string }> }) {
  const gate = await requireQcPortal(request, { capability: MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const { invitationId } = await params
  if (!isUuid(invitationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin, companyId, userId } = gate.ctx
  const loaded = await loadManageable(admin, invitationId, companyId)
  if ('error' in loaded) return loaded.error
  const cancelled = await cancelInvitation(admin, { invitationId, companyId })
  if (!cancelled) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  await recordQcTeamActivity(admin, {
    actorUserId: userId, actorName: await selfName(admin, userId), companyId,
    companyName: (await loadCompanyName(admin, companyId)) ?? '', action: 'team_invite_revoked',
    targetEmail: cancelled.email, keysBefore: normalizeQcKeys(cancelled), keysAfter: null,
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: Route test — a company admin cannot escalate or touch admins**

```ts
// src/app/api/portal/team/[userId]/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ gate: null as any, target: null as any, set: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({ ...(await orig<any>()), requireQcPortal: async () => m.gate }))
vi.mock('@/lib/portal/qc-grants', async (orig) => ({
  ...(await orig<any>()), readGrant: async () => m.target, setQcAccess: m.set, removeQcAccess: m.remove,
}))
vi.mock('@/lib/portal/team-activity', () => ({ recordQcTeamActivity: vi.fn() }))
vi.mock('@/lib/portal/invite-service', () => ({ loadCompanyName: async () => 'Roastery One' }))

import { DELETE, PATCH } from './route'

const SELF = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const admin = { from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }) }
const req = (body: unknown = {}) => ({ json: async () => body, url: 'http://x/api/portal/team/u?company=c' }) as any
const params = (userId: string) => ({ params: Promise.resolve({ userId }) })

beforeEach(() => {
  m.set.mockReset().mockResolvedValue({ before: null, after: { views: ['qc_samples'], capabilities: [] } })
  m.remove.mockReset().mockResolvedValue({ before: { views: ['qc_samples'], capabilities: [] }, after: null })
  m.gate = { ok: true, ctx: { admin, companyId: 'co-1', userId: SELF, keys: { views: ['qc_samples', 'qc_reports'], capabilities: ['qc_cupping_score'] }, isCompanyAdmin: true, isStaffViewAs: false } }
  m.target = { views: ['qc_samples'], capabilities: [], source: 'manager' }
})

describe('PATCH /api/portal/team/[userId]', () => {
  it('clamps the requested keys to the admin\'s own and never grants manage_users', async () => {
    const res = await PATCH(req({ views: ['qc_samples', 'qc_dashboard'], capabilities: ['manage_users', 'qc_cupping_score', 'qc_spec_edit'] }), params(OTHER))
    expect(res.status).toBe(200)
    expect(m.set.mock.calls[0][1]).toEqual({
      userId: OTHER, companyId: 'co-1', keys: { views: ['qc_samples'], capabilities: ['qc_cupping_score'] }, source: 'manager', createdBy: SELF,
    })
  })

  it('refuses to change another company admin', async () => {
    m.target = { views: ['qc_samples'], capabilities: ['manage_users'], source: 'admin' }
    expect((await PATCH(req({ views: ['qc_samples'] }), params(OTHER))).status).toBe(403)
    expect(m.set).not.toHaveBeenCalled()
  })

  it('refuses to change themselves', async () => {
    expect((await PATCH(req({ views: ['qc_samples'] }), params(SELF))).status).toBe(403)
  })
})

describe('DELETE /api/portal/team/[userId]', () => {
  it('removes only QC access and keeps manage_users rules to staff', async () => {
    expect((await DELETE(req(), params(OTHER))).status).toBe(200)
    expect(m.remove.mock.calls[0][1]).toEqual({ userId: OTHER, companyId: 'co-1', alsoManageUsers: false })
  })

  it('refuses another company admin', async () => {
    m.target = { views: ['qc_samples'], capabilities: ['manage_users'], source: 'admin' }
    expect((await DELETE(req(), params(OTHER))).status).toBe(403)
    expect(m.remove).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run "src/app/api/portal/team" src/lib/portal src/app/api/route-exports.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit -p .` → no errors.

```bash
git add src/lib/portal/portal-me.ts src/lib/portal/portal-me.test.ts src/lib/portal/team-rules.ts src/lib/portal/team-rules.test.ts \
  src/app/api/portal/me/route.ts src/app/api/portal/team
git commit -m "feat(portal): company admins manage their QC team (capped at their own keys, never admins or themselves); /api/portal/me"
```

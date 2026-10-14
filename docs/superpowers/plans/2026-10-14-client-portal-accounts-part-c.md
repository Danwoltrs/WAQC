# Client Portal Accounts — Part C: Staff, accept, team and me routes (Tasks 12–14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read first: the plan index `docs/superpowers/plans/2026-10-14-client-portal-accounts.md` and the spec `docs/superpowers/specs/2026-10-14-client-portal-accounts-design.md`. Parts A and B must be done.

---

### Task 12: Invite service, team rules and staff routes

One invite path serves staff (`/clients/[id]`) and company admins (`/portal/team`). The rules it owns (spec §6.1–6.3; rulings of 2026-10-14):
- **Account status decides** (sys `user_profiles.status`): `active` → the `qc_` keys are added to their grant; `disabled` → 409 (switched off; only Wolthers switches an account back on, in sys); `invited` → 409 (a pending sys invitation: sys activation skips the staged sys grants when any grant exists, so add QC access after their first sign-in); `pending` or no profile → a `portal_invitations` row and an invitation email.
- **Fail closed:** a lookup error answers 500 and invites nobody; an `@wolthers.com` address is refused (400) even without an account; a Wolthers or partner account is refused (409).
- **A company admin's invite never edits a row it may not edit:** on the manager path, an existing row of that person on this company first passes the team guard (themselves → 403, a QC company admin → 403, a group copy → 409), and a person who is already a QC member here is refused (409, "edit them in the team list"). Otherwise a company admin could rewrite an admin's QC keys, or their own, by "inviting" that address.
- **Email:** the invitee's email goes to them alone; head office gets a link-free copy (`sendPortalHouseCopy`) of every invitation, resend and access email.
- **Shared helpers live in `src/lib`** (route files export only handlers): `team-names.ts` (`selfName`, `targetEmail`), `team-rules.ts` (`teamGuard`, `teamTargetError`, also used by Task 14), `account-status.ts` (also used by Task 13), and `cancelAndLogInvitation` (cancel plus activity, used by the staff and the team invitation routes).

**Files:**
- Create: `src/lib/portal/staff-gate.ts`, `src/lib/portal/staff-gate.test.ts`
- Create: `src/lib/portal/account-status.ts`, `src/lib/portal/account-status.test.ts`
- Create: `src/lib/portal/team-rules.ts`, `src/lib/portal/team-rules.test.ts`
- Create: `src/lib/portal/team-names.ts`, `src/lib/portal/team-names.test.ts`
- Create: `src/lib/portal/invite-service.ts`, `src/lib/portal/invite-service.test.ts`
- Create: `src/app/api/clients/[id]/portal-access/route.ts` (GET, POST)
- Create: `src/app/api/clients/[id]/portal-access/[userId]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/clients/[id]/portal-access/invitations/[invitationId]/route.ts` (POST resend, DELETE cancel)
- Test: `src/app/api/clients/[id]/portal-access/route.test.ts`

**Interfaces:**
- Consumes: Tasks 2 (`normalizeQcKeys`, `qcKeysOf`, `isCompanyAdmin`, `holdsQcKey`, `QcKeySet`), 7 (`accessKindForUser`), 8 (`portalServiceClient`, `isUuid`), 9 (`setQcAccess`, `removeQcAccess`, `readGrant`, `listQcMembers`, `GroupGrantError`, `ExistingGrant`), 10, 11 (`buildPortalInviteEmail`, `portalInviteLink`, `portalSignInLink`, `sendPortalInviteEmail`, `sendPortalHouseCopy`, `recordQcTeamActivity`, `listQcTeamActivity`); `companyDisplayName` (`src/lib/contract-intake-mapping.ts`); `isExternalQcRole` (Task 6).
- Produces:
  - `canManageClientPortal(profile: { qc_role: string | null; is_global_admin: boolean | null } | null): boolean`
  - `interface StaffContext { userId: string; name: string; admin: SupabaseClient<any> }`
  - `requirePortalStaff(): Promise<{ ok: true; ctx: StaffContext } | { ok: false; response: NextResponse }>`
  - `SWITCHED_OFF: string`, `PENDING_SYS_INVITATION: string`, `accountStatusRefusal(status: string | null | undefined): string | null`
  - `type TeamRefusal = { status: 403 | 404 | 409; error: string }`
  - `teamGuard(args: { selfId: string; targetId: string; target: ExistingGrant | null }): { status: 403 | 409; error: string } | null` (self, group copy, QC company admin)
  - `teamTargetError(args: { selfId: string; targetId: string; target: ExistingGrant | null }): TeamRefusal | null` (the guard, plus 404 without QC access here)
  - `selfName(admin, userId: string): Promise<string>`, `targetEmail(admin, userId: string): Promise<string>`
  - `type InviteOutcome = { outcome: 'invited'; invitationId: string; emailSent: boolean } | { outcome: 'access_added'; userId: string; emailSent: boolean } | { outcome: 'refused'; status: 400 | 403 | 409 | 500; error: string }`
  - `inviteToCompany(admin, args: { companyId: string; email: string; firstName: string; lastName: string; keys: QcKeySet; isCompanyAdmin: boolean; inviter: { userId: string; name: string; kind: 'staff' | 'manager' } }): Promise<InviteOutcome>`
  - `inviteOutcomeResponse(outcome: InviteOutcome): NextResponse`
  - `loadCompanyName(admin, companyId: string): Promise<string | null>`
  - `resendInvitation(admin, args: { invitation: PortalInvitationRow; companyName: string; inviterName: string; actorUserId: string }): Promise<{ emailSent: boolean } | null>`
  - `cancelAndLogInvitation(admin, args: { invitationId: string; companyId: string; actorUserId: string; actorName: string }): Promise<PortalInvitationRow | null>`

- [ ] **Step 1: Write the failing tests for the small rules**

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
// src/lib/portal/account-status.test.ts
import { describe, expect, it } from 'vitest'
import { PENDING_SYS_INVITATION, SWITCHED_OFF, accountStatusRefusal } from './account-status'

describe('accountStatusRefusal', () => {
  it('refuses switched-off and sys-invited accounts, and nothing else', () => {
    expect(accountStatusRefusal('disabled')).toBe(SWITCHED_OFF)
    expect(accountStatusRefusal('invited')).toBe(PENDING_SYS_INVITATION)
    for (const status of ['active', 'pending', null, undefined]) expect(accountStatusRefusal(status)).toBeNull()
  })
})
```

```ts
// src/lib/portal/team-rules.test.ts
import { describe, expect, it } from 'vitest'
import { teamGuard, teamTargetError } from './team-rules'

const member = { views: ['qc_samples'], capabilities: [], source: 'manager' }

describe('teamGuard', () => {
  it('a company admin cannot act on themselves, with or without a row', () => {
    expect(teamGuard({ selfId: 'u1', targetId: 'u1', target: member })).toMatchObject({ status: 403 })
    expect(teamGuard({ selfId: 'u1', targetId: 'u1', target: null })).toMatchObject({ status: 403 })
  })
  it('nor on another QC company admin', () => {
    expect(teamGuard({ selfId: 'u1', targetId: 'u2', target: { ...member, capabilities: ['qc_manage_users'] } })).toMatchObject({ status: 403 })
  })
  it('nor on a group copy', () => {
    expect(teamGuard({ selfId: 'u1', targetId: 'u2', target: { ...member, source: 'group' } })).toMatchObject({ status: 409 })
  })
  it('a sys admin who is not a QC admin is an ordinary member here', () => {
    expect(teamGuard({ selfId: 'u1', targetId: 'u2', target: { ...member, capabilities: ['manage_users'] } })).toBeNull()
  })
  it('no row is no refusal', () => {
    expect(teamGuard({ selfId: 'u1', targetId: 'u2', target: null })).toBeNull()
  })
})

describe('teamTargetError', () => {
  it('404 when the person has no QC access here', () => {
    expect(teamTargetError({ selfId: 'u1', targetId: 'u2', target: null })).toMatchObject({ status: 404 })
    expect(teamTargetError({ selfId: 'u1', targetId: 'u2', target: { views: ['contracts'], capabilities: ['see_prices'], source: 'admin' } })).toMatchObject({ status: 404 })
  })
  it('allows an ordinary member', () => {
    expect(teamTargetError({ selfId: 'u1', targetId: 'u2', target: member })).toBeNull()
  })
})
```

```ts
// src/lib/portal/team-names.test.ts
import { describe, expect, it } from 'vitest'
import { selfName, targetEmail } from './team-names'

const fake = (row: any) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
}) as any

describe('team names', () => {
  it('names a person by full name, else email', async () => {
    expect(await selfName(fake({ full_name: 'Bea Costa', email: 'bea@c.com' }), 'u1')).toBe('Bea Costa')
    expect(await selfName(fake({ full_name: null, email: 'bea@c.com' }), 'u1')).toBe('bea@c.com')
    expect(await targetEmail(fake({ email: 'bea@c.com' }), 'u1')).toBe('bea@c.com')
  })
  it('falls back without a row', async () => {
    expect(await selfName(fake(null), 'u1')).toBe('Your colleague')
    expect(await targetEmail(fake(null), 'u1')).toBe('u1')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/portal/staff-gate.test.ts src/lib/portal/account-status.test.ts src/lib/portal/team-rules.test.ts src/lib/portal/team-names.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement the small rules**

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

```ts
// src/lib/portal/account-status.ts
/**
 * sys user_profiles.status decides whether WAQC may give QC access to an
 * existing external account (spec §6.1, §6.4):
 *   active           → yes
 *   disabled         → no: switched off; only Wolthers switches an account
 *                      back on (sys), and doing it here would also revive
 *                      the person's sys access everywhere
 *   invited          → no: a pending sys invitation. sys activation
 *                      (invited → active) skips the staged sys grants when
 *                      any grant exists, so a QC grant or a QC accept now
 *                      would silently drop them
 *   pending / no row → an invitation; accepting it makes the account active
 */

export const SWITCHED_OFF = 'This account is switched off. Wolthers must switch the account back on first.'
export const PENDING_SYS_INVITATION =
  'This person has a pending Wolthers portal invitation. Add QC access after their first sign-in.'

export function accountStatusRefusal(status: string | null | undefined): string | null {
  if (status === 'disabled') return SWITCHED_OFF
  if (status === 'invited') return PENDING_SYS_INVITATION
  return null
}
```

```ts
// src/lib/portal/team-rules.ts
import { holdsQcKey, isCompanyAdmin } from './qc-keys'
import type { ExistingGrant } from './qc-grants'

/**
 * What a company admin may not do on /portal/team (spec §6.2): act on
 * themselves, on another QC company admin (staff do that), or on a row
 * copied from a sister company (sys owns group access). A sys admin
 * (manage_users) who is not a QC admin is an ordinary member here.
 */

export type TeamRefusal = { status: 403 | 404 | 409; error: string }

const NOT_A_MEMBER: TeamRefusal = { status: 404, error: 'This person has no QC portal access here' }

/** For any write that touches an existing row, invites included. No row is no refusal. */
export function teamGuard(
  args: { selfId: string; targetId: string; target: ExistingGrant | null },
): { status: 403 | 409; error: string } | null {
  if (args.selfId === args.targetId) return { status: 403, error: 'You cannot change your own access' }
  if (!args.target) return null
  if (args.target.source === 'group') {
    return { status: 409, error: 'This access is copied from another company in your group. Ask Wolthers to change it.' }
  }
  if (isCompanyAdmin(args.target)) return { status: 403, error: 'Only Wolthers can change a company admin' }
  return null
}

/** For PATCH and DELETE on a member: the guard, and the person must hold QC access here. */
export function teamTargetError(args: { selfId: string; targetId: string; target: ExistingGrant | null }): TeamRefusal | null {
  const refusal = teamGuard(args)
  if (refusal) return refusal
  if (!args.target || !holdsQcKey(args.target)) return NOT_A_MEMBER
  return null
}
```

```ts
// src/lib/portal/team-names.ts
import type { SupabaseClient } from '@supabase/supabase-js'

/** How team routes name the people they log (one home for staff and portal routes). */

export async function selfName(admin: SupabaseClient<any>, userId: string): Promise<string> {
  const { data } = await admin.from('user_profiles').select('full_name, email').eq('id', userId).maybeSingle()
  return data?.full_name || data?.email || 'Your colleague'
}

export async function targetEmail(admin: SupabaseClient<any>, userId: string): Promise<string> {
  const { data } = await admin.from('user_profiles').select('email').eq('id', userId).maybeSingle()
  return data?.email ?? userId
}
```

- [ ] **Step 4: Run the small-rule tests**

Run: `npx vitest run src/lib/portal/staff-gate.test.ts src/lib/portal/account-status.test.ts src/lib/portal/team-rules.test.ts src/lib/portal/team-names.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing invite-service test**

```ts
// src/lib/portal/invite-service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  setQcAccess: vi.fn(),
  createPortalInvitation: vi.fn(),
  sendPortalInviteEmail: vi.fn(),
  sendPortalHouseCopy: vi.fn(),
  recordQcTeamActivity: vi.fn(),
}))
vi.mock('./qc-grants', async (orig) => ({ ...(await orig<any>()), setQcAccess: m.setQcAccess }))
vi.mock('./portal-invitations', async (orig) => ({ ...(await orig<any>()), createPortalInvitation: m.createPortalInvitation }))
vi.mock('./invite-email', async (orig) => ({
  ...(await orig<any>()), sendPortalInviteEmail: m.sendPortalInviteEmail, sendPortalHouseCopy: m.sendPortalHouseCopy,
}))
vi.mock('./team-activity', () => ({ recordQcTeamActivity: m.recordQcTeamActivity }))

import { GroupGrantError } from './qc-grants'
import { PENDING_SYS_INVITATION, SWITCHED_OFF } from './account-status'
import { inviteToCompany } from './invite-service'

/** Rows per table; .ilike matches case-insensitively without wildcards; `failing` tables answer an error. */
function fakeAdmin(rows: Record<string, any[]>, failing: string[] = []) {
  return {
    from(table: string) {
      const preds: Array<(r: any) => boolean> = []
      const chain: any = {
        select() { return chain },
        eq(c: string, v: unknown) { preds.push((r) => r[c] === v); return chain },
        ilike(c: string, v: string) { const want = v.replace(/\\(.)/g, '$1').toLowerCase(); preds.push((r) => String(r[c]).toLowerCase() === want); return chain },
        maybeSingle() {
          if (failing.includes(table)) return Promise.resolve({ data: null, error: { message: 'more than one row' } })
          return Promise.resolve({ data: (rows[table] ?? []).find((r) => preds.every((p) => p(r))) ?? null, error: null })
        },
      }
      return chain
    },
  } as any
}

const company = { id: 'co-1', name: 'Roastery One Ltda', fantasy_name: 'Roastery One' }
const keys = { views: ['qc_samples'] as any, capabilities: [] as any }
const staff = { userId: 'staff-1', name: 'Daniel Wolthers', kind: 'staff' as const }
const manager = { userId: 'mgr-1', name: 'Bea Costa', kind: 'manager' as const }
const active = (over: Record<string, unknown> = {}) => ({ id: 'u-9', email: 'sys@client.com', user_type: 'external', status: 'active', ...over })
const invite = (admin: any, over: Record<string, unknown> = {}) => inviteToCompany(admin, {
  companyId: 'co-1', email: 'sys@client.com', firstName: 'S', lastName: '', keys, isCompanyAdmin: false, inviter: staff, ...over,
} as any)

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.createPortalInvitation.mockResolvedValue({ invitation: { id: 'inv-1', expires_at: '2026-10-21T00:00:00Z' }, token: 'tok' })
  m.setQcAccess.mockResolvedValue({ before: null, after: { views: ['qc_samples'], capabilities: [] } })
  m.sendPortalHouseCopy.mockResolvedValue(true)
})

describe('inviteToCompany', () => {
  it('invites a new person with a normalized email: their mail alone, plus a link-free copy for head office', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    const out = await invite(admin, { email: ' Ana.Lima@Client.COM ', firstName: 'Ana', lastName: 'Lima', isCompanyAdmin: true })
    expect(out).toEqual({ outcome: 'invited', invitationId: 'inv-1', emailSent: true })
    expect(m.createPortalInvitation.mock.calls[0][1]).toMatchObject({ email: 'ana.lima@client.com', isCompanyAdmin: true, invitedByKind: 'staff' })
    expect(m.sendPortalInviteEmail.mock.calls[0][0]).toBe('ana.lima@client.com')
    expect(m.sendPortalInviteEmail.mock.calls[0][1].subject).toContain('Roastery One')
    expect(m.sendPortalHouseCopy).toHaveBeenCalledWith({
      kind: 'invitation', inviterName: 'Daniel Wolthers', email: 'ana.lima@client.com', companyName: 'Roastery One',
      keys, isCompanyAdmin: true,
    })
  })

  it('a company admin can never create another admin', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    await invite(admin, { email: 'b@client.com', isCompanyAdmin: true, inviter: manager })
    expect(m.createPortalInvitation.mock.calls[0][1]).toMatchObject({ isCompanyAdmin: false, invitedByKind: 'manager' })
  })

  it('an external account still pending (the sign-up row) gets an invitation, not keys', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active({ status: 'pending' })], profiles: [] })
    expect(await invite(admin)).toMatchObject({ outcome: 'invited' })
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('adds keys directly for an active external user, with an access email and a head-office copy', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [] })
    const out = await invite(admin, { email: 'SYS@client.com' })
    expect(out).toEqual({ outcome: 'access_added', userId: 'u-9', emailSent: true })
    expect(m.setQcAccess.mock.calls[0][1]).toMatchObject({ userId: 'u-9', companyId: 'co-1', keys, manageUsers: undefined, source: 'admin' })
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
    expect(m.sendPortalHouseCopy.mock.calls[0][0]).toMatchObject({ kind: 'access_added', email: 'sys@client.com' })
    expect(m.recordQcTeamActivity.mock.calls[0][1]).toMatchObject({ action: 'team_update', targetUserId: 'u-9' })
  })

  it('refuses a switched-off or sys-invited account and writes nothing', async () => {
    for (const [status, error] of [['disabled', SWITCHED_OFF], ['invited', PENDING_SYS_INVITATION]]) {
      const admin = fakeAdmin({ companies: [company], user_profiles: [active({ status })], profiles: [] })
      expect(await invite(admin)).toEqual({ outcome: 'refused', status: 409, error })
    }
    expect(m.setQcAccess).not.toHaveBeenCalled()
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
  })

  it('refuses Wolthers and partner accounts, and any @wolthers.com address', async () => {
    const internal = fakeAdmin({ companies: [company], user_profiles: [{ id: 'u-1', email: 'x@partner.com', user_type: 'internal', status: 'active' }], profiles: [] })
    expect(await invite(internal, { email: 'x@partner.com' })).toMatchObject({ outcome: 'refused', status: 409 })
    const staffProfile = fakeAdmin({ companies: [company], user_profiles: [], profiles: [{ id: 'u-2', email: 'Lab@Partner.com', qc_role: 'lab_personnel' }] })
    expect(await invite(staffProfile, { email: 'lab@partner.com' })).toMatchObject({ outcome: 'refused', status: 409 })
    const nobody = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    expect(await invite(nobody, { email: 'New.Person@Wolthers.com' })).toMatchObject({ outcome: 'refused', status: 400 })
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
  })

  it('fails closed when the email cannot be checked', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] }, ['user_profiles'])
    expect(await invite(admin, { email: 'a@b.com' })).toMatchObject({ outcome: 'refused', status: 500 })
    expect(m.createPortalInvitation).not.toHaveBeenCalled()
  })

  it('validates email, name and pages', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    expect(await invite(admin, { email: 'nope' })).toMatchObject({ status: 400 })
    expect(await invite(admin, { email: 'a@b.com', firstName: ' ' })).toMatchObject({ status: 400 })
    expect(await invite(admin, { email: 'a@b.com', keys: { views: [], capabilities: [] } })).toMatchObject({ status: 400 })
  })

  it('reports a failed email without losing the invitation', async () => {
    m.sendPortalInviteEmail.mockRejectedValue(new Error('graph down'))
    const admin = fakeAdmin({ companies: [company], user_profiles: [], profiles: [] })
    expect(await invite(admin, { email: 'a@b.com' })).toEqual({ outcome: 'invited', invitationId: 'inv-1', emailSent: false })
  })

  it('turns a group-copied grant into a 409 on the staff path', async () => {
    m.setQcAccess.mockRejectedValue(new GroupGrantError())
    const admin = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [] })
    expect(await invite(admin)).toMatchObject({ outcome: 'refused', status: 409 })
  })
})

describe('inviteToCompany — a company admin inviting an existing account', () => {
  const row = (over: Record<string, unknown>) => ({ user_id: 'u-9', company_id: 'co-1', views: ['qc_samples'], capabilities: [], source: 'manager', ...over })

  it('refuses someone already on the team: they are edited in the team list', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [], external_user_company_grants: [row({})] })
    expect(await invite(admin, { inviter: manager })).toMatchObject({ outcome: 'refused', status: 409 })
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it("refuses a company admin's address, their own, and a group copy", async () => {
    const adminRow = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [], external_user_company_grants: [row({ capabilities: ['qc_manage_users'] })] })
    expect(await invite(adminRow, { inviter: manager })).toMatchObject({ outcome: 'refused', status: 403 })
    const self = fakeAdmin({ companies: [company], user_profiles: [active({ id: 'mgr-1' })], profiles: [], external_user_company_grants: [] })
    expect(await invite(self, { inviter: manager })).toMatchObject({ outcome: 'refused', status: 403 })
    const group = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [], external_user_company_grants: [row({ source: 'group' })] })
    expect(await invite(group, { inviter: manager })).toMatchObject({ outcome: 'refused', status: 409 })
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('adds keys for an account with no QC access here yet, as a manager grant', async () => {
    const admin = fakeAdmin({ companies: [company], user_profiles: [active()], profiles: [], external_user_company_grants: [row({ views: ['contracts'], source: 'admin' })] })
    expect(await invite(admin, { inviter: manager })).toMatchObject({ outcome: 'access_added', userId: 'u-9' })
    expect(m.setQcAccess.mock.calls[0][1]).toMatchObject({ userId: 'u-9', source: 'manager', manageUsers: undefined, createdBy: 'mgr-1' })
  })
})
```

Run: `npx vitest run src/lib/portal/invite-service.test.ts`
Expected: FAIL, cannot resolve `./invite-service`.

- [ ] **Step 6: Implement the invite service**

```ts
// src/lib/portal/invite-service.ts
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { isExternalQcRole } from '@/lib/auth/new-profile'
import { GroupGrantError, readGrant, setQcAccess, type ExistingGrant } from './qc-grants'
import {
  cancelInvitation, createPortalInvitation, escapeLike, isValidEmail, normalizeEmail, reissueInvitation,
  type PortalInvitationRow,
} from './portal-invitations'
import {
  buildPortalInviteEmail, portalInviteLink, portalSignInLink, sendPortalHouseCopy, sendPortalInviteEmail,
} from './invite-email'
import { recordQcTeamActivity } from './team-activity'
import { holdsQcKey, normalizeQcKeys, qcKeysOf, type QcKeySet } from './qc-keys'
import { accountStatusRefusal } from './account-status'
import { teamGuard } from './team-rules'

/**
 * One invite path for staff (/clients/[id]) and company admins (/portal/team),
 * spec §6.1–6.2:
 *   * a Wolthers or partner account, or any @wolthers.com address: refused
 *   * an existing external account: by status (account-status.ts) — active
 *     gets the keys on its grant + an access email; disabled / invited: 409
 *   * a company admin's invite of an existing account first passes the team
 *     guard, and someone already on the team is edited in the team list
 *   * anyone else: a portal_invitations row + an invitation email
 * Every email goes to the person alone; head office gets a link-free copy.
 * A lookup error invites nobody (fail closed).
 */

export type InviteOutcome =
  | { outcome: 'invited'; invitationId: string; emailSent: boolean }
  | { outcome: 'access_added'; userId: string; emailSent: boolean }
  | { outcome: 'refused'; status: 400 | 403 | 409 | 500; error: string }

function refused(status: 400 | 403 | 409 | 500, error: string): InviteOutcome {
  return { outcome: 'refused', status, error }
}

const LOOKUP_FAILED = 'This email could not be checked. Please try again.'

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
  if (email.endsWith('@wolthers.com')) return refused(400, 'Wolthers addresses cannot be invited as clients')
  if (!args.firstName.trim()) return refused(400, 'Enter a first name')
  if (keys.views.length === 0) return refused(400, 'Choose at least one page')
  const isCompanyAdmin = args.inviter.kind === 'staff' && args.isCompanyAdmin

  const companyName = await loadCompanyName(admin, args.companyId)
  if (!companyName) return refused(400, 'Company not found')

  const pattern = escapeLike(email)
  const [accountRead, staffRead] = await Promise.all([
    admin.from('user_profiles').select('id, user_type, status').ilike('email', pattern).maybeSingle(),
    admin.from('profiles').select('id, qc_role').ilike('email', pattern).maybeSingle(),
  ])
  if (accountRead.error || staffRead.error) return refused(500, LOOKUP_FAILED)
  const account = accountRead.data as { id: string; user_type: string | null; status: string | null } | null
  const staffProfile = staffRead.data as { id: string; qc_role: string | null } | null
  const isStaffProfile = !!staffProfile?.qc_role && !isExternalQcRole(staffProfile.qc_role)
  if (isStaffProfile || (account && account.user_type !== 'external')) {
    return refused(409, 'This email belongs to a Wolthers or partner account and cannot be invited as a client')
  }
  const statusRefusal = accountStatusRefusal(account?.status)
  if (statusRefusal) return refused(409, statusRefusal)

  if (account && account.status === 'active') {
    if (args.inviter.kind === 'manager') {
      let existing: ExistingGrant | null
      try {
        existing = await readGrant(admin, account.id, args.companyId)
      } catch {
        return refused(500, LOOKUP_FAILED)
      }
      const guard = teamGuard({ selfId: args.inviter.userId, targetId: account.id, target: existing })
      if (guard) return refused(guard.status, guard.error)
      if (existing && holdsQcKey(existing)) {
        return refused(409, 'This person is already on the team. Edit their access in the team list.')
      }
    }

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
    await sendPortalHouseCopy({ kind: 'access_added', inviterName: args.inviter.name, email, companyName, keys, isCompanyAdmin })
    await recordQcTeamActivity(admin, {
      actorUserId: args.inviter.userId, actorName: args.inviter.name, companyId: args.companyId, companyName,
      action: 'team_update', targetEmail: email, targetUserId: account.id,
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
  await sendPortalHouseCopy({ kind: 'invitation', inviterName: args.inviter.name, email, companyName, keys, isCompanyAdmin })
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

/** New token + 7 more days for a pending invitation, emailed again (and head office told, link-free). */
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
  await sendPortalHouseCopy({
    kind: 'resend', inviterName: args.inviterName, email: fresh.invitation.email, companyName: args.companyName,
    keys, isCompanyAdmin: fresh.invitation.is_company_admin,
  })
  await recordQcTeamActivity(admin, {
    actorUserId: args.actorUserId, actorName: args.inviterName, companyId: args.invitation.company_id, companyName: args.companyName,
    action: 'team_invite', targetEmail: fresh.invitation.email, keysAfter: keys,
  })
  return { emailSent }
}

/** Cancel a pending invitation of this company and log it (staff and team routes). Null when there was none. */
export async function cancelAndLogInvitation(
  admin: SupabaseClient<any>,
  args: { invitationId: string; companyId: string; actorUserId: string; actorName: string },
): Promise<PortalInvitationRow | null> {
  const cancelled = await cancelInvitation(admin, { invitationId: args.invitationId, companyId: args.companyId })
  if (!cancelled) return null
  await recordQcTeamActivity(admin, {
    actorUserId: args.actorUserId, actorName: args.actorName, companyId: args.companyId,
    companyName: (await loadCompanyName(admin, args.companyId)) ?? '', action: 'team_invite_revoked',
    targetEmail: cancelled.email, keysBefore: normalizeQcKeys(cancelled), keysAfter: null,
  })
  return cancelled
}
```

- [ ] **Step 7: Run the service test**

Run: `npx vitest run src/lib/portal/invite-service.test.ts`
Expected: PASS.

- [ ] **Step 8: Write the staff routes**

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

/** GET: who has QC portal access to this company (direct grants), pending invitations, recent activity. */
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
import { targetEmail } from '@/lib/portal/team-names'

/** PATCH: set a person's QC keys (body: views, capabilities, is_company_admin? → qc_manage_users). */
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
      targetEmail: await targetEmail(admin, userId), targetUserId: userId,
      keysBefore: result.before ? qcKeysOf(result.before) : null, keysAfter: qcKeysOf(result.after),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof GroupGrantError) return NextResponse.json({ error: error.message }, { status: 409 })
    throw error
  }
}

/** DELETE: remove a person's QC access, company-admin status included. Their sys access stays. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const gate = await requirePortalStaff()
  if (!gate.ok) return gate.response
  const { id, userId } = await params
  if (!isUuid(id) || !isUuid(userId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin } = gate.ctx
  try {
    const result = await removeQcAccess(admin, { userId, companyId: id })
    if (!result.before) return NextResponse.json({ error: 'No access to remove' }, { status: 404 })
    await recordQcTeamActivity(admin, {
      actorUserId: gate.ctx.userId, actorName: gate.ctx.name, companyId: id,
      companyName: (await loadCompanyName(admin, id)) ?? '', action: 'team_remove',
      targetEmail: await targetEmail(admin, userId), targetUserId: userId,
      keysBefore: qcKeysOf(result.before), keysAfter: null,
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
import { findCompanyInvitation } from '@/lib/portal/portal-invitations'
import { cancelAndLogInvitation, loadCompanyName, resendInvitation } from '@/lib/portal/invite-service'
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
  const cancelled = await cancelAndLogInvitation(gate.ctx.admin, {
    invitationId, companyId: id, actorUserId: gate.ctx.userId, actorName: gate.ctx.name,
  })
  if (!cancelled) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 9: Route test for the staff POST**

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

  it('passes only grantable QC keys and the admin flag through, as a staff invitation', async () => {
    m.invite.mockResolvedValue({ outcome: 'invited', invitationId: 'inv-1', emailSent: true })
    const res = await POST(req({
      email: 'ana@client.com', first_name: 'Ana', last_name: 'Lima',
      views: ['qc_samples', 'contracts'], capabilities: ['manage_users', 'qc_manage_users', 'qc_spec_edit'], is_company_admin: true,
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

- [ ] **Step 10: Typecheck and commit**

Run: `npx tsc --noEmit -p .` → no errors.

```bash
git add src/lib/portal/staff-gate.ts src/lib/portal/staff-gate.test.ts src/lib/portal/account-status.ts \
  src/lib/portal/account-status.test.ts src/lib/portal/team-rules.ts src/lib/portal/team-rules.test.ts \
  src/lib/portal/team-names.ts src/lib/portal/team-names.test.ts src/lib/portal/invite-service.ts \
  src/lib/portal/invite-service.test.ts "src/app/api/clients/[id]/portal-access"
git commit -m "feat(portal): staff invite, change and remove client portal access — status-aware, fail-closed invites, link-free head-office copy, team guard on manager invites"
```

---

### Task 13: Accept routes `/api/portal/accept`

Rules this task owns (spec §6.4; rulings of 2026-10-14):
- The invitation is claimed before anything is created; every refusal and failure after the claim releases it, so the link works again.
- **Status is checked again at accept time:** a Wolthers account (not external) → 409; a `disabled` account → 409 (only Wolthers switches it back on); an `invited` account → 409 (a pending sys invitation; accepting would make sys skip its staged grants). Same messages as the invite (`account-status.ts`, Task 12).
- **A grant row here that is a group copy** → 409 before anything is written (WAQC never edits group rows).
- **Reusing an existing login:** when its email was never confirmed, the password is always replaced (password method: the chosen one; Microsoft method: a random secret) and the email confirmed, so a pre-registrant's password never survives. A confirmed login gets the chosen password with the password method and is left alone with Microsoft.
- `user_profiles` gets `user_type = 'external'`, `status = 'active'`, `is_active = true` and `full_name` = the invitation's name, or the invited email when the name is empty (the column is NOT NULL). WAQC never writes sys `contacts`.

**Files:**
- Create: `src/lib/portal/accept-invitation.ts`, `src/lib/portal/accept-invitation.test.ts`
- Create: `src/app/api/portal/accept/route.ts` (GET, POST)

**Interfaces:**
- Consumes: Tasks 8 (`portalServiceClient`), 9 (`setQcAccess`, `readGrant`, `GroupGrantError`), 10 (find/claim/release/record, `invitationState`, `escapeLike`), 11 (`recordQcTeamActivity`), 12 (`loadCompanyName`, `accountStatusRefusal`).
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  find: vi.fn(), claim: vi.fn(), release: vi.fn(), record: vi.fn(), setQcAccess: vi.fn(), readGrant: vi.fn(), activity: vi.fn(),
}))
vi.mock('./portal-invitations', async (orig) => ({
  ...(await orig<any>()),
  findInvitationByToken: m.find, claimInvitation: m.claim, releaseInvitation: m.release, recordAcceptedUser: m.record,
}))
vi.mock('./qc-grants', async (orig) => ({ ...(await orig<any>()), setQcAccess: m.setQcAccess, readGrant: m.readGrant }))
vi.mock('./team-activity', () => ({ recordQcTeamActivity: m.activity }))
vi.mock('./invite-service', () => ({ loadCompanyName: async () => 'Roastery One' }))

import { GroupGrantError } from './qc-grants'
import { PENDING_SYS_INVITATION, SWITCHED_OFF } from './account-status'
import { INVALID_INVITATION, acceptInvitation } from './accept-invitation'

const pending = {
  id: 'inv-1', company_id: 'co-1', email: 'ana@client.com', first_name: 'Ana', last_name: 'Lima',
  views: ['qc_samples'], capabilities: [], is_company_admin: true, invited_by: 'staff-1', invited_by_kind: 'staff',
  status: 'pending', expires_at: '2999-01-01T00:00:00Z', accepted_at: null, accepted_user_id: null, created_at: '2026-10-14T00:00:00Z',
}
const TOKEN = 't'.repeat(43)

function fakeAdmin(opts: { account?: any; createError?: any; confirmed?: boolean } = {}) {
  const auth = {
    createUser: vi.fn(async () => (opts.createError ? { data: null, error: opts.createError } : { data: { user: { id: 'new-user' } }, error: null })),
    getUserById: vi.fn(async (id: string) => ({
      data: { user: { id, email_confirmed_at: opts.confirmed === false ? null : '2026-01-01T00:00:00Z' } }, error: null,
    })),
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

const accept = (admin: any, over: Record<string, unknown> = {}) =>
  acceptInvitation(admin, { token: TOKEN, method: 'password', password: 'long-enough', ...over } as any)
const profileUpdate = (admin: any) => admin.writes.find((w: any) => w.table === 'user_profiles' && w.op === 'update')

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.find.mockResolvedValue(pending)
  m.claim.mockResolvedValue(true)
  m.readGrant.mockResolvedValue(null)
  m.setQcAccess.mockResolvedValue({ before: null, after: { views: ['qc_samples'], capabilities: ['qc_manage_users'] } })
})

afterEach(() => { delete process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN })

describe('acceptInvitation', () => {
  it('410 for an unknown, used or expired link, without creating anything', async () => {
    for (const row of [null, { ...pending, status: 'accepted' }, { ...pending, expires_at: '2000-01-01T00:00:00Z' }, { ...pending, status: 'cancelled' }]) {
      m.find.mockResolvedValueOnce(row)
      const admin = fakeAdmin()
      expect(await accept(admin)).toEqual({ status: 410, body: { error: INVALID_INVITATION } })
      expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
    }
  })

  it('410 when a second click finds the invitation already claimed', async () => {
    m.claim.mockResolvedValue(false)
    const admin = fakeAdmin()
    expect((await accept(admin)).status).toBe(410)
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it('400 on a short password, before claiming', async () => {
    expect((await accept(fakeAdmin(), { password: 'short' })).status).toBe(400)
    expect(m.claim).not.toHaveBeenCalled()
  })

  it('400 for Microsoft while the flag is off', async () => {
    expect((await accept(fakeAdmin(), { method: 'microsoft', password: null })).status).toBe(400)
  })

  it('creates the login, marks it external, active and is_active, and grants the invitation keys', async () => {
    const admin = fakeAdmin()
    expect(await accept(admin)).toEqual({ status: 200, body: { ok: true, email: 'ana@client.com', method: 'password' } })
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'ana@client.com', email_confirm: true, password: 'long-enough', user_metadata: { full_name: 'Ana Lima' },
    })
    expect(profileUpdate(admin).values).toEqual({ user_type: 'external', status: 'active', is_active: true, full_name: 'Ana Lima' })
    expect(m.setQcAccess.mock.calls[0][1]).toEqual({
      userId: 'new-user', companyId: 'co-1', keys: { views: ['qc_samples'], capabilities: [] },
      manageUsers: true, source: 'admin', createdBy: 'staff-1',
    })
    expect(m.record).toHaveBeenCalledWith(admin, { invitationId: 'inv-1', userId: 'new-user' })
    expect(admin.writes.some((w: any) => w.table === 'contacts')).toBe(false)
  })

  it('names the profile by the invited email when the invitation has no name', async () => {
    m.find.mockResolvedValue({ ...pending, first_name: '', last_name: '' })
    const admin = fakeAdmin()
    await accept(admin)
    expect(profileUpdate(admin).values.full_name).toBe('ana@client.com')
  })

  it('reuses a confirmed external login and sets the chosen password', async () => {
    const admin = fakeAdmin({ account: { id: 'ext-1', user_type: 'external', status: 'active' } })
    await accept(admin)
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('ext-1', { password: 'long-enough', email_confirm: true })
  })

  it('leaves a confirmed login alone with Microsoft', async () => {
    process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN = 'true'
    const admin = fakeAdmin({ account: { id: 'ext-1', user_type: 'external', status: 'active' } })
    expect((await accept(admin, { method: 'microsoft', password: null })).status).toBe(200)
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
  })

  it('always replaces the password of a login nobody confirmed, and confirms it', async () => {
    const withPassword = fakeAdmin({ account: { id: 'ext-2', user_type: 'external', status: 'pending' }, confirmed: false })
    await accept(withPassword)
    expect(withPassword.auth.admin.updateUserById).toHaveBeenCalledWith('ext-2', { password: 'long-enough', email_confirm: true })

    process.env.NEXT_PUBLIC_PORTAL_MICROSOFT_SIGNIN = 'true'
    const withMicrosoft = fakeAdmin({ account: { id: 'ext-3', user_type: 'external', status: 'pending' }, confirmed: false })
    expect((await accept(withMicrosoft, { method: 'microsoft', password: null })).status).toBe(200)
    const [id, attrs] = withMicrosoft.auth.admin.updateUserById.mock.calls[0]
    expect(id).toBe('ext-3')
    expect(attrs.email_confirm).toBe(true)
    expect(typeof attrs.password).toBe('string')
    expect(attrs.password.length).toBeGreaterThanOrEqual(40)
  })

  it('refuses a switched-off or sys-invited account before writing anything, and the link works again', async () => {
    for (const [status, error] of [['disabled', SWITCHED_OFF], ['invited', PENDING_SYS_INVITATION]]) {
      const admin = fakeAdmin({ account: { id: 'ext-4', user_type: 'external', status } })
      expect(await accept(admin)).toEqual({ status: 409, body: { error } })
      expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
      expect(profileUpdate(admin)).toBeUndefined()
    }
    expect(m.release).toHaveBeenCalledTimes(2)
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('409 when the grant here is a group copy, before writing anything, and the link works again', async () => {
    m.readGrant.mockResolvedValue({ views: ['qc_samples'], capabilities: [], source: 'group' })
    const admin = fakeAdmin({ account: { id: 'ext-5', user_type: 'external', status: 'active' } })
    expect((await accept(admin)).status).toBe(409)
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
  })

  it('409 when the grant turns into a group copy mid-way, and the link works again', async () => {
    m.setQcAccess.mockRejectedValue(new GroupGrantError())
    const admin = fakeAdmin()
    expect((await accept(admin)).status).toBe(409)
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
  })

  it('409 for a Wolthers account, and the link works again', async () => {
    const admin = fakeAdmin({ account: { id: 'int-1', user_type: 'internal', status: 'active' } })
    expect((await accept(admin)).status).toBe(409)
    expect(m.release).toHaveBeenCalledWith(admin, 'inv-1')
    expect(m.setQcAccess).not.toHaveBeenCalled()
  })

  it('500 and release when something fails half-way', async () => {
    const admin = fakeAdmin({ createError: { message: 'boom' } })
    expect((await accept(admin)).status).toBe(500)
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
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  claimInvitation, escapeLike, findInvitationByToken, invitationState, recordAcceptedUser, releaseInvitation,
} from './portal-invitations'
import { GroupGrantError, readGrant, setQcAccess } from './qc-grants'
import { recordQcTeamActivity } from './team-activity'
import { loadCompanyName } from './invite-service'
import { accountStatusRefusal } from './account-status'
import { normalizeQcKeys } from './qc-keys'

/**
 * Accepting a QC portal invitation (spec §6.4). The login is created here,
 * server-side, so the shared Supabase sign-up setting never matters. The
 * invitation is claimed before anything is created; every refusal or failure
 * after the claim releases it, so the link works again.
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

/** A password nobody knows: replaces a pre-registrant's password when the person chose Microsoft. */
function randomSecret(): string {
  return randomBytes(32).toString('base64url')
}

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

  const refuse = async (error: string) => {
    await releaseInvitation(admin, invitation.id)
    return { status: 409, body: { error } }
  }

  try {
    const fullName = `${invitation.first_name} ${invitation.last_name}`.trim()
    const profileName = fullName || invitation.email
    const { data: account, error: accountError } = await admin
      .from('user_profiles')
      .select('id, user_type, status')
      .ilike('email', escapeLike(invitation.email))
      .maybeSingle()
    if (accountError) throw accountError
    if (account && account.user_type !== 'external') {
      return await refuse('This email belongs to a Wolthers account. Please contact Wolthers.')
    }
    const statusRefusal = accountStatusRefusal(account?.status)
    if (statusRefusal) return await refuse(statusRefusal)
    if (account) {
      const existing = await readGrant(admin, account.id, invitation.company_id)
      if (existing?.source === 'group') return await refuse(new GroupGrantError().message)
    }

    let userId: string
    if (account) {
      userId = account.id
      const { data: login, error: loginError } = await admin.auth.admin.getUserById(userId)
      if (loginError || !login?.user) throw loginError ?? new Error('login not found')
      if (!login.user.email_confirmed_at) {
        // Nobody ever confirmed this address: whoever registered it first must
        // not keep a working password.
        const { error } = await admin.auth.admin.updateUserById(userId, { password: password ?? randomSecret(), email_confirm: true })
        if (error) throw error
      } else if (password !== null) {
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
      .update({ user_type: 'external', status: 'active', is_active: true, full_name: profileName })
      .eq('id', userId)
      .select('id')
    if (updateError) throw updateError
    if (!updated || updated.length === 0) {
      const { error } = await admin.from('user_profiles').insert({
        id: userId, email: invitation.email, full_name: profileName, user_type: 'external', status: 'active',
        is_active: true, permissions: [], department_ids: [],
      })
      if (error) throw error
    }

    const keys = normalizeQcKeys(invitation)
    try {
      await setQcAccess(admin, {
        userId,
        companyId: invitation.company_id,
        keys,
        manageUsers: invitation.is_company_admin && invitation.invited_by_kind === 'staff' ? true : undefined,
        source: invitation.invited_by_kind === 'staff' ? 'admin' : 'manager',
        createdBy: invitation.invited_by,
      })
    } catch (error) {
      if (error instanceof GroupGrantError) return await refuse(error.message)
      throw error
    }
    await recordAcceptedUser(admin, { invitationId: invitation.id, userId })
    await recordQcTeamActivity(admin, {
      actorUserId: userId, actorName: profileName, companyId: invitation.company_id,
      companyName: (await loadCompanyName(admin, invitation.company_id)) ?? '',
      action: 'team_invite_accepted', targetEmail: invitation.email, targetUserId: userId, keysAfter: keys,
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

(`/api/portal/me` and `/api/portal/accept` do not run `requireQcPortal`: accept is public by design, and me resolves the caller's kind itself.)

- [ ] **Step 6: Typecheck, route-export guard, commit**

Run: `npx tsc --noEmit -p .` and `npx vitest run src/lib/portal src/app/api/route-exports.test.ts` → PASS.

```bash
git add src/lib/portal/accept-invitation.ts src/lib/portal/accept-invitation.test.ts src/app/api/portal/accept/route.ts
git commit -m "feat(portal): accept an invitation — status re-checked, unconfirmed logins get a new password, external + active, grant from the invitation; claim released on every refusal"
```

---

### Task 14: Team routes and `/api/portal/me`

Rules this task owns (spec §6.2, §6.7; rulings of 2026-10-14):
- The Team page and its routes need the QC company-admin key `qc_manage_users` (`requireQcPortal(request, { capability: QC_MANAGE_USERS })`). sys's `manage_users` does not count.
- A company admin may change or remove an ordinary member's `qc_` keys within their own keys; never themselves, another QC company admin, or a group copy (`teamTargetError`, Task 12). A company admin's invite of an existing account runs the same guard inside `inviteToCompany` (Task 12).
- `/api/portal/me` lists only companies where the person has a **direct** grant with a QC view (`isQcAccessRow`): a group copy never adds a company to the switcher.
- Names for logs come from `team-names.ts`, cancelling goes through `cancelAndLogInvitation` (both Task 12); route files export only handlers.

**Files:**
- Create: `src/lib/portal/portal-me.ts`, `src/lib/portal/portal-me.test.ts`
- Create: `src/app/api/portal/me/route.ts` (GET)
- Create: `src/app/api/portal/team/route.ts` (GET, POST)
- Create: `src/app/api/portal/team/[userId]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/portal/team/invitations/[invitationId]/route.ts` (POST resend, DELETE cancel)
- Test: `src/app/api/portal/team/route.test.ts`, `src/app/api/portal/team/[userId]/route.test.ts`

**Interfaces:**
- Consumes: Tasks 2 (`QC_MANAGE_USERS`, `QC_VIEWS`, `clampQcKeys`, `normalizeQcKeys`, `qcKeysOf`, `isCompanyAdmin`, `isQcAccessRow`), 7 (`accessKindForUser`), 8 (`requireQcPortal`, `isUuid`, `portalServiceClient`), 9 (`readGrant`, `setQcAccess`, `removeQcAccess`, `listQcMembers`, `GroupGrantError`), 10 (`listPendingInvitations`, `toInvitationSummary`, `findCompanyInvitation`), 11 (`recordQcTeamActivity`), 12 (`inviteToCompany`, `inviteOutcomeResponse`, `loadCompanyName`, `resendInvitation`, `cancelAndLogInvitation`, `teamTargetError`, `selfName`, `targetEmail`).
- Produces:
  - `interface PortalCompany { id: string; name: string; keys: QcKeySet; isCompanyAdmin: boolean }`
  - `interface PortalMe { kind: 'external' | 'staff'; fullName: string | null; email: string | null; companies: PortalCompany[]; viewAs: boolean }`
  - `buildExternalMe(profile: { full_name: string | null; email: string | null }, grants: any[]): PortalMe` (grants carry `source` and embed `companies(id, name, fantasy_name)`)
  - `GET /api/portal/me[?company=]` → `PortalMe` | 401 | 403
  - `GET /api/portal/team?company=` → `{ members: QcMember[]; invitations: InvitationSummary[]; ceiling: QcKeySet; selfId: string }`
  - `POST /api/portal/team?company=` body `{ email, first_name, last_name, views, capabilities }`
  - `PATCH|DELETE /api/portal/team/[userId]?company=`
  - `POST|DELETE /api/portal/team/invitations/[invitationId]?company=`

- [ ] **Step 1: Write the failing test for `/api/portal/me`'s builder**

```ts
// src/lib/portal/portal-me.test.ts
import { describe, expect, it } from 'vitest'
import { buildExternalMe } from './portal-me'

describe('buildExternalMe', () => {
  it('lists only companies with a direct QC grant, by fantasy name, with keys and the QC admin flag', () => {
    const me = buildExternalMe({ full_name: 'Ana Lima', email: 'ana@client.com' }, [
      { company_id: 'b', views: ['qc_samples'], capabilities: ['qc_manage_users'], source: 'admin', companies: { id: 'b', name: 'Zeta Ltda', fantasy_name: 'Beta Roasters' } },
      { company_id: 'c', views: ['contracts'], capabilities: ['manage_users'], source: 'admin', companies: { id: 'c', name: 'Sys Only', fantasy_name: null } },
      { company_id: 'a', views: ['qc_certificates'], capabilities: ['manage_users'], source: 'manager', companies: { id: 'a', name: 'Alpha Coffee SA', fantasy_name: '' } },
      { company_id: 'd', views: ['qc_samples'], capabilities: ['qc_manage_users'], source: 'group', companies: { id: 'd', name: 'Delta Sister', fantasy_name: null } },
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

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/portal/portal-me.test.ts`
Expected: FAIL, cannot resolve `./portal-me`.

- [ ] **Step 3: Implement**

```ts
// src/lib/portal/portal-me.ts
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { isCompanyAdmin, isQcAccessRow, qcKeysOf, type QcKeySet } from './qc-keys'

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

/** The portal identity of an external user: one entry per company with a direct QC grant (never a group copy). */
export function buildExternalMe(profile: { full_name: string | null; email: string | null }, grants: any[]): PortalMe {
  const companies = grants
    .filter(isQcAccessRow)
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

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/portal/portal-me.test.ts`
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

/**
 * Who is using the portal, and the companies and keys they have there. It
 * resolves the caller's kind itself instead of running requireQcPortal: it is
 * the call that tells the shell which companies exist.
 */
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
        .select('company_id, views, capabilities, source, companies(id, name, fantasy_name)')
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

- [ ] **Step 6: Write the failing route tests**

```ts
// src/app/api/portal/team/route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({ gate: null as any, need: null as any, invite: vi.fn() }))
vi.mock('@/lib/portal/qc-portal-gate', async (orig) => ({
  ...(await orig<any>()),
  requireQcPortal: async (_req: unknown, need: unknown) => { m.need = need; return m.gate },
}))
vi.mock('@/lib/portal/invite-service', () => ({
  inviteToCompany: m.invite,
  inviteOutcomeResponse: (o: any) => o.outcome === 'refused'
    ? NextResponse.json({ error: o.error }, { status: o.status })
    : NextResponse.json(o),
}))
vi.mock('@/lib/portal/team-names', () => ({ selfName: async () => 'Bea Costa', targetEmail: async () => 'x@c.com' }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body, url: 'http://x/api/portal/team?company=c' }) as any

beforeEach(() => {
  m.invite.mockReset().mockResolvedValue({ outcome: 'invited', invitationId: 'inv-1', emailSent: true })
  m.gate = { ok: true, ctx: { admin: {}, companyId: 'co-1', userId: 'mgr-1', keys: { views: ['qc_samples'], capabilities: ['qc_cupping_score'] }, isCompanyAdmin: true, isStaffViewAs: false } }
})

describe('POST /api/portal/team', () => {
  it('needs qc_manage_users and a write, clamps to the admin\'s own keys, and never invites an admin', async () => {
    const res = await POST(req({
      email: 'b@client.com', first_name: 'B', last_name: '', is_company_admin: true,
      views: ['qc_samples', 'qc_dashboard'], capabilities: ['qc_cupping_score', 'qc_spec_edit', 'qc_manage_users', 'manage_users'],
    }))
    expect(res.status).toBe(200)
    expect(m.need).toEqual({ capability: 'qc_manage_users', write: true })
    expect(m.invite.mock.calls[0][1]).toEqual({
      companyId: 'co-1', email: 'b@client.com', firstName: 'B', lastName: '',
      keys: { views: ['qc_samples'], capabilities: ['qc_cupping_score'] }, isCompanyAdmin: false,
      inviter: { userId: 'mgr-1', name: 'Bea Costa', kind: 'manager' },
    })
  })

  it('passes a refusal from the invite service through', async () => {
    m.invite.mockResolvedValue({ outcome: 'refused', status: 409, error: 'This person is already on the team. Edit their access in the team list.' })
    expect((await POST(req({ email: 'b@client.com', first_name: 'B', views: ['qc_samples'] }))).status).toBe(409)
  })
})
```

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
vi.mock('@/lib/portal/team-names', () => ({ selfName: async () => 'Bea Costa', targetEmail: async () => 'x@c.com' }))

import { DELETE, PATCH } from './route'

const SELF = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const req = (body: unknown = {}) => ({ json: async () => body, url: 'http://x/api/portal/team/u?company=c' }) as any
const params = (userId: string) => ({ params: Promise.resolve({ userId }) })

beforeEach(() => {
  m.set.mockReset().mockResolvedValue({ before: null, after: { views: ['qc_samples'], capabilities: [] } })
  m.remove.mockReset().mockResolvedValue({ before: { views: ['qc_samples'], capabilities: [] }, after: null })
  m.gate = { ok: true, ctx: { admin: {}, companyId: 'co-1', userId: SELF, keys: { views: ['qc_samples', 'qc_reports'], capabilities: ['qc_cupping_score'] }, isCompanyAdmin: true, isStaffViewAs: false } }
  m.target = { views: ['qc_samples'], capabilities: [], source: 'manager' }
})

describe('PATCH /api/portal/team/[userId]', () => {
  it("clamps the requested keys to the admin's own and never grants an admin key", async () => {
    const res = await PATCH(req({ views: ['qc_samples', 'qc_dashboard'], capabilities: ['qc_manage_users', 'manage_users', 'qc_cupping_score', 'qc_spec_edit'] }), params(OTHER))
    expect(res.status).toBe(200)
    expect(m.set.mock.calls[0][1]).toEqual({
      userId: OTHER, companyId: 'co-1', keys: { views: ['qc_samples'], capabilities: ['qc_cupping_score'] }, source: 'manager', createdBy: SELF,
    })
  })

  it('refuses to change another QC company admin', async () => {
    m.target = { views: ['qc_samples'], capabilities: ['qc_manage_users'], source: 'admin' }
    expect((await PATCH(req({ views: ['qc_samples'] }), params(OTHER))).status).toBe(403)
    expect(m.set).not.toHaveBeenCalled()
  })

  it('treats a sys admin who is not a QC admin as an ordinary member', async () => {
    m.target = { views: ['contracts', 'qc_samples'], capabilities: ['manage_users'], source: 'admin' }
    expect((await PATCH(req({ views: ['qc_samples'] }), params(OTHER))).status).toBe(200)
  })

  it('refuses a group copy', async () => {
    m.target = { views: ['qc_samples'], capabilities: [], source: 'group' }
    expect((await PATCH(req({ views: ['qc_samples'] }), params(OTHER))).status).toBe(409)
    expect(m.set).not.toHaveBeenCalled()
  })

  it('refuses to change themselves', async () => {
    expect((await PATCH(req({ views: ['qc_samples'] }), params(SELF))).status).toBe(403)
  })
})

describe('DELETE /api/portal/team/[userId]', () => {
  it('removes only QC access', async () => {
    expect((await DELETE(req(), params(OTHER))).status).toBe(200)
    expect(m.remove.mock.calls[0][1]).toEqual({ userId: OTHER, companyId: 'co-1' })
  })

  it('refuses another QC company admin', async () => {
    m.target = { views: ['qc_samples'], capabilities: ['qc_manage_users'], source: 'admin' }
    expect((await DELETE(req(), params(OTHER))).status).toBe(403)
    expect(m.remove).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run "src/app/api/portal/team"`
Expected: FAIL, the route modules do not exist yet.

- [ ] **Step 7: The team routes**

```ts
// src/app/api/portal/team/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireQcPortal } from '@/lib/portal/qc-portal-gate'
import { listQcMembers } from '@/lib/portal/qc-grants'
import { listPendingInvitations, toInvitationSummary } from '@/lib/portal/portal-invitations'
import { inviteOutcomeResponse, inviteToCompany } from '@/lib/portal/invite-service'
import { QC_MANAGE_USERS, clampQcKeys, normalizeQcKeys } from '@/lib/portal/qc-keys'
import { selfName } from '@/lib/portal/team-names'

/** GET: the company's QC team (direct grants), pending invitations, and what this admin may grant. */
export async function GET(request: NextRequest) {
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS })
  if (!gate.ok) return gate.response
  const { admin, companyId, keys, userId } = gate.ctx
  const [members, invitations] = await Promise.all([listQcMembers(admin, companyId), listPendingInvitations(admin, companyId)])
  return NextResponse.json({ members, invitations: invitations.map(toInvitationSummary), ceiling: keys, selfId: userId })
}

/** POST: invite a colleague or partner, capped at this admin's own keys; never a company admin. */
export async function POST(request: NextRequest) {
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS, write: true })
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
import { QC_MANAGE_USERS, clampQcKeys, normalizeQcKeys, qcKeysOf } from '@/lib/portal/qc-keys'
import { teamTargetError } from '@/lib/portal/team-rules'
import { recordQcTeamActivity } from '@/lib/portal/team-activity'
import { loadCompanyName } from '@/lib/portal/invite-service'
import { selfName, targetEmail } from '@/lib/portal/team-names'

/** PATCH: change a member's QC keys within this admin's own keys. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS, write: true })
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
    await recordQcTeamActivity(admin, {
      actorUserId: userId, actorName: await selfName(admin, userId), companyId,
      companyName: (await loadCompanyName(admin, companyId)) ?? '', action: 'team_update',
      targetEmail: await targetEmail(admin, targetId), targetUserId: targetId,
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
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const { userId: targetId } = await params
  if (!isUuid(targetId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin, companyId, userId } = gate.ctx

  const target = await readGrant(admin, targetId, companyId)
  const refusal = teamTargetError({ selfId: userId, targetId, target })
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status })

  try {
    const result = await removeQcAccess(admin, { userId: targetId, companyId })
    await recordQcTeamActivity(admin, {
      actorUserId: userId, actorName: await selfName(admin, userId), companyId,
      companyName: (await loadCompanyName(admin, companyId)) ?? '', action: 'team_remove',
      targetEmail: await targetEmail(admin, targetId), targetUserId: targetId,
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
import { findCompanyInvitation } from '@/lib/portal/portal-invitations'
import { cancelAndLogInvitation, loadCompanyName, resendInvitation } from '@/lib/portal/invite-service'
import { QC_MANAGE_USERS } from '@/lib/portal/qc-keys'
import { selfName } from '@/lib/portal/team-names'

/** A company admin may resend or cancel any pending invitation of this company except a staff-issued admin one. */
async function loadManageable(admin: any, invitationId: string, companyId: string) {
  const invitation = await findCompanyInvitation(admin, { invitationId, companyId })
  if (!invitation || invitation.status !== 'pending') return { error: NextResponse.json({ error: 'Invitation not found' }, { status: 404 }) }
  if (invitation.is_company_admin) return { error: NextResponse.json({ error: 'Only Wolthers can change this invitation' }, { status: 403 }) }
  return { invitation }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ invitationId: string }> }) {
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS, write: true })
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
  const gate = await requireQcPortal(request, { capability: QC_MANAGE_USERS, write: true })
  if (!gate.ok) return gate.response
  const { invitationId } = await params
  if (!isUuid(invitationId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const { admin, companyId, userId } = gate.ctx
  const loaded = await loadManageable(admin, invitationId, companyId)
  if ('error' in loaded) return loaded.error
  const cancelled = await cancelAndLogInvitation(admin, {
    invitationId, companyId, actorUserId: userId, actorName: await selfName(admin, userId),
  })
  if (!cancelled) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 8: Run the route tests**

Run: `npx vitest run "src/app/api/portal/team" src/lib/portal src/app/api/route-exports.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit -p .` → no errors.

```bash
git add src/lib/portal/portal-me.ts src/lib/portal/portal-me.test.ts src/app/api/portal/me/route.ts src/app/api/portal/team
git commit -m "feat(portal): company admins (qc_manage_users) manage their QC team — capped at their own keys, never admins, themselves or group copies; /api/portal/me from direct grants"
```

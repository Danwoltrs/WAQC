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

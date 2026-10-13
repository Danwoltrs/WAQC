import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A notification is addressed to someone else (the cupper being assigned), and
 * the notifications SELECT policy only shows a user their own rows. Written
 * through the sender's session, the INSERT ... RETURNING could not read the row
 * back and Postgres rejected it with 42501 (prod, 2026-10-13: only the
 * assigner's own notification ever landed). The write must go through the
 * service-role client, falling back to the session only when it is unconfigured.
 */

const state = vi.hoisted(() => ({ session: null as any, service: null as any }))

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.session }))
vi.mock('@/lib/reports/service-role', () => ({ serviceRoleClient: () => state.service }))

import { createNotification } from './notifications'

/** Records which tables a client wrote to; every insert succeeds. */
function fakeClient() {
  const inserts: { table: string; row: any }[] = []
  return {
    inserts,
    auth: { getUser: async () => ({ data: { user: { id: 'assigner-1' } }, error: null }) },
    from(table: string) {
      return {
        insert(row: any) {
          inserts.push({ table, row })
          const done = { data: { id: 'n-1', ...row }, error: null }
          return { select: () => ({ single: async () => done }) }
        },
      }
    },
  }
}

const params = {
  type: 'info' as const,
  title: 'New Samples Assigned for Cupping',
  message: 'You have 2 samples waiting to be cupped',
  user_id: 'cupper-2',
}

describe('createNotification', () => {
  beforeEach(() => {
    state.session = fakeClient()
    state.service = fakeClient()
  })

  it("writes another user's notification through the service-role client", async () => {
    const result = await createNotification(params)

    expect(result.success).toBe(true)
    expect(state.service.inserts).toHaveLength(1)
    expect(state.service.inserts[0].table).toBe('notifications')
    expect(state.service.inserts[0].row.user_id).toBe('cupper-2')
    expect(state.session.inserts).toHaveLength(0)
  })

  it('falls back to the session client when the service role is not configured', async () => {
    state.service = null

    const result = await createNotification(params)

    expect(result.success).toBe(true)
    expect(state.session.inserts).toHaveLength(1)
  })
})

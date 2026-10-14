import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * laboratories.code is NOT NULL with no default, and POST /api/laboratories
 * never sent it, so every Create Laboratory failed with 23502 behind a generic
 * "Failed to create laboratory" (prod, 2026-10-14). The route now derives a
 * SANTOS_HQ-style code from the city (else the name), unique among existing
 * labs, and stores the address parts the form collects.
 */

const state = vi.hoisted(() => ({ db: null as any }))

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { POST } from './route'

function fakeDb(existingCodes: string[]) {
  const inserted: any[] = []
  return {
    inserted,
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }) },
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { qc_role: 'global_admin', is_global_admin: true }, error: null }),
            }),
          }),
        }
      }
      return {
        select: async () => ({ data: existingCodes.map((code) => ({ code })), error: null }),
        insert(row: any) {
          inserted.push(row)
          return { select: () => ({ single: async () => ({ data: { id: 'lab-new', ...row }, error: null }) }) }
        },
      }
    },
  }
}

const request = (body: Record<string, unknown>) => ({ json: async () => body }) as any

const form = {
  name: 'Wolthers Colombia',
  location: 'Calle 5 #10-20, Buenaventura, Valle del Cauca',
  address: 'Calle 5 #10-20',
  city: 'Buenaventura',
  state: 'Valle del Cauca',
  country: 'Colombia',
}

describe('POST /api/laboratories', () => {
  beforeEach(() => {
    state.db = fakeDb(['SANTOS_HQ'])
  })

  it('sends a code derived from the city, so the NOT NULL column is filled', async () => {
    const res = await POST(request(form))

    expect(res.status).toBe(201)
    expect(state.db.inserted[0].code).toBe('BUENAVENTURA')
  })

  it('falls back to the name and avoids codes already in use', async () => {
    state.db = fakeDb(['SANTOS_HQ', 'WOLTHERS_COLOMBIA'])

    await POST(request({ ...form, city: '' }))

    expect(state.db.inserted[0].code).toBe('WOLTHERS_COLOMBIA_2')
  })

  it('stores the address parts, not only the joined location', async () => {
    await POST(request(form))

    expect(state.db.inserted[0]).toMatchObject({
      address: 'Calle 5 #10-20',
      city: 'Buenaventura',
      state: 'Valle del Cauca',
    })
  })
})

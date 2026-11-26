import { describe, it, expect, vi } from 'vitest'

/**
 * The roaster list feeds the intake, sub-contract and supply-chain pickers
 * (GET stays). The POST that created or tagged companies by name is gone:
 * companies are added through POST /api/clients, which links an existing
 * company instead of duplicating it.
 */

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({}) }))

import * as route from './route'

describe('/api/roasters', () => {
  it('exports GET only', () => {
    expect(Object.keys(route).sort()).toEqual(['GET'])
  })
})

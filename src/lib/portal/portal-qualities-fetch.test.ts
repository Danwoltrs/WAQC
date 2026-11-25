import { describe, expect, it } from 'vitest'
import { fetchCompanyQualities } from './portal-qualities-fetch'

/**
 * The portal reads with the service role, so the client filter is the only
 * guard. A portal user is the client and has no laboratory: they see the
 * client's specs from every laboratory, each labelled with its laboratory.
 */

const CO = 'co-1'

function fakeAdmin(tables: Record<string, any[]>) {
  const calls: Array<{ table: string; select?: string; eq: Array<[string, unknown]> }> = []
  const from = (table: string) => {
    const call = { table, select: undefined as string | undefined, eq: [] as Array<[string, unknown]> }
    calls.push(call)
    const q: any = new Proxy({}, {
      get(_t, p: string) {
        if (p === 'then') return (res: any, rej: any) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej)
        return (...args: unknown[]) => {
          if (p === 'select') call.select = args[0] as string
          if (p === 'eq') call.eq.push([args[0] as string, args[1]])
          return q
        }
      },
    })
    return q
  }
  return { admin: { from } as any, calls }
}

const row = (o: Record<string, unknown>) => ({
  client_id: CO, custom_name: null, origin: 'Brazil', is_active: true, template: { name: 'GC17', name_en: null }, ...o,
})

describe('fetchCompanyQualities', () => {
  it('returns the client\'s specs from every laboratory, each with its laboratory name', async () => {
    const { admin } = fakeAdmin({
      client_qualities: [
        row({ id: 'q-hq', laboratory_id: 'lab-hq', laboratories: { name: 'Santos HQ' } }),
        row({ id: 'q-co', laboratory_id: 'lab-co', laboratories: { name: 'Colombia' } }),
      ],
      client_quality_versions: [],
    })
    const out = await fetchCompanyQualities(admin, CO)
    expect(out.map((q) => [q.id, q.labName])).toEqual([['q-hq', 'Santos HQ'], ['q-co', 'Colombia']])
  })

  it('selects the laboratory and its name, and keeps the client filter as the guard', async () => {
    const { admin, calls } = fakeAdmin({ client_qualities: [row({ id: 'q1', laboratory_id: 'lab-hq', laboratories: { name: 'Santos HQ' } })], client_quality_versions: [] })
    await fetchCompanyQualities(admin, CO)
    const read = calls.find((c) => c.table === 'client_qualities')!
    expect(read.select).toContain('laboratory_id')
    expect(read.select).toContain('laboratories(name)')
    expect(read.eq).toContainEqual(['client_id', CO])
  })

  it('drops a row of another client even if the query returned it', async () => {
    const { admin } = fakeAdmin({
      client_qualities: [
        row({ id: 'mine', laboratory_id: 'lab-hq', laboratories: { name: 'Santos HQ' } }),
        row({ id: 'theirs', client_id: 'other', laboratory_id: 'lab-co', laboratories: { name: 'Colombia' } }),
      ],
      client_quality_versions: [],
    })
    expect((await fetchCompanyQualities(admin, CO)).map((q) => q.id)).toEqual(['mine'])
  })

  it('labels a spec whose laboratory name is missing as null', async () => {
    const { admin } = fakeAdmin({ client_qualities: [row({ id: 'q1', laboratory_id: 'lab-x', laboratories: null })], client_quality_versions: [] })
    expect((await fetchCompanyQualities(admin, CO))[0].labName).toBeNull()
  })
})

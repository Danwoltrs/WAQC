import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  resolveCertificateSearchIds,
  COUNTERPARTY_FIELDS,
  SAMPLE_TEXT_FIELDS,
  COMPANY_CHUNK_SIZE,
  MAX_SEARCH_SAMPLE_IDS,
  QUALITY_SCAN_LIMIT,
} from './cert-search-resolve'

/**
 * Minimal PostgREST-builder fake: records every call per table and answers
 * from `respond(table, calls)` — an array of rows, or `{ error }` to fail that
 * request. Thenable so `await` and Promise.all both work.
 */
type Call = { op: string; args: unknown[] }
type Answer = Array<Record<string, unknown>> | { error: { message: string } }
function fakeDb(respond: (table: string, calls: Call[]) => Answer) {
  const log: Array<{ table: string; calls: Call[] }> = []
  return {
    log,
    from(table: string) {
      const calls: Call[] = []
      log.push({ table, calls })
      const builder: any = {}
      for (const op of ['select', 'or', 'in', 'ilike', 'limit', 'order']) {
        builder[op] = (...args: unknown[]) => { calls.push({ op, args }); return builder }
      }
      builder.then = (resolve: (v: unknown) => void) => {
        const a = respond(table, calls)
        resolve(Array.isArray(a) ? { data: a, error: null } : { data: null, error: a.error })
      }
      return builder
    },
  }
}
const filterOf = (calls: Call[], op: string) => calls.filter((c) => c.op === op).map((c) => String(c.args[0]))
const isBroadScan = (l: { table: string; calls: Call[] }) => l.table === 'samples' && filterOf(l.calls, 'or')[0]?.includes('.in.(')
const NEWEST_FIRST = { op: 'order', args: ['created_at', { ascending: false }] }
const at = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString()

afterEach(() => vi.restoreAllMocks())

describe('resolveCertificateSearchIds', () => {
  it('matches a seller name: every sample carrying the company in ANY counterparty role', async () => {
    const db = fakeDb((table, calls) => {
      if (table === 'companies') return [{ id: 'monte' }]
      if (table === 'samples' && filterOf(calls, 'or')[0]?.includes('seller_id.in.(monte)')) return [{ id: 's1' }, { id: 's2' }]
      return []
    })
    const res = await resolveCertificateSearchIds(db, 'Monte')
    expect(res.clientSampleIds).toEqual(['s1', 's2'])
    const broadScan = db.log.find(isBroadScan)!
    for (const fk of COUNTERPARTY_FIELDS) expect(filterOf(broadScan.calls, 'or')[0]).toContain(`${fk}.in.(monte)`)
    expect(broadScan.calls).toContainEqual(NEWEST_FIRST)
    expect(res.truncated).toBe(false)
  })

  it('matches quality by template name, custom name, and the sample free-text fields', async () => {
    const db = fakeDb((table, calls) => {
      if (table === 'quality_templates') return [{ id: 't1' }]
      if (table === 'client_qualities' && filterOf(calls, 'ilike').length) return [{ id: 'q-custom' }]
      if (table === 'client_qualities') return [{ id: 'q-from-template' }]
      if (table === 'samples' && filterOf(calls, 'in').length) return [{ id: 's-quality' }]
      if (table === 'samples') return [{ id: 's-text' }]
      return []
    })
    const res = await resolveCertificateSearchIds(db, 'Fine Cup')
    expect(res.sampleIds).toEqual(['s-text'])
    expect(res.clientSampleIds).toEqual(['s-quality'])
    const qualityScan = db.log.find((l) => l.table === 'samples' && filterOf(l.calls, 'in').length)!
    expect(qualityScan.calls.find((c) => c.op === 'in')!.args).toEqual(['quality_spec_id', ['q-custom', 'q-from-template']])
    expect(qualityScan.calls).toContainEqual(NEWEST_FIRST)
    const textScan = db.log.find((l) => l.table === 'samples')!
    for (const f of SAMPLE_TEXT_FIELDS) expect(filterOf(textScan.calls, 'or')[0]).toContain(`${f}.ilike.%Fine Cup%`)
    expect(textScan.calls).toContainEqual(NEWEST_FIRST)
  })

  it('keeps parentheses for the .ilike() name scans while stripping them from the .or() filter', async () => {
    const db = fakeDb(() => [])
    await resolveCertificateSearchIds(db, ' NY 2/3 (copy) ')
    const templates = db.log.find((l) => l.table === 'quality_templates')!
    expect(templates.calls.find((c) => c.op === 'ilike')!.args).toEqual(['name', '%NY 2/3 (copy)%'])
    expect(filterOf(db.log.find((l) => l.table === 'samples')!.calls, 'or')[0]).toContain('quality_name.ilike.%NY 2/3 copy%')
  })

  it('chunks a wide company match so the six in-lists stay under the URI limit', async () => {
    const companies = Array.from({ length: 70 }, (_, i) => ({ id: `c${i}` }))
    const db = fakeDb((table) => (table === 'companies' ? companies : []))
    await resolveCertificateSearchIds(db, 'co')
    const broadScans = db.log.filter(isBroadScan)
    expect(broadScans).toHaveLength(Math.ceil(70 / COMPANY_CHUNK_SIZE))
    expect(filterOf(broadScans[0].calls, 'or')[0].split('client_id.in.(')[1].split(')')[0].split(',')).toHaveLength(COMPANY_CHUNK_SIZE)
  })

  it('caps the union by newest CERTIFICATE so a broad term still shows the top of the list', async () => {
    // "Brazil" matches origin on every sample: 775 ids were a 28 KB filter and a bare Bad Request.
    const samples = Array.from({ length: 775 }, (_, i) => ({ id: `s${i}` }))
    // s0 is the oldest intake but holds the newest certificate; s1 has none at all.
    const certOf = (id: string) => id === 's0' ? at(9999) : id === 's1' ? null : at(Number(id.slice(1)))
    const db = fakeDb((table, calls) => {
      if (table === 'samples') return samples
      if (table === 'certificates') {
        const chunk = calls.find((c) => c.op === 'in')!.args[1] as string[]
        return chunk.flatMap((id) => (certOf(id) ? [{ sample_id: id, created_at: certOf(id) }] : []))
      }
      return []
    })
    const res = await resolveCertificateSearchIds(db, 'Brazil')
    expect(res.truncated).toBe(true)
    expect(res.sampleIds).toHaveLength(MAX_SEARCH_SAMPLE_IDS)
    expect(res.sampleIds[0]).toBe('s0')
    expect(res.sampleIds[1]).toBe('s774')
    expect(res.sampleIds).not.toContain('s1')
    expect(res.clientSampleIds).toEqual([])
    expect(db.log.filter((l) => l.table === 'certificates')).toHaveLength(Math.ceil(775 / 200))
  })

  it('keeps the own/broad split through the cap', async () => {
    const own = Array.from({ length: 200 }, (_, i) => ({ id: `o${i}` }))
    const broad = Array.from({ length: 200 }, (_, i) => ({ id: `b${i}` }))
    const db = fakeDb((table, calls) => {
      if (table === 'companies') return [{ id: 'c1' }]
      if (table === 'samples') return filterOf(calls, 'or')[0]?.includes('.in.(') ? broad : own
      if (table === 'certificates') {
        const chunk = calls.find((c) => c.op === 'in')!.args[1] as string[]
        // broad certificates are newer than own ones
        return chunk.map((id) => ({ sample_id: id, created_at: at((id.startsWith('b') ? 1000 : 0) + Number(id.slice(1))) }))
      }
      return []
    })
    const res = await resolveCertificateSearchIds(db, 'x')
    expect(res.truncated).toBe(true)
    expect(res.clientSampleIds).toHaveLength(200)
    expect(res.sampleIds).toHaveLength(MAX_SEARCH_SAMPLE_IDS - 200)
    expect(res.sampleIds[0]).toBe('o199')
  })

  it('never lists a sample in both sets — an own match is not repeated as broad', async () => {
    const db = fakeDb((table) => (table === 'companies' ? [{ id: 'c1' }] : table === 'samples' ? [{ id: 'dup' }] : []))
    const res = await resolveCertificateSearchIds(db, 'x')
    expect(res.sampleIds).toEqual(['dup'])
    expect(res.clientSampleIds).toEqual([])
  })

  it('degrades a failed scan to "incomplete" instead of throwing or pretending nothing matched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = fakeDb((table) => (table === 'companies' ? { error: { message: 'TypeError: fetch failed' } } : table === 'samples' ? [{ id: 's1' }] : []))
    const res = await resolveCertificateSearchIds(db, 'x')
    expect(res.sampleIds).toEqual(['s1'])
    expect(res.truncated).toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('companies'), 'TypeError: fetch failed')
  })

  it('flags truncation when the template → client_qualities hop hits its cap', async () => {
    const many = Array.from({ length: QUALITY_SCAN_LIMIT }, (_, i) => ({ id: `q${i}` }))
    const db = fakeDb((table, calls) => {
      if (table === 'quality_templates') return [{ id: 't1' }]
      if (table === 'client_qualities' && filterOf(calls, 'in').length) return many
      return []
    })
    const res = await resolveCertificateSearchIds(db, 'NY')
    expect(res.truncated).toBe(true)
  })

  it('skips the broad queries entirely when nothing matched by name', async () => {
    const db = fakeDb(() => [])
    const res = await resolveCertificateSearchIds(db, 'zzz')
    expect(res).toEqual({ sampleIds: [], clientSampleIds: [], truncated: false })
    expect(db.log.filter((l) => l.table === 'samples')).toHaveLength(1)
  })

  it('runs no query for a term that sanitizes to nothing', async () => {
    const db = fakeDb(() => [])
    expect(await resolveCertificateSearchIds(db, ' (%) ')).toEqual({ sampleIds: [], clientSampleIds: [], truncated: false })
    expect(db.log).toHaveLength(0)
  })
})

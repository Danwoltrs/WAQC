import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCertificateSearchOr } from './cert-search-filter'

const resolveMock = vi.hoisted(() => vi.fn())
vi.mock('./cert-search-resolve', async (orig) => ({
  ...(await orig<typeof import('./cert-search-resolve')>()),
  resolveCertificateSearchIds: resolveMock,
}))

import { NO_MATCH_OR, resolveCertificateSearch } from './cert-search-multi'

const none = { sampleIds: [], clientSampleIds: [], truncated: false, failed: false }

/**
 * Fake db: the certificates scan (.or) and the has-certificate read (.in) resolve per test.
 * A sample in `deleted` is soft-deleted: a read leaves its certificate out only
 * when it joins the sample (inner) and filters `sample.deleted_at` is null.
 */
function fakeDb(opts: { scan?: (or: string) => any[]; certified?: string[]; scanError?: boolean; deleted?: string[] } = {}) {
  const calls: { or: string[]; select: string[] } = { or: [], select: [] }
  const db = {
    from: (table: string) => {
      expect(table).toBe('certificates')
      let orArg = ''
      let inList: string[] | null = null
      let innerSample = false
      let liveOnly = false
      const chain: any = {
        select: (cols: string) => ((innerSample = /sample:samples!inner\(deleted_at\)/.test(cols)), calls.select.push(cols), chain),
        or: (s: string) => ((orArg = s), calls.or.push(s), chain),
        not: () => chain,
        is: (col: string, value: null) => ((liveOnly = liveOnly || (col === 'sample.deleted_at' && value === null)), chain),
        limit: () => chain,
        in: (_c: string, list: string[]) => ((inList = list), chain),
        then: (res: any, rej: any) => {
          const live = (id: string) => !(innerSample && liveOnly && (opts.deleted ?? []).includes(id))
          const out = inList
            ? { data: (opts.certified ?? []).filter((id) => inList!.includes(id) && live(id)).map((sample_id) => ({ sample_id })), error: null }
            : opts.scanError
              ? { data: null, error: { message: 'boom' } }
              : { data: (opts.scan?.(orArg) ?? []).filter(live).map((sample_id) => ({ sample_id })), error: null }
          return Promise.resolve(out).then(res, rej)
        },
      }
      return chain
    },
  }
  return { db, calls }
}

describe('resolveCertificateSearch', () => {
  beforeEach(() => resolveMock.mockReset().mockResolvedValue(none))

  it('no terms means no search', async () => {
    const r = await resolveCertificateSearch(fakeDb().db, ' , ')
    expect(r.or).toBeNull()
    expect(r.unmatchedTerms).toEqual([])
  })

  it("a single term takes today's path unchanged", async () => {
    resolveMock.mockResolvedValue({ sampleIds: ['s1'], clientSampleIds: [], truncated: false, failed: false })
    const r = await resolveCertificateSearch(fakeDb().db, '42270')
    expect(r.or).toBe(buildCertificateSearchOr('%42270%', { sampleIds: ['s1'], clientSampleIds: [] }))
    expect(r.unmatchedTerms).toEqual([])
    expect(r.termsCapped).toBe(false)
  })

  it('two terms search the union of their samples and name the one with no certificate', async () => {
    resolveMock.mockImplementation(async (_db: any, t: string) => ({
      ...none,
      sampleIds: [t === 'S-1548' ? 's1' : 's2'],
    }))
    const r = await resolveCertificateSearch(fakeDb({ certified: ['s1'] }).db, 'S-1548, S-1549')
    expect(r.or).toBe('sample_id.in.(s1,s2)')
    expect(r.unmatchedTerms).toEqual(['S-1549'])
  })

  it('a certificate number in a list matches through the certificates scan', async () => {
    resolveMock.mockImplementation(async (_db: any, t: string) => ({ ...none, sampleIds: t === '42270' ? ['s1'] : [] }))
    const { db } = fakeDb({ scan: (or) => (or.includes('SAG-011960') ? ['s9'] : []), certified: ['s1', 's9'] })
    const r = await resolveCertificateSearch(db, 'SAG-011960, 42270')
    expect(r.or).toContain('s9')
    expect(r.unmatchedTerms).toEqual([])
  })

  it('a certificate of a deleted lot does not count: its number is reported as not found', async () => {
    resolveMock.mockImplementation(async (_db: any, t: string) => ({ ...none, sampleIds: t === '42270' ? ['s1'] : [] }))
    const { db, calls } = fakeDb({
      // SAG-011961 is the certificate of s8, whose sample was soft-deleted.
      scan: (or) => (or.includes('SAG-011961') ? ['s8'] : []),
      certified: ['s1', 's8'],
      deleted: ['s8'],
    })
    const r = await resolveCertificateSearch(db, 'SAG-011961, 42270')
    expect(r.unmatchedTerms).toEqual(['SAG-011961'])
    expect(r.or).toBe('sample_id.in.(s1)')
    // Both the per-term scan and the has-certificate read join the live sample.
    expect(calls.select).toHaveLength(3)
    for (const cols of calls.select) expect(cols).toContain('sample:samples!inner(deleted_at)')
  })

  it('a term whose only lot was deleted is named, even when the sample lookup still finds it', async () => {
    resolveMock.mockImplementation(async (_db: any, t: string) => ({ ...none, sampleIds: t === 'S-1548' ? ['s1'] : ['s2'] }))
    const r = await resolveCertificateSearch(fakeDb({ certified: ['s1', 's2'], deleted: ['s2'] }).db, 'S-1548, S-1549')
    expect(r.unmatchedTerms).toEqual(['S-1549'])
  })

  it('nothing matched at all filters to no rows', async () => {
    const r = await resolveCertificateSearch(fakeDb().db, 'zzz1, zzz2')
    expect(r.or).toBe(NO_MATCH_OR)
    expect(r.unmatchedTerms).toEqual(['zzz1', 'zzz2'])
  })

  it('cuts the union at 300 and says so', async () => {
    resolveMock.mockImplementation(async (_db: any, t: string) => ({
      ...none,
      sampleIds: Array.from({ length: 160 }, (_, i) => `${t}-${i}`),
    }))
    const r = await resolveCertificateSearch(fakeDb().db, 'a1, b2')
    expect(r.truncated).toBe(true)
    expect(r.or!.slice('sample_id.in.('.length, -1).split(',')).toHaveLength(300)
  })

  it('a failed lookup marks the search incomplete', async () => {
    resolveMock.mockResolvedValue({ ...none, failed: true })
    expect((await resolveCertificateSearch(fakeDb().db, 'a1, b2')).failed).toBe(true)
  })

  it('a failed certificates scan marks the search incomplete', async () => {
    expect((await resolveCertificateSearch(fakeDb({ scanError: true }).db, 'a1, b2')).failed).toBe(true)
  })

  it('passes on the 50-term cap', async () => {
    const sixty = Array.from({ length: 60 }, (_, i) => `T${i}`).join(',')
    const r = await resolveCertificateSearch(fakeDb().db, sixty)
    expect(r.termsCapped).toBe(true)
    expect(resolveMock).toHaveBeenCalledTimes(50)
  })

  it('keeps at most 5 terms in flight', async () => {
    let active = 0
    let peak = 0
    resolveMock.mockImplementation(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 1))
      active--
      return none
    })
    await resolveCertificateSearch(fakeDb().db, Array.from({ length: 20 }, (_, i) => `T${i}`).join(','))
    expect(peak).toBeLessThanOrEqual(5)
  })
})

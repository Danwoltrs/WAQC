import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyCertificateListQuery,
  certificateListUrl,
  foldFilterOptions,
  parseCertificateListParams,
  santosDateBoundsUtc,
} from './certificate-list-query'

// A recording stand-in for the supabase-js builder: every method logs its call
// and returns the same object, so the chain order does not matter.
let calls: unknown[][]
let fake: Record<string, (...args: unknown[]) => unknown>
beforeEach(() => {
  calls = []
  fake = {}
  for (const name of ['is', 'in', 'eq', 'not', 'or', 'gte', 'lt', 'order', 'range']) {
    fake[name] = (...args: unknown[]) => {
      calls.push([name, ...args])
      return fake
    }
  }
})

const run = (qs: string, searchOr: string | null = null) =>
  applyCertificateListQuery(fake, parseCertificateListParams(new URLSearchParams(qs)), searchOr)

describe('applyCertificateListQuery', () => {
  it('default list: live samples only, newest first, first page', () => {
    run('')
    expect(calls).toEqual(expect.arrayContaining([
      ['is', 'sample.deleted_at', null], ['or', 'sample.not.is.null,sample_id.is.null'],
      ['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['range', 0, 99],
    ]))
  })
  it('a client filter needs a sample', () => {
    run('client_id=ahold&quality_id=q1')
    expect(calls).toEqual(expect.arrayContaining([['eq', 'sample.client_id', 'ahold'], ['eq', 'sample.quality_spec_id', 'q1'], ['not', 'sample', 'is', null]]))
    expect(calls).not.toContainEqual(['or', 'sample.not.is.null,sample_id.is.null'])
  })
  it("sorts by the sample's origin", () => {
    run('sort_by=origin&sort_order=asc')
    expect(calls).toContainEqual(['order', 'sample(origin)', { ascending: true, nullsFirst: false }])
  })
  it('page 3', () => {
    run('offset=200')
    expect(calls).toContainEqual(['range', 200, 299])
  })
  it('ids mode reads just those certificates', () => {
    run('ids=a,b&status=issued&client_id=x')
    expect(calls).toContainEqual(['in', 'id', ['a', 'b']])
    expect(calls.some(c => c[0] === 'range')).toBe(false)
    expect(calls.some(c => c[0] === 'eq')).toBe(false)
  })
  it('applies status, Santos date bounds and the search or', () => {
    run('status=issued&date_from=2026-10-16&date_to=2026-10-16', 'certificate_number.ilike.%x%')
    expect(calls).toEqual(expect.arrayContaining([
      ['eq', 'status', 'issued'],
      ['gte', 'created_at', '2026-10-16T03:00:00.000Z'],
      ['lt', 'created_at', '2026-10-17T03:00:00.000Z'],
      ['or', 'certificate_number.ilike.%x%'],
    ]))
  })
})

describe('parseCertificateListParams', () => {
  it('rejects junk params', () => {
    const p = parseCertificateListParams(new URLSearchParams('limit=5000&offset=-4&sort_by=drop&status=x&date_from=yesterday'))
    expect(p).toMatchObject({ limit: 300, offset: 0, sortBy: 'created_at', status: null, dateFrom: null })
  })
  it('caps ids at 300', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `i${i}`).join(',')
    expect(parseCertificateListParams(new URLSearchParams({ ids })).ids).toHaveLength(300)
  })
})

describe('santosDateBoundsUtc', () => {
  it('Santos days', () => {
    expect(santosDateBoundsUtc('2026-10-16', '2026-10-16')).toEqual({ gte: '2026-10-16T03:00:00.000Z', lt: '2026-10-17T03:00:00.000Z' })
    expect(santosDateBoundsUtc(null, '2026-10-16')).toEqual({ gte: null, lt: '2026-10-17T03:00:00.000Z' })
  })
  it('a certificate at 22:00 Santos on the 16th is inside the 16th', () => {
    const { gte, lt } = santosDateBoundsUtc('2026-10-16', '2026-10-16')
    const at = '2026-10-17T01:00:00.000Z'
    expect(at >= gte! && at < lt!).toBe(true)
  })
})

describe('certificateListUrl', () => {
  it('builds list URLs without defaults', () => {
    expect(certificateListUrl({})).toBe('/api/certificates')
    expect(certificateListUrl({ search: '42270', offset: 100 })).toBe('/api/certificates?search=42270&offset=100')
    expect(certificateListUrl({ search: '' })).toBe('/api/certificates')
  })
})

describe('foldFilterOptions', () => {
  it('folds filter options', () => {
    expect(foldFilterOptions([
      { client_id: 'a', client_name: 'Ahold', quality_id: 'q1', quality_name: 'SAG' },
      { client_id: 'a', client_name: 'Ahold', quality_id: 'q2', quality_name: 'SAK' },
      { client_id: 'a', client_name: 'Ahold', quality_id: 'q2', quality_name: 'SAK' },
      { client_id: 'd', client_name: 'Dunkin', quality_id: null, quality_name: null },
    ])).toEqual({
      clients: [{ id: 'a', name: 'Ahold' }, { id: 'd', name: 'Dunkin' }],
      qualities: [{ id: 'q1', name: 'SAG', client_id: 'a' }, { id: 'q2', name: 'SAK', client_id: 'a' }],
    })
  })
})

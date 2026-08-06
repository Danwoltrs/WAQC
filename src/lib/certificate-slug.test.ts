import { describe, it, expect } from 'vitest'
import { resolveSampleIdForSlug, resolvePublicReference } from './certificate-slug'

interface QueryLog {
  table: string
  filters: Array<{ op: string; column: string; value: unknown }>
}

/**
 * Hand-rolled Supabase stub: every builder method returns `this`, and the
 * terminal `maybeSingle()` hands back whatever the table was seeded with.
 * Records each query so a test can assert the samples table was never touched.
 */
function fakeSupabase(rows: Record<string, unknown | null>) {
  const queries: QueryLog[] = []

  const from = (table: string) => {
    const log: QueryLog = { table, filters: [] }
    queries.push(log)
    const builder: any = {
      select: () => builder,
      limit: () => builder,
      is: (column: string, value: unknown) => {
        log.filters.push({ op: 'is', column, value })
        return builder
      },
      ilike: (column: string, value: unknown) => {
        log.filters.push({ op: 'ilike', column, value })
        return builder
      },
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
    }
    return builder
  }

  return { client: { from } as any, queries }
}

describe('resolveSampleIdForSlug', () => {
  it('resolves an official certificate number without touching samples', async () => {
    const { client, queries } = fakeSupabase({ certificates: { sample_id: 'sample-1' } })

    expect(await resolveSampleIdForSlug(client, 'BR-036991_26')).toBe('sample-1')
    expect(queries.map(q => q.table)).toEqual(['certificates'])
  })

  it('falls through to the legacy tracking number when no certificate matches', async () => {
    const { client, queries } = fakeSupabase({
      certificates: null,
      samples: { id: 'sample-2' },
    })

    expect(await resolveSampleIdForSlug(client, 'SAN-048524_25')).toBe('sample-2')
    expect(queries.map(q => q.table)).toEqual(['certificates', 'samples'])
  })

  it('returns null when neither lookup matches', async () => {
    const { client } = fakeSupabase({ certificates: null, samples: null })

    expect(await resolveSampleIdForSlug(client, 'NOPE_99')).toBeNull()
  })

  it('converts the slug underscore back to a slash before querying', async () => {
    const { client, queries } = fakeSupabase({ certificates: null, samples: null })

    await resolveSampleIdForSlug(client, 'BR-036991_26')

    expect(queries[0].filters).toContainEqual({
      op: 'ilike',
      column: 'certificate_number',
      value: 'BR-036991/26',
    })
    expect(queries[1].filters).toContainEqual({
      op: 'ilike',
      column: 'tracking_number',
      value: 'BR-036991/26',
    })
  })

  it('excludes soft-deleted samples from the legacy path', async () => {
    const { client, queries } = fakeSupabase({ certificates: null, samples: null })

    await resolveSampleIdForSlug(client, 'SAN-048524_25')

    expect(queries[1].filters).toContainEqual({ op: 'is', column: 'deleted_at', value: null })
  })
})

describe('resolvePublicReference', () => {
  it('shows the container for a shipment sample', () => {
    expect(resolvePublicReference({ sampleType: 'ss', containerNr: 'HASU 155.201-6' })).toEqual({
      reference: 'HASU 155.201-6',
      eyebrow: 'SS · Container',
    })
  })

  it('shows the exporter sample number for a pre-shipment sample', () => {
    expect(resolvePublicReference({ sampleType: 'pss', exporterSampleNumber: 'CCT-2214/26' })).toEqual({
      reference: 'CCT-2214/26',
      eyebrow: 'PSS · Exporter sample',
    })
  })

  it('uses a container even when the type does not match', () => {
    expect(resolvePublicReference({ sampleType: 'pss', containerNr: 'HASU 155.201-6' })).toEqual({
      reference: 'HASU 155.201-6',
      eyebrow: 'Container',
    })
  })

  it('uses an exporter sample number even when the type does not match', () => {
    expect(resolvePublicReference({ sampleType: 'ss', exporterSampleNumber: 'CCT-2214/26' })).toEqual({
      reference: 'CCT-2214/26',
      eyebrow: 'Exporter sample',
    })
  })

  it('prefers the buyer contract over the Wolthers contract', () => {
    expect(resolvePublicReference({
      sampleType: 'ss',
      buyerContractNr: 'P-8037',
      wolthersContractNr: '41922/26',
    })).toEqual({ reference: 'P-8037', eyebrow: 'Contract' })
  })

  it('falls back to the Wolthers contract when there is no buyer contract', () => {
    expect(resolvePublicReference({ wolthersContractNr: '41922/26' })).toEqual({
      reference: '41922/26',
      eyebrow: 'Contract',
    })
  })

  it('renders Reference pending when nothing resolves', () => {
    expect(resolvePublicReference({
      sampleType: 'ss',
      containerNr: '  ',
      exporterSampleNumber: null,
      buyerContractNr: '',
      wolthersContractNr: null,
    })).toEqual({ reference: 'Reference pending', eyebrow: '' })
  })

  it('never returns the internal lab number, even when only contracts are known', () => {
    const { reference } = resolvePublicReference({
      sampleType: 'ss',
      buyerContractNr: 'P-8037',
      wolthersContractNr: '41922/26',
    })
    expect(reference).not.toContain('SAN-')
  })
})

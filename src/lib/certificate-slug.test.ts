import { describe, it, expect } from 'vitest'
import {
  parseCertificatePath,
  resolveSampleIdForSlug,
  resolvePublicReference,
  resolveLotReference,
  resolveContractReference,
} from './certificate-slug'

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
      // Awaiting the builder resolves the list form, which the certificates
      // lookup uses now that a number can legitimately match several rows.
      then: (resolve: (v: unknown) => unknown) => {
        const seeded = rows[table] ?? null
        const data = seeded === null ? [] : Array.isArray(seeded) ? seeded : [seeded]
        return Promise.resolve({ data, error: null }).then(resolve)
      },
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

  it('refuses to guess when one number matches several clients\' certificates', async () => {
    // certificate_number is unique per client, not globally (migration
    // 20260824000000), so a bare number like 000001/26 can belong to two
    // clients. Picking one would show a scanner another client's lot.
    const { client } = fakeSupabase({
      certificates: [{ sample_id: 'sample-wa-qc' }, { sample_id: 'sample-arvid' }],
      samples: { id: 'sample-legacy' },
    })

    expect(await resolveSampleIdForSlug(client, '000001_26')).toBeNull()
  })

  it('narrows a duplicated number to the client named in the url', async () => {
    const { client } = fakeSupabase({
      certificates: [
        { sample_id: 'sample-wa-qc', client: { fantasy_name: 'W&A QC', name: 'W&A QC' } },
        { sample_id: 'sample-arvid', client: { fantasy_name: 'Arvid Nordquist', name: 'Arvid Nordquist H.A.B.' } },
      ],
    })

    expect(await resolveSampleIdForSlug(client, '000001_26', 'arvid-nordquist')).toBe('sample-arvid')
    expect(await resolveSampleIdForSlug(client, '000001_26', 'w-a-qc')).toBe('sample-wa-qc')
  })

  it('matches the buyer on the legal name when the fantasy name does not', async () => {
    const { client } = fakeSupabase({
      certificates: [
        { sample_id: 'sample-wa-qc', client: { fantasy_name: 'W&A QC', name: 'W&A QC' } },
        { sample_id: 'sample-arvid', client: { fantasy_name: 'Arvid Nordquist', name: 'Arvid Nordquist H.A.B.' } },
      ],
    })

    expect(await resolveSampleIdForSlug(client, '000001_26', 'arvid-nordquist-h-a-b')).toBe('sample-arvid')
  })

  it('ignores a stale buyer segment when the number is unique anyway', async () => {
    // A company rename must not 404 every tin printed under the old name.
    const { client } = fakeSupabase({
      certificates: [{ sample_id: 'sample-1', client: { fantasy_name: 'Renamed Co', name: 'Renamed Co' } }],
    })

    expect(await resolveSampleIdForSlug(client, 'BR-036991_26', 'old-name')).toBe('sample-1')
  })

  it('still refuses when the buyer segment matches none of the candidates', async () => {
    const { client } = fakeSupabase({
      certificates: [
        { sample_id: 'sample-wa-qc', client: { fantasy_name: 'W&A QC', name: 'W&A QC' } },
        { sample_id: 'sample-arvid', client: { fantasy_name: 'Arvid Nordquist', name: 'Arvid Nordquist H.A.B.' } },
      ],
      samples: null,
    })

    expect(await resolveSampleIdForSlug(client, '000001_26', 'someone-else')).toBeNull()
  })

  it('excludes soft-deleted samples from the legacy path', async () => {
    const { client, queries } = fakeSupabase({ certificates: null, samples: null })

    await resolveSampleIdForSlug(client, 'SAN-048524_25')

    expect(queries[1].filters).toContainEqual({ op: 'is', column: 'deleted_at', value: null })
  })
})

describe('parseCertificatePath', () => {
  it('reads a bare number as the legacy one-segment url', () => {
    expect(parseCertificatePath(['000001_26'])).toEqual({ buyerSlug: null, numberSlug: '000001_26' })
  })

  it('reads the buyer from the first of two segments', () => {
    expect(parseCertificatePath(['arvid-nordquist', '000001_26']))
      .toEqual({ buyerSlug: 'arvid-nordquist', numberSlug: '000001_26' })
  })

  it('rejects an empty or over-long path', () => {
    expect(parseCertificatePath([])).toBeNull()
    expect(parseCertificatePath(['a', 'b', 'c'])).toBeNull()
    expect(parseCertificatePath(undefined)).toBeNull()
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

describe('resolveLotReference', () => {
  it('labels a shipment sample by its container', () => {
    expect(resolveLotReference({ sampleType: 'ss', containerNr: 'HASU 155.201-6' }))
      .toEqual({ label: 'Container', value: 'HASU 155.201-6' })
  })

  it('labels a pre-shipment sample by the exporter sample number', () => {
    expect(resolveLotReference({ sampleType: 'pss', exporterSampleNumber: 'CCT-2214/26' }))
      .toEqual({ label: 'Exporter sample', value: 'CCT-2214/26' })
  })

  it('falls back across the type when only the other field is set', () => {
    expect(resolveLotReference({ sampleType: 'pss', containerNr: 'HASU 155.201-6' }))
      .toEqual({ label: 'Container', value: 'HASU 155.201-6' })
    expect(resolveLotReference({ sampleType: 'ss', exporterSampleNumber: 'CCT-2214/26' }))
      .toEqual({ label: 'Exporter sample', value: 'CCT-2214/26' })
  })

  it('never falls through to a contract number — that is not the lot', () => {
    expect(resolveLotReference({
      sampleType: 'ss',
      containerNr: '  ',
      buyerContractNr: 'P-8037',
      wolthersContractNr: '41922/26',
    })).toBeNull()
  })
})

describe('resolveContractReference', () => {
  it('prefers the buyer\'s own contract number', () => {
    expect(resolveContractReference({ buyerContractNr: 'P-8037', wolthersContractNr: '41922/26' }))
      .toEqual({ label: 'Contract', value: 'P-8037' })
  })

  it('labels our own contract as ours rather than passing it off as the buyer\'s', () => {
    expect(resolveContractReference({ wolthersContractNr: '41922/26' }))
      .toEqual({ label: 'W&A contract', value: '41922/26' })
  })

  it('returns null when neither is set', () => {
    expect(resolveContractReference({ buyerContractNr: '  ', wolthersContractNr: null })).toBeNull()
  })
})

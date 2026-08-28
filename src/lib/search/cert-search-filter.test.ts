import { describe, it, expect } from 'vitest'
import { buildCertificateSearchOr } from './cert-search-filter'

const like = '%42274%'

describe('buildCertificateSearchOr', () => {
  it('always matches certificate number and issued_to', () => {
    const or = buildCertificateSearchOr(like, { sampleIds: [], clientSampleIds: [] })
    expect(or).toBe('certificate_number.ilike.%42274%,issued_to.ilike.%42274%')
  })

  it('matches the certificates of samples whose own fields matched', () => {
    const or = buildCertificateSearchOr(like, { sampleIds: ['s1', 's2'], clientSampleIds: [] })
    expect(or).toContain('sample_id.in.(s1,s2)')
  })

  it('keeps company-name matches broad (all certs for the client samples)', () => {
    const or = buildCertificateSearchOr(like, { sampleIds: [], clientSampleIds: ['s9'] })
    expect(or).toContain('sample_id.in.(s9)')
  })

  it('never reads certificates.sample_contract_id — a contract sibling is a sample', () => {
    const or = buildCertificateSearchOr(like, { sampleIds: ['s2'], clientSampleIds: ['s9'] })
    expect(or).not.toContain('sample_contract_id')
  })

  it('unions both id sets into one deduplicated in-list, reference matches first', () => {
    const or = buildCertificateSearchOr(like, { sampleIds: ['s1', 's9'], clientSampleIds: ['s9', 's3'] })
    expect(or).toBe(
      'certificate_number.ilike.%42274%,issued_to.ilike.%42274%,sample_id.in.(s1,s9,s3)',
    )
  })
})

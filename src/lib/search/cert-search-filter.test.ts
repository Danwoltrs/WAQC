import { describe, it, expect } from 'vitest'
import { buildCertificateSearchOr } from './cert-search-filter'

const like = '%42274%'

describe('buildCertificateSearchOr', () => {
  it('always matches certificate number and issued_to', () => {
    const or = buildCertificateSearchOr(like, { motherSampleIds: [], subContractIds: [], clientSampleIds: [] })
    expect(or).toBe('certificate_number.ilike.%42274%,issued_to.ilike.%42274%')
  })

  it('matches mother certs only for samples whose own fields matched (sub_contract_id is null)', () => {
    const or = buildCertificateSearchOr(like, { motherSampleIds: ['s1', 's2'], subContractIds: [], clientSampleIds: [] })
    expect(or).toContain('and(sample_contract_id.is.null,sample_id.in.(s1,s2))')
  })

  it('matches the specific sub-contract certs, NOT the whole mother sample', () => {
    const or = buildCertificateSearchOr(like, { motherSampleIds: [], subContractIds: ['c1', 'c2'], clientSampleIds: [] })
    expect(or).toContain('sample_contract_id.in.(c1,c2)')
    // No bare whole-sample expansion — sibling sub-contracts must not ride along.
    expect(or).not.toContain('sample_id.in.')
  })

  it('keeps company-name matches broad (all certs for the client samples)', () => {
    const or = buildCertificateSearchOr(like, { motherSampleIds: [], subContractIds: [], clientSampleIds: ['s9'] })
    expect(or).toContain('sample_id.in.(s9)')
  })

  it('composes all branches deterministically', () => {
    const or = buildCertificateSearchOr(like, { motherSampleIds: ['s1'], subContractIds: ['c1'], clientSampleIds: ['s9'] })
    expect(or).toBe(
      'certificate_number.ilike.%42274%,issued_to.ilike.%42274%,' +
        'and(sample_contract_id.is.null,sample_id.in.(s1)),' +
        'sample_contract_id.in.(c1),' +
        'sample_id.in.(s9)',
    )
  })
})

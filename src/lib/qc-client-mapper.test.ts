import { describe, it, expect } from 'vitest'
import { splitClientPayload } from './qc-client-mapper'

describe('splitClientPayload', () => {
  it('routes qc_fee_co_broker_company_id to qc_client_settings', () => {
    const { settingsFields, companyFields } = splitClientPayload({
      qc_fee_co_broker_company_id: '11111111-1111-1111-1111-111111111111',
    })
    expect(settingsFields.qc_fee_co_broker_company_id).toBe(
      '11111111-1111-1111-1111-111111111111',
    )
    expect(companyFields.qc_fee_co_broker_company_id).toBeUndefined()
  })

  it('routes an explicit null through (clearing the mapping)', () => {
    const { settingsFields } = splitClientPayload({ qc_fee_co_broker_company_id: null })
    expect(settingsFields).toHaveProperty('qc_fee_co_broker_company_id', null)
  })
})

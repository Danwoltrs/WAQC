import { describe, it, expect } from 'vitest'
import { splitClientPayload, mapCompanyToClient, buildQcClientCreatePayload } from './qc-client-mapper'
import type { QcConfigData } from '@/components/clients/qc-config-panel'
import { DEFAULT_CERTIFICATE_PATTERN } from '@/types/certificate-pattern'

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

// mapCompanyToClient is the read side of the same round trip: QC_CLIENT_SELECT
// pulls qc_client_settings.qc_fee_co_broker_company_id, and this flattens it onto
// the "client" shape the UI reads. Without this, a save through splitClientPayload
// above would succeed but the re-fetched panel would render the picker empty.
describe('mapCompanyToClient', () => {
  const baseRow = {
    id: 'company-1',
    name: 'Rich Coop',
    fantasy_name: null,
    email: null,
    phone: null,
    address: null,
    neighborhood: null,
    city: null,
    state: null,
    country: null,
    zip_code: null,
    vat_number: null,
    company_types: null,
    trading_roles: null,
    is_qc_client: true,
    is_active: true,
    legacy_client_id: null,
    logo_url: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  it('echoes qc_fee_co_broker_company_id out of qc_client_settings', () => {
    const client = mapCompanyToClient({
      ...baseRow,
      qc_settings: { qc_fee_co_broker_company_id: '22222222-2222-2222-2222-222222222222' },
    })
    expect(client?.qc_fee_co_broker_company_id).toBe('22222222-2222-2222-2222-222222222222')
  })

  it('defaults to null when no offset co-broker is set', () => {
    const client = mapCompanyToClient({ ...baseRow, qc_settings: {} })
    expect(client?.qc_fee_co_broker_company_id).toBeNull()
  })
})

// Fix round 1: qc-config-panel.tsx's co-broker picker is unconditional JSX, so
// it renders in the Add Client flow (add-client-modal.tsx) exactly as it does
// in the two edit flows above — but that flow's create payload silently
// dropped qc_fee_co_broker_company_id, discarding the pick the moment
// "Create Client" was clicked. buildQcClientCreatePayload is the extracted,
// testable version of that mapping; this fails if the field is ever dropped
// from it again.
describe('buildQcClientCreatePayload', () => {
  const baseQcConfig: QcConfigData = {
    certificatePattern: DEFAULT_CERTIFICATE_PATTERN,
    certificateValidityEnabled: false,
    certificateValidityMonths: 6,
    pricingModel: 'per_pound',
    pricePerPoundCents: undefined,
    pricePerSample: undefined,
    currency: 'USD',
    billingBasis: 'approved_only',
    paymentTerms: '',
    feePayer: 'client_pays',
    billingNotes: '',
    qcFeeCoBrokerCompanyId: null,
    logoUrl: null,
  }

  it('carries the picked co-broker into the create payload', () => {
    const payload = buildQcClientCreatePayload({
      ...baseQcConfig,
      qcFeeCoBrokerCompanyId: '33333333-3333-3333-3333-333333333333',
    })
    expect(payload.qc_fee_co_broker_company_id).toBe(
      '33333333-3333-3333-3333-333333333333',
    )
  })

  it('defaults to null when no co-broker is picked', () => {
    const payload = buildQcClientCreatePayload(baseQcConfig)
    expect(payload.qc_fee_co_broker_company_id).toBeNull()
  })
})

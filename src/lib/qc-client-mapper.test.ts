import { describe, it, expect } from 'vitest'
import {
  splitClientPayload,
  mapCompanyToClient,
  buildQcClientCreatePayload,
  fetchClientById,
  QC_CLIENT_SELECT,
  QC_CLIENT_SELECT_LEGACY,
  withQcClientSelect,
} from './qc-client-mapper'
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
    toleranceAutoApprove: false,
    certificatesToAllParties: false,
    finalWord: 'wolthers',
    finalWordFixed: false,
    buyerSampleAddressId: null,
    stuffingRequest: 'off',
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

describe('client switches: 5% rule and sharing certificates', () => {
  const rowWith = (qc_settings: Record<string, unknown>) => ({
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
    qc_settings,
  })
  const config = (over: Partial<QcConfigData>): QcConfigData => ({
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
    toleranceAutoApprove: false,
    certificatesToAllParties: false,
    finalWord: 'wolthers',
    finalWordFixed: false,
    buyerSampleAddressId: null,
    stuffingRequest: 'off',
    logoUrl: null,
    ...over,
  })

  it('reads both switches, off when absent', () => {
    expect(mapCompanyToClient(rowWith({ tolerance_auto_approve: true, certificates_to_all_parties: true })))
      .toMatchObject({ tolerance_auto_approve: true, certificates_to_all_parties: true })
    expect(mapCompanyToClient(rowWith({})))
      .toMatchObject({ tolerance_auto_approve: false, certificates_to_all_parties: false })
  })
  it('routes both switches to qc_client_settings', () => {
    expect(splitClientPayload({ tolerance_auto_approve: true, certificates_to_all_parties: true }).settingsFields)
      .toEqual({ tolerance_auto_approve: true, certificates_to_all_parties: true })
  })
  it('carries both switches into the create payload', () => {
    expect(buildQcClientCreatePayload(config({ toleranceAutoApprove: true, certificatesToAllParties: true })))
      .toMatchObject({ tolerance_auto_approve: true, certificates_to_all_parties: true })
  })
})

describe('final-word settings', () => {
  const row = (qc_settings: object) => ({
    id: 'c', name: 'Blaser', fantasy_name: null, email: null, phone: null, address: null, neighborhood: null,
    city: null, state: null, country: null, zip_code: null, vat_number: null, company_types: null,
    trading_roles: null, is_qc_client: true, is_active: true, legacy_client_id: null, logo_url: null,
    notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', qc_settings,
  })
  it('reads the four columns, with today\'s defaults when absent', () => {
    expect(mapCompanyToClient(row({ final_word: 'pre_approval', final_word_fixed: true, buyer_sample_address_id: 'a1', stuffing_request: 'fixed_on' })))
      .toMatchObject({ final_word: 'pre_approval', final_word_fixed: true, buyer_sample_address_id: 'a1', stuffing_request: 'fixed_on' })
    expect(mapCompanyToClient(row({})))
      .toMatchObject({ final_word: 'wolthers', final_word_fixed: false, buyer_sample_address_id: null, stuffing_request: 'off' })
  })
  it('routes the four columns to qc_client_settings', () => {
    const p = { final_word: 'pre_approval', final_word_fixed: true, buyer_sample_address_id: null, stuffing_request: 'prechecked' }
    const { settingsFields, companyFields } = splitClientPayload(p)
    expect(settingsFields).toEqual(p)
    expect(companyFields).toEqual({})
  })
  it('carries them into the create payload', () => {
    expect(buildQcClientCreatePayload({ certificatePattern: DEFAULT_CERTIFICATE_PATTERN, certificateValidityEnabled: false, certificateValidityMonths: 6, pricingModel: 'per_pound', currency: 'USD', billingBasis: 'approved_only', paymentTerms: '', feePayer: 'client_pays', billingNotes: '', qcFeeCoBrokerCompanyId: null, toleranceAutoApprove: false, certificatesToAllParties: false, logoUrl: null, finalWord: 'pre_approval', finalWordFixed: true, buyerSampleAddressId: 'a1', stuffingRequest: 'fixed_on' }))
      .toMatchObject({ final_word: 'pre_approval', final_word_fixed: true, buyer_sample_address_id: 'a1', stuffing_request: 'fixed_on' })
  })
})

// sys.wolthers.com keeps the address in companies.street / street_number /
// neighbourhood (British spelling); companies.address and .neighborhood are
// legacy and empty for every company sys edits (1,723 street-only rows on
// 2026-11-18, none address-only). QC read the legacy pair, so Swiss Water's
// street never showed on qc.wolthers.com after it was set on sys.
describe('address columns shared with sys', () => {
  const row = {
    id: 'company-sw',
    name: 'Swiss Water Decaffeinated Coffee Inc.',
    fantasy_name: 'Swiss Water',
    email: null,
    phone: null,
    address: null,
    neighborhood: null,
    street: '7750 Beedie Way',
    street_number: null,
    neighbourhood: null,
    city: 'Delta',
    state: 'BC',
    country: 'Canada',
    zip_code: 'V4G 0A5',
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
    qc_settings: null,
  }

  it('reads the street sys wrote', () => {
    const client = mapCompanyToClient(row)
    expect(client?.address).toBe('7750 Beedie Way')
    expect(client?.sys_address).toBe('7750 Beedie Way')
    expect(client?.city).toBe('Delta')
    expect(client?.zip_code).toBe('V4G 0A5')
  })

  it('joins street_number the way sys prints it', () => {
    const client = mapCompanyToClient({ ...row, street: 'R. DO COMERCIO', street_number: '55' })
    expect(client?.address).toBe('R. DO COMERCIO, 55')
  })

  it('drops a street_number already inside the street or equal to the zip', () => {
    expect(mapCompanyToClient({ ...row, street: 'Avenida Princesa do Sul, 2365', street_number: '2365' })?.address)
      .toBe('Avenida Princesa do Sul, 2365')
    expect(mapCompanyToClient({ ...row, street_number: 'V4G 0A5' })?.address).toBe('7750 Beedie Way')
  })

  it('reads the neighbourhood sys wrote', () => {
    const client = mapCompanyToClient({ ...row, neighbourhood: 'Centro' })
    expect(client?.neighborhood).toBe('Centro')
    expect(client?.sys_neighborhood).toBe('Centro')
  })

  it('falls back to the legacy columns when sys left street empty', () => {
    const client = mapCompanyToClient({ ...row, street: null, address: 'Old street 1', neighborhood: 'Old hood' })
    expect(client?.address).toBe('Old street 1')
    expect(client?.neighborhood).toBe('Old hood')
  })

  it('still lets the QC address override win', () => {
    const client = mapCompanyToClient({
      ...row,
      qc_settings: { address_override: { street: 'Lab drop-off 9', city: 'Vancouver' } },
    })
    expect(client?.address).toBe('Lab drop-off 9')
    expect(client?.city).toBe('Vancouver')
    expect(client?.sys_address).toBe('7750 Beedie Way')
  })

  it('writes the street and neighbourhood into the columns sys reads', () => {
    const { companyFields } = splitClientPayload({ address: 'Rua A, 10', neighborhood: 'Centro' })
    expect(companyFields.street).toBe('Rua A, 10')
    expect(companyFields.neighbourhood).toBe('Centro')
    expect(companyFields).not.toHaveProperty('address')
    expect(companyFields).not.toHaveProperty('neighborhood')
  })
})

// Migration 20261118000001 adds the four final-word columns. Until it is
// applied, selecting them 42703s and the Clients list/detail failed hard.
describe('withQcClientSelect: reads survive the final-word migration not being applied yet', () => {
  const FINAL_WORD = ['final_word', 'final_word_fixed', 'buyer_sample_address_id', 'stuffing_request']
  it('the legacy select is the full select without the four columns', () => {
    for (const c of FINAL_WORD) {
      expect(QC_CLIENT_SELECT).toContain(c)
      expect(QC_CLIENT_SELECT_LEGACY).not.toContain(c)
    }
    expect(QC_CLIENT_SELECT_LEGACY).toContain('certificates_to_all_parties')
    expect(QC_CLIENT_SELECT_LEGACY).toContain('qc_client_settings_company_id_fkey')
  })
  it.each(['42703', 'PGRST204'])('retries once with the legacy select on %s', async (code) => {
    const selects: string[] = []
    const res = await withQcClientSelect(async (select) => {
      selects.push(select)
      return selects.length === 1
        ? { data: null, error: { code, message: 'column qc_client_settings_1.final_word does not exist' } }
        : { data: [{ id: 'c' }], error: null }
    })
    expect(selects).toEqual([QC_CLIENT_SELECT, QC_CLIENT_SELECT_LEGACY])
    expect(res).toEqual({ data: [{ id: 'c' }], error: null })
  })
  it('passes any other error through without a retry', async () => {
    const selects: string[] = []
    const res = await withQcClientSelect(async (select) => {
      selects.push(select)
      return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    })
    expect(selects).toEqual([QC_CLIENT_SELECT])
    expect(res.error?.code).toBe('PGRST116')
  })
  it('fetchClientById falls back too, and the mapper fills today\'s defaults', async () => {
    const selects: string[] = []
    const q = {
      select: (s: string) => { selects.push(s); return q },
      eq: () => q,
      single: async () =>
        selects.length === 1
          ? { data: null, error: { code: '42703', message: 'column does not exist' } }
          : {
              data: {
                id: 'c', name: 'Blaser', fantasy_name: null, email: null, phone: null, address: null, neighborhood: null,
                city: null, state: null, country: null, zip_code: null, vat_number: null, company_types: null,
                trading_roles: null, is_qc_client: true, is_active: true, legacy_client_id: null, logo_url: null,
                notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', qc_settings: {},
              },
              error: null,
            },
    }
    const client = await fetchClientById({ from: () => q } as never, 'c')
    expect(selects).toEqual([QC_CLIENT_SELECT, QC_CLIENT_SELECT_LEGACY])
    expect(client).toMatchObject({ id: 'c', final_word: 'wolthers', final_word_fixed: false, buyer_sample_address_id: null, stuffing_request: 'off' })
  })
})

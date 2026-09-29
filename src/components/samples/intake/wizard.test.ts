import { describe, it, expect } from 'vitest'
import {
  CONTRACT_STEP,
  DETAILS_STEP,
  QC_STEPS,
  REVIEW_STEP,
  STEP_AFTER_CONTRACT_LINK,
  nextStep,
  previousStep,
  stepIssues,
  submitIssues,
} from './wizard'
import type { FormData } from './types'

function form(over: Partial<FormData> = {}): FormData {
  return {
    sample_category: 'qc', awb_number: '', courier_name: '', is_quick_look: false, recipients: [],
    seller: 'StoneX Switzerland SA', seller_contract_nr: '15649', exporter_sample_number: '148',
    same_seller_shipper: true, shipper: '', shipper_contract_nr: '',
    importer: 'Blaser', importer_contract_nr: '106761', importer_is_qc_client: true,
    qc_client: '', qc_client_contract_nr: '', supplier: '', supplier_contract_nr: '',
    roaster: '', roaster_contract_nr: '', end_client: '', end_client_contract_nr: '',
    client_id: 'client-1', laboratory_id: 'lab-1', origin: 'Brazil', micro_origin: '', processing_method: '',
    sample_type: 'pss', linked_pss_sample_id: '', quality_spec_id: 'spec-1', quality_name: '14/16 FC',
    hide_exporter_on_label: false, certifications: [], crop_year: '26/27',
    wolthers_contract_nr: '42196/26', exporter_contract_nr: '', ico_number: '', container_nr: '',
    bag_count: '640', bag_weight_kg: '60', bag_type: 'jute_bag', bags_quantity_mt: '', equivalent_60kg_bags: '',
    container_count: '', shipment_month: '2026-08', arrival_date: '2026-09-28', notes: '', photo_file: null,
    contracts: [], selected_contract: null, contract_prefilled_fields: [], contract_resolution: null,
    ...over,
  }
}

describe('the QC intake wizard', () => {
  it('has three steps: contract, sample details with quantity, review with sub-contracts', () => {
    expect(QC_STEPS.map((s) => s.id)).toEqual([CONTRACT_STEP, DETAILS_STEP, REVIEW_STEP])
    expect(QC_STEPS).toHaveLength(3)
  })

  // A pick goes straight to the details step, never past it: that is where
  // the sample reference and the shipper are checked.
  it('takes a contract link to the details step', () => {
    expect(STEP_AFTER_CONTRACT_LINK).toBe(DETAILS_STEP)
  })

  it('moves one step at a time, never past the review', () => {
    expect(nextStep(CONTRACT_STEP)).toBe(DETAILS_STEP)
    expect(nextStep(DETAILS_STEP)).toBe(REVIEW_STEP)
    expect(nextStep(REVIEW_STEP)).toBe(REVIEW_STEP)
    expect(previousStep(CONTRACT_STEP)).toBe(CONTRACT_STEP)
  })

  it('never blocks the contract step', () => {
    expect(stepIssues(CONTRACT_STEP, form({ seller: '', sample_type: '' }))).toEqual([])
  })

  it('lists what the details step still needs, supply chain first, then quality, then quantity', () => {
    expect(stepIssues(DETAILS_STEP, form())).toEqual([])
    expect(stepIssues(DETAILS_STEP, form({
      seller: '', same_seller_shipper: false, quality_spec_id: '', bag_count: '',
    }))).toEqual(['Seller', 'Shipper', 'Quality specification', 'Quantity of bags'])
  })

  it('asks a PSS or SS for its client, but not a type sample', () => {
    expect(stepIssues(DETAILS_STEP, form({ importer: '' }))).toEqual(['Importer or QC client'])
    expect(stepIssues(DETAILS_STEP, form({ importer: '', importer_is_qc_client: false, qc_client: 'Dunkin' }))).toEqual([])
    expect(stepIssues(DETAILS_STEP, form({ sample_type: 'type', importer: '', quality_spec_id: '' }))).toEqual([])
  })

  it('refuses a bulk sample above one container on the details step', () => {
    expect(stepIssues(DETAILS_STEP, form({ bag_type: 'bulk', bag_count: '340' }))).toEqual([])
    expect(stepIssues(DETAILS_STEP, form({ bag_type: 'bulk', bag_count: '400' }))).toEqual([
      'Bulk is at most 360 × 60 kg bag equivalents (21.6 MT) per sample',
    ])
  })

  it('checks every sub-contract row with a bag type on the review step, numbered as the rows are', () => {
    const row = { ...form(), contracts: [] }
    const contract = (over: Record<string, string>) => ({
      importer: '', importer_is_qc_client: true, roaster: '', end_client: '', qc_client: '',
      wolthers_contract_nr: '', contract_id: '', buyer_contract_nr: '', roaster_contract_nr: '',
      qc_client_contract_nr: '', end_client_contract_nr: '', supplier_contract_nr: '', ico_number: '',
      container_nr: '', bag_count: '', bag_weight_kg: '', bag_type: '' as const, bags_quantity_mt: '',
      equivalent_60kg_bags: '', container_count: '', shipment_month: '', exporter_sample_number: '', ...over,
    }) as FormData['contracts'][number]
    const withRows = { ...row, contracts: [
      contract({ bag_type: 'jute_bag', bag_count: '320', bag_weight_kg: '60' }),
      contract({ bag_type: 'bulk', bag_count: '500' }),
      contract({}),
    ] }
    expect(stepIssues(REVIEW_STEP, withRows)).toEqual([
      'Contract #3: Bulk is at most 360 × 60 kg bag equivalents (21.6 MT) per sample',
    ])
    expect(stepIssues(REVIEW_STEP, form({ arrival_date: '' }))).toEqual(['Arrival date'])
  })

  it('submits only when the details and the review are both complete', () => {
    expect(submitIssues(form())).toEqual([])
    expect(submitIssues(form({ origin: '', arrival_date: '' }))).toEqual(['Origin', 'Arrival date'])
  })
})

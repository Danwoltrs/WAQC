import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { FormData, SelectedContract } from './types'

// The step imports the add-client modal, which builds a browser Supabase
// client at import time; no test here reaches it.
vi.mock('@/lib/supabase', () => {
  const chain: any = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => chain) })
  return { supabase: { from: () => chain } }
})

import { SupplyChainStep } from './supply-chain-step'

// The linked contract as the form state carries it after a Step-1 pick: the
// seller's legal name in the field, its trade name and company id on the link.
const ipanema: SelectedContract = {
  id: 'c-42611', contract_number: '42611/26', split_suffix: null,
  seller_name: 'Ipanema', buyer_name: 'Blaser', shipper_name: null, end_buyer_name: null,
  seller_id: 'co-ipanema', seller_legal_name: 'Ipanema Agrícola S.A.',
  shipper_id: null, shipper_legal_name: null,
  buyer_id: 'co-blaser', buyer_legal_name: 'Blaser Trading AG',
  crop: '2026/2027', volume_bags: 320, bag_type: 'BAGS OF 60 KG EACH',
  shipment_period_start: '2026-10-01', quality_description: 'NY 2, 16/18, Fine Cup',
}

function form(over: Partial<FormData> = {}): FormData {
  return {
    sample_category: 'qc', awb_number: '', courier_name: '', is_quick_look: false, recipients: [],
    seller: 'Ipanema Agrícola S.A.', seller_contract_nr: '027/26', exporter_sample_number: '',
    same_seller_shipper: true, shipper: '', shipper_contract_nr: '',
    importer: 'Blaser', importer_contract_nr: '107048', importer_is_qc_client: true,
    qc_client: '', qc_client_contract_nr: '', supplier: '', supplier_contract_nr: '',
    roaster: '', roaster_contract_nr: '', end_client: '', end_client_contract_nr: '',
    client_id: 'co-blaser', laboratory_id: 'lab-1', origin: 'Brazil', micro_origin: '', processing_method: '',
    sample_type: 'pss', linked_pss_sample_id: '', quality_spec_id: '', quality_name: 'NY 2, 16/18, Fine Cup',
    hide_exporter_on_label: false, certifications: [], crop_year: '2026/2027',
    wolthers_contract_nr: '42611/26', exporter_contract_nr: '', ico_number: '', container_nr: '',
    bag_count: '320', bag_weight_kg: '60', bag_type: 'jute_bag', bags_quantity_mt: '',
    equivalent_60kg_bags: '', container_count: '', shipment_month: '2026-10',
    arrival_date: '2026-09-17', notes: '', photo_file: null,
    contracts: [],
    selected_contract: ipanema,
    contract_prefilled_fields: ['seller', 'importer', 'seller_contract_nr', 'importer_contract_nr', 'wolthers_contract_nr'],
    contract_resolution: {
      seller_match_count: 1, shipper_match_count: 0, multiple_seller_matches: false,
      multiple_shipper_matches: false, importer_resolved: true, quality_match: null,
    },
    ...over,
  }
}

// A combobox never takes its accessible name from its content, so the
// trigger's text is what says which option is selected.
const comboboxTexts = () => screen.getAllByRole('combobox').map((el) => el.textContent)
const comboboxShowing = (text: string) =>
  screen.getAllByRole('combobox').find((el) => el.textContent === text) as HTMLElement

const renderStep = (formData: FormData, exporters: Array<Record<string, unknown>> = []) =>
  render(
    <SupplyChainStep
      formData={formData}
      updateFormData={vi.fn()}
      clients={[]}
      laboratories={[]}
      filteredClients={[]}
      approvedPSSSamples={[]}
      exporters={exporters}
      importers={[]}
      roasters={[]}
      qcClients={[]}
    />,
  )

describe('SupplyChainStep with a linked contract', () => {
  // Prod 2026-09-17 (#42611/26, Ipanema -> Blaser): the seller was in the form
  // state but not in the exporter list, so the combobox found no option for it
  // and showed "Select seller" — the value was there, invisible.
  it('shows the linked seller as selected even when the exporter list lacks it', () => {
    renderStep(form())
    expect(comboboxTexts()).toContain('Ipanema')
    expect(screen.queryByText('Select seller')).not.toBeInTheDocument()
    expect(screen.queryByText(/No exporter named/)).not.toBeInTheDocument()
  })

  it('does not duplicate the seller when the exporter list has it', () => {
    renderStep(form(), [{ id: 'co-ipanema', name: 'Ipanema Agrícola S.A.', fantasy_name: 'Ipanema' }])
    fireEvent.click(comboboxShowing('Ipanema'))
    const options = screen.getAllByRole('option').filter((o) => o.textContent === 'Ipanema')
    expect(options).toHaveLength(1)
  })

  it('shows the linked importer as selected without any importer option loaded', () => {
    renderStep(form())
    expect(comboboxTexts()).toContain('Blaser')
    expect(screen.queryByText('Select importer')).not.toBeInTheDocument()
  })

  it('keeps every reference the contract filled in its input', () => {
    renderStep(form())
    expect(screen.getByDisplayValue('027/26')).toBeInTheDocument()
    expect(screen.getByDisplayValue('107048')).toBeInTheDocument()
    expect(screen.getByDisplayValue('42611/26')).toBeInTheDocument()
  })

  it('offers a distinct linked shipper the same way', () => {
    renderStep(form({
      same_seller_shipper: false, shipper: 'Cooperativa Regional Cooxupé',
      selected_contract: { ...ipanema, shipper_id: 'co-cooxupe', shipper_name: 'Cooxupé', shipper_legal_name: 'Cooperativa Regional Cooxupé' },
    }))
    expect(comboboxTexts()).toContain('Cooxupé')
    expect(screen.queryByText('Select shipper')).not.toBeInTheDocument()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SampleDetailsStep } from './sample-details-step'
import type { FormData } from './types'

function form(over: Partial<FormData> = {}): FormData {
  return {
    sample_category: 'qc', awb_number: '', courier_name: '', is_quick_look: false, recipients: [],
    seller: 'Ecom Agroindustrial', seller_contract_nr: '4155263042', exporter_sample_number: 'AS300226',
    same_seller_shipper: false, shipper: 'Cooxupe', shipper_contract_nr: 'SHP-77',
    importer: 'Floriana', importer_contract_nr: 'IR-42885', importer_is_qc_client: true,
    qc_client: '', qc_client_contract_nr: '', supplier: 'Fazenda Boa Vista', supplier_contract_nr: 'FARM-1',
    roaster: '', roaster_contract_nr: '', end_client: '', end_client_contract_nr: '',
    client_id: 'client-1', laboratory_id: 'lab-1', origin: 'Brazil', micro_origin: '', processing_method: '',
    sample_type: 'pss', linked_pss_sample_id: '', quality_spec_id: 'spec-1', quality_name: 'NY 2',
    hide_exporter_on_label: false, certifications: [], crop_year: '26/27',
    wolthers_contract_nr: '', exporter_contract_nr: '', ico_number: '', container_nr: '',
    bag_count: '320', bag_weight_kg: '60', bag_type: 'jute_bag', bags_quantity_mt: '', equivalent_60kg_bags: '',
    container_count: '', shipment_month: '2026-10', arrival_date: '2026-09-23', notes: '', photo_file: null,
    contracts: [], selected_contract: null, contract_prefilled_fields: [], contract_resolution: null,
    ...over,
  }
}

const renderStep = (formData: FormData) =>
  render(
    <SampleDetailsStep
      formData={formData}
      updateFormData={vi.fn()}
      onPhotoUpload={vi.fn()}
      clients={[]}
      laboratories={[]}
      filteredClients={[]}
      approvedPSSSamples={[]}
    />,
  )

// The review's Shipper line is the shipper's own contract ref. It used to show
// supplier_contract_nr, which is the farm / co-op Supplier's ref.
describe('SampleDetailsStep review', () => {
  it('shows the shipper\'s own ref on the Shipper line, never the Supplier\'s', () => {
    renderStep(form())
    expect(screen.getByText(/SHP-77/)).toBeInTheDocument()
    expect(screen.queryByText(/FARM-1/)).not.toBeInTheDocument()
  })
})

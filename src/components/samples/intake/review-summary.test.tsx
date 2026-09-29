import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ReviewSummary } from './review-summary'
import type { FormData } from './types'
import { CONTRACT_STEP, DETAILS_STEP } from './wizard'

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

const row = (label: string) => document.querySelector(`[data-summary-row="${label}"]`) as HTMLElement

describe('ReviewSummary', () => {
  // The Shipper line is the shipper's own contract ref. It used to show
  // supplier_contract_nr, which is the farm / co-op Supplier's ref.
  it('shows the shipper\'s own ref on the Shipper line, never the Supplier\'s', () => {
    render(<ReviewSummary formData={form()} onEdit={vi.fn()} />)
    expect(row('Shipper')).toHaveTextContent('Cooxupe · SHP-77')
    expect(row('Shipper')).not.toHaveTextContent('FARM-1')
    expect(row('Supplier')).toHaveTextContent('Fazenda Boa Vista · FARM-1')
  })

  it('names the seller and shipper by trade name', () => {
    render(
      <ReviewSummary
        formData={form({ seller: 'Coop. Regional de Cafeicultores em Guaxupé Ltda.', same_seller_shipper: true, seller_contract_nr: '' })}
        exporters={[{ id: 'co-coox', name: 'Coop. Regional de Cafeicultores em Guaxupé Ltda.', fantasy_name: 'Cooxupé' } as any]}
        onEdit={vi.fn()}
      />,
    )
    expect(row('Seller')).toHaveTextContent(/^SellerCooxupé$/)
    expect(row('Shipper')).toHaveTextContent('Cooxupé (the seller)')
  })

  it('reads out the quantity with its 60 kg equivalent, MT and shipment month', () => {
    render(<ReviewSummary formData={form()} onEdit={vi.fn()} />)
    expect(row('60 kg equivalent')).toHaveTextContent('320 bags · 19.2 MT')
    expect(row('Shipment')).toHaveTextContent('October 2026')
  })

  it('keeps the rows the user must have checked, even when blank', () => {
    render(<ReviewSummary formData={form({ exporter_sample_number: '' })} onEdit={vi.fn()} />)
    expect(row('Sample ref.')).toHaveTextContent('—')
    expect(row('Linked contract')).toHaveTextContent('None, entered by hand')
    expect(row('Roaster')).toBeNull()
  })

  it('sends each group\'s Edit to the step (and section) where it is entered', () => {
    const onEdit = vi.fn()
    render(<ReviewSummary formData={form()} onEdit={onEdit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit contract' }))
    expect(onEdit).toHaveBeenLastCalledWith(CONTRACT_STEP, undefined)
    fireEvent.click(within(screen.getByRole('region', { name: 'Quantity and shipment' })).getByRole('button'))
    expect(onEdit).toHaveBeenLastCalledWith(DETAILS_STEP, 'quantity')
  })
})

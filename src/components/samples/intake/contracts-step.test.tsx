import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { ContractsStep, createEmptyContract } from './contracts-step'
import type { FormData, SubContractFormData } from './types'

// A mother form the way step 6 sees it: one lot, its buy side and references
// filled in, no contracts yet. Tests override what they need.
function motherForm(over: Partial<FormData> = {}): FormData {
  return {
    sample_category: 'qc', awb_number: '', courier_name: '', is_quick_look: false, recipients: [],
    seller: 'Louis Dreyfus Company', seller_contract_nr: 'S-100', exporter_sample_number: '50235-1',
    same_seller_shipper: true, shipper: '', shipper_contract_nr: '',
    importer: 'Acme Importers', importer_contract_nr: 'S049504-13', importer_is_qc_client: true,
    qc_client: '', qc_client_contract_nr: '', supplier: '', supplier_contract_nr: '',
    roaster: '', roaster_contract_nr: '', end_client: '', end_client_contract_nr: '',
    client_id: 'client-1', laboratory_id: 'lab-1', origin: 'Brazil', micro_origin: '', processing_method: 'Natural',
    sample_type: 'pss', linked_pss_sample_id: '', quality_spec_id: 'spec-1', quality_name: 'Fine Cup',
    hide_exporter_on_label: false, certifications: [], crop_year: '25/26',
    wolthers_contract_nr: '41966/26', exporter_contract_nr: '', ico_number: '', container_nr: '',
    bag_count: '320', bag_weight_kg: '60', bag_type: 'jute_bag', bags_quantity_mt: '19.200',
    equivalent_60kg_bags: '320', container_count: '', shipment_month: '2026-09',
    arrival_date: '2026-08-28', notes: '', photo_file: null,
    contracts: [],
    selected_contract: null, contract_prefilled_fields: [], contract_resolution: null,
    ...over,
  }
}

// Mirrors SampleIntakeForm.handleAddContract: the mother counts as contract #1,
// so the suggestion seeds are the last two contracts, falling back to the mother.
function Harness({ initial }: { initial: FormData }) {
  const [formData, setFormData] = useState(initial)
  const updateFormData = (field: keyof FormData, value: unknown) =>
    setFormData((prev) => ({ ...prev, [field]: value }))
  const addContract = () =>
    setFormData((prev) => {
      const last = prev.contracts[prev.contracts.length - 1]
      const beforeLast = prev.contracts[prev.contracts.length - 2]
      return { ...prev, contracts: [...prev.contracts, createEmptyContract(prev, last, beforeLast)] }
    })
  return (
    <>
      <ContractsStep
        formData={formData}
        updateFormData={updateFormData}
        clients={[]}
        laboratories={[]}
        filteredClients={[]}
        approvedPSSSamples={[]}
        importers={[]}
        roasters={[]}
        qcClients={[]}
        onAddContract={addContract}
        onRemoveContract={(i) => setFormData((prev) => ({ ...prev, contracts: prev.contracts.filter((_, k) => k !== i) }))}
      />
      <button type="button" onClick={addContract}>Add contract</button>
    </>
  )
}

const contractOf = (form: FormData, over: Partial<SubContractFormData> = {}): SubContractFormData => ({
  ...createEmptyContract(form),
  ...over,
})

describe('createEmptyContract reference suggestions', () => {
  // Only the exporter's own SAMPLE number is stepped. One seed bumps the FIRST
  // run of digits (spec: "50235-1 → 50236-1"); the two-seed case below is how a
  // corrected guess teaches the tool which run actually moves.
  //
  // CONTRACT numbers are never stepped and never copied from the mother
  // (2026-09-10) — guessing "41966/26 → 41967/26" for a number nobody read off
  // the paperwork is how a wrong contract number reached a certificate. Each
  // contract's number is typed, and the field searches as you type.
  it('steps the exporter sample number when the first contract is added', () => {
    const c = createEmptyContract(motherForm())
    expect(c.exporter_sample_number).toBe('50236-1')
  })

  it('never guesses a contract number', () => {
    const c = createEmptyContract(motherForm())
    expect(c.wolthers_contract_nr).toBe('')
    expect(c.buyer_contract_nr).toBe('S049504-13') // copied from the mother, NOT stepped
  })

  it('steps the run the user moved once a previous contract exists', () => {
    const form = motherForm()
    const first = contractOf(form, { exporter_sample_number: '50236-1' })
    const c = createEmptyContract(form, first, undefined)
    // The mother (50235-1) is the seed before the first contract (50236-1).
    expect(c.exporter_sample_number).toBe('50237-1')
  })

  it('leaves the sample number alone when there is nothing to count', () => {
    const c = createEmptyContract(motherForm({ exporter_sample_number: 'PENDING' }))
    expect(c.exporter_sample_number).toBe('PENDING')
  })
})

describe('ContractsStep', () => {
  it('prefills the incremented sample number, and an EMPTY contract number', () => {
    render(<Harness initial={motherForm()} />)
    fireEvent.click(screen.getByText('Add contract'))
    expect(screen.getByDisplayValue('50236-1')).toBeInTheDocument()
    // The mother's 41966/26 is neither copied nor stepped onto the new row.
    expect(screen.queryByDisplayValue('41967/26')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('41966/26')).not.toBeInTheDocument()
  })

  it('continues the sample-number series from the last contract, with the mother as the seed before it', () => {
    const form = motherForm()
    const first = contractOf(form, { exporter_sample_number: '50236-1' })
    render(<Harness initial={{ ...form, contracts: [first] }} />)
    fireEvent.click(screen.getByText('Add contract'))
    expect(screen.getByDisplayValue('50237-1')).toBeInTheDocument()
  })

  it('switching a contract to bulk shows Containers + Total MT and derives the equivalent', async () => {
    const form = motherForm()
    const jute = contractOf(form, { bag_type: 'jute_bag', bag_count: '320', bag_weight_kg: '60' })
    render(<Harness initial={{ ...form, contracts: [jute] }} />)

    expect(screen.queryByLabelText('Containers')).not.toBeInTheDocument()

    // Radix Select opens from the keyboard in jsdom (pointer events carry no
    // pointerType there); items select on Enter.
    const trigger = screen.getByText('Jute Bag').closest('button')!
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const bulkOption = await screen.findByRole('option', { name: 'Bulk' })
    fireEvent.keyDown(bulkOption, { key: 'Enter' })

    await waitFor(() => expect(screen.getByLabelText('Containers')).toBeInTheDocument())
    expect(screen.getByLabelText('Total MT')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Containers'), { target: { value: '2' } })
    await waitFor(() => expect(screen.getByText('eq. 720 × 60 kg bags')).toBeInTheDocument())
    // The summary prints the agreed bulk wording, not "720 × 21600 kg bulk bags".
    expect(screen.getAllByText('2 containers in bulk (43.2 MT)').length).toBeGreaterThan(0)
  })
})

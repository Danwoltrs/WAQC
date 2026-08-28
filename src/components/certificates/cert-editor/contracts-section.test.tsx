import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContractsSection } from './contracts-section'
import type { SampleGroupMember } from './use-cert-editor'

// Anderson's SAN-00654/26 shape: a lab unit (contract #1) plus siblings, one of
// them in bulk and one not yet certified.
const group: SampleGroupMember[] = [
  {
    id: 'lab', tracking_number: 'SAN-00654/26', contract_ordinal: 1, lab_source_sample_id: null,
    certificate_id: 'c1', certificate_number: 'BR-037250/26',
    buyer_contract_nr: 'S049504-13', wolthers_contract_nr: '50235-1', exporter_sample_number: '130306',
    importer_name: 'OFI', bag_count: 333, bag_weight_kg: 60, bag_type: 'jute_bag', bags_quantity_mt: 19.98,
    container_count: null, status: 'approved',
  },
  {
    id: 'sib-2', tracking_number: 'SAN-00655/26', contract_ordinal: 2, lab_source_sample_id: 'lab',
    certificate_id: 'c2', certificate_number: 'BR-037251/26',
    buyer_contract_nr: 'S049504-14', wolthers_contract_nr: '50236-1', exporter_sample_number: '130307',
    importer_name: 'OFI', bag_count: 720, bag_weight_kg: 21600, bag_type: 'bulk', bags_quantity_mt: 43.2,
    container_count: 2, status: 'approved',
  },
  {
    id: 'sib-3', tracking_number: 'SAN-00656/26', contract_ordinal: 3, lab_source_sample_id: 'lab',
    certificate_id: null, certificate_number: null,
    buyer_contract_nr: 'S049504-15', wolthers_contract_nr: '50237-1', exporter_sample_number: '130308',
    importer_name: 'OFI', bag_count: null, bag_weight_kg: null, bag_type: null, bags_quantity_mt: null,
    container_count: null, status: 'in_progress',
  },
]

describe('ContractsSection', () => {
  it('lists every contract with its ordinal, certificate number (or tracking number) and quantity', () => {
    render(<ContractsSection group={group} currentSampleId="lab" onOpen={() => {}} onAddContract={() => {}} />)
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('#3')).toBeInTheDocument()
    expect(screen.getByText('BR-037250/26')).toBeInTheDocument()
    expect(screen.getByText('BR-037251/26')).toBeInTheDocument()
    // No certificate yet: the internal lab number stands in.
    expect(screen.getByText('SAN-00656/26')).toBeInTheDocument()
    expect(screen.getByText('333 × 60 kg jute bags (20.0 MT)')).toBeInTheDocument()
    expect(screen.getByText('2 containers in bulk (43.2 MT)')).toBeInTheDocument()
    expect(screen.getByText(/S049504-14/)).toBeInTheDocument()
    expect(screen.getByText(/130308/)).toBeInTheDocument()
  })

  it('marks the open contract as current and opens any other on its own sample id', () => {
    const onOpen = vi.fn()
    render(<ContractsSection group={group} currentSampleId="sib-2" onOpen={onOpen} onAddContract={() => {}} />)
    const rows = screen.getAllByRole('button', { name: /^Contract #/ })
    expect(rows).toHaveLength(3)
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
    fireEvent.click(rows[0])
    expect(onOpen).toHaveBeenCalledWith('lab')
    fireEvent.click(rows[1])
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows a status pill per contract', () => {
    render(<ContractsSection group={group} currentSampleId="lab" onOpen={() => {}} onAddContract={() => {}} />)
    expect(screen.getAllByText('Approved')).toHaveLength(2)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('"Add contract" hands off to the caller', () => {
    const onAddContract = vi.fn()
    render(<ContractsSection group={group} currentSampleId="lab" onOpen={() => {}} onAddContract={onAddContract} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add contract' }))
    expect(onAddContract).toHaveBeenCalledTimes(1)
  })

  it('renders a single-contract sample as one row so a second contract can be added', () => {
    render(<ContractsSection group={[group[0]]} currentSampleId="lab" onOpen={() => {}} onAddContract={() => {}} />)
    expect(screen.getAllByRole('button', { name: /^Contract #/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Add contract' })).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// The edit table imports the add-client modal, which builds a browser
// Supabase client at import time; no test here reaches it.
vi.mock('@/components/clients/add-client-modal', () => ({ AddClientModal: () => null }))

import { SupplyChainEditTable } from './supply-chain-edit-table'

/**
 * The lot's contract date picks the spec version it is judged by. The sample
 * editor always lets staff type it, beside the Wolthers contract number; a
 * contract on the system carries its own date, so it may stay empty.
 */

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SupplyChainEditTable contract date', () => {
  it('is an editable date beside the Wolthers number, explained', () => {
    const onFormChange = vi.fn()
    render(
      <SupplyChainEditTable
        sample={{ wolthers_contract_nr: '42611/26', contract_id: 'c-1', contract_date: '2026-07-01' }}
        isEditMode
        formData={{}}
        onFormChange={onFormChange}
      />,
    )
    const input = screen.getByLabelText('Contract date')
    expect(input).toHaveAttribute('type', 'date')
    expect(input).toHaveValue('2026-07-01')
    expect(screen.getByText('Picks the spec version. Leave empty when the contract carries the date.')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '2026-08-15' } })
    expect(onFormChange).toHaveBeenCalledWith('contract_date', '2026-08-15')
  })

  it('shows the edited value over the stored one, and an emptied box as empty', () => {
    render(
      <SupplyChainEditTable
        sample={{ contract_date: '2026-07-01' }}
        isEditMode
        formData={{ contract_date: '' }}
        onFormChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Contract date')).toHaveValue('')
  })

  it('reads the stored date out in view mode, and leaves the row out when there is none', () => {
    const { unmount } = render(
      <SupplyChainEditTable sample={{ contract_date: '2026-07-01' }} isEditMode={false} formData={{}} onFormChange={vi.fn()} />,
    )
    expect(screen.getByText('2026-07-01')).toBeInTheDocument()
    unmount()
    render(<SupplyChainEditTable sample={{}} isEditMode={false} formData={{}} onFormChange={vi.fn()} />)
    expect(screen.queryByText('Contract date')).not.toBeInTheDocument()
  })
})

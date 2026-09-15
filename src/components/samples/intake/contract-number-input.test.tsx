import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { ContractNumberInput, type ContractMatch } from './contract-number-input'

/**
 * Typing a Wolthers contract number that is exactly one active contract links
 * that contract, as clicking its suggestion would. Anything short of that
 * (a partial number, two active contracts sharing the number) leaves the
 * choice to the user.
 */

const match = (over: Partial<ContractMatch>): ContractMatch => ({
  id: 'c-1', contract_number: '41923/26', seller_reference: null, buyer_reference: null,
  contract_date: null, crop: null, seller: null, buyer: null,
  ...over,
})

function stubSearch(contracts: ContractMatch[]) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ contracts }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function Host({ onSelect, linked }: { onSelect: (m: ContractMatch) => void; linked?: string | null }) {
  const [value, setValue] = useState('')
  return <ContractNumberInput value={value} onChange={setValue} onSelectContract={onSelect} linkedContractId={linked} />
}

const typeNumber = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('Wolthers ref.'), { target: { value } })

afterEach(() => { vi.unstubAllGlobals() })

describe('ContractNumberInput exact match', () => {
  it('links the contract when the typed number is exactly one active contract', async () => {
    stubSearch([match({ id: 'c-1', contract_number: '41923/26' }), match({ id: 'c-2', contract_number: '141923/26' })])
    const onSelect = vi.fn()
    render(<Host onSelect={onSelect} />)
    typeNumber('41923/26')
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(onSelect.mock.calls[0][0].id).toBe('c-1')
    // The number stays what was typed.
    expect(screen.getByPlaceholderText('Wolthers ref.')).toHaveValue('41923/26')
  })

  it('leaves the choice to the user when two active contracts share the number', async () => {
    stubSearch([match({ id: 'c-1' }), match({ id: 'c-2' })])
    const onSelect = vi.fn()
    render(<Host onSelect={onSelect} />)
    typeNumber('41923/26')
    expect(await screen.findByText('2 matching contracts', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not link on a partial number', async () => {
    stubSearch([match({ id: 'c-1', contract_number: '41923/26' })])
    const onSelect = vi.fn()
    render(<Host onSelect={onSelect} />)
    typeNumber('4192')
    expect(await screen.findByText('1 matching contract', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not link again the contract the field is already linked to', async () => {
    const fetchMock = stubSearch([match({ id: 'c-1' })])
    const onSelect = vi.fn()
    render(<Host onSelect={onSelect} linked="c-1" />)
    typeNumber('41923/26')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 2000 })
    await new Promise((r) => setTimeout(r, 50))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

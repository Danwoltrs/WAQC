// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FinalWordFields, finalWordSummary } from './final-word-fields'
import { FinalWordCell } from './final-word-cell'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const NONE = { finalWord: null, fixed: null, addressId: null, stuffing: null }
const BUYER = { finalWord: 'wolthers' as const, fixed: true, addressId: null, stuffing: 'off' as const }

function stub(options: unknown[] = []) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ options }))))
}

describe('FinalWordFields', () => {
  it('with inherit, picking "as Blaser" writes finalWord null and clears fixed', () => {
    stub()
    const onChange = vi.fn()
    render(<FinalWordFields value={{ ...NONE, finalWord: 'pre_approval', fixed: true }} onChange={onChange} inherit={BUYER} clientId="co1" clientName="Blaser" />)
    fireEvent.click(screen.getAllByLabelText('as Blaser')[0])
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ finalWord: null, fixed: null }))
  })

  it('disables Fixed while the final word is inherited, enables it once set', () => {
    stub()
    const { rerender } = render(<FinalWordFields value={NONE} onChange={() => {}} inherit={BUYER} clientId="co1" clientName="Blaser" />)
    expect(screen.getByLabelText('Fixed')).toBeDisabled()
    rerender(<FinalWordFields value={{ ...NONE, finalWord: 'pre_approval' }} onChange={() => {}} inherit={BUYER} clientId="co1" clientName="Blaser" />)
    expect(screen.getByLabelText('Fixed')).not.toBeDisabled()
  })

  it('without inherit there is no "as" choice and Fixed is usable', () => {
    stub()
    render(<FinalWordFields value={{ ...BUYER, fixed: false }} onChange={() => {}} clientId="co1" clientName="Ahold" />)
    expect(screen.queryByLabelText('as Ahold')).toBeNull()
    expect(screen.getByLabelText('Fixed')).not.toBeDisabled()
    expect(screen.getByLabelText('Pre-approval: seller sends a sample to Ahold, Ahold decides')).toBeInTheDocument()
  })

  it('stuffing choices write the rule', () => {
    stub()
    const onChange = vi.fn()
    render(<FinalWordFields value={BUYER} onChange={onChange} clientId="co1" clientName="Ahold" />)
    fireEvent.click(screen.getByLabelText('Pre-checked'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ stuffing: 'prechecked' }))
  })

  it('shows a muted note when the stored address is no longer on file', async () => {
    stub([])
    render(<FinalWordFields value={{ ...BUYER, addressId: 'gone' }} onChange={() => {}} clientId="co1" clientName="Ahold" />)
    expect(await screen.findByText('Address no longer on file')).toBeInTheDocument()
  })
})

describe('finalWordSummary', () => {
  it('reads as the brief says', () => {
    expect(finalWordSummary(NONE, 'Blaser')).toBe('as Blaser')
    expect(finalWordSummary({ ...NONE, finalWord: 'pre_approval', fixed: true }, 'Blaser')).toBe('Pre-approval · fixed')
    expect(finalWordSummary({ ...NONE, finalWord: 'wolthers' }, 'Blaser')).toBe('Wolthers')
  })
})

describe('FinalWordCell', () => {
  it('summarises the row and saves only the changed columns', async () => {
    stub()
    const onUpdate = vi.fn()
    render(<FinalWordCell quality={{ id: 'q1' }} clientId="co1" clientName="Blaser" buyer={BUYER} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByText('as Blaser'))
    fireEvent.click(await screen.findByLabelText('Pre-approval: seller sends a sample to Blaser, Blaser decides'))
    fireEvent.click(screen.getByLabelText('Fixed'))
    fireEvent.click(screen.getByText('Save'))
    expect(onUpdate.mock.calls).toEqual([['q1', 'final_word', 'pre_approval'], ['q1', 'final_word_fixed', true]])
  })
})

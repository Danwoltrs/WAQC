import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContractSearchStep } from './contract-search-step'

/**
 * A laboratory other than Santos gets no sys contract lookup for now: the
 * search answers `labConfined`, and the step says so instead of "Nothing
 * matches". "No contract" stays, so the step remains skippable.
 */

const NOTE = 'Contracts from sys are not available to this laboratory. Fill in the parties by hand.'

function stubSearch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))
}

const renderStep = (onNoContract = vi.fn()) => {
  render(
    <ContractSearchStep formData={{} as any} applyContract={vi.fn()} unlinkContract={vi.fn()} onNoContract={onNoContract} />,
  )
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '42089/26' } })
  return onNoContract
}

afterEach(() => vi.unstubAllGlobals())

describe('ContractSearchStep for a confined laboratory', () => {
  it('shows the note in place of the empty result list, and stays skippable', async () => {
    stubSearch({ contracts: [], labConfined: true })
    const onNoContract = renderStep()
    expect(await screen.findByText(NOTE)).toBeTruthy()
    expect(screen.queryByText(/Nothing matches/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'No contract' }))
    expect(onNoContract).toHaveBeenCalled()
  })

  it('keeps saying "Nothing matches" for a laboratory that can search', async () => {
    stubSearch({ contracts: [] })
    renderStep()
    expect(await screen.findByText(/Nothing matches/)).toBeTruthy()
    expect(screen.queryByText(NOTE)).toBeNull()
  })
})

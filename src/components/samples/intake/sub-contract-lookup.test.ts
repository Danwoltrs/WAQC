import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSubContractLookup } from './sub-contract-lookup'

/**
 * A contract row's lookup asks /api/contracts/[id] for the contract, whose
 * quality match runs over one laboratory's specs: the lot's, when the host
 * knows it, so the match compares with the lot's own spec.
 */

const body = { contract: { id: 'c-2', quality_description: null }, resolution: { importer_is_qc_client: false, quality_match: null } }

afterEach(() => { vi.unstubAllGlobals() })

function stub() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const contract = { wolthers_contract_nr: '', contract_id: '' } as any
const match = { id: 'c-2' } as any

describe('useSubContractLookup', () => {
  it("loads the contract for the lot's laboratory", async () => {
    const fetchMock = stub()
    const { result } = renderHook(() => useSubContractLookup({ contract, updateContract: vi.fn(), laboratoryId: 'lab-co' }))
    await act(async () => { await result.current.handleSelectContract(match) })
    expect(fetchMock).toHaveBeenCalledWith('/api/contracts/c-2?laboratory_id=lab-co')
  })

  it('leaves the laboratory to the server when the host has none', async () => {
    const fetchMock = stub()
    const { result } = renderHook(() => useSubContractLookup({ contract, updateContract: vi.fn() }))
    await act(async () => { await result.current.handleSelectContract(match) })
    expect(fetchMock).toHaveBeenCalledWith('/api/contracts/c-2')
  })
})

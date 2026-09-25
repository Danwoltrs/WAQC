import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyPickedContract } from './contract-pick'

/**
 * A contract picked in the sample editor is loaded in full (parties by id) and
 * its edits go through the host's own setter: the editor's draft for the info
 * strip, the panel's form for the details panel.
 */

const contract = {
  id: 'c-new', contract_number: '41871/26', split_suffix: null, status: 'active',
  contract_date: null, crop: '2025/2026', volume_bags: 320, bag_type: 'Bulk', bag_weight_kg: null,
  quality_description: 'NY 2, 17/18', shipment_period_start: null, shipment_period_end: null,
  seller_reference: 'S664243-13', buyer_reference: 'IR0007621-1', certifications: null,
  seller_id: 'seller-1', buyer_id: 'buyer-1', shipper_id: null, end_buyer_id: null,
  seller: { id: 'seller-1', fantasy_name: 'Ecom', name: 'Ecom Agroindustrial Corp' },
  buyer: { id: 'buyer-1', fantasy_name: 'Ahold', name: 'Ahold Delhaize Coffee Company' },
  shipper: null, end_buyer: null,
}

function stubContract(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => { vi.unstubAllGlobals() })

describe('applyPickedContract', () => {
  it("applies the contract's edits through the host's setter and names the parties it set", async () => {
    const fetchMock = stubContract(200, { contract, resolution: {} })
    const apply = vi.fn()
    const result = await applyPickedContract('c-new', { client_id: 'c-ahold', seller_id: 'seller-old' }, { standalone: true }, apply)
    expect(fetchMock).toHaveBeenCalledWith('/api/contracts/c-new')
    expect(Object.fromEntries(apply.mock.calls)).toEqual({
      wolthers_contract_nr: '41871/26',
      seller_contract_nr: 'S664243-13',
      buyer_contract_nr: 'IR0007621-1',
      importer_id: 'buyer-1',
      importer_is_qc_client: false,
      seller_id: 'seller-1',
      exporter_id: 'seller-1',
      same_seller_shipper: true,
    })
    expect(result).toEqual({ buyer: 'Ahold', seller: 'Ecom', sellerKept: null })
  })

  it("reports the contract's seller when a lot keeps its own", async () => {
    stubContract(200, { contract, resolution: {} })
    const result = await applyPickedContract('c-new', { client_id: 'c-ahold', seller_id: 'seller-old' }, { standalone: false }, vi.fn())
    expect(result).toEqual({ buyer: 'Ahold', seller: null, sellerKept: 'Ecom' })
  })

  it('applies nothing and throws when the contract cannot be loaded', async () => {
    stubContract(404, { error: 'Contract not found' })
    const apply = vi.fn()
    await expect(applyPickedContract('c-gone', {}, { standalone: true }, apply)).rejects.toThrow('Contract not found')
    expect(apply).not.toHaveBeenCalled()
  })
})

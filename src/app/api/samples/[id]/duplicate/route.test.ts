import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A duplicate is a brand-new sample for the same parties and quality (Daniel,
 * 2026-09-25). It takes the party names, the quality and the packaging, and
 * starts with no reference, no contract link and no quantity: staff type the
 * references on the copy, and the quantity too unless the popover gave one.
 *
 * A quantity from the popover goes through the shared helpers: bulk stores
 * container_count + MT with bag_count = the 60 kg equivalent, bags stay
 * count-driven.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { POST } from './route'

function fakeDb(source: Record<string, any>) {
  const inserts: Record<string, any>[] = []
  const client: any = {
    inserts,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    rpc: async () => ({ data: `SAN-0100${inserts.length + 1}/26`, error: null }),
    from() {
      let pending: Record<string, any> | null = null
      const chain: any = {
        select() { return chain },
        eq() { return chain },
        is() { return chain },
        insert(values: Record<string, any>) { pending = values; return chain },
        single: async () => {
          if (pending) {
            const row = { id: `dup-${inserts.length + 1}`, ...pending }
            inserts.push(row)
            return { data: row, error: null }
          }
          return { data: source, error: null }
        },
      }
      return chain
    },
  }
  return client
}

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/samples/src-1/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as any,
    { params: Promise.resolve({ id: 'src-1' }) },
  )

const bulkSource = {
  id: 'src-1', laboratory_id: 'lab-1', client_id: 'c-1', sample_type: 'ss', bag_type: 'bulk',
  container_count: 1, bags_quantity_mt: 21.6, bag_count: 360, bag_weight_kg: 21600, equivalent_60kg_bags: 360,
}

// Until 2026-09-25 a copy kept every reference and contract link of its source
// (fa9da05) and its quantity: a copy made for another contract printed the
// source's references and was filed under the source's sys contract unless
// staff caught and retyped every one.
describe('POST /api/samples/[id]/duplicate — what a copy keeps', () => {
  beforeEach(() => { state.db = null })

  const ssSource = {
    id: 'src-1', laboratory_id: 'lab-1', sample_type: 'ss',
    client_id: 'c-dunkin', seller_id: 'co-seller', exporter_id: 'co-shipper', same_seller_shipper: false,
    importer_id: 'co-importer', importer_is_qc_client: true, roaster_id: 'co-roaster', end_client_id: 'co-end',
    supplier: 'Fazenda Esperanca', hide_exporter_on_label: true,
    origin: 'Brazil', micro_origin: 'Cerrado Mineiro', processing_method: 'natural',
    quality_spec_id: 'spec-1', quality_name: 'NY2 17/18 FC', crop_year: '2025/26', certifications: ['RFA'],
    contract_id: 'contract-p07905', linked_pss_sample_id: 'pss-805063db', wolthers_contract_nr: '41999/26',
    seller_contract_nr: 'S664243-9', shipper_contract_nr: '4155261413', exporter_contract_nr: 'E-77',
    buyer_contract_nr: 'P07905.001', roaster_contract_nr: 'R-12', qc_client_contract_nr: 'Q-3',
    end_client_contract_nr: 'EC-9', supplier_contract_nr: 'F-1',
    ico_number: '002/4600/3507', exporter_sample_number: '39575/26', container_nr: 'FCIU 629.557-3',
    shipment_month: '2026-10',
    bag_type: 'jute_bag', bag_weight_kg: 60, bag_count: 333, bags_quantity_mt: 19.98, equivalent_60kg_bags: 333,
    container_count: 1,
  }

  it('keeps the party names, the quality and the packaging on every copy', async () => {
    state.db = fakeDb(ssSource)
    const res = await post({ count: 2 })
    expect(res.status).toBe(201)
    expect(state.db.inserts).toHaveLength(2)
    for (const row of state.db.inserts) {
      expect(row).toMatchObject({
        laboratory_id: 'lab-1', sample_type: 'ss', status: 'received', workflow_stage: 'received',
        client_id: 'c-dunkin', seller_id: 'co-seller', exporter_id: 'co-shipper', same_seller_shipper: false,
        importer_id: 'co-importer', importer_is_qc_client: true, roaster_id: 'co-roaster', end_client_id: 'co-end',
        supplier: 'Fazenda Esperanca', hide_exporter_on_label: true,
        origin: 'Brazil', micro_origin: 'Cerrado Mineiro', processing_method: 'natural',
        quality_spec_id: 'spec-1', quality_name: 'NY2 17/18 FC', crop_year: '2025/26', certifications: ['RFA'],
        bag_type: 'jute_bag', bag_weight_kg: 60,
      })
    }
  })

  it('starts every copy without references, contract links or quantity, each written as an explicit null', async () => {
    state.db = fakeDb(ssSource)
    await post({ count: 2 })
    const blank = [
      'contract_id', 'linked_pss_sample_id', 'wolthers_contract_nr',
      'seller_contract_nr', 'shipper_contract_nr', 'exporter_contract_nr', 'buyer_contract_nr',
      'roaster_contract_nr', 'qc_client_contract_nr', 'end_client_contract_nr', 'supplier_contract_nr',
      'ico_number', 'exporter_sample_number', 'container_nr', 'shipment_month',
      'bag_count', 'bags_quantity_mt', 'equivalent_60kg_bags', 'container_count',
    ]
    for (const row of state.db.inserts) {
      for (const field of blank) expect(row).toHaveProperty(field, null)
    }
  })

  it('never writes the retired linked_pss_sample_contract_id', async () => {
    state.db = fakeDb({ ...ssSource, linked_pss_sample_contract_id: 'sc-legacy' })
    await post({ count: 1 })
    expect(state.db.inserts[0]).not.toHaveProperty('linked_pss_sample_contract_id')
  })
})

describe('POST /api/samples/[id]/duplicate — quantity from the popover', () => {
  beforeEach(() => { state.db = null })

  it('leaves a bulk copy without quantity when none is typed, keeping the bulk packaging', async () => {
    state.db = fakeDb(bulkSource)
    const res = await post({ count: 1 })
    expect(res.status).toBe(201)
    expect(state.db.inserts[0]).toMatchObject({
      bag_type: 'bulk', bag_weight_kg: 21600,
      container_count: null, bags_quantity_mt: null, equivalent_60kg_bags: null, bag_count: null,
    })
  })

  it('applies containers + MT through bulkQuantitiesFromContainers to every copy', async () => {
    state.db = fakeDb(bulkSource)
    const res = await post({ count: 2, container_count: 2, bags_quantity_mt: 43.2 })
    expect(res.status).toBe(201)
    expect(state.db.inserts).toHaveLength(2)
    for (const row of state.db.inserts) {
      expect(row).toMatchObject({
        container_count: 2, bags_quantity_mt: 43.2, equivalent_60kg_bags: 720, bag_count: 720, bag_weight_kg: 21600,
      })
    }
  })

  it('derives containers × 21.6 when only the container count is typed', async () => {
    state.db = fakeDb(bulkSource)
    await post({ count: 1, container_count: 2 })
    expect(state.db.inserts[0]).toMatchObject({ container_count: 2, bags_quantity_mt: 43.2, bag_count: 720, equivalent_60kg_bags: 720 })
  })

  it('stores a typed MT without inventing a container count', async () => {
    state.db = fakeDb(bulkSource)
    await post({ count: 1, bags_quantity_mt: 43.2 })
    expect(state.db.inserts[0]).toMatchObject({ container_count: null, bags_quantity_mt: 43.2, bag_count: 720, equivalent_60kg_bags: 720 })
  })

  it('keeps bags count-driven: a typed bag count derives MT and equivalent from the packaging', async () => {
    state.db = fakeDb({ ...bulkSource, bag_type: 'jute_bag', bag_weight_kg: 60, bag_count: 320, bags_quantity_mt: 19.2, equivalent_60kg_bags: 320, container_count: null })
    await post({ count: 1, bag_count: 100 })
    expect(state.db.inserts[0]).toMatchObject({ bag_type: 'jute_bag', bag_count: 100, bag_weight_kg: 60, bags_quantity_mt: 6, equivalent_60kg_bags: 100, container_count: null })
  })
})

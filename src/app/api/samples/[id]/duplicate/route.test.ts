import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A duplicate is the same lot and contract in its next container (review with
 * Anderson, 2026-09-28): it copies everything but the container number, which
 * starts blank. A quantity typed in the popover replaces the source's on every
 * copy: bags as a count, bulk as 60 kg equivalents (one container, at most
 * 360), or the older containers + MT body.
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

describe('POST /api/samples/[id]/duplicate — what a copy keeps', () => {
  beforeEach(() => { state.db = null })

  const ssSource = {
    id: 'src-1', laboratory_id: 'lab-1', sample_type: 'ss', tracking_number: 'SAN-00900/26',
    status: 'certified', workflow_stage: 'certified', storage_position: 'A1-B2', created_by: 'someone-else',
    lab_source_sample_id: null, contract_ordinal: 1, cards_printed_at: '2026-09-20T10:00:00Z',
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

  it('copies parties, quality, every reference and contract link, the ICO and the quantity to every copy', async () => {
    state.db = fakeDb(ssSource)
    const res = await post({ count: 5 })
    expect(res.status).toBe(201)
    expect(state.db.inserts).toHaveLength(5)
    for (const row of state.db.inserts) {
      expect(row).toMatchObject({
        laboratory_id: 'lab-1', sample_type: 'ss', status: 'received', workflow_stage: 'received', created_by: 'user-1',
        client_id: 'c-dunkin', seller_id: 'co-seller', exporter_id: 'co-shipper', same_seller_shipper: false,
        importer_id: 'co-importer', importer_is_qc_client: true, roaster_id: 'co-roaster', end_client_id: 'co-end',
        supplier: 'Fazenda Esperanca', hide_exporter_on_label: true,
        origin: 'Brazil', micro_origin: 'Cerrado Mineiro', processing_method: 'natural',
        quality_spec_id: 'spec-1', quality_name: 'NY2 17/18 FC', crop_year: '2025/26', certifications: ['RFA'],
        contract_id: 'contract-p07905', linked_pss_sample_id: 'pss-805063db', wolthers_contract_nr: '41999/26',
        seller_contract_nr: 'S664243-9', shipper_contract_nr: '4155261413', exporter_contract_nr: 'E-77',
        buyer_contract_nr: 'P07905.001', roaster_contract_nr: 'R-12', qc_client_contract_nr: 'Q-3',
        end_client_contract_nr: 'EC-9', supplier_contract_nr: 'F-1',
        ico_number: '002/4600/3507', exporter_sample_number: '39575/26', shipment_month: '2026-10',
        bag_type: 'jute_bag', bag_weight_kg: 60, bag_count: 333, bags_quantity_mt: 19.98, equivalent_60kg_bags: 333,
        container_count: 1,
      })
    }
  })

  it('starts every copy without a container number', async () => {
    state.db = fakeDb(ssSource)
    await post({ count: 2 })
    for (const row of state.db.inserts) expect(row).toHaveProperty('container_nr', null)
  })

  it('takes no lab, decision, print or storage state, and draws its own internal number', async () => {
    state.db = fakeDb(ssSource)
    await post({ count: 1 })
    const row = state.db.inserts[0]
    expect(row.tracking_number).toBe('SAN-01001/26')
    for (const field of ['storage_position', 'lab_source_sample_id', 'contract_ordinal', 'cards_printed_at']) {
      expect(row).not.toHaveProperty(field)
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

  it('keeps the source\'s bulk quantity when none is typed', async () => {
    state.db = fakeDb(bulkSource)
    const res = await post({ count: 1 })
    expect(res.status).toBe(201)
    expect(state.db.inserts[0]).toMatchObject({
      bag_type: 'bulk', bag_weight_kg: 21600, container_count: 1, bags_quantity_mt: 21.6, equivalent_60kg_bags: 360, bag_count: 360,
    })
  })

  it('applies typed 60 kg equivalents to every bulk copy as one container', async () => {
    state.db = fakeDb(bulkSource)
    const res = await post({ count: 2, bag_count: 340 })
    expect(res.status).toBe(201)
    for (const row of state.db.inserts) {
      expect(row).toMatchObject({
        bag_type: 'bulk', container_count: 1, bags_quantity_mt: 20.4, equivalent_60kg_bags: 340, bag_count: 340, bag_weight_kg: 21600,
      })
    }
  })

  it('refuses bulk equivalents above one container', async () => {
    state.db = fakeDb(bulkSource)
    const res = await post({ count: 1, bag_count: 361 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Bulk is at most 360 × 60 kg bag equivalents (21.6 MT) per sample')
    expect(state.db.inserts).toHaveLength(0)
  })

  it('still accepts the older containers + MT body for bulk', async () => {
    state.db = fakeDb(bulkSource)
    await post({ count: 1, container_count: 2, bags_quantity_mt: 43.2 })
    expect(state.db.inserts[0]).toMatchObject({ container_count: 2, bags_quantity_mt: 43.2, bag_count: 720, equivalent_60kg_bags: 720 })
  })

  it('keeps bags count-driven: a typed bag count derives MT and equivalent from the packaging', async () => {
    state.db = fakeDb({ ...bulkSource, bag_type: 'jute_bag', bag_weight_kg: 60, bag_count: 320, bags_quantity_mt: 19.2, equivalent_60kg_bags: 320, container_count: null })
    await post({ count: 1, bag_count: 100 })
    expect(state.db.inserts[0]).toMatchObject({ bag_type: 'jute_bag', bag_count: 100, bag_weight_kg: 60, bags_quantity_mt: 6, equivalent_60kg_bags: 100, container_count: null })
  })
})

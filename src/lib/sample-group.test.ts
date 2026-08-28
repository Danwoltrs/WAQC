import { describe, it, expect } from 'vitest'
import {
  labSourceId, isLabUnit, sortGroup, buildSiblingRow,
  MOTHER_SHARED_FIELDS, SIBLING_OWN_FIELDS, SIBLING_COALESCE_FIELDS,
} from './sample-group'

const mother = {
  id: 'm', tracking_number: 'SAN-00654/26', origin: 'BR', sample_category: 'quality_control', sample_type: 'pss',
  laboratory_id: 'lab', quality_spec_id: 'q', client_id: 'dunkin', seller_id: 'ofi', exporter_id: 'ofi',
  status: 'approved', workflow_stage: 'certified', crop_year: '26/27', processing_method: 'natural',
  certifications: ['RFA'], seller_contract_nr: 'S664243-13', shipper_contract_nr: null, exporter_contract_nr: 'EX-1',
  exporter_sample_number: '130306', ico_number: null, container_nr: null, shipment_month: '2026-10',
  bag_count: 333, bag_weight_kg: 60, bag_type: 'jute_bag', bags_quantity_mt: 19.98, equivalent_60kg_bags: 333, bags: null,
  importer_id: 'imp', roaster_id: null, end_client_id: null, importer_is_qc_client: false,
  wolthers_contract_nr: 'W-1', buyer_contract_nr: 'S049504-13', storage_position: 'A1', deleted_at: null,
  linked_pss_sample_id: 'x', linked_pss_sample_contract_id: 'y', split_numbering: true, created_at: '2026-08-27T17:52:33Z',
  manual_ref_fields: ['buyer_contract_nr'], contract_id: 'sysc',
}

describe('labSourceId / isLabUnit', () => {
  it('is the row itself for a lab unit and the pointer for a sibling', () => {
    expect(labSourceId({ id: 'a', lab_source_sample_id: null })).toBe('a')
    expect(labSourceId({ id: 'b', lab_source_sample_id: 'a' })).toBe('a')
    expect(isLabUnit({ id: 'a', lab_source_sample_id: null })).toBe(true)
    expect(isLabUnit({ id: 'b', lab_source_sample_id: 'a' })).toBe(false)
  })
})

describe('sortGroup', () => {
  it('puts the lab unit first, then contract order, then creation time', () => {
    const rows = [
      { id: 's3', lab_source_sample_id: 'm', contract_ordinal: null, created_at: '2026-01-03' },
      { id: 's2', lab_source_sample_id: 'm', contract_ordinal: 3, created_at: '2026-01-02' },
      { id: 'm', lab_source_sample_id: null, contract_ordinal: 1, created_at: '2026-01-01' },
      { id: 's1', lab_source_sample_id: 'm', contract_ordinal: 2, created_at: '2026-01-05' },
    ]
    expect(sortGroup(rows).map((r) => r.id)).toEqual(['m', 's1', 's2', 's3'])
  })
})

describe('buildSiblingRow', () => {
  it("copies the lab unit, takes the contract's own buy side and refs, and cross-maps the seller ref", () => {
    const row = buildSiblingRow(mother, {
      importer_id: 'imp2', importer_is_qc_client: true, buyer_contract_nr: 'S049504-14',
      supplier_contract_nr: 'S664243-14', exporter_sample_number: '130307',
      bag_count: 20, bag_weight_kg: 1000, bag_type: 'big_bag', bags_quantity_mt: 20, equivalent_60kg_bags: 333,
      created_at: '2026-08-28T10:00:00Z',
    }, { trackingNumber: 'SAN-00700/26', ordinal: 2 })
    expect(row.id).toBeUndefined()
    expect(row.tracking_number).toBe('SAN-00700/26')
    expect(row.lab_source_sample_id).toBe('m')
    expect(row.contract_ordinal).toBe(2)
    expect(row.split_numbering).toBe(true)
    expect(row.origin).toBe('BR'); expect(row.laboratory_id).toBe('lab'); expect(row.status).toBe('approved')
    expect(row.workflow_stage).toBe('certified'); expect(row.certifications).toEqual(['RFA'])
    expect(row.seller_id).toBe('ofi'); expect(row.exporter_contract_nr).toBe('EX-1')
    expect(row.importer_id).toBe('imp2'); expect(row.roaster_id).toBeNull(); expect(row.end_client_id).toBeNull()
    expect(row.importer_is_qc_client).toBe(true)
    expect(row.wolthers_contract_nr).toBeNull(); expect(row.buyer_contract_nr).toBe('S049504-14')
    expect(row.client_id).toBe('dunkin'); expect(row.exporter_sample_number).toBe('130307')
    expect(row.shipment_month).toBe('2026-10'); expect(row.supplier_contract_nr).toBe('S664243-14')
    expect(row.seller_contract_nr).toBe('S664243-14')
    expect(row.bag_count).toBe(20); expect(row.bag_type).toBe('big_bag'); expect(row.bags_quantity_mt).toBe(20)
    expect(row.bags).toBe(20)
    expect(row.storage_position).toBeNull(); expect(row.linked_pss_sample_id).toBeNull()
    expect(row.linked_pss_sample_contract_id).toBeNull()
    expect(row.manual_ref_fields).toEqual([]); expect(row.contract_id).toBeNull()
    expect(row.created_at).toBe('2026-08-28T10:00:00Z')
    expect(row.calculated_client_fee).toBeUndefined(); expect(row.updated_at).toBeUndefined()
  })

  it('falls back to the lab unit for blank coalesced fields and quantity', () => {
    const row = buildSiblingRow(mother, {}, { trackingNumber: 'SAN-00701/26', ordinal: 3 })
    expect(row.seller_contract_nr).toBe('S664243-13')
    expect(row.exporter_sample_number).toBe('130306')
    expect(row.bag_count).toBe(333); expect(row.bags_quantity_mt).toBe(19.98); expect(row.bag_type).toBe('jute_bag')
    expect(row.client_id).toBe('dunkin')
    expect(row.importer_id).toBeNull()
    expect(row.importer_is_qc_client).toBe(true)
    expect(row.created_at).toBeUndefined()
  })

  it('keeps the three field lists disjoint and complete', () => {
    const all = new Set([...MOTHER_SHARED_FIELDS, ...SIBLING_OWN_FIELDS, ...SIBLING_COALESCE_FIELDS])
    expect(all.size).toBe(MOTHER_SHARED_FIELDS.length + SIBLING_OWN_FIELDS.length + SIBLING_COALESCE_FIELDS.length)
    for (const f of ['bag_count', 'bags_quantity_mt', 'client_id', 'exporter_sample_number']) expect(SIBLING_COALESCE_FIELDS).toContain(f)
    for (const f of ['importer_id', 'buyer_contract_nr', 'wolthers_contract_nr', 'contract_id', 'manual_ref_fields']) expect(SIBLING_OWN_FIELDS).toContain(f)
    for (const f of ['origin', 'laboratory_id', 'status', 'workflow_stage', 'quality_spec_id', 'seller_id', 'deleted_at']) expect(MOTHER_SHARED_FIELDS).toContain(f)
  })
})

/**
 * Test-only certificate rows for the annual report. Defaults describe one
 * approved, bagged shipment certificate issued mid-June 2026 by Comexim.
 */
import type { AnnualRow } from '../annual-row'

let seq = 0

export function annualRow(p: Partial<AnnualRow> & { violations?: string[] } = {}): AnnualRow {
  seq += 1
  const { violations, ...rest } = p
  const issued = rest.approval_date ?? '2026-06-15T12:00:00.000Z'
  const row = {
    approval_date: issued,
    created_at: issued,
    certificate_number: `T-${String(seq).padStart(5, '0')}/26`,
    exporter_name: 'Comexim',
    seller_name: null,
    importer_name: 'Ahold',
    importer_contract_nr: null,
    roaster_name: 'Unsold',
    container_nr: `CONT${seq}`,
    ico_marks: null,
    bags: 320,
    mt: 19.2,
    container_count: null,
    is_rejected: false,
    region: null,
    origin: 'Brazil',
    laboratory_name: 'Santos',
    bag_type: 'jute_bag',
    lab_unit_id: `lab-${seq}`,
    ...rest,
  } as AnnualRow & { _violations?: string[] }
  row._violations = violations ?? []
  return row
}

/**
 * One certificate of the annual report: the period report's row plus what the
 * year groups on — origin, laboratory, bag type (containers) and the lab unit
 * whose grading the certificate reports.
 */
import type { PerformanceRow } from './performance-data'
import {
  mapCertRowToReportRow,
  type ClientSankeyType,
  type RawCertSampleRow,
} from '@/lib/report-data'
import { labSourceId } from '@/lib/sample-group'

export type AnnualRow = PerformanceRow & {
  origin: string | null
  laboratory_name: string | null
  /** `samples.bag_type`; 'bulk' rows count containers from their own count. */
  bag_type: string | null
  /** The row whose grading and cupping this certificate reports (a sibling points at its lab unit). */
  lab_unit_id: string
  created_at: string
}

/** Map a raw cert row → an AnnualRow, carrying region, origin, lab, bag type and violations. */
export function toAnnualRow(
  c: RawCertSampleRow,
  ctx: { sankeyType: ClientSankeyType; clientDisplay: string },
  labName: string | null,
): AnnualRow {
  const s = c.sample!
  const row = mapCertRowToReportRow(c, ctx) as AnnualRow & { _violations?: string[] }
  row.region = s.micro_origin ?? null
  row.origin = s.origin ?? null
  row.laboratory_name = labName
  row.bag_type = s.bag_type ?? null
  row.lab_unit_id = labSourceId(s)
  row.created_at = c.created_at
  row._violations = c.compliance_violations ?? []
  return row
}

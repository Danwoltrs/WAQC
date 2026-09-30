/**
 * The Dunkin weekly report of 21–25/09/2026 (the one Daniel compared against
 * his Excel), rebuilt from the rows it printed: 25 approved and 15 rejected
 * shipment-sample certificates plus two approved pre-shipment samples. Built
 * through the real aggregators so region tables, reasons and the flow come
 * out the way the fetcher makes them.
 */
import {
  aggregateBucket,
  buildBucketSankey,
  regionTableRows,
  type PerformanceBucket,
  type PerformanceReportData,
  type PerformanceRow,
} from '@/lib/reports/performance-data'

type Spec = [date: string, contract: string, cert: number, shipper: string, importer: string, roaster: string, container: string, ico: string, bags: number, region: string, violations?: string[]]

const Q = (n: number) => `Quakers: ${n} exceeds maximum (8)`
// The shapes the live week carried: weighted (fractional) defect equivalents,
// a total-defect line beside the secondary one, a fault counted not named.
const SEC = 'Secondary defects: 24.4 exceeds limit (21)'
const TOTAL = 'Total defects: 26.2 exceeds limit (21)'
const PRI = 'Primary defects: 2 exceeds limit (1)'
const FAULT = 'Cupping faults: 1 exceeds limit (0)'

const SS: Spec[] = [
  ['2026-09-21T14:00:00Z', 'P018870', 37362, 'CDN', 'Hamburg Coffee', 'Unsold', 'TCKU 110.331-8', '002/2228/0125', 333, 'Unspecified'],
  ['2026-09-21T14:05:00Z', 'P018870', 37363, 'CDN', 'Hamburg Coffee', 'Unsold', 'MRKU 893.697-8', '002/2228/0125', 334, 'Unspecified'],
  ...[37364, 37365, 37366, 37367, 37368, 37369, 37370, 37371, 37372, 37373, 37374, 37375, 37376, 37377, 37378].map((n, i): Spec => [
    '2026-09-21T15:00:00Z', 'P07772.000', n, 'Cooxupé', 'Coffee America', 'Unsold',
    `MRSU ${String(200 + i).padStart(3, '0')}.272-${i % 10}`, `002/4600/${3238 + i}`, i % 3 === 2 ? 334 : 324, 'Sul de Minas | Cerrado Mineiro',
    i < 2 ? [Q(12)] : i < 7 ? [SEC, TOTAL, Q(10)] : i < 10 ? [PRI, SEC, TOTAL, Q(11)] : i < 12 ? [FAULT, Q(9)] : i < 13 ? [FAULT, PRI, Q(14)] : [TOTAL, Q(13)],
  ]),
  ...[37381, 37382, 37383, 37384, 37385, 37386, 37387, 37388, 37389].map((n, i): Spec => [
    '2026-09-22T12:00:00Z', i < 6 ? 'P07334.005' : 'P07335.004', n, 'COCATREL', 'Coffee America', 'Unsold',
    i === 7 ? 'MRKU 815.0973-3' : `HLBU ${230 + i}.023-3`, `002/1657/0${767 + i}`, 333, 'Cerrado Mineiro',
  ]),
  ['2026-09-22T13:00:00Z', 'S049504-10', 37390, 'OFI', 'OFI', 'Qusac', 'UETU 317.367-6', '002/1145/5599', 333, 'Cerrado Mineiro'],
  ...[37391, 37392, 37393, 37394].map((n): Spec => ['2026-09-22T13:10:00Z', 'S667157-2', n, 'OFI', 'OFI', 'National DCP', 'MSBU 202.893-0', '002/1145/5614', 333, 'Sul de Minas']),
  ...[37395, 37396, 37397].map((n): Spec => ['2026-09-22T13:20:00Z', 'S667158-2', n, 'OFI', 'OFI', 'MZB', 'MSMU 317.942-6', '002/1145/5615', 333, 'Unspecified']),
  ...[37398, 37399].map((n): Spec => ['2026-09-22T13:30:00Z', 'S667159-2', n, 'OFI', 'OFI', 'Mother Parkers', 'UETU 320.589-7', '002/1145/5616', 333, 'Sul de Minas | Cerrado Mineiro']),
  ['2026-09-22T13:40:00Z', 'S667160-2', 37400, 'OFI', 'OFI', 'S & D / WESTROCK', 'MSBU 164.509-6', '002/1145/5617', 333, 'Unspecified'],
  ...[37401, 37402, 37403].map((n): Spec => ['2026-09-23T12:00:00Z', 'P-018868', n, 'Cooxupé', 'Hamburg Coffee', 'Unsold', `MRSU 105.26${n % 10}-5`, '002/4600/3687', 333, 'Sul de Minas | Cerrado Mineiro']),
]

const toRow = ([date, contract, cert, shipper, importer, roaster, container, ico, bags, region, violations]: Spec): PerformanceRow => {
  return {
    approval_date: date,
    certificate_number: `BR-0${cert}/26`,
    exporter_name: shipper,
    seller_name: shipper,
    importer_name: importer,
    importer_contract_nr: contract,
    roaster_name: roaster,
    container_nr: container || null,
    ico_marks: ico,
    bags,
    mt: Math.round(bags * 0.06 * 10) / 10,
    is_rejected: !!violations,
    region,
    _violations: violations ?? [],
    // What the lab unit recorded, as the fetcher attaches it.
    rejection_detail: violations ? {
      primaryDefects: violations.includes(PRI) ? ['Full Black'] : [],
      faults: violations.includes(FAULT) ? ['Hard (riado)'] : [],
      taints: cert === 37364 ? ['Earthy'] : [],
    } : null,
  } as PerformanceRow
}

function bucket(rows: PerformanceRow[], metric: 'count' | 'bags'): PerformanceBucket {
  const agg = aggregateBucket(rows, metric)
  return {
    ...agg,
    rows,
    greenDefects: [
      { name: 'Unripe/Immature', count: 1178, max: 90 },
      { name: 'Broken', count: 556, max: 50 },
      { name: 'Bad Formed', count: 367, max: 40 },
      { name: 'Minor Broca', count: 109, max: 10 },
      { name: 'Severe Broca', count: 84, max: 10 },
    ],
    defectLoad: { avg: 25, max: 28.2, graded: 15 },
    cuppingDefects: [{ name: 'Hard (riado)', kind: 'fault', count: 3 }],
    ...buildBucketSankey(rows, agg.byExporter, 'final_buyer', 'Dunkin', regionTableRows(agg)),
  } as PerformanceBucket
}

export function dunkinWeek(): PerformanceReportData {
  const ssRows = SS.map(toRow)
  const pssRows = [
    toRow(['2026-09-21T16:00:00Z', '', 37379, 'OFI', 'OFI', 'Unsold', '', '', 720, 'Cerrado Mineiro']),
    toRow(['2026-09-21T16:10:00Z', 'S052132-3', 37380, 'OFI', 'OFI', 'Mother Parkers', '', '', 3334, 'Cerrado Mineiro']),
  ].map(r => ({ ...r, container_nr: null, ico_marks: null, importer_contract_nr: r.importer_contract_nr || null }))
  return {
    client: { id: 'dunkin', name: 'Dunkin', logo_url: null, is_roaster: false, sankey_type: 'final_buyer' },
    period: { start_date: '2026-09-21T03:00:00.000Z', end_date: '2026-09-26T03:00:00.000Z', issued_at: '2026-09-29T15:00:00.000Z' },
    origin: 'Brazil',
    ratings: {
      shippers: ['CDN', 'Grano', 'OFI', 'Cooxupé', 'Brascof', 'COCATREL', 'Sucden Brasil', 'COCAPEC'].map((name, i) => ({ rank: i + 1, name, total: 100 - i * 10, pss: 10, ss: 90 - i * 10, approvalRate: 100 - i * 9 })),
      sellers: ['CDN', 'Grano', 'OFI', 'Cooxupé', 'Brascof', 'COCATREL', 'Sucden Brasil', 'COCAPEC'].map((name, i) => ({ rank: i + 1, name, total: 100 - i * 10, pss: 10, ss: 90 - i * 10, approvalRate: 100 - i * 9 })),
      window: { start: '2026-01-01T03:00:00.000Z', end: '2026-09-26T03:00:00.000Z' },
    },
    pss: bucket(pssRows, 'count'),
    ss: bucket(ssRows, 'bags'),
  }
}

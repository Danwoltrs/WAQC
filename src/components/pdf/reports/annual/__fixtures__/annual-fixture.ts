/**
 * Test-only annual report data, built through the real aggregation so PDF
 * tests exercise the numbers production prints. Default: Ahold-like year —
 * nine shippers, six sellers, June–September, PSS with some rejections, SS clean.
 */
import { buildAnnualAggregates, type AnnualPerformanceReportData } from '@/lib/reports/annual-data'
import { buildQualityFindings, type LabUnitQuality } from '@/lib/reports/annual-quality'
import { annualRow } from '@/lib/reports/__fixtures__/annual-rows'
import type { AnnualRow } from '@/lib/reports/annual-row'
import type { ClientSankeyType } from '@/lib/report-data'

const SHIPPERS = ['EISA', 'Veloso Green Coffee', 'Comexim', 'Dreyfus', 'Expocacer', 'Cooxupé', 'Alto Cafezal', 'NKG Stockler', 'Grano']
const SELLERS = ['Rothfos GmbH', 'Ecom', 'Volcafe CH', 'Comexim EU', 'LDC Suisse', 'Douqué']
const LONG = 'Ipanema Comercial e Exportadora S.A. or Ipanema Agrícola S.A.'
const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09']
const REASONS = [
  'Taint "Phenolic": Intensity 3 exceeds maximum (0)',
  'Secondary defects: 25 exceeds maximum (20)',
  'Moisture: 12.9 exceeds maximum (12.5)',
]

export interface AnnualFixtureOptions {
  shippers?: number
  sellers?: number
  sankeyType?: ClientSankeyType
  importers?: number
  roasters?: number
  withPss?: boolean
  withSs?: boolean
  longNames?: boolean
}

const day = (n: number) => String(n).padStart(2, '0')

export function annualFixture(o: AnnualFixtureOptions = {}): AnnualPerformanceReportData {
  const shippers = o.shippers ?? 9
  const sellers = o.sellers ?? 6
  const sankeyType = o.sankeyType ?? 'roaster'
  const importers = o.importers ?? 1
  const roasters = o.roasters ?? 1
  const pss: AnnualRow[] = []
  const ss: AnnualRow[] = []
  let container = 0
  // Local serials, so two calls build identical data (the facts fingerprint depends on it).
  let serial = 0
  const ids = () => {
    serial += 1
    return { certificate_number: `SAK-${String(serial).padStart(6, '0')}/26`, lab_unit_id: `lab-${serial}` }
  }

  for (let i = 0; i < shippers; i++) {
    const common = {
      exporter_name: o.longNames ? `${LONG} ${i + 1}` : SHIPPERS[i] ?? `Shipper ${i + 1}`,
      seller_name: SELLERS[i % sellers] ?? `Seller ${(i % sellers) + 1}`,
      importer_name: importers > 1 ? `Importer ${(i % importers) + 1}` : 'Ahold',
      roaster_name: roasters > 1 ? `Roaster ${(i % roasters) + 1}` : 'Unsold',
    }
    MONTHS.forEach((month, m) => {
      if (o.withPss !== false) {
        for (let k = 0; k < 2 + (i % 2); k++) {
          const rejected = (i + m + k) % 4 === 0
          pss.push(annualRow({
            ...common,
            ...ids(),
            approval_date: `${month}-${day(3 + k)}T12:00:00.000Z`,
            container_nr: null,
            is_rejected: rejected,
            violations: rejected ? [REASONS[(i + k) % REASONS.length]] : [],
          }))
        }
      }
      if (o.withSs !== false) {
        for (let k = 0; k < 2; k++) {
          container += 1
          ss.push(annualRow({
            ...common,
            ...ids(),
            approval_date: `${month}-${day(10 + k)}T12:00:00.000Z`,
            container_nr: `MSKU${String(container).padStart(7, '0')}`,
          }))
        }
      }
    })
  }

  const lots: LabUnitQuality[] = pss.map((r, n) => ({
    labUnitId: r.lab_unit_id,
    shipper: r.exporter_name,
    certificateNumber: r.certificate_number,
    green: {
      defects: {
        counts: n % 3 === 0 ? { 'Full Black': 1 + (n % 4), 'Broken/Chipped': 6 + (n % 5) } : { Immature: 2 + (n % 3) },
        primary: n % 3 === 0 ? 1 + (n % 4) : 0,
        secondary: 1.2 + (n % 5) * 0.2,
      },
    },
    cupDefects: r.is_rejected ? [{ kind: 'Taint' as const, name: n % 2 ? 'Phenolic' : 'Hard', cups: null, intensity: null }] : [],
  }))

  return {
    client: { id: 'client-ahold', name: 'Ahold', logo_url: null, is_roaster: sankeyType === 'roaster', sankey_type: sankeyType },
    period: { year: 2026, issued_at: '2026-09-25T12:00:00.000Z' },
    origin: 'Brazil',
    agg: buildAnnualAggregates(pss, ss, { sankeyType, clientDisplay: 'Ahold', quality: buildQualityFindings(lots) }),
  }
}

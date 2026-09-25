/** The methodology note printed under the year flow (or on the last page that exists). */
import type { AnnualPerformanceReportData } from '@/lib/reports/annual-data'

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function methodologyText(data: AnnualPerformanceReportData): string {
  const { client, period, agg } = data
  const labs = agg.labsCovered.length
    ? `the ${list(agg.labsCovered)} ${agg.labsCovered.length === 1 ? 'laboratory' : 'laboratories'}`
    : 'all Wolthers laboratories'
  const origins = agg.originsCovered.length ? `origins ${list(agg.originsCovered)}` : 'all origins'
  return [
    `Covers every certificate Wolthers issued for ${client.name} from 1 January to 31 December ${period.year} (UTC), across ${labs} and ${origins}.`,
    'Pre-shipment (PSS) figures count certificates; shipment (SS) figures count 60-kg-equivalent bags; MT is metric tonnes.',
    'A sample covering several contracts carries one certificate per contract.',
    'Containers are the distinct container numbers recorded on approved shipment certificates plus the container count of bulk lots.',
    'Defect, taint and fault figures are read once per graded lot, as printed on its certificate.',
    'Where no seller is recorded the shipper is shown as seller, so shipper and seller views are not additive.',
  ].join(' ')
}

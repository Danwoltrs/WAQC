import { formatCropYear } from '@/lib/crop-year'
import { reportDay, saoPauloMidnight } from '@/lib/reports/periods'

export interface PortalPeriod { key: string; label: string; start: string; end: string }

const CROP_START_MONTH = 9 // September, 1-based

function cropPeriod(startYear: number): PortalPeriod {
  return {
    key: `crop-${startYear}`,
    label: `Crop ${formatCropYear(startYear)}`,
    start: saoPauloMidnight(`${startYear}-09-01`),
    end: saoPauloMidnight(`${startYear + 1}-09-01`),
  }
}

function yearPeriod(year: number): PortalPeriod {
  return {
    key: `year-${year}`,
    label: String(year),
    start: saoPauloMidnight(`${year}-01-01`),
    end: saoPauloMidnight(`${year + 1}-01-01`),
  }
}

/** Sao Paulo calendar year and month (1-based) of `now`. */
function saoPauloNow(now: Date): { year: number; month: number } {
  const [y, m] = reportDay(now.toISOString()).split('-')
  return { year: Number(y), month: Number(m) }
}

function currentCropStart(now: Date): number {
  const { year, month } = saoPauloNow(now)
  return month >= CROP_START_MONTH ? year : year - 1
}

export function parsePortalPeriod(key: string | null, now: Date = new Date()): PortalPeriod {
  const m = key ? /^(crop|year)-(\d{4})$/.exec(key) : null
  if (m) return m[1] === 'crop' ? cropPeriod(Number(m[2])) : yearPeriod(Number(m[2]))
  return cropPeriod(currentCropStart(now))
}

export function portalPeriodOptions(now: Date = new Date()): PortalPeriod[] {
  const c = currentCropStart(now)
  const y = saoPauloNow(now).year
  return [cropPeriod(c), cropPeriod(c - 1), cropPeriod(c - 2), yearPeriod(y), yearPeriod(y - 1)]
}

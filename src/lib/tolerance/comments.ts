import type { ToleranceItem } from './types'

const formatLimit = (n: number): string => String(Math.round(n * 10) / 10)

/**
 * The seller-facing line for one out-of-spec metric.
 *
 * Portuguese unconditionally: sellers here are Brazilian exporters, and the line
 * is editable in the confirm dialog, so a per-company language field buys
 * nothing at this stage.
 */
export function prefillComment(item: ToleranceItem): string {
  if (item.quadrant === 'defects') {
    return `Reduzir defeitos para no máximo ${formatLimit(item.limit)}.`
  }
  if (item.label === 'Pan') {
    return `Reduzir fundo para no máximo ${formatLimit(item.limit)}%.`
  }
  const size = item.label.replace(/^Screen\s+/i, '')
  if (item.direction === 'min') {
    return `Melhorar peneira ${size} para no mínimo ${formatLimit(item.limit)}%.`
  }
  return `Reduzir peneira ${size} para no máximo ${formatLimit(item.limit)}%.`
}

export function prefillComments(items: ToleranceItem[]): string[] {
  return items.map(prefillComment)
}

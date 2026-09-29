import { escapeHtml } from '@/lib/html'
import { sieveKey } from '@/lib/sieve-names'
import { isPanScreen } from '@/lib/tolerance/limits'
import type { ScreenLimit } from '@/lib/tolerance/normalize-distribution'
import type { ToleranceItem } from '@/lib/tolerance/types'
import { getScreenSizeOrder } from '@/types/screen-size-constraints'

const one = (n: number) => Math.round(n * 10) / 10

/** One sieve in the seller's table: what the sample had, what the quality
 *  requires, and what the certificate issues after the adjustment. */
export interface ScreenAdjustmentRow {
  sieve: string
  sample: number
  requirement: string | null
  adjusted: number
  /** The sample misses this sieve's requirement. */
  short: boolean
}

function requirementText(l: ScreenLimit | undefined): string | null {
  if (!l) return null
  if (l.min !== undefined && l.max !== undefined) return `${l.min}–${l.max}%`
  if (l.min !== undefined) return `mín. ${l.min}%`
  if (l.max !== undefined) return `máx. ${l.max}%`
  return null
}

/**
 * Every sieve of the lot, largest first, pan last. The adjustment fills a short
 * screen from the screens below it (normalizeDistribution), so the seller sees
 * where the missing points came from, not only the screen that failed.
 */
export function buildScreenAdjustmentRows(
  actual: Record<string, number> | null,
  issued: Record<string, number> | null,
  limits: ScreenLimit[],
): ScreenAdjustmentRow[] {
  if (!actual) return []
  const limitOf = new Map(limits.map((l) => [sieveKey(l.screen_size), l]))
  return Object.keys(actual)
    .sort((a, b) => getScreenSizeOrder(a) - getScreenSizeOrder(b))
    .map((size) => {
      const limit = limitOf.get(sieveKey(size))
      const sample = actual[size]
      const short =
        (limit?.min !== undefined && sample < limit.min) || (limit?.max !== undefined && sample > limit.max)
      return {
        sieve: isPanScreen(size) ? 'Fundo' : size.replace(/^screen[_\s]*/i, '').trim(),
        sample: one(sample),
        requirement: requirementText(limit),
        adjusted: one(issued?.[size] ?? sample),
        short,
      }
    })
}

const TH = 'padding:4px 8px;text-align:right;'
const TD = 'padding:4px 8px;text-align:right;'

function screenTable(rows: ScreenAdjustmentRow[]): string {
  const body = rows
    .map(
      (r) => `<tr>
  <td style="padding:4px 8px;${r.short ? 'font-weight:600;' : ''}">${escapeHtml(r.sieve)}</td>
  <td style="${TD}${r.short ? 'font-weight:600;' : ''}">${r.sample.toFixed(1)}%</td>
  <td style="${TD}">${r.requirement ? escapeHtml(r.requirement) : '—'}</td>
  <td style="${TD}">${r.adjusted.toFixed(1)}%</td>
</tr>`,
    )
    .join('\n')
  return `  <table style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr>
        <th style="padding:4px 8px;text-align:left;">Peneira</th>
        <th style="${TH}">Sua amostra</th>
        <th style="${TH}">Exigido</th>
        <th style="${TH}">Ajustado</th>
      </tr>
    </thead>
    <tbody>
${body}
    </tbody>
  </table>`
}

function itemTable(items: ToleranceItem[]): string {
  const unit = (i: ToleranceItem) => (i.quadrant === 'distribution' ? '%' : '')
  const rows = items
    .map(
      (i) => `<tr>
  <td style="padding:4px 8px;">${escapeHtml(i.label)}</td>
  <td style="${TD}">${one(i.actual)}${unit(i)}</td>
  <td style="${TD}">${i.direction === 'min' ? 'min' : 'max'} ${i.limit}${unit(i)}</td>
  <td style="${TD}">${i.direction === 'min' ? '−' : '+'}${one(i.gap)}${unit(i)}</td>
</tr>`,
    )
    .join('\n')
  return `  <table style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr>
        <th style="padding:4px 8px;text-align:left;">Item</th>
        <th style="${TH}">Resultado</th>
        <th style="${TH}">Exigido</th>
        <th style="${TH}">Diferença</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>`
}

/**
 * The seller-only block for a lot approved with comments.
 *
 * Seller emails alone carry this: the buyer's copy shows the issued values with
 * no comments and no mention of tolerance. No greeting filler — straight to the
 * result, the way QC writes today.
 *
 * With `screenRows`, the screens are shown as the whole distribution (sample,
 * requirement, adjusted) and the seller is asked to meet the standard; defect
 * items keep their own actual / required / gap table.
 */
export function buildToleranceBlock(
  items: ToleranceItem[],
  comments: string[],
  requestAdditionalSample: boolean,
  screenRows: ScreenAdjustmentRow[] = [],
): string {
  if (items.length === 0 && comments.length === 0) return ''

  const hasScreenItem = items.some((i) => i.quadrant === 'distribution')
  const showScreenTable = hasScreenItem && screenRows.length > 0
  const listed = showScreenTable ? items.filter((i) => i.quadrant !== 'distribution') : items

  const lines = comments
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => `<li>${escapeHtml(c)}</li>`)
    .join('\n')

  const parts = [
    '  <p style="font-weight:600;margin:0 0 6px;">Aprovado com observações</p>',
    showScreenTable ? screenTable(screenRows) : '',
    showScreenTable
      ? '  <p style="margin:8px 0 0;font-size:13px;">Favor ajustar a classificação por peneira para atender ao padrão exigido.</p>'
      : '',
    listed.length > 0 ? `${showScreenTable ? '  <div style="margin-top:10px;"></div>\n' : ''}${itemTable(listed)}` : '',
    lines ? `  <ul style="margin:10px 0 0;padding-left:18px;font-size:13px;">\n${lines}\n  </ul>` : '',
    requestAdditionalSample
      ? '  <p style="margin:10px 0 0;font-size:13px;">Favor enviar uma amostra adicional.</p>'
      : '',
  ].filter(Boolean)

  return `<div style="margin-top:16px;">\n${parts.join('\n')}\n</div>`
}

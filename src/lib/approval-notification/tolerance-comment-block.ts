import { escapeHtml } from '@/lib/html'
import type { ToleranceItem } from '@/lib/tolerance/types'

const one = (n: number) => Math.round(n * 10) / 10

/**
 * The seller-only block for a lot approved with comments.
 *
 * Seller emails alone carry this: the buyer's copy shows the issued values with
 * no comments and no mention of tolerance. No greeting filler — straight to the
 * result, the way QC writes today.
 */
export function buildToleranceBlock(
  items: ToleranceItem[],
  comments: string[],
  requestAdditionalSample: boolean,
): string {
  if (items.length === 0 && comments.length === 0) return ''

  const unit = (i: ToleranceItem) => (i.quadrant === 'distribution' ? '%' : '')
  const rows = items
    .map(
      (i) => `<tr>
  <td style="padding:4px 8px;">${escapeHtml(i.label)}</td>
  <td style="padding:4px 8px;text-align:right;">${one(i.actual)}${unit(i)}</td>
  <td style="padding:4px 8px;text-align:right;">${i.direction === 'min' ? 'min' : 'max'} ${i.limit}${unit(i)}</td>
  <td style="padding:4px 8px;text-align:right;">${i.direction === 'min' ? '−' : '+'}${one(i.gap)}${unit(i)}</td>
</tr>`,
    )
    .join('\n')

  const lines = comments
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => `<li>${escapeHtml(c)}</li>`)
    .join('\n')

  return `
<div style="margin-top:16px;">
  <p style="font-weight:600;margin:0 0 6px;">Aprovado com observações</p>
  <table style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr>
        <th style="padding:4px 8px;text-align:left;">Item</th>
        <th style="padding:4px 8px;text-align:right;">Resultado</th>
        <th style="padding:4px 8px;text-align:right;">Exigido</th>
        <th style="padding:4px 8px;text-align:right;">Diferença</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
${lines ? `  <ul style="margin:10px 0 0;padding-left:18px;font-size:13px;">\n${lines}\n  </ul>` : ''}
${requestAdditionalSample ? '  <p style="margin:10px 0 0;font-size:13px;">Favor enviar uma amostra adicional.</p>' : ''}
</div>`.trim()
}

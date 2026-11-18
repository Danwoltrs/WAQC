import { escapeHtml } from '@/lib/html'
import { COPY } from './copy'
import type { Lang, SellerRequests } from './types'

/**
 * The per-sample request lines under an approved PSS: send 1 sample to the
 * buyer (with the address) and inform the stuffing date/time/place.
 * Null when neither is requested.
 */
export function buildRequestLines(req: SellerRequests, lang: Lang): { html: string; text: string } | null {
  const copy = COPY[lang]
  const htmlParts: string[] = []
  const textParts: string[] = []

  const b = req.buyerSample
  if (b) {
    const head = copy.buyerSampleLine(b.companyName)
    const tail: string[] = [...b.lines]
    if (b.country) tail.push(b.country)
    const attnBits = [b.attention ? `ATTN ${b.attention}` : null, b.phone ? `Tel: ${b.phone}` : null].filter(
      (x): x is string => !!x,
    )
    if (attnBits.length) tail.push(attnBits.join(' · '))
    const instructions = b.instructions?.trim() || null

    textParts.push([head, ...tail, ...(instructions ? [instructions] : [])].join('\n'))
    htmlParts.push(
      `<p style="margin:10px 0 0;font-size:13px;"><strong>${escapeHtml(head)}</strong>` +
        tail.map((l) => `<br/>${escapeHtml(l)}`).join('') +
        (instructions ? `<br/><span style="color:#c0392b;">${escapeHtml(instructions)}</span>` : '') +
        '</p>',
    )
  }

  if (req.stuffing) {
    textParts.push(copy.stuffingLine)
    htmlParts.push(`<p style="margin:10px 0 0;font-size:13px;">${escapeHtml(copy.stuffingLine)}</p>`)
  }

  if (htmlParts.length === 0) return null
  return { html: htmlParts.join('\n'), text: textParts.join('\n') }
}

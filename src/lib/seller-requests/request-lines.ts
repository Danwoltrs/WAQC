import { escapeHtml } from '@/lib/html'
import { COPY } from './copy'
import type { BuyerSampleDestination, Lang, SellerRequests } from './types'

/** A sample line: the bold ask, then the address, contact and the instructions in red. */
function sampleLine(head: string, d: BuyerSampleDestination): { html: string; text: string } {
  const tail: string[] = [...d.lines]
  if (d.country) tail.push(d.country)
  const attnBits = [d.attention ? `ATTN ${d.attention}` : null, d.phone ? `Tel: ${d.phone}` : null].filter(
    (x): x is string => !!x,
  )
  if (attnBits.length) tail.push(attnBits.join(' · '))
  const instructions = d.instructions?.trim() || null
  return {
    text: [head, ...tail, ...(instructions ? [instructions] : [])].join('\n'),
    html:
      `<p style="margin:10px 0 0;font-size:13px;"><strong>${escapeHtml(head)}</strong>` +
      tail.map((l) => `<br/>${escapeHtml(l)}`).join('') +
      (instructions ? `<br/><span style="color:#c0392b;">${escapeHtml(instructions)}</span>` : '') +
      '</p>',
  }
}

const plainLine = (line: string) => ({
  text: line,
  html: `<p style="margin:10px 0 0;font-size:13px;">${escapeHtml(line)}</p>`,
})

/**
 * The per-sample request lines under an approved PSS, in this order: 1 sample
 * to the buyer, 1 sample to the final client (our pre-approval, or for their
 * final approval), an additional sample to our lab, one shipment sample of each
 * container, and the stuffing date/time/place. Null when nothing is requested.
 * A final-client tick still waiting for its address prints nothing.
 */
export function buildRequestLines(req: SellerRequests, lang: Lang): { html: string; text: string } | null {
  const copy = COPY[lang]
  const parts: Array<{ html: string; text: string }> = []

  if (req.buyerSample) parts.push(sampleLine(copy.buyerSampleLine(req.buyerSample.companyName), req.buyerSample))
  const f = req.finalClientSample
  if (f?.destination) {
    const name = f.destination.companyName
    const head = f.purpose === 'final_approval' ? copy.finalApprovalLine(name) : copy.buyerSampleLine(name)
    parts.push(sampleLine(head, f.destination))
  }
  if (req.additionalSample) parts.push(plainLine(copy.additionalSampleLine))
  if (req.ssPerContainer) parts.push(plainLine(copy.ssPerContainerLine))
  if (req.stuffing) parts.push(plainLine(copy.stuffingLine))

  if (parts.length === 0) return null
  return { html: parts.map((p) => p.html).join('\n'), text: parts.map((p) => p.text).join('\n') }
}

import type { CertificateView } from './types'

/**
 * What is in the tin. Mirrors the printed sleeve label so the scanner can
 * confirm this certificate belongs to the sample in their hand — the whole
 * reason it sits directly under the verdict rather than in the detail section.
 *
 * A field with no value is omitted; an empty labelled cell reads as missing
 * data rather than "not applicable".
 */
export function LotIdentity({ view }: { view: CertificateView }) {
  const cells: Array<{ k: string; v: string }> = []
  // The container leads: the certificate number and contract sit in the verdict
  // block above, and this is the next thing a scanner matches against the tin
  // in their hand. Omitted when it is already the headline (no certificate
  // number), so the same value is never printed twice.
  if (view.lotReference && view.certificateNumber) {
    cells.push({ k: view.lotReference.label, v: view.lotReference.value })
  }
  if (view.exporter) cells.push({ k: 'Exporter', v: view.exporter })
  if (view.qualityName) cells.push({ k: 'Quality', v: view.qualityName })
  // The bag type is quantity information — "440 bags · 26.4 MT · 60 kg jute
  // bag" — and pairing it with the date only ever made the date harder to read.
  const quantity = [view.quantity, view.bagType].filter(Boolean).join(' · ')
  if (quantity) cells.push({ k: 'Quantity', v: quantity })
  if (view.origin) cells.push({ k: 'Origin', v: view.origin })
  // Six cells, two columns, three rows: the date sits beside Origin rather than
  // spanning its own full-width row underneath them.
  if (view.certifiedDate) cells.push({ k: 'Certified', v: view.certifiedDate })

  if (cells.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-x-[10px] gap-y-3 px-4 py-[14px] bg-[#333331] border-y border-[#3f3f3c]">
      {cells.map(cell => (
        <div key={cell.k} className="min-w-0">
          <div className="text-[10.5px] tracking-[0.09em] uppercase text-[#7c7a73] mb-0.5">
            {cell.k}
          </div>
          <div className="text-[15px] font-semibold text-[#f2efe6] break-words">{cell.v}</div>
        </div>
      ))}
    </div>
  )
}

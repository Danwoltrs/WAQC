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
  if (view.exporter) cells.push({ k: 'Exporter', v: view.exporter })
  if (view.qualityName) cells.push({ k: 'Quality', v: view.qualityName })
  if (view.quantity) cells.push({ k: 'Quantity', v: view.quantity })
  if (view.origin) cells.push({ k: 'Origin', v: view.origin })

  const footParts = [view.certifiedDate, view.bagType].filter(Boolean) as string[]
  if (cells.length === 0 && footParts.length === 0) return null

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
      {footParts.length > 0 && (
        <div className="col-span-2">
          <div className="text-[10.5px] tracking-[0.09em] uppercase text-[#7c7a73] mb-0.5">
            Certified
          </div>
          <div className="text-[13.5px] font-medium text-[#a8a69d]">
            {footParts.join(' · ')}
          </div>
        </div>
      )}
    </div>
  )
}

import { approvalBandColor, pctText } from './approval-band'

export interface OriginCard { origin: string; qualities: number; certificates: number; approvedPct: number | null }

export function OriginSummary({ origins }: { origins: OriginCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {origins.map(o => (
        <section key={o.origin} data-testid="origin-card" className="rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] p-6">
          <h2 className="text-sm font-semibold">{o.origin}</h2>
          <div className="mt-3 text-2xl font-semibold" style={{ color: approvalBandColor(o.approvedPct) }}>{pctText(o.approvedPct)}</div>
          <div className="text-xs text-black/40">approved</div>
          <div className="mt-3 text-xs text-black/40">
            {o.qualities} {o.qualities === 1 ? 'quality' : 'qualities'} · {o.certificates} {o.certificates === 1 ? 'certificate' : 'certificates'}
          </div>
        </section>
      ))}
    </div>
  )
}

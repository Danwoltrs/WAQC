'use client'

import { bandColor, DEFAULT_SANKEY_PALETTE } from '@/lib/charts/sankey-layout'
import type { FlowModel } from '@/lib/portal/overview-model'
import type { FlowStep } from '@/lib/portal/portal-facts'

type RankingFlow = Extract<FlowModel, { kind: 'ranking' }>

export const STEP_LABEL: Record<FlowStep, string> = {
  origin: 'Origin', lab: 'Lab', seller: 'Seller', importer: 'Importer', roaster: 'Roaster',
}

export function PortalRanking({ flow, onSelect }: {
  flow: RankingFlow
  onSelect: (step: FlowStep, value: string) => void
}) {
  const th = 'px-1.5 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-black/40 border-b-[0.5px] border-black/10'
  const td = 'px-1.5 py-[9px] border-b-[0.5px] border-black/10'
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className={`${th} text-left w-7`}>#</th>
          <th className={`${th} text-left`}>{STEP_LABEL[flow.step]}</th>
          <th className={`${th} text-right`}>Certificates</th>
          <th className={`${th} text-right`}>Rejected</th>
          <th className={`${th} text-right`}>Approval rate</th>
        </tr>
      </thead>
      <tbody>
        {flow.rows.map((r, i) => (
          <tr key={r.value}>
            <td className={`${td} text-black/40`}>{i + 1}</td>
            <td className={`${td} font-medium`}>
              <button type="button" className="cursor-pointer text-left hover:text-[#556b2f]"
                onClick={() => onSelect(flow.step, r.value)}>{r.label}</button>
              {r.fewLots && <span className="ml-1.5 text-[11px] font-normal text-black/40">few lots</span>}
            </td>
            <td className={`${td} text-right tabular-nums`}>{r.certificates}</td>
            <td className={`${td} text-right tabular-nums ${r.rejected > 0 ? 'font-medium text-[#ef4444]' : ''}`}>
              {r.rejected > 0 ? r.rejected : '—'}
            </td>
            <td className={`${td} text-right tabular-nums`}>
              <div className="flex items-center justify-end gap-2">
                <div className="h-1.5 w-[90px] bg-black/[0.06]">
                  <span className="block h-full"
                    style={{ width: `${r.approvalRate}%`, background: bandColor(r.approvalRate, DEFAULT_SANKEY_PALETTE) }} />
                </div>
                {Math.round(r.approvalRate)}%
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

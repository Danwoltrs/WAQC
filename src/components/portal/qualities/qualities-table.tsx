import Link from 'next/link'
import { format } from 'date-fns'
import type { QualityListRow } from '@/lib/portal/portal-qualities'
import { withCarried } from '@/lib/portal/portal-fetch'
import { approvalBandColor, pctText } from './approval-band'

const th = 'px-1.5 py-2 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-black/40 border-b-[0.5px] border-black/10'
const td = 'px-1.5 py-[9px] border-b-[0.5px] border-black/10'

/** 'YYYY-MM-DD' is a calendar date: build it as a local date so no timezone shifts it. */
export function formatCalendarDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return format(new Date(y, m - 1, d), 'd MMM yyyy')
}

export function QualitiesTable({ qualities, companyId, carried }: { qualities: QualityListRow[]; companyId: string; carried: string }) {
  const origins = Array.from(new Set(qualities.map(q => q.origin)))
  return (
    <section className="overflow-x-auto rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] px-6 py-3">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>{['Quality', 'Version', 'Certificates', 'PSS approved', 'SS approved'].map(h => <th key={h} className={th}>{h}</th>)}</tr>
        </thead>
        {origins.map(origin => (
          <tbody key={origin}>
            <tr><th colSpan={5} scope="colgroup" className="px-1.5 pb-1 pt-4 text-left text-xs font-semibold">{origin}</th></tr>
            {qualities.filter(q => q.origin === origin).map(q => (
              <tr key={q.id} className="hover:bg-black/[0.03]">
                <td className={`${td} font-semibold`}>
                  <Link href={withCarried(`/portal/qualities/${q.id}`, companyId, carried)} className="hover:underline">{q.name}</Link>
                </td>
                <td className={td}>
                  {q.versionNo == null ? '-' : `v${q.versionNo}`}
                  {q.scheduled && (
                    <span className="ml-2 rounded-[4px] bg-black/5 px-1.5 py-0.5 text-xs">
                      {`v${q.scheduled.versionNo} from ${formatCalendarDate(q.scheduled.effectiveFrom)}`}
                    </span>
                  )}
                </td>
                <td className={td}>{q.certificates}</td>
                <td className={td} style={{ color: approvalBandColor(q.pssApprovedPct) }}>{pctText(q.pssApprovedPct)}</td>
                <td className={td} style={{ color: approvalBandColor(q.ssApprovedPct) }}>{pctText(q.ssApprovedPct)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  )
}

import Link from 'next/link'
import type { LatestCert } from '@/lib/portal/overview-model'

const th = 'px-1.5 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-black/40 border-b-[0.5px] border-black/10'
const td = 'px-1.5 py-[9px] border-b-[0.5px] border-black/10'

/** "22 Oct", on the São Paulo calendar like the period boundaries. */
function issued(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo' })
}

export function LatestCertificatesCard({ rows, allHref, emptyText }: { rows: LatestCert[]; allHref: string; emptyText: string }) {
  return (
    <section className="rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] px-6 py-5">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold">Latest certificates</h2>
        <Link href={allHref} className="text-xs text-[#556b2f]">All certificates</Link>
      </div>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Certificate</th>
            <th className={`${th} text-left`}>Origin</th>
            <th className={`${th} text-left`}>Type</th>
            <th className={`${th} text-left`}>Seller</th>
            <th className={`${th} text-right`}>Issued</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.id}>
              <td className={`${td} font-medium`}>{c.certificateNumber ?? c.contractRef ?? '—'}</td>
              <td className={td}>{c.origin}</td>
              <td className={td}>{c.type.toUpperCase()}</td>
              <td className={td}>{c.seller}</td>
              <td className={`${td} text-right tabular-nums`}>{issued(c.issuedAt)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="px-1.5 py-[9px] text-[11px] text-black/40">{emptyText}</td></tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

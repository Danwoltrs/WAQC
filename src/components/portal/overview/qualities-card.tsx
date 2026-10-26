import type { QualityRow } from '@/lib/portal/overview-model'

const th = 'px-1.5 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-black/40 border-b-[0.5px] border-black/10'
const td = 'px-1.5 py-[9px] border-b-[0.5px] border-black/10'

function Rate({ k, n }: { k: number; n: number }) {
  if (n === 0) return <span className="text-black/40">—</span>
  const p = Math.round((k / n) * 100)
  return (
    <>
      <span className={p < 70 ? 'font-medium text-[#ef4444]' : ''}>{p}%</span>{' '}
      <span className="text-[11px] text-black/40">{k} / {n}</span>
    </>
  )
}

export function QualitiesCard({ rows }: { rows: QualityRow[] }) {
  return (
    <section className="rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] px-6 py-5">
      <h2 className="text-sm font-semibold">Qualities</h2>
      <p className="mb-3.5 mt-0.5 text-xs text-black/40">Every quality you buy, all origins</p>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Quality</th>
            <th className={`${th} text-left`}>Origin</th>
            <th className={`${th} text-left`}>Lab</th>
            <th className={`${th} text-right`}>Certificates</th>
            <th className={`${th} text-right`}>PSS approved</th>
            <th className={`${th} text-right`}>SS approved</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(q => (
            <tr key={`${q.quality}|${q.origin}|${q.lab}`}>
              <td className={td}>{q.quality}</td>
              <td className={td}>{q.origin}</td>
              <td className={`${td} text-xs text-black/60`}>{q.lab}</td>
              <td className={`${td} text-right tabular-nums`}>{q.certificates}</td>
              <td className={`${td} text-right tabular-nums`}><Rate k={q.pssApproved} n={q.pssTotal} /></td>
              <td className={`${td} text-right tabular-nums`}><Rate k={q.ssApproved} n={q.ssTotal} /></td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-1.5 py-[9px] text-[11px] text-black/40">No qualities for this selection</td></tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

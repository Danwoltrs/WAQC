import { verdictFailures } from '@/lib/certificate-checklist'
import type { CertificateView } from './types'

/**
 * The answer to the only question a scanner has: is this lot approved, and if
 * not, why not.
 *
 * Failure lines come from the same rows the checklist renders, so the page
 * cannot name a reason the checklist omits. Total defects is suppressed when
 * primary or secondary already failed — see verdictFailures. On approval there
 * are no lines at all: no green mirror of the failure block, no "0 issues
 * found". The badge says everything.
 */
export function Verdict({ view }: { view: CertificateView }) {
  const rejected = view.status === 'REJECTED'
  const failures = verdictFailures(view.rows)

  return (
    <div
      className={`px-4 pt-[18px] pb-[14px] ${
        rejected ? 'bg-gradient-to-b from-[#d9534f1a] to-transparent' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] tracking-[0.12em] uppercase text-[#7c7a73] font-semibold mb-[3px]">
            {view.eyebrow}
          </div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#f2efe6] m-0 break-words">
            {view.reference}
          </h1>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-[0.06em] whitespace-nowrap border ${
            rejected
              ? 'bg-[#43221f] text-[#d9534f] border-[#d9534f59]'
              : 'bg-[#26361f] text-[#5fae63] border-[#5fae6359]'
          }`}
        >
          <span aria-hidden="true">{rejected ? '✕' : '✓'}</span>
          {view.status}
        </span>
      </div>

      {rejected && failures.length > 0 && (
        <div className="mt-3 border-l-[3px] border-[#d9534f] pl-[11px]">
          {failures.map(row => (
            <div key={row.key} className="flex items-baseline justify-between gap-3 mt-[5px] first:mt-0">
              <span className="text-sm text-[#f2efe6]">{row.label}</span>
              <span className="text-sm tabular-nums text-[#a8a69d] whitespace-nowrap">
                <b className="text-[15px] font-bold text-[#d9534f]">{row.actual}</b>
                {row.limit && (
                  <>
                    {' '}
                    {row.operator === '<' ? '<' : row.operator === '>' ? '>' : '≠'}{' '}
                    <span className="text-[#7c7a73]">{row.limit}</span>
                  </>
                )}
              </span>
            </div>
          ))}
          {view.qualityName && (
            <div className="text-[#7c7a73] text-[12.5px] mt-1.5">
              Everything else within {view.qualityName} spec.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

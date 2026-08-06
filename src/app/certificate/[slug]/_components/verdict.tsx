import { resolveVerdictReasons } from '@/lib/certificate-checklist'
import type { CertificateView } from './types'

/**
 * The answer to the only question a scanner has: is this lot approved, and if
 * not, why not.
 *
 * Reason lines come from `resolveVerdictReasons`, in priority order: live
 * failing checklist rows first (so the page never names a reason the
 * checklist omits), then the violations recorded at certification, then a
 * staff override's comment, then a bare acknowledgement. A rejected
 * certificate always shows SOMETHING here — never a bare badge. On approval
 * there are no lines at all: no green mirror of the failure block, no "0
 * issues found". The badge says everything.
 */
export function Verdict({ view }: { view: CertificateView }) {
  const rejected = view.status === 'REJECTED'
  const reasons = rejected
    ? resolveVerdictReasons(view.rows, view.complianceViolations, view.overrideComment)
    : []

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

      {rejected && reasons.length > 0 && (
        <div className="mt-3 border-l-[3px] border-[#d9534f] pl-[11px]">
          {reasons.map((reason, i) =>
            reason.kind === 'row' ? (
              <div
                key={reason.row.key}
                className="flex items-baseline justify-between gap-3 mt-[5px] first:mt-0"
              >
                <span className="text-sm text-[#f2efe6]">{reason.row.label}</span>
                <span className="text-sm tabular-nums text-[#a8a69d] whitespace-nowrap">
                  <b className="text-[15px] font-bold text-[#d9534f]">{reason.row.actual}</b>
                  {reason.row.limit ? (
                    <>
                      {' '}
                      {reason.row.operator === '<' ? '<' : reason.row.operator === '>' ? '>' : '≠'}{' '}
                      <span className="text-[#7c7a73]">{reason.row.limit}</span>
                    </>
                  ) : reason.row.sublabel ? (
                    // No limit to state (e.g. a grouped row, or a default-reject
                    // rule with no configured tolerance) — fall back to the
                    // sublabel so the line still says something, e.g. "3 of 7
                    // inside target range" rather than just "Fail".
                    <span className="text-[#7c7a73]"> {reason.row.sublabel}</span>
                  ) : null}
                </span>
              </div>
            ) : (
              <div
                key={`reason-text-${i}`}
                className="text-sm text-[#f2efe6] mt-[5px] first:mt-0"
              >
                {reason.text}
              </div>
            ),
          )}
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

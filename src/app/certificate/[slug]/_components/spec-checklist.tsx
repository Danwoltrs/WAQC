import type { CertificateView } from './types'

/**
 * The decision surface: every criterion this lot was judged on.
 *
 * Passing values are muted rather than green. Green on every row makes a
 * rejected certificate read as fine at a glance, which is the failure mode this
 * page exists to fix. A criterion with a value but no configured threshold gets
 * no icon at all rather than an invented limit.
 */
export function SpecChecklist({ view }: { view: CertificateView }) {
  if (view.rows.length === 0) return null

  return (
    <>
      <div className="text-[11px] tracking-[0.1em] uppercase text-[#7c7a73] font-semibold mx-4 mt-[22px] mb-2">
        {view.qualityName ? `Against ${view.qualityName} spec` : 'Against spec'}
      </div>
      <div className="bg-[#333331] border-y border-[#3f3f3c]">
        {view.rows.map(row => (
          <div
            key={row.key}
            className="flex items-center gap-[11px] px-4 py-[13px] border-b border-[#3f3f3c] last:border-b-0"
          >
            {row.hasThreshold ? (
              <div
                className={`flex-none w-5 h-5 rounded-full grid place-items-center text-xs font-bold ${
                  row.passed ? 'bg-[#5fae6326] text-[#5fae63]' : 'bg-[#d9534f26] text-[#d9534f]'
                }`}
              >
                <span aria-hidden="true">{row.passed ? '✓' : '✕'}</span>
                <span className="sr-only">{row.passed ? 'Passed' : 'Failed'}</span>
              </div>
            ) : (
              <div className="flex-none w-5 h-5" aria-hidden="true" />
            )}

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#f2efe6]">{row.label}</div>
              {row.sublabel && (
                <div className="text-xs text-[#7c7a73] mt-px">{row.sublabel}</div>
              )}
            </div>

            <div
              className={`text-sm font-bold tabular-nums whitespace-nowrap ${
                row.hasThreshold && !row.passed ? 'text-[#d9534f]' : 'text-[#a8a69d]'
              }`}
            >
              {row.actual}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

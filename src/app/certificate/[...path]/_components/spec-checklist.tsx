import { partitionDefectRows } from '@/lib/certificate-checklist'
import type { CertificateView } from './types'

/** Shorter headings for the three-column block — "Primary defects" over a
 *  third of a phone's width wraps to two lines for no gain. */
const DEFECT_HEADINGS: Record<string, string> = {
  primary_defects: 'Primary',
  secondary_defects: 'Secondary',
  total_defects: 'Total',
}

/**
 * The decision surface: every criterion this lot was judged on.
 *
 * Passing values are muted rather than green. Green on every row makes a
 * rejected certificate read as fine at a glance, which is the failure mode this
 * page exists to fix. A criterion with a value but no configured threshold gets
 * no icon at all rather than an invented limit.
 *
 * Defects lead, side by side: primary and secondary are the two components and
 * total is the sum they make, which is invisible when they are stacked as three
 * unrelated full-width rows.
 */
export function SpecChecklist({ view }: { view: CertificateView }) {
  if (view.rows.length === 0) return null
  const { defects, rest } = partitionDefectRows(view.rows)

  return (
    <>
      <div className="text-[11px] tracking-[0.1em] uppercase text-[#7c7a73] font-semibold mx-4 mt-[22px] mb-2">
        {view.qualityName ? `Against ${view.qualityName} spec` : 'Against spec'}
      </div>
      <div className="bg-[#333331] border-y border-[#3f3f3c]">
        {defects.length > 0 && (
          <div
            className="grid px-4 py-[13px] border-b border-[#3f3f3c]"
            style={{ gridTemplateColumns: `repeat(${defects.length}, minmax(0, 1fr))` }}
          >
            {defects.map(row => (
              <div
                key={row.key}
                className="min-w-0 px-2 first:pl-0 last:pr-0 border-l border-[#3f3f3c] first:border-l-0"
              >
                <div className="text-[10.5px] tracking-[0.08em] uppercase text-[#7c7a73] mb-1">
                  {DEFECT_HEADINGS[row.key] ?? row.label}
                </div>
                <div className="flex items-center gap-1.5">
                  {row.hasThreshold && (
                    <span
                      className={`flex-none w-4 h-4 rounded-full grid place-items-center text-[10px] font-bold ${
                        row.passed ? 'bg-[#5fae6326] text-[#5fae63]' : 'bg-[#d9534f26] text-[#d9534f]'
                      }`}
                    >
                      <span aria-hidden="true">{row.passed ? '✓' : '✕'}</span>
                      <span className="sr-only">{row.passed ? 'Passed' : 'Failed'}</span>
                    </span>
                  )}
                  <span
                    className={`text-[17px] font-bold tabular-nums ${
                      row.hasThreshold && !row.passed ? 'text-[#d9534f]' : 'text-[#f2efe6]'
                    }`}
                  >
                    {row.actual}
                  </span>
                </div>
                {/* Already reads "21 max" — formatLimit carries the word. */}
                {row.limit && (
                  <div className="text-[11px] text-[#7c7a73] mt-0.5">{row.limit}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {rest.map(row => (
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
              {/* Each named taint and fault behind the count — "1 cup Hard
                  (Riado) at intensity 2 of 5". A count alone tells a buyer
                  something is wrong but not what. */}
              {row.details && row.details.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {row.details.map(detail => (
                    <li
                      key={detail}
                      className="text-xs text-[#a8a69d] pl-2 border-l border-[#4a4a47]"
                    >
                      {detail}
                    </li>
                  ))}
                </ul>
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

import type { CertificateView, AttributeRail } from './types'

/** Where a score sits relative to its band: inside, near an edge, or outside. */
function railState(rail: AttributeRail): 'in' | 'edge' | 'out' {
  const { score, min, max } = rail
  if (min !== null && score < min) return 'out'
  if (max !== null && score > max) return 'out'
  if (min !== null && score - min <= 0.25) return 'edge'
  if (max !== null && max - score <= 0.25) return 'edge'
  return 'in'
}

/** Clamp a value onto the rail as a 0–100 percentage of its scale. */
function railPercent(value: number, rail: AttributeRail): number {
  const span = rail.scaleMax - rail.scaleMin
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, ((value - rail.scaleMin) / span) * 100))
}

function Summary({ children }: { children: React.ReactNode }) {
  return (
    <summary className="list-none cursor-pointer px-4 py-[14px] flex items-center justify-between text-[13.5px] font-semibold text-[#f2efe6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe6] focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
      {children}
      <span className="text-[#7c7a73] text-xs" aria-hidden="true">
        &#8964;
      </span>
    </summary>
  )
}

/**
 * Screen distribution and the cupping profile.
 *
 * The radar chart this replaces clipped off-screen on a phone and coloured
 * every attribute the same olive whether it passed or failed. Seven rails read
 * in one downward glance, and a score outside its band is visibly outside it.
 */
export function CertificateDetail({ view }: { view: CertificateView }) {
  const hasScreens = view.screens.length > 0
  const hasAttributes = view.attributes.length > 0
  if (!hasScreens && !hasAttributes) return null

  return (
    <>
      <div className="text-[11px] tracking-[0.1em] uppercase text-[#7c7a73] font-semibold mx-4 mt-[22px] mb-2">
        Detail
      </div>

      {hasScreens && (
        <details className="bg-[#333331] border-t border-b border-[#3f3f3c]">
          <Summary>Screen distribution</Summary>
          <div className="px-4 pt-1 pb-[18px] border-t border-[#3f3f3c]">
            {view.screens.map(screen => (
              <div key={screen.label} className="flex items-center gap-2.5 mt-[11px]">
                <div className="w-[52px] flex-none text-[12.5px] text-[#a8a69d]">
                  {screen.label}
                </div>
                <div className="flex-1 h-2 rounded bg-[#3b3b39] overflow-hidden">
                  <div
                    className={`h-full rounded ${screen.belowFloor ? 'bg-[#4e5a2b]' : 'bg-[#6d7f37]'}`}
                    style={{ width: `${Math.min(100, Math.max(0, screen.percent))}%` }}
                  />
                </div>
                <div className="w-[46px] text-right text-[12.5px] tabular-nums text-[#f2efe6]">
                  {screen.percent.toFixed(1)}%
                </div>
              </div>
            ))}
            {view.screenSpecNote && (
              <div className="mt-[13px] pt-[11px] border-t border-[#3f3f3c] text-xs text-[#7c7a73]">
                {view.screenSpecNote}
              </div>
            )}
          </div>
        </details>
      )}

      {hasAttributes && (
        <details open className="bg-[#333331] border-b border-[#3f3f3c]">
          <Summary>Cupping profile</Summary>
          <div className="px-4 pt-1 pb-[18px] border-t border-[#3f3f3c]">
            {view.attributes.map((rail, index) => {
              const state = railState(rail)
              const bandStart = rail.min !== null ? railPercent(rail.min, rail) : 0
              const bandEnd = rail.max !== null ? railPercent(rail.max, rail) : 100
              const hasBand = rail.min !== null || rail.max !== null

              return (
                <div key={rail.attribute} className="mt-[15px] first:mt-1.5">
                  <div className="flex justify-between items-baseline mb-1.5">
                    <div className="min-w-0">
                      <span className="text-[13.5px] text-[#f2efe6]">{rail.attribute}</span>
                      {hasBand && (
                        <span className="text-[11px] text-[#7c7a73] ml-1.5">
                          {rail.min !== null && rail.max !== null
                            ? `${rail.min.toFixed(1)}–${rail.max.toFixed(1)}`
                            : rail.min !== null
                              ? `min ${rail.min.toFixed(1)}`
                              : `max ${rail.max?.toFixed(1)}`}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[13.5px] font-bold tabular-nums ${
                        state === 'out'
                          ? 'text-[#d9534f]'
                          : state === 'edge'
                            ? 'text-[#c98a2e]'
                            : 'text-[#a8a69d]'
                      }`}
                    >
                      {rail.score.toFixed(2)}
                      {state === 'out' && <span className="sr-only"> — outside target range</span>}
                    </div>
                  </div>

                  <div className="relative h-[22px]">
                    <div className="absolute left-0 right-0 top-[9px] h-1 rounded-sm bg-[#3b3b39]" />
                    {hasBand && (
                      <div
                        className="absolute top-[9px] h-1 rounded-sm bg-[#4e5a2b]"
                        style={{ left: `${bandStart}%`, width: `${Math.max(0, bandEnd - bandStart)}%` }}
                      />
                    )}
                    <div
                      className={`absolute top-[3px] w-[3px] h-4 rounded-sm -translate-x-[1.5px] ${
                        state === 'out'
                          ? 'bg-[#d9534f]'
                          : state === 'edge'
                            ? 'bg-[#c98a2e]'
                            : 'bg-[#f2efe6]'
                      }`}
                      style={{ left: `${railPercent(rail.score, rail)}%` }}
                    />
                  </div>

                  {index === view.attributes.length - 1 && (
                    <div className="flex justify-between text-[10px] text-[#7c7a73] mt-px">
                      <span>{rail.scaleMin}</span>
                      <span>{(rail.scaleMin + rail.scaleMax) / 2}</span>
                      <span>{rail.scaleMax}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      )}
    </>
  )
}

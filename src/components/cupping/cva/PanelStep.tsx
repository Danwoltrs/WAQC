'use client'

import { useEffect, useState } from 'react'

interface PanelCupper {
  cupper_id: string
  full_name: string
  cva_score: number | null
  is_master: boolean
  is_you: boolean
  complete: boolean
  sections: Record<string, unknown> | null
}

interface PanelData {
  blind: boolean
  cuppers: PanelCupper[]
  guests: { id: string; name: string }[]
  recorded: number
  mean: number | null
  spread: number
  threshold: number
  flagged: boolean
  outliers: string[]
  authoritative_cupper_id: string | null
}

interface Props {
  sessionId: string
  sampleId: string
  reference: string
  /**
   * Cuppers dropped from the panel average, and whose single card is being
   * taken instead. Owned by CvaJourney because Certify sends them; the panel
   * is where they are chosen. Absent = read-only panel (unchanged behaviour).
   */
  excludedCupperIds?: ReadonlySet<string>
  onToggleExcluded?: (cupperId: string) => void
  sourceCupperId?: string | null
  onSelectSource?: (cupperId: string | null) => void
  canAdjust?: boolean
}

const fmt = (n: number | null) => (n == null ? '—' : Number(n.toFixed(2)).toString())

/**
 * Everybody's score for this lot, once you have finished your own.
 *
 * The blind rule is enforced server-side; this component only renders what the
 * route was willing to send. Do not add a client-side reveal.
 */
export function PanelStep({
  sessionId,
  sampleId,
  reference,
  excludedCupperIds,
  onToggleExcluded,
  sourceCupperId = null,
  onSelectSource,
  canAdjust = false,
}: Props) {
  const [data, setData] = useState<PanelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/cupping/cva/panel?session_id=${encodeURIComponent(sessionId)}&sample_id=${encodeURIComponent(sampleId)}`,
        )
        const body = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(body?.error ?? 'Could not load the panel'); return }
        setData(body as PanelData)
      } catch {
        if (!cancelled) setError('Could not load the panel')
      }
    })()
    return () => { cancelled = true }
  }, [sessionId, sampleId])

  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading the panel…</p>
  }

  if (data.blind) {
    return (
      <div className="flex w-full max-w-[780px] flex-col items-center gap-3 text-center">
        <div className="text-[clamp(48px,12vw,96px)] font-extrabold leading-none tracking-tighter text-muted-foreground">—</div>
        <p className="text-sm text-muted-foreground">
          Rate all eight sections to see how the rest of the panel scored {reference}.
        </p>
        <p className="text-xs text-muted-foreground">
          Scores stay hidden until yours is complete, so nobody anchors to anybody else.
        </p>
      </div>
    )
  }

  const ordered = [...data.cuppers].sort((a, b) => (b.cva_score ?? -1) - (a.cva_score ?? -1))

  const isExcluded = (id: string) => !!excludedCupperIds?.has(id)
  const scored = ordered.filter((c) => c.complete && c.cva_score != null)
  const kept = scored.filter((c) => !isExcluded(c.cupper_id))
  // What Certify will actually judge, shown here so the adjustment is visible
  // before it is committed. Mirrors averageCvaScore on the server: the mean of
  // the kept cards, rounded to 0.25 (SCA-104 §5.5).
  const agreed =
    sourceCupperId
      ? (kept.find((c) => c.cupper_id === sourceCupperId)?.cva_score ?? null)
      : kept.length
        ? Math.round((kept.reduce((a, c) => a + (c.cva_score ?? 0), 0) / kept.length) * 4) / 4
        : null

  return (
    <div className="flex w-full max-w-[780px] flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Panel · {ordered.length} cupper{ordered.length === 1 ? '' : 's'}</h2>
        <span className="text-xs text-muted-foreground">{reference}</span>
      </div>

      <ul className="flex flex-col gap-2">
        {ordered.map((c) => {
          const excluded = isExcluded(c.cupper_id)
          const isSource = sourceCupperId === c.cupper_id
          const adjustable = canAdjust && c.complete && c.cva_score != null
          return (
          <li
            key={c.cupper_id}
            className={`flex items-center justify-between rounded-[14px] border px-4 py-3 ${
              isSource ? 'border-[#556b2f]' : 'border-border'
            } ${excluded ? 'opacity-45' : ''}`}
          >
            <span className="flex items-center gap-2 text-sm">
              <span className={`${c.is_you ? 'font-semibold' : ''} ${excluded ? 'line-through' : ''}`}>
                {c.full_name}
              </span>
              {c.is_you && <span className="text-xs text-muted-foreground">you</span>}
              {c.is_master && <span className="text-xs text-muted-foreground">authoritative</span>}
              {isSource && <span className="text-xs text-[#556b2f]">this card decides</span>}
              {data.outliers.includes(c.cupper_id) && !excluded && (
                <span className="text-xs text-muted-foreground">furthest from the mean</span>
              )}
            </span>
            <span className="flex items-center gap-3">
              {adjustable && (
                <>
                  <button
                    type="button"
                    onClick={() => onSelectSource?.(isSource ? null : c.cupper_id)}
                    disabled={excluded}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-40 disabled:no-underline"
                    title={
                      isSource
                        ? 'Go back to the panel average'
                        : `Certify on ${c.full_name}'s score alone`
                    }
                  >
                    {isSource ? 'use average' : 'use this'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleExcluded?.(c.cupper_id)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    title={
                      excluded
                        ? `Count ${c.full_name} towards the score again`
                        : `Drop ${c.full_name} from the score`
                    }
                  >
                    {excluded ? 'include' : 'exclude'}
                  </button>
                </>
              )}
              <span className="text-sm font-semibold tabular-nums">
                {c.complete ? fmt(c.cva_score) : 'in progress'}
              </span>
            </span>
          </li>
          )
        })}
        {data.guests.map((g) => (
          <li
            key={g.id}
            className="flex items-center justify-between rounded-[14px] border border-dashed border-border px-4 py-3"
          >
            <span className="text-sm">
              {g.name} <span className="text-xs text-muted-foreground">guest</span>
            </span>
            <span className="text-xs text-muted-foreground">not recorded — see the paper card</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>mean {fmt(data.mean)}</span>
        <span>spread {fmt(data.spread)}</span>
        <span>threshold {fmt(data.threshold)}</span>
      </div>

      {canAdjust && (
        <p className="text-sm">
          Certifying on{' '}
          <span className="font-semibold tabular-nums">{fmt(agreed)}</span>
          {sourceCupperId
            ? ' — one cupper’s card, chosen above.'
            : kept.length === scored.length
              ? ' — the average of the whole panel.'
              : ` — the average of ${kept.length} of ${scored.length} cards.`}
        </p>
      )}

      {data.flagged && (
        <p className="text-sm">
          This panel is wider than the {fmt(data.threshold)}-point threshold. Talk it through before certifying.
        </p>
      )}
    </div>
  )
}

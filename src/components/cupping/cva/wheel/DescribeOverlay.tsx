'use client'

// Full-screen "Describe the cup" overlay — 3 shared group tabs (layout from the
// journey prototype's wheelpanel, minus the Phase-3 voicebox). Always full-bleed:
// the wheel is the chromeless hero inside an edge-to-edge framed stage band,
// with the descriptors card floating bottom-center above it.

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { OLF_CAP, FORM_BOXES, addPickCapped, cataForPicks } from '@/lib/cva/flavor-wheel-data'
import { PALETTE } from './palette'
import type { CvaDescribe, DescribeGroup, WheelPick } from '@/types/cva'
import { FlavorWheel, COMPACT_MQ } from './FlavorWheel'
import { MainTastes } from './MainTastes'
import { MouthfeelCata } from './MouthfeelCata'

export interface DescribeSample { id: string; reference: string }

interface Props {
  open: boolean
  group: DescribeGroup
  onGroupChange: (g: DescribeGroup) => void
  describe: CvaDescribe
  onDescribe: (mutator: (d: CvaDescribe) => CvaDescribe) => void
  onClose: () => void
  /** The lots on the table. The strip is hidden unless there are at least two. */
  samples?: DescribeSample[]
  activeSampleId?: string
  onSampleChange?: (id: string) => void
}

const GROUPS: { key: DescribeGroup; label: string; sub: string }[] = [
  { key: 'aroma', label: 'Aroma', sub: 'Fragrance + Aroma (orthonasal)' },
  { key: 'flavor_aftertaste', label: 'Flavor & Aftertaste', sub: 'Retronasal' },
  { key: 'mouthfeel', label: 'Mouthfeel', sub: 'Texture & weight' },
]

const NOTE_KEY: Record<DescribeGroup, keyof CvaDescribe['notes']> = {
  aroma: 'fragrance_aroma',
  flavor_aftertaste: 'flavor_aftertaste',
  mouthfeel: 'mouthfeel',
}

/**
 * The 24 CATA boxes of the SCA-103 §8.2 form, laid out as the form prints them,
 * showing what the cupper's wheel picks have actually checked.
 *
 * READ-ONLY for now, and deliberately so. Every box does correspond to a wheel
 * node, so ticking one COULD add the matching pick — but un-ticking has no safe
 * meaning: "Berry" may be checked because the cupper picked Blueberry, and
 * clearing the box would have to silently delete that note. Making this an input
 * is a decision about what un-tick does, not a rendering change (Daniel
 * 2026-09-04: approved the checklist; the tap-to-check half is still open).
 */
function FormChecklist({ boxes, frees, picks }: { boxes: string[]; frees: string[]; picks: WheelPick[] }) {
  // Which written-in term came from which family, so §6.3.4 reads in place.
  const writtenBy = new Map<string, string[]>()
  for (const p of picks) {
    const leaf = p.path[p.path.length - 1]
    if (!frees.includes(leaf)) continue
    const head = p.path[0] === 'Spices' ? 'Spice' : p.path[0]
    writtenBy.set(head, [...(writtenBy.get(head) ?? []), leaf])
  }
  const Box = ({ name, big }: { name: string; big?: boolean }) => {
    const on = boxes.includes(name)
    return (
      <span
        role="checkbox"
        aria-checked={on}
        aria-readonly
        aria-label={name}
        className={`inline-flex items-center gap-1.5 ${big ? 'text-[13.5px] font-bold' : 'text-[11.5px] font-semibold'}`}
      >
        <span
          className={`grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border text-[11px] font-extrabold text-white ${on ? 'border-transparent' : 'border-border'}`}
          style={on ? { background: 'var(--cva-accent)' } : undefined}
          aria-hidden
        >
          {on ? '✓' : ''}
        </span>
        <span className={on ? 'text-foreground' : 'text-muted-foreground'}>{name}</span>
      </span>
    )
  }
  return (
    <div data-testid="form-checklist" className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-3 sm:px-6">
      <p className="mb-3 text-[11.5px] leading-relaxed text-muted-foreground">
        The 24 boxes of the SCA-103 §8.2 form.{' '}
        {boxes.length > 0
          ? `${boxes.length} ticked by your ${picks.length} wheel ${picks.length === 1 ? 'pick' : 'picks'}.`
          : 'Tap a family on the wheel, then the notes you find.'}
      </p>
      <div className="mx-auto flex max-w-xl flex-col">
        {FORM_BOXES.map((g) => {
          const written = writtenBy.get(g.head) ?? []
          const fam = PALETTE.get(g.head === 'Spice' ? 'Spices' : g.head)
          return (
            <div key={g.head} className="flex flex-col gap-1.5 border-b border-border py-2.5">
              <span className="flex items-center gap-2">
                <Box name={g.head} big />
                <span className="ml-auto h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: fam?.fill }} aria-hidden />
              </span>
              {g.subs.length > 0 && (
                <span className="flex flex-wrap gap-x-3 gap-y-1.5 pl-[27px]">
                  {g.subs.map((b) => <Box key={b} name={b} />)}
                </span>
              )}
              {written.length > 0 && (
                <span className="pl-[27px] text-[11px] font-semibold text-muted-foreground">
                  written in · {written.join(', ')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const DescribeOverlay = memo(function DescribeOverlay({ open, group, onGroupChange, describe, onDescribe, onClose, samples, activeSampleId, onSampleChange }: Props) {
  const [toast, setToast] = useState<string | null>(null)
  // The wheel is the instrument; the checklist is the form the wheel fills in.
  const [showList, setShowList] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Compact (phone/coarse-pointer) screens start with the descriptors tray
  // collapsed so the wheel gets the whole stage; it expands on tap. Desktop is
  // always open.
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(COMPACT_MQ)
    const update = () => setCompact(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])
  const [trayOpen, setTrayOpen] = useState(false)

  // The tray floats over the wheel's lower edge and its height moves with the
  // chips, the toast and (on phones) the collapse toggle. The band it covers —
  // stage bottom to tray top — is measured and handed to the wheel, which frames
  // flies, clamps pans and places its edge band against the region ABOVE it
  // (Daniel 2026-09-03: "when we go to the lower part, it must all move up so we
  // have a clear view"). Measured, not styled: a closed overlay (display:none)
  // measures 0×0 and reports 0.
  const stageRef = useRef<HTMLDivElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)
  const [insetBottom, setInsetBottom] = useState(0)
  useEffect(() => {
    const stage = stageRef.current, tray = trayRef.current
    if (!stage || !tray || typeof ResizeObserver === 'undefined') return
    const update = () => {
      const s = stage.getBoundingClientRect(), t = tray.getBoundingClientRect()
      const next = s.height && t.height ? Math.max(0, Math.round(s.bottom - t.top)) : 0
      setInsetBottom((prev) => (prev === next ? prev : next))
    }
    const ro = new ResizeObserver(update)
    ro.observe(stage); ro.observe(tray)
    update()
    return () => ro.disconnect()
  }, [])
  // The overlay is kept mounted and reopened many times per sample (see the
  // `open` comment below) — without this, the tray would only start collapsed
  // on the very first open and stay expanded (eating the thumb territory) on
  // every reopen after that.
  useEffect(() => { if (open) setTrayOpen(false) }, [open])
  const open_ = !compact || trayOpen

  // Latest-ref mirrors so togglePick stays referentially stable — a fresh
  // closure per render would defeat FlavorWheel's memo and reconcile the
  // ~600-element wheel on every keystroke/autosave flip.
  const describeRef = useRef(describe)
  describeRef.current = describe
  const groupRef = useRef(group)
  groupRef.current = group

  // The FlavorWheel (child) registers its Esc handler first (child effects run
  // before parent effects) and preventDefaults while zoomed — so this only
  // closes when the wheel is at rest.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const togglePick = useCallback((pick: WheelPick) => {
    const grp = groupRef.current
    if (grp === 'mouthfeel') return
    const g = grp as 'aroma' | 'flavor_aftertaste'
    // Compute from the controlled `describe` (via ref — kept current each
    // render) and fire the toast OUTSIDE the state updater — calling setToast
    // inside the updater would be a setState during the parent's render.
    const res = addPickCapped(describeRef.current[g].picks, pick)
    if (res.removed) showToast(`Cap of ${OLF_CAP} reached — replaced "${res.removed.path[res.removed.path.length - 1]}"`)
    onDescribe((d) => ({ ...d, [g]: { ...d[g], picks: res.picks, cata: cataForPicks(res.picks).boxes } }))
  }, [onDescribe, showToast])

  const isOlfactory = group !== 'mouthfeel'
  const olf = group === 'aroma' ? describe.aroma : describe.flavor_aftertaste

  const removePick = (pick: WheelPick) => {
    const g = group as 'aroma' | 'flavor_aftertaste'
    onDescribe((d) => {
      const picks = d[g].picks.filter((p) => p.path.join('>') !== pick.path.join('>'))
      return { ...d, [g]: { ...d[g], picks, cata: cataForPicks(picks).boxes } }
    })
  }

  const derived = isOlfactory ? cataForPicks(olf.picks) : null
  const groupCount = (g: DescribeGroup) =>
    g === 'aroma' ? describe.aroma.picks.length
    : g === 'flavor_aftertaste' ? describe.flavor_aftertaste.picks.length + describe.flavor_aftertaste.main_tastes.length
    : describe.mouthfeel.cata.length

  return (
    // kept mounted when closed (display:none) — re-mounting the ~600-element
    // wheel on every open was the repeated first-interaction hitch
    <div className="fixed inset-0 z-50" style={{ display: open ? undefined : 'none' }}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div className="absolute inset-0 flex flex-col overflow-hidden bg-background">
        {/* Step-major (SCA-102 §7): one section is described across every lot on
            the table, so switching lots must not cost a close-and-reopen. It gets
            its own row — a lot chip plus three tabs plus the buttons does not fit
            390 px on one line. */}
        {samples && samples.length > 1 && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[1.5px] text-muted-foreground">Lot</span>
            <div className="flex min-w-0 gap-1.5 overflow-x-auto">
              {samples.map((sm) => {
                const on = sm.id === activeSampleId
                return (
                  <button
                    key={sm.id}
                    type="button"
                    aria-current={on}
                    onClick={() => onSampleChange?.(sm.id)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] transition ${
                      on ? 'border-transparent font-bold text-foreground' : 'border-border font-medium text-muted-foreground'
                    }`}
                    style={on ? { background: 'var(--cva-accent-soft)' } : undefined}
                  >
                    {sm.reference}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3.5">
          <div role="tablist" className="flex gap-2">
            {GROUPS.map((g) => {
              const on = g.key === group
              const n = groupCount(g.key)
              return (
                <button
                  key={g.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => onGroupChange(g.key)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition sm:px-4 sm:py-2 sm:text-[13px] ${
                    on ? 'border-transparent text-white' : 'border-border text-muted-foreground'
                  }`}
                  style={on ? { background: 'var(--cva-accent)' } : undefined}
                >
                  {g.label}{n > 0 ? ` · ${n}` : ''}
                </button>
              )
            })}
          </div>
          <span className="hidden text-[11px] font-bold uppercase tracking-[1.5px] text-muted-foreground md:inline">
            {GROUPS.find((g) => g.key === group)!.sub} · shared across sections
          </span>
          {isOlfactory && (
            <button
              type="button"
              aria-label={showList ? 'Show the flavour wheel' : 'Show the official checklist'}
              aria-pressed={showList}
              onClick={() => setShowList((v) => !v)}
              className={`ml-auto grid h-9 w-9 place-items-center rounded-full border text-sm ${
                showList ? 'border-transparent text-white' : 'border-border text-muted-foreground'
              }`}
              style={showList ? { background: 'var(--cva-accent)' } : undefined}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </button>
          )}
          <button
            type="button"
            aria-label="Close describe"
            onClick={onClose}
            className={`grid h-9 w-9 place-items-center rounded-full border border-border text-sm font-bold ${isOlfactory ? '' : 'ml-auto'}`}
          >
            ×
          </button>
        </div>

        <div ref={stageRef} data-testid="describe-stage" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* the wheel's frame — fills the region to all four edges; the gradient
              ellipse is larger than the screen so its falloff never shows a seam */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(130% 130% at 50% 50%, var(--cva-accent-soft) 0%, transparent 96%)' }}
          />
          {isOlfactory && showList ? (
            <FormChecklist boxes={derived!.boxes} frees={derived!.frees} picks={olf.picks} />
          ) : isOlfactory ? (
            <div className="relative min-h-0 flex-1">
              <FlavorWheel picks={olf.picks} onToggle={togglePick} active={open} onSwipeClose={onClose} insetBottom={insetBottom} />
            </div>
          ) : (
            <div className="relative m-auto shrink-0">
              <MouthfeelCata
                value={describe.mouthfeel.cata}
                onChange={(next) => onDescribe((d) => ({ ...d, mouthfeel: { cata: next } }))}
              />
            </div>
          )}

          {/* descriptors — bottom-anchored centered card, floats above the
              wheel's lower edge so it never clips off-screen; on compact
              screens it collapses to a tap-to-expand tray so the wheel gets
              the whole stage (bottom 148px stay clear for the thumb) */}
          <div
            data-testid="describe-tray-wrapper"
            className="pointer-events-none absolute inset-x-0 flex justify-center px-3 sm:px-4"
            style={{ bottom: compact ? 148 : 24 }}
          >
            <div
              ref={trayRef}
              data-testid="describe-tray"
              data-open={open_ ? '1' : '0'}
              className="wheel-tray pointer-events-auto flex w-full max-w-[820px] flex-col items-center gap-3 px-4 py-2.5 sm:px-5 sm:py-3"
              style={{ maxHeight: compact ? 'min(40dvh, 320px)' : 'min(46dvh, 340px)', overflowY: 'auto' }}
            >
              {compact && (
                <button
                  type="button"
                  className="wheel-tray-toggle w-full text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground"
                  aria-expanded={open_}
                  onClick={() => setTrayOpen((v) => !v)}
                >
                  Descriptors · {groupCount(group)} {open_ ? '▾' : '▸'}
                </button>
              )}
              <div className="wheel-tray-body flex w-full flex-col items-center gap-3">
                {group === 'flavor_aftertaste' && (
                  <MainTastes
                    value={describe.flavor_aftertaste.main_tastes}
                    onChange={(next) =>
                      onDescribe((d) => ({ ...d, flavor_aftertaste: { ...d.flavor_aftertaste, main_tastes: next } }))
                    }
                  />
                )}

                {isOlfactory && (
                  <div className="flex w-full flex-col items-center gap-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">Descriptors</span>
                    </div>
                    <div className="flex min-h-9 flex-wrap justify-center gap-1.5">
                      {olf.picks.length === 0 && (
                        <span className="text-xs text-muted-foreground">Tap a family on the wheel, then tap the notes you find.</span>
                      )}
                      {olf.picks.map((p) => (
                        <button
                          key={p.path.join('>')}
                          type="button"
                          aria-label={`Remove ${p.path[p.path.length - 1]}`}
                          onClick={() => removePick(p)}
                          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11.5px] font-semibold hover:border-red-500"
                        >
                          {p.path[p.path.length - 1]}
                          <span className="text-muted-foreground">{p.path.slice(0, -1).join(' › ')}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-center text-[11.5px] leading-relaxed text-muted-foreground" data-testid="derived-cata">
                      <b className="text-foreground">Official form auto-fill</b>
                      {' · '}
                      {derived!.boxes.length ? derived!.boxes.join(', ') : '—'}
                      {derived!.frees.length > 0 && <> · precise notes: {derived!.frees.join(', ')}</>}
                    </p>
                  </div>
                )}

                <label className="flex w-full max-w-[560px] flex-col gap-1.5 text-center text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-foreground">
                  Descriptors — freely elicited (off-wheel)
                  <input
                    aria-label="Descriptors — freely elicited"
                    value={describe.notes[NOTE_KEY[group]] ?? ''}
                    onChange={(e) =>
                      onDescribe((d) => ({ ...d, notes: { ...d.notes, [NOTE_KEY[group]]: e.target.value } }))
                    }
                    placeholder='e.g. "dried tomato" — notes the wheel does not cover'
                    className="h-11 rounded-[14px] border border-border bg-card px-4 text-center text-sm font-normal normal-case tracking-normal outline-none focus:border-[var(--cva-accent)]"
                  />
                </label>

                {toast && (
                  <div className="rounded-[12px] border border-border bg-card px-4 py-2.5 text-[12.5px] font-semibold">
                    {toast}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

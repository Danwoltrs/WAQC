'use client'

// Full-screen "Describe the cup" overlay — 3 shared group tabs (layout from the
// journey prototype's wheelpanel, minus the Phase-3 voicebox). Always full-bleed:
// the wheel is the chromeless hero inside an edge-to-edge framed stage band,
// with the descriptors card floating bottom-center above it.

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { OLF_CAP, addPickCapped, cataForPicks } from '@/lib/cva/flavor-wheel-data'
import type { CvaDescribe, DescribeGroup, WheelPick } from '@/types/cva'
import { FlavorWheel } from './FlavorWheel'
import { MainTastes } from './MainTastes'
import { MouthfeelCata } from './MouthfeelCata'

interface Props {
  open: boolean
  group: DescribeGroup
  onGroupChange: (g: DescribeGroup) => void
  describe: CvaDescribe
  onDescribe: (mutator: (d: CvaDescribe) => CvaDescribe) => void
  onClose: () => void
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

export const DescribeOverlay = memo(function DescribeOverlay({ open, group, onGroupChange, describe, onDescribe, onClose }: Props) {
  const [toast, setToast] = useState<string | null>(null)
  // True while the cupper is reading the wheel's lower half — the tray fades
  // out of the way (it floats over the wheel's bottom edge). Hide is instant;
  // reveal is debounced so a cursor crossing the band repeatedly (the source of
  // the earlier flicker) doesn't pop the tray back between sweeps.
  const [shade, setShadeRaw] = useState(false)
  const shadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setShade = useCallback((on: boolean) => {
    if (shadeTimer.current) { clearTimeout(shadeTimer.current); shadeTimer.current = null }
    if (on) setShadeRaw(true)
    else shadeTimer.current = setTimeout(() => setShadeRaw(false), 200)
  }, [])
  useEffect(() => () => { if (shadeTimer.current) clearTimeout(shadeTimer.current) }, [])
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
          <button
            type="button"
            aria-label="Close describe"
            onClick={onClose}
            className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-border text-sm font-bold"
          >
            ×
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* the wheel's frame — fills the region to all four edges; the gradient
              ellipse is larger than the screen so its falloff never shows a seam */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(130% 130% at 50% 50%, var(--cva-accent-soft) 0%, transparent 96%)' }}
          />
          {isOlfactory ? (
            <div
              className="relative m-auto shrink-0"
              style={{ width: 'min(100vw, calc(100dvh - 200px))', height: 'min(100vw, calc(100dvh - 200px))' }}
            >
              <FlavorWheel picks={olf.picks} onToggle={togglePick} active={open} onShade={setShade} />
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
              wheel's lower edge so it never clips off-screen; fades out while
              the cupper is reading the wheel's lower half (onShade) */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3 sm:bottom-6 sm:px-4">
            <div
              className={`flex max-h-[min(36dvh,300px)] w-full max-w-[820px] flex-col items-center gap-3 overflow-y-auto rounded-[20px] border border-border bg-background/80 px-4 py-2.5 backdrop-blur-md transition-opacity duration-300 sm:max-h-[min(46dvh,340px)] sm:px-5 sm:py-3 ${
                shade && isOlfactory ? 'pointer-events-none opacity-0' : 'pointer-events-auto'
              }`}
            >
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
                  <span className="rounded-md bg-[var(--cva-accent-soft)] px-2 py-0.5 text-[11px] font-bold">
                    Picks {olf.picks.length}/{OLF_CAP}
                  </span>
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
  )
})

'use client'

// Full-screen "Describe the cup" overlay — 3 shared group tabs (layout from the
// journey prototype's wheelpanel, minus the Phase-3 voicebox). Full-bleed below
// 1280px (laptops/iPads — Daniel's requirement); inset rounded panel above.

import { useEffect, useRef, useState } from 'react'
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

export function DescribeOverlay({ open, group, onGroupChange, describe, onDescribe, onClose }: Props) {
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  if (!open) return null

  const isOlfactory = group !== 'mouthfeel'
  const olf = group === 'aroma' ? describe.aroma : describe.flavor_aftertaste

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  const togglePick = (pick: WheelPick) => {
    if (!isOlfactory) return
    const g = group as 'aroma' | 'flavor_aftertaste'
    // Compute from the controlled `describe` prop and fire the toast OUTSIDE the
    // state updater — calling setToast inside the updater would be a setState
    // during the parent's render (React warns). The overlay is controlled, so
    // describe[g].picks is the live value the updater will apply.
    const res = addPickCapped(describe[g].picks, pick)
    if (res.removed) showToast(`Cap of ${OLF_CAP} reached — replaced "${res.removed.path[res.removed.path.length - 1]}"`)
    onDescribe((d) => ({ ...d, [g]: { ...d[g], picks: res.picks, cata: cataForPicks(res.picks).boxes } }))
  }

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
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div className="absolute inset-0 flex flex-col overflow-hidden bg-background">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
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
                  className={`rounded-full border px-4 py-2 text-[13px] font-bold transition ${
                    on ? 'border-transparent text-white' : 'border-border text-muted-foreground'
                  }`}
                  style={on ? { background: 'var(--cva-accent)' } : undefined}
                >
                  {g.label}{n > 0 ? ` · ${n}` : ''}
                </button>
              )
            })}
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
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
          {/* full-width accent glow behind the wheel — the wheel's "box" runs edge
              to edge, while the wheel itself stays this size. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(62% 64% at 50% 44%, var(--cva-accent-soft), transparent 82%)' }}
          />
          {isOlfactory ? (
            <div
              className="relative m-auto shrink-0"
              style={{ width: 'min(100vw, calc(100dvh - 200px))', height: 'min(100vw, calc(100dvh - 200px))' }}
            >
              <FlavorWheel picks={olf.picks} onToggle={togglePick} />
            </div>
          ) : (
            <div className="relative m-auto shrink-0">
              <MouthfeelCata
                value={describe.mouthfeel.cata}
                onChange={(next) => onDescribe((d) => ({ ...d, mouthfeel: { cata: next } }))}
              />
            </div>
          )}

          {/* descriptors — centered card, lifted off the bottom edge */}
          <div className="relative flex shrink-0 justify-center px-4 pb-7 pt-1">
            <div className="flex max-h-[168px] w-full max-w-[820px] flex-col items-center gap-3 overflow-y-auto rounded-[20px] border border-border bg-background/80 px-5 py-3 backdrop-blur-md">
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
}

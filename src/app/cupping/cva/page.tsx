'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trackingNumberToSlug } from '@/lib/utils'

interface EligibleSample { id: string; tracking_number: string; status?: string }

export default function CvaIndexPage() {
  const router = useRouter()
  const [samples, setSamples] = useState<EligibleSample[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/cupping/cva/eligible')
        const data = await res.json()
        setSamples(data.samples ?? [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const allSelected = samples.length > 0 && selected.size === samples.length
  const orderedSelection = useMemo(
    () => samples.filter((s) => selected.has(s.id)).map((s) => s.id),
    [samples, selected]
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => (prev.size === samples.length ? new Set() : new Set(samples.map((s) => s.id))))
  }

  const start = async () => {
    if (orderedSelection.length === 0) return
    setStarting(true)
    try {
      const res = await fetch('/api/cupping/cva/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_ids: orderedSelection }),
      })
      const data = await res.json()
      if (data.session_id) {
        // URL by sample number, not the session UUID — the API's [id] route
        // resolves a tracking-number slug back to the session.
        const first = samples.find((s) => s.id === orderedSelection[0])
        const slug = first?.tracking_number ? trackingNumberToSlug(first.tracking_number) : data.session_id
        router.push(`/cupping/cva/${slug}`)
      }
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="cva-root mx-auto max-w-2xl px-6 py-10" style={{ ['--cva-accent' as string]: '#556b2f' }}>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[2.5px]" style={{ color: 'var(--cva-accent)' }}>
          SCA 2024 Value Assessment
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Specialty (CVA) cupping</h1>
        <p className="text-sm text-muted-foreground">
          Pick one or more specialty samples to cup together — they open in tabs, like the commodity screen.
        </p>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      ) : samples.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No specialty samples yet. Create a CVA quality, assign it to a client, and intake a sample on it.
        </p>
      ) : (
        <>
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          </div>
          <ul className="mt-2 space-y-2">
            {samples.map((s) => {
              const on = selected.has(s.id)
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition"
                    style={
                      on
                        ? { borderColor: 'var(--cva-accent)', background: 'var(--cva-accent-soft)' }
                        : { borderColor: 'hsl(var(--border))' }
                    }
                  >
                    <span
                      className="grid h-5 w-5 place-items-center rounded-md border text-[11px] font-bold text-white"
                      style={{
                        borderColor: on ? 'var(--cva-accent)' : 'hsl(var(--border))',
                        background: on ? 'var(--cva-accent)' : 'transparent',
                      }}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{s.tracking_number}</span>
                    {s.status && <span className="ml-auto text-xs capitalize text-muted-foreground">{s.status}</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="sticky bottom-4 mt-6">
            <button
              type="button"
              disabled={starting || orderedSelection.length === 0}
              onClick={start}
              className="w-full rounded-2xl px-5 py-3.5 text-sm font-bold text-white transition disabled:opacity-40"
              style={{ background: 'var(--cva-accent)', boxShadow: '0 8px 22px var(--cva-accent-soft)' }}
            >
              {starting
                ? 'Starting…'
                : orderedSelection.length <= 1
                  ? 'Start cupping'
                  : `Start cupping · ${orderedSelection.length} samples`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

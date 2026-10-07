'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { CVA_PICKER_CRUMBS, CvaBackChevron, CvaBrand, CvaShellHeader, CvaTrail } from '@/components/cupping/cva/CvaShellHeader'
import { SampleIntakeDialog } from '@/components/samples/sample-intake-dialog'

interface EligibleSample {
  id: string
  /** The lot's own reference — never the internal SAN- lab number. */
  reference: string
  reference_secondary?: string | null
  reference_slug: string
  status?: string
}

export default function CvaIndexPage() {
  const router = useRouter()
  const [samples, setSamples] = useState<EligibleSample[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [starting, setStarting] = useState(false)
  const [adding, setAdding] = useState(false)

  const loadSamples = useCallback(async (): Promise<EligibleSample[]> => {
    try {
      const res = await fetch('/api/cupping/cva/eligible')
      const data = await res.json()
      const rows: EligibleSample[] = data.samples ?? []
      setSamples(rows)
      return rows
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSamples()
  }, [loadSamples])

  // Add sample (Daniel 2026-10-07: "will only add specialty samples"): the
  // New Sample wizard that takes only a CVA quality. The new lot joins the
  // list already selected, ready to start; the lab number it reports is
  // never shown.
  const sampleAdded = async (_labNumber: string, sampleId?: string) => {
    setAdding(false)
    const rows = await loadSamples()
    if (sampleId && rows.some((s) => s.id === sampleId)) {
      setSelected((prev) => new Set(prev).add(sampleId))
    }
  }

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
        // URL by the lot's own reference, not the session UUID — the API's [id]
        // route resolves a reference slug back to the session.
        const first = samples.find((s) => s.id === orderedSelection[0])
        const slug = first?.reference_slug || data.session_id
        router.push(`/cupping/cva/${slug}`)
      }
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="cva-root flex min-h-[100dvh] flex-col bg-background text-foreground" style={{ ['--cva-accent' as string]: '#556b2f' }}>
      {/* No app shell on this route either (no sidebar, no app header), so the
          journey's header sits here too: a back chevron on a phone, the trail
          from a desk, both leading to Cupping, which has the shell. */}
      <CvaShellHeader>
        <CvaBackChevron href="/cupping" label="Back to Cupping" />
        <CvaBrand />
        <CvaTrail crumbs={CVA_PICKER_CRUMBS} current="Specialty (CVA)" />
      </CvaShellHeader>
      <main className="mx-auto w-full max-w-2xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-[2.5px]" style={{ color: 'var(--cva-accent)' }}>
              SCA 2024 Value Assessment
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Specialty (CVA) cupping</h1>
            <p className="text-sm text-muted-foreground">
              Pick one or more specialty samples to cup together — they open in tabs, like the commodity screen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--cva-accent-soft)]"
            style={{ borderColor: 'var(--cva-accent)', color: 'var(--cva-accent)' }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add sample
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
        ) : samples.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            No specialty samples waiting to be cupped. Add one with Add sample; it takes only a specialty (CVA) quality.
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
                      <span className="text-sm font-semibold text-foreground">{s.reference}</span>
                      {s.reference_secondary && (
                        <span className="text-xs text-muted-foreground">{s.reference_secondary}</span>
                      )}
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
      </main>
      <SampleIntakeDialog open={adding} onOpenChange={setAdding} onSuccess={sampleAdded} specialtyOnly />
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface EligibleSample { id: string; tracking_number: string; status?: string }

export default function CvaIndexPage() {
  const router = useRouter()
  const [samples, setSamples] = useState<EligibleSample[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)

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

  const start = async (sampleId: string) => {
    setStarting(sampleId)
    try {
      const res = await fetch('/api/cupping/cva/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_id: sampleId }),
      })
      const data = await res.json()
      if (data.session_id) router.push(`/cupping/cva/${data.session_id}`)
    } finally {
      setStarting(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-sm font-semibold text-foreground">Specialty (CVA) cupping</h1>
      <p className="mt-1 text-xs text-muted-foreground">Samples on a specialty (SCA CVA 2024) quality.</p>
      {loading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      ) : samples.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No specialty samples yet. Create a CVA quality and assign a sample to it.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {samples.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
              <span className="text-sm font-medium text-foreground">{s.tracking_number}</span>
              <button
                type="button"
                disabled={starting === s.id}
                onClick={() => start(s.id)}
                className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background disabled:opacity-50"
              >
                {starting === s.id ? 'Starting…' : 'Start CVA'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

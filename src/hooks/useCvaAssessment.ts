'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createEmptyAssessment, type CvaAssessment, type CvaSectionScore } from '@/types/cva'
import type { CvaSectionKey } from '@/lib/cva/sections'

interface SampleHeader { id: string; tracking_number: string; status?: string }

export function useCvaAssessment(sessionId: string) {
  const [assessment, setAssessment] = useState<CvaAssessment>(createEmptyAssessment())
  const [sample, setSample] = useState<SampleHeader | null>(null)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<CvaAssessment>(assessment)

  // Initial load.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/cupping/cva/${sessionId}`)
        const data = await res.json()
        if (cancelled) return
        if (data.assessment) {
          setAssessment(data.assessment)
          latest.current = data.assessment
        }
        if (data.sample) setSample(data.sample)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  const persist = useCallback(async (next: CvaAssessment) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/cupping/cva/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (res.ok) setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }, [sessionId])

  // Debounced autosave on every change.
  const update = useCallback((mutator: (draft: CvaAssessment) => CvaAssessment) => {
    setAssessment((prev) => {
      const next = mutator(prev)
      latest.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => persist(latest.current), 700)
      return next
    })
  }, [persist])

  // Save any pending change on unmount.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      void persist(latest.current)
    }
  }, [persist])

  // Typed setters used by the UI.
  const setSectionValue = useCallback((key: CvaSectionKey, patch: Partial<CvaSectionScore>) => {
    update((d) => ({ ...d, sections: { ...d.sections, [key]: { ...d.sections[key], ...patch } } }))
  }, [update])

  const setRoast = useCallback((patch: Partial<CvaAssessment['roast']>) => {
    update((d) => ({ ...d, roast: { ...d.roast, ...patch } }))
  }, [update])

  return { assessment, sample, ready, saving, savedAt, setSectionValue, setRoast }
}

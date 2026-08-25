'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createEmptyAssessment, normalizeAssessment, type CvaAssessment, type CvaDescribe, type CvaSectionScore } from '@/types/cva'
import { computeAssessmentScore, type LiveScore } from '@/lib/cva/scoring'
import type { CvaSectionKey } from '@/lib/cva/sections'

export interface CvaSampleMeta {
  id: string
  /**
   * What this lot is called — the exporter's sample number for a PSS, the
   * container for an SS. Never the internal SAN- lab number; the API resolves
   * it so the journey has no way to render one.
   */
  reference: string
  /** The lot's other identifier: an SS carries its ICO beside its container. */
  reference_secondary?: string | null
  /** URL-safe form of `reference`, for the address bar. */
  reference_slug: string
  status?: string | null
  /** Wolthers/contract pass mark (quality_templates.cva_min_score); null = unset. */
  min_score: number | null
  requires_descriptors: boolean
}

const empty = createEmptyAssessment()

/**
 * Holds the state for a whole CVA session — one assessment + journey step per sample,
 * tabbable like the commodity screen. Edits to the active sample autosave (debounced,
 * serialized per sample so concurrent PUTs can't race a duplicate cupping_scores row).
 */
export function useCvaSession(sessionId: string) {
  const [samples, setSamples] = useState<CvaSampleMeta[]>([])
  const [assessments, setAssessments] = useState<Record<string, CvaAssessment>>({})
  const [steps, setSteps] = useState<Record<string, number>>({})
  const [activeId, setActiveId] = useState<string>('')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  /** Whether this viewer may certify this session — a UI affordance only; the
   *  finalize route enforces the same rule independently server-side. */
  const [canFinalize, setCanFinalize] = useState(false)
  /** The session's actual database id. The `sessionId` argument above is
   *  whatever the address bar carries, which is usually a slug of the lot's
   *  own reference (CvaJourney cosmetically rewrites the URL to one) rather
   *  than the raw UUID — the [id] API route resolves either, but the finalize
   *  route takes session_id literally with no slug resolution. Callers that
   *  POST to finalize must use this resolved value. Null until the initial
   *  hydrate completes. */
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(null)

  const latest = useRef<Record<string, CvaAssessment>>({})
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const inFlight = useRef<Set<string>>(new Set())
  const queued = useRef<Set<string>>(new Set())
  const mounted = useRef(true)
  const activeRef = useRef('')

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Initial hydrate: roster + each sample's saved assessment.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/cupping/cva/${sessionId}`)
        const data = await res.json()
        if (cancelled) return
        const roster: CvaSampleMeta[] = data.samples ?? []
        const raw: Record<string, CvaAssessment> = data.assessments ?? {}
        const loaded: Record<string, CvaAssessment> = Object.fromEntries(
          Object.entries(raw).map(([id, a]) => [id, normalizeAssessment(a)]),
        )
        setSamples(roster)
        setAssessments(loaded)
        setCanFinalize(data.can_finalize ?? false)
        setResolvedSessionId(data.session_id ?? null)
        latest.current = loaded
        const first = roster[0]?.id ?? ''
        setActiveId(first)
        activeRef.current = first
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  // Serialized per-sample PUT. Always sends latest.current[sampleId].
  const persist = useCallback(async (sampleId: string) => {
    if (!sampleId || !latest.current[sampleId]) return
    if (inFlight.current.has(sampleId)) { queued.current.add(sampleId); return }
    inFlight.current.add(sampleId)
    if (mounted.current) setSaving(true)
    try {
      const res = await fetch(`/api/cupping/cva/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sample_id: sampleId, assessment: latest.current[sampleId] }),
      })
      if (res.ok && mounted.current) setSavedAt(Date.now())
    } finally {
      inFlight.current.delete(sampleId)
      if (mounted.current) setSaving(inFlight.current.size > 0)
      if (queued.current.has(sampleId)) { queued.current.delete(sampleId); void persist(sampleId) }
    }
  }, [sessionId])

  const flushAll = useCallback(() => {
    for (const [sid, t] of timers.current) { clearTimeout(t); void persist(sid) }
    timers.current.clear()
  }, [persist])

  const update = useCallback((sampleId: string, mutator: (draft: CvaAssessment) => CvaAssessment) => {
    setAssessments((prev) => {
      const nextA = mutator(prev[sampleId] ?? createEmptyAssessment())
      const next = { ...prev, [sampleId]: nextA }
      latest.current = next
      const t = timers.current.get(sampleId)
      if (t) clearTimeout(t)
      timers.current.set(sampleId, setTimeout(() => void persist(sampleId), 700))
      return next
    })
  }, [persist])

  // Flush pending saves on unmount.
  useEffect(() => () => { flushAll() }, [flushAll])

  const setActive = useCallback((id: string) => {
    flushAll()              // commit any pending edit before leaving the tab
    activeRef.current = id
    setActiveId(id)
  }, [flushAll])

  const setStep = useCallback((n: number) => {
    const id = activeRef.current
    if (!id) return
    setSteps((prev) => ({ ...prev, [id]: n }))
  }, [])

  const setSectionValue = useCallback((key: CvaSectionKey, patch: Partial<CvaSectionScore>) => {
    const id = activeRef.current
    if (!id) return
    update(id, (d) => ({ ...d, sections: { ...d.sections, [key]: { ...d.sections[key], ...patch } } }))
  }, [update])

  const setRoast = useCallback((patch: Partial<CvaAssessment['roast']>) => {
    const id = activeRef.current
    if (!id) return
    update(id, (d) => ({ ...d, roast: { ...d.roast, ...patch } }))
  }, [update])

  const setDescribe = useCallback((mutator: (d: CvaDescribe) => CvaDescribe) => {
    const id = activeRef.current
    if (!id) return
    update(id, (a) => ({ ...a, describe: mutator(a.describe) }))
  }, [update])

  const scoreOf = useCallback((id: string): LiveScore => {
    return computeAssessmentScore(assessments[id] ?? empty)
  }, [assessments])

  const assessment = assessments[activeId] ?? empty
  const step = steps[activeId] ?? 0

  return {
    samples,
    ready,
    activeId,
    setActive,
    assessment,
    step,
    setStep,
    setSectionValue,
    setRoast,
    setDescribe,
    saving,
    savedAt,
    scoreOf,
    canFinalize,
    /** Resolved database session id — see the field's own comment above. */
    sessionId: resolvedSessionId,
  }
}

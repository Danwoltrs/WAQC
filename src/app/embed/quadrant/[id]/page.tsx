'use client'

/**
 * Read-only quadrant embed page
 *
 * Loaded by the Wolthers System (sys.wolthers.com) inside a cross-origin iframe.
 *
 * Protocol:
 *   1) On mount  → postMessage { type: 'waqc-embed-ready' } to window.parent
 *   2) On message → validate origin; accept { type: 'waqc-embed-auth', accessToken }
 *      → fetch /api/embed/quadrant/<id> with Bearer token
 *   3) After render → ResizeObserver posts { type: 'waqc-embed-height', px } on size change
 *   4) ?theme=dark|light (default dark) → apply dark/light class on documentElement
 *
 * HARD constraint: tracking_number is NEVER rendered here.
 * Identifier header shows only wolthers_contract_nr / certificate_number / party names.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { isAllowedOrigin, EMBED_PARENT_ALLOWLIST } from '@/lib/embed/origin-allowlist'
import {
  DefectsQuadrant,
} from '@/components/certificates/cert-editor/defects-quadrant'
import {
  ScreenQuadrant,
} from '@/components/certificates/cert-editor/screen-quadrant'
import {
  PhysicalQuadrant,
} from '@/components/certificates/cert-editor/physical-quadrant'
import {
  CuppingQuadrant,
} from '@/components/certificates/cert-editor/cupping-quadrant'
import type { DefectDraft, TaintFaultDraft } from '@/components/certificates/cert-editor/shared'

// ---------------------------------------------------------------------------
// Types — mirrors what the API route returns (QuadrantPayload)
// ---------------------------------------------------------------------------

interface QuadrantData {
  sample: Record<string, unknown>
  qualityAssessment: {
    green_bean_data: Record<string, unknown> | null
    roast_data: Record<string, unknown> | null
    clean_cup?: boolean | null
    uniform_cup?: boolean | null
    cupping_comments?: string | null
    grading_comments?: string | null
    [key: string]: unknown
  } | null
  cupping: {
    cva_score: number | null
    flavor_descriptor: string | null
    attributes: Record<string, { finalScore: number }>
    defects: { taints: string[]; faults: string[] }
    defect_levels: Array<{
      defectName: string
      type: 'taint' | 'fault'
      levels: Record<string, number>
    }>
    isCVA: boolean
    cvaMinScore: number | null
    [key: string]: unknown
  } | null
}

type Phase = 'waiting' | 'loading' | 'ready' | 'error'
interface State { phase: Phase; data?: QuadrantData; message?: string }

// ---------------------------------------------------------------------------
// Data mapping helpers — mirrors use-cert-editor.ts (lines 114-289)
// ---------------------------------------------------------------------------

/** Normalize screen keys ("Screen 18" / "screen_18" → "18", keep "Pan"). */
function normalizeScreens(raw: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw) return out
  for (const [k, v] of Object.entries(raw)) {
    const clean = k.replace(/^screen[_ ]?/i, '').trim()
    const num = typeof v === 'number' ? v : parseFloat(String(v))
    if (Number.isFinite(num) && num > 0) out[clean] = num
  }
  return out
}

/** Seed defects from green_bean_data (mirrors use-cert-editor.ts seedDefects, lines 128-142). */
function seedDefects(green: Record<string, unknown> | null | undefined): DefectDraft[] {
  const defects = green?.defects
  const list: DefectDraft[] = []
  if (!defects) return list
  if (Array.isArray(defects)) {
    defects.forEach((d: { name: string; count: number }) =>
      list.push({ name: d.name, count: Number(d.count) || 0 }),
    )
  } else if (typeof defects === 'object' && defects !== null) {
    const obj = defects as Record<string, unknown>
    if (Array.isArray(obj.defect_list)) {
      obj.defect_list.forEach((e: { name: string; count: number }) =>
        list.push({ name: e.name, count: Number(e.count) || 0 }),
      )
    } else if (obj.counts && typeof obj.counts === 'object') {
      Object.entries(obj.counts as Record<string, unknown>).forEach(([n, c]) =>
        list.push({ name: n, count: Number(c) || 0 }),
      )
    }
  }
  return list
}

/**
 * Build taints/faults from aggregate cupping data
 * (mirrors use-cert-editor.ts lines 228-237 where aggTaints/aggFaults are built).
 */
function buildAggTaintsOrFaults(
  names: string[],
  type: 'taint' | 'fault',
  defectLevels: QuadrantData['cupping'] extends null ? never : NonNullable<QuadrantData['cupping']>['defect_levels'],
): TaintFaultDraft[] {
  return names.map((name) => {
    const lvl = defectLevels.find((dl) => dl.defectName === name && dl.type === type)
    const vals = lvl?.levels ? (Object.values(lvl.levels) as number[]) : []
    const intensity =
      vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : undefined
    return { name, intensity: intensity ?? null }
  })
}

/**
 * Derive the CertDraft-shaped props from the API payload.
 * This mirrors exactly what use-cert-editor.ts lines 200-289 build from its three fetches.
 *
 * API payload fields → use-cert-editor variable names:
 *   qualityAssessment.green_bean_data → green
 *   qualityAssessment.roast_data      → roast
 *   cupping                           → agg (the aggregated object)
 */
function deriveDraft(data: QuadrantData) {
  const green = data.qualityAssessment?.green_bean_data as Record<string, unknown> | null | undefined
  const roast = data.qualityAssessment?.roast_data as Record<string, unknown> | null | undefined
  const qa = data.qualityAssessment
  const agg = data.cupping

  // Cupping attribute scores — prefer master-cupper override in green_bean_data
  // (mirrors use-cert-editor.ts lines 259-263)
  let cupping: Record<string, number> = {}
  if (agg?.attributes) {
    for (const [k, v] of Object.entries(agg.attributes)) {
      cupping[k] = v.finalScore
    }
  }
  if (green?.cupping_scores && typeof green.cupping_scores === 'object' && !Array.isArray(green.cupping_scores)) {
    cupping = { ...(green.cupping_scores as Record<string, number>) }
  }

  // Taints / faults (mirrors lines 277-282)
  const aggTaints = agg
    ? buildAggTaintsOrFaults(agg.defects.taints, 'taint', agg.defect_levels)
    : []
  const aggFaults = agg
    ? buildAggTaintsOrFaults(agg.defects.faults, 'fault', agg.defect_levels)
    : []

  const roastTaints = Array.isArray(roast?.taints)
    ? (roast!.taints as Array<{ name: string; intensity?: number | null }>)
    : []
  const roastFaults = Array.isArray(roast?.faults)
    ? (roast!.faults as Array<{ name: string; intensity?: number | null }>)
    : []

  const taints: TaintFaultDraft[] = (roastTaints.length ? roastTaints : aggTaints).map((t) => ({
    name: t.name,
    intensity: t.intensity ?? null,
  }))
  const faults: TaintFaultDraft[] = (roastFaults.length ? roastFaults : aggFaults).map((f) => ({
    name: f.name,
    intensity: f.intensity ?? null,
  }))

  // Cup profile (mirrors line 284)
  const rawCupProfile =
    typeof green?.cup_profile === 'string' && green.cup_profile.trim()
      ? green.cup_profile
      : (agg?.flavor_descriptor ?? null)

  return {
    defects: seedDefects(green),
    screens: normalizeScreens((green?.screen_sizes ?? green?.screen_analysis) as Record<string, unknown> | null | undefined),
    moisture: (green?.moisture_percentage ?? green?.moisture ?? green?.humidity ?? null) as number | null,
    density: (green?.density ?? null) as number | null,
    greenAspect: (green?.green_aspect ?? green?.aspect ?? null) as string | null,
    roastAspect: (roast?.roast_aspect ?? roast?.roast_color ?? null) as string | null,
    quakers: (green?.quakers ?? roast?.quakers ?? null) as number | null,
    taints,
    faults,
    cupping,
    cupProfile: rawCupProfile as string | null,
    cleanCup: (qa?.clean_cup ?? null) as boolean | null,
    uniformCup: (qa?.uniform_cup ?? null) as boolean | null,
    cuppingComments: (qa?.cupping_comments ?? null) as string | null,
    gradingComments: (qa?.grading_comments ?? null) as string | null,
  }
}

// ---------------------------------------------------------------------------
// Minimal safe header — NO tracking_number
// Shows wolthers_contract_nr / certificate_number / party display names only.
// ---------------------------------------------------------------------------

function SafeHeader({ sample }: { sample: Record<string, unknown> }) {
  const contractNr = (sample.wolthers_contract_nr as string | null | undefined) || null
  const certNr = (sample.certificate as { certificate_number?: string | null } | null)?.certificate_number || null
  const sellerName =
    (sample.seller as { name?: string; fantasy_name?: string } | null)?.fantasy_name ||
    (sample.seller as { name?: string } | null)?.name ||
    null
  const importerName =
    (sample.importer as { name?: string; fantasy_name?: string } | null)?.fantasy_name ||
    (sample.importer as { name?: string } | null)?.name ||
    null
  const roasterName =
    (sample.roaster as { name?: string; fantasy_name?: string } | null)?.fantasy_name ||
    (sample.roaster as { name?: string } | null)?.name ||
    null

  const buyerName = roasterName || importerName

  const hasAnyInfo = contractNr || certNr || sellerName || buyerName
  if (!hasAnyInfo) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border pb-4 text-sm">
      {contractNr ? (
        <span className="font-medium text-foreground">
          Contract {contractNr}
        </span>
      ) : null}
      {certNr ? (
        <span className="text-muted-foreground">
          Cert #{certNr}
        </span>
      ) : null}
      {sellerName ? (
        <span className="text-muted-foreground">{sellerName}</span>
      ) : null}
      {buyerName ? (
        <span className="text-muted-foreground">{buyerName}</span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuadrantEmbedPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const searchParams = useSearchParams()
  const theme = searchParams?.get('theme') === 'light' ? 'light' : 'dark'

  const [state, setState] = useState<State>({ phase: 'waiting' })
  const rootRef = useRef<HTMLDivElement>(null)
  // Phase guard: tracks whether auth processing has started so a second waqc-embed-auth
  // message from the parent is a no-op. Using a ref avoids introducing a re-render cycle.
  const authStartedRef = useRef(false)

  // 1) Apply theme class on documentElement (matches ThemeProvider behaviour in
  //    src/components/providers/theme-provider.tsx lines 30-33: toggles 'dark' on root).
  //    useLayoutEffect (not useEffect) so the embed's ?theme= wins over the root
  //    ThemeProvider with no flash — it runs synchronously after DOM mutations,
  //    after the provider's own (passive) effect has settled the class.
  useLayoutEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  // 2) Tell parent we are ready (targetOrigin '*' — just a readiness ping).
  useEffect(() => {
    window.parent?.postMessage({ type: 'waqc-embed-ready' }, '*')
  }, [])

  // 3) Receive auth token, fetch payload.
  useEffect(() => {
    if (!id) return
    async function onMessage(e: MessageEvent) {
      if (!isAllowedOrigin(e.origin, EMBED_PARENT_ALLOWLIST)) return
      const msg = e.data as { type?: string; accessToken?: string } | null
      if (msg?.type !== 'waqc-embed-auth' || !msg.accessToken) return
      // Phase guard: once loading or ready, ignore further auth messages (idempotent).
      if (authStartedRef.current) return
      authStartedRef.current = true

      setState({ phase: 'loading' })
      try {
        const res = await fetch(`/api/embed/quadrant/${id}`, {
          headers: { Authorization: `Bearer ${msg.accessToken}` },
        })
        if (!res.ok) {
          setState({ phase: 'error', message: 'No QC detail available' })
          return
        }
        const json: QuadrantData = await res.json()
        setState({ phase: 'ready', data: json })
      } catch {
        setState({ phase: 'error', message: 'No QC detail available' })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [id])

  // 4) Post height to parent via ResizeObserver.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const px = rootRef.current?.scrollHeight ?? 0
      window.parent?.postMessage({ type: 'waqc-embed-height', px }, '*')
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [state.phase])

  const draft = state.phase === 'ready' && state.data ? deriveDraft(state.data) : null

  return (
    <div ref={rootRef} className="bg-background text-foreground min-h-0 p-4 font-[Inter]">
      {state.phase !== 'ready' ? (
        <div className="py-6 text-sm text-muted-foreground">
          {state.phase === 'error'
            ? (state.message ?? 'No QC detail available')
            : 'Loading…'}
        </div>
      ) : draft && state.data ? (
        <>
          <SafeHeader sample={state.data.sample} />
          <div className="grid gap-5 lg:grid-cols-2">
            <DefectsQuadrant
              defects={draft.defects}
              readOnly
            />
            <ScreenQuadrant
              screens={draft.screens}
              readOnly
            />
            <PhysicalQuadrant
              draft={draft}
              readOnly
            />
            <CuppingQuadrant
              draft={draft}
              isCVA={state.data.cupping?.isCVA ?? false}
              cvaScore={state.data.cupping?.cva_score ?? null}
              cvaMinScore={state.data.cupping?.cvaMinScore ?? null}
              readOnly
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

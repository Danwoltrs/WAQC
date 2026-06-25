'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { LOCK_SENSITIVE_FIELDS } from '@/lib/sample-edit-permissions'
import {
  CertDraft,
  DefectDraft,
  TaintFaultDraft,
  computeDefectTotals,
} from './shared'

/** Commercial / logistics fields seeded into the editable draft (mirrors the
 *  legacy modal's edit buffer). Everything here is committed via PATCH /api/samples. */
const COMMERCIAL_FIELDS = [
  'bag_count', 'bag_type', 'bag_weight_kg', 'bags_quantity_mt', 'equivalent_60kg_bags',
  'wolthers_contract_nr', 'seller_contract_nr', 'shipper_contract_nr', 'exporter_contract_nr',
  'buyer_contract_nr', 'roaster_contract_nr', 'qc_client_contract_nr', 'end_client_contract_nr',
  'supplier_contract_nr', 'ico_number', 'container_nr', 'processing_method', 'micro_origin',
  // NOTE: tracking_number is deliberately NOT here — it has no editor control and a
  // PATCH of it cascades a (permanent, gap-free) certificate-number rename.
  'origin', 'sample_type', 'exporter_sample_number', 'storage_position',
  'quality_spec_id', 'seller_id', 'exporter_id', 'importer_id', 'roaster_id', 'end_client_id',
  'client_id', 'same_seller_shipper', 'importer_is_qc_client',
] as const

export interface CertSample {
  id: string
  tracking_number: string
  status: string
  sample_type?: string | null
  origin?: string
  quality_name?: string
  quality_code?: string
  quality_spec_id?: string
  micro_origin?: string
  processing_method?: string
  created_at: string
  certificate_id?: string | null
  certificate_number?: string | null
  // party display names
  seller_name?: string
  exporter_name?: string
  importer_name?: string
  roaster_name?: string
  end_client_name?: string
  qc_client_name?: string
  wolthers_contract_nr?: string
  exporter_sample_number?: string
  bag_count?: number
  bags?: number
  bag_weight_kg?: number
  bag_type?: string
  bags_quantity_mt?: number
  equivalent_60kg_bags?: number
  storage_position?: string
  client_id?: string
  workflow_stage?: string
  certificate_status?: string | null
  certificate_created_at?: string | null
  seller_contract_nr?: string
  container_nr?: string
  ico_number?: string
  sample_category?: 'qc' | 'other'
  awb_number?: string | null
  courier_name?: string | null
  is_quick_look?: boolean
  linked_pss?: { id: string; tracking_number: string } | null
  sample_recipients?: any[]
  [key: string]: any
}

export interface QualityOption {
  id: string
  custom_name: string
  quality_code: string | null
}

interface EditPermission {
  canEdit: boolean
  isEditor?: boolean
  canEditContent?: boolean
  canEditCounterparties?: boolean
  reason?: string
  message?: string
}

function emptyDraft(): CertDraft {
  return {
    sample: {},
    defects: [],
    screens: {},
    moisture: null,
    density: null,
    greenAspect: null,
    roastAspect: null,
    quakers: null,
    taints: [],
    faults: [],
    cupping: {},
    cupProfile: null,
    cleanCup: null,
    uniformCup: null,
    cuppingComments: null,
    gradingComments: null,
  }
}

/** Normalize screen keys ("Screen 18" / "screen_18" -> "18", keep "Pan"). */
function normalizeScreens(raw: Record<string, any> | undefined | null): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw) return out
  for (const [k, v] of Object.entries(raw)) {
    const clean = k.replace(/^screen[_ ]?/i, '').trim()
    const num = typeof v === 'number' ? v : parseFloat(String(v))
    // Skip zero/blank sieves so the seeded shape matches what the edit panel emits
    // (it only writes sieves with grams > 0) — avoids spurious dirty + data loss.
    if (Number.isFinite(num) && num > 0) out[clean] = num
  }
  return out
}

function seedDefects(green: any): DefectDraft[] {
  const defects = green?.defects
  const list: DefectDraft[] = []
  if (!defects) return list
  if (Array.isArray(defects)) {
    defects.forEach((d: any) => list.push({ name: d.name, count: Number(d.count) || 0 }))
  } else if (typeof defects === 'object') {
    if (Array.isArray(defects.defect_list)) {
      defects.defect_list.forEach((e: any) => list.push({ name: e.name, count: Number(e.count) || 0 }))
    } else if (defects.counts && typeof defects.counts === 'object') {
      Object.entries(defects.counts).forEach(([n, c]) => list.push({ name: n, count: Number(c) || 0 }))
    }
  }
  return list
}

export interface CertEditorState {
  loading: boolean
  error: string | null
  sample: CertSample | null
  draft: CertDraft
  isCVA: boolean
  cvaMinScore: number | null
  cvaScore: number | null
  qualityOptions: QualityOption[]
  canEditCommercial: boolean
  canEditQuality: boolean
  qualityLockMessage: string | null
  dirty: boolean
  saving: boolean
  setDraft: React.Dispatch<React.SetStateAction<CertDraft>>
  /** Shallow-merge into draft.sample (commercial fields). */
  setSampleField: (field: string, value: any) => void
  save: () => Promise<boolean>
  reload: () => void
}

export function useCertEditor(sampleId: string | null, open: boolean, contractId?: string | null): CertEditorState {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sample, setSample] = useState<CertSample | null>(null)
  const [draft, setDraft] = useState<CertDraft>(emptyDraft())
  const [initial, setInitial] = useState<CertDraft>(emptyDraft())
  const [isCVA, setIsCVA] = useState(false)
  const [cvaMinScore, setCvaMinScore] = useState<number | null>(null)
  const [cvaScore, setCvaScore] = useState<number | null>(null)
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([])
  const [permission, setPermission] = useState<EditPermission | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const isEditor =
    permission?.isEditor ??
    (profile?.is_master_cupper === true ||
      profile?.is_global_admin === true ||
      profile?.qc_role === 'global_admin')
  const canEditCommercial = isEditor
  // Quality content freezes 7 days after certification (or after OCR scan lock).
  const canEditQuality =
    isEditor && (permission?.canEditContent ?? true)
  const qualityLockMessage =
    !canEditQuality ? (permission?.message || 'Quality data is locked after certification.') : null

  const load = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const [sampleRes, qaRes, aggRes, permRes] = await Promise.all([
        fetch(`/api/samples/${id}${contractId ? `?contract_id=${contractId}` : ''}`),
        fetch(`/api/samples/${id}/quality-assessment`),
        fetch(`/api/cupping/scores/aggregate?sample_id=${id}`),
        fetch(`/api/cupping/check-edit-permission?sampleId=${id}`),
      ])

      if (!sampleRes.ok) {
        setError(sampleRes.status === 401 ? 'unauthorized' : 'not_found')
        return
      }
      const sampleData = await sampleRes.json()
      const s: CertSample = sampleData.sample
      setSample(s)

      if (permRes.ok) setPermission(await permRes.json())

      // Cupping aggregate (per-cupper -> attribute final scores + taints/faults)
      let aggCupping: Record<string, number> = {}
      let aggTaints: TaintFaultDraft[] = []
      let aggFaults: TaintFaultDraft[] = []
      let aggFlavor: string | null = null
      if (aggRes.ok) {
        const agg = (await aggRes.json()).aggregated
        if (agg?.attributes) {
          for (const [k, v] of Object.entries(agg.attributes as Record<string, any>)) {
            aggCupping[k] = (v as any).finalScore
          }
        }
        // Authoritative CVA 0–100 score (server-verified), surfaced by the aggregate route.
        if (typeof agg?.cva_score === 'number') setCvaScore(agg.cva_score)
        if (typeof agg?.flavor_descriptor === 'string') aggFlavor = agg.flavor_descriptor
        if (agg?.defects) {
          const levels = agg.defect_levels || []
          const lvlAvg = (name: string, type: string) => {
            const lvl = levels.find((dl: any) => dl.defectName === name && dl.type === type)
            const vals = lvl?.levels ? (Object.values(lvl.levels) as number[]) : []
            return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : undefined
          }
          aggTaints = (agg.defects.taints || []).map((n: string) => ({ name: n, intensity: lvlAvg(n, 'taint') }))
          aggFaults = (agg.defects.faults || []).map((n: string) => ({ name: n, intensity: lvlAvg(n, 'fault') }))
        }
      }

      // Quality assessment (green bean + roast overrides)
      let green: any = null
      let roast: any = null
      let cleanCup: boolean | null = null
      let uniformCup: boolean | null = null
      let cuppingComments: string | null = null
      let gradingComments: string | null = null
      if (qaRes.ok) {
        const a = (await qaRes.json()).assessment
        if (a) {
          green = a.green_bean_data || null
          roast = a.roast_data || null
          cleanCup = a.clean_cup ?? null
          uniformCup = a.uniform_cup ?? null
          cuppingComments = a.cupping_comments ?? null
          gradingComments = a.grading_comments ?? null
        }
      }

      // Cupping scores: prefer the master-cupper override in green_bean_data, else aggregate.
      let cupping = aggCupping
      if (green?.cupping_scores && typeof green.cupping_scores === 'object' && !Array.isArray(green.cupping_scores)) {
        cupping = { ...green.cupping_scores }
      }

      const commercial: Record<string, any> = {}
      for (const f of COMMERCIAL_FIELDS) commercial[f] = (s as any)[f]

      const nextDraft: CertDraft = {
        sample: commercial,
        defects: seedDefects(green),
        screens: normalizeScreens(green?.screen_sizes || green?.screen_analysis),
        moisture: green?.moisture_percentage ?? green?.moisture ?? green?.humidity ?? null,
        density: green?.density ?? null,
        greenAspect: green?.green_aspect ?? green?.aspect ?? null,
        roastAspect: roast?.roast_aspect ?? roast?.roast_color ?? null,
        quakers: green?.quakers ?? roast?.quakers ?? null,
        taints: (Array.isArray(roast?.taints) && roast.taints.length ? roast.taints : aggTaints).map(
          (t: any) => ({ name: t.name, intensity: t.intensity ?? null }),
        ),
        faults: (Array.isArray(roast?.faults) && roast.faults.length ? roast.faults : aggFaults).map(
          (f: any) => ({ name: f.name, intensity: f.intensity ?? null }),
        ),
        cupping,
        cupProfile: (typeof green?.cup_profile === 'string' && green.cup_profile.trim()) ? green.cup_profile : aggFlavor,
        cleanCup,
        uniformCup,
        cuppingComments,
        gradingComments,
      }
      setDraft(nextDraft)
      setInitial(structuredClone(nextDraft))

      // CVA detection + quality options (need the client's quality list for the picker)
      if (s.quality_spec_id) {
        fetch(`/api/client-qualities/${s.quality_spec_id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            const tmpl = d?.client_quality?.template
            if (tmpl?.methodology === 'cva') setIsCVA(true)
            if (typeof tmpl?.cva_min_score === 'number') setCvaMinScore(tmpl.cva_min_score)
          })
          .catch(() => {})
      }
      if (s.client_id) {
        fetch(`/api/client-qualities?client_id=${s.client_id}&is_active=true`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.client_qualities) {
              setQualityOptions(
                d.client_qualities.map((q: any) => ({
                  id: q.id,
                  custom_name: q.custom_name || q.template?.name || 'Unnamed',
                  quality_code: q.quality_code,
                })),
              )
            }
          })
          .catch(() => {})
      }
    } catch (e) {
      console.error('Error loading certificate editor data:', e)
      setError('network')
    } finally {
      setLoading(false)
    }
  }, [contractId])

  useEffect(() => {
    if (open && sampleId) {
      setIsCVA(false)
      setCvaMinScore(null)
      setCvaScore(null)
      setQualityOptions([])
      setPermission(null)
      load(sampleId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sampleId, reloadKey, contractId])

  const setSampleField = useCallback((field: string, value: any) => {
    setDraft((prev) => ({ ...prev, sample: { ...prev.sample, [field]: value } }))
  }, [])

  // Dirty tracking — commercial vs quality computed separately for the save.
  const commercialDirty = useMemo(
    () => JSON.stringify(draft.sample) !== JSON.stringify(initial.sample),
    [draft.sample, initial.sample],
  )
  const qualityDirty = useMemo(() => {
    const q = (d: CertDraft) => ({
      defects: d.defects, screens: d.screens, moisture: d.moisture, density: d.density,
      greenAspect: d.greenAspect, roastAspect: d.roastAspect, quakers: d.quakers,
      taints: d.taints, faults: d.faults, cupping: d.cupping, cupProfile: d.cupProfile,
      cleanCup: d.cleanCup, uniformCup: d.uniformCup,
      cuppingComments: d.cuppingComments, gradingComments: d.gradingComments,
    })
    return JSON.stringify(q(draft)) !== JSON.stringify(q(initial))
  }, [draft, initial])

  const dirty = commercialDirty || qualityDirty

  const save = useCallback(async (): Promise<boolean> => {
    if (!sample) return false
    setSaving(true)
    try {
      // Quality goes FIRST: if it's locked (423), nothing commercial has been written
      // yet, so we never leave a confusing half-saved state.
      await saveQuality()
      await saveCommercial()
      return true
    } catch (e) {
      console.error('Error saving certificate edits:', e)
      throw e
    } finally {
      setSaving(false)
    }

    // --- Commercial / logistics -> PATCH /api/samples/[id] ---
    async function saveCommercial() {
      if (!commercialDirty || !sample) return
      const payload: Record<string, any> = {}
      for (const f of COMMERCIAL_FIELDS) {
        if (JSON.stringify(draft.sample[f]) !== JSON.stringify(initial.sample[f])) {
          payload[f] = draft.sample[f]
        }
      }
      // When quality content is locked, never send lock-sensitive fields — otherwise the
      // server rejects the ENTIRE PATCH (423) and the editable changes are lost too.
      if (!canEditQuality) {
        for (const k of Object.keys(payload)) {
          if (LOCK_SENSITIVE_FIELDS.has(k)) delete payload[k]
        }
      }
      // Recompute derived bag totals when count/weight change (clear them if invalid).
      if ('bag_count' in payload || 'bag_weight_kg' in payload) {
        const count = Number(draft.sample.bag_count) || 0
        const weight = Number(draft.sample.bag_weight_kg) || 0
        if (count > 0 && weight > 0) {
          payload.bags_quantity_mt = Math.round((count * weight) / 1000 * 1000) / 1000
          payload.equivalent_60kg_bags = Math.round((count * weight) / 60)
        } else {
          payload.bags_quantity_mt = null
          payload.equivalent_60kg_bags = null
        }
      }
      // Keep quality_name in sync with a changed quality_spec_id. Use null (not undefined)
      // when the name can't be resolved so the server falls back to the joined name.
      if ('quality_spec_id' in payload) {
        const opt = qualityOptions.find((q) => q.id === payload.quality_spec_id)
        payload.quality_name = opt?.custom_name ?? null
      }
      if (!Object.keys(payload).length) return
      const res = await fetch(`/api/samples/${sample.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save details')
    }

    // --- Quality -> POST /api/samples/[id]/quality-assessment ---
    // Server shallow-merges, so we send ONLY the fields that actually changed.
    // Cupping attribute scores are display-only here (they're aggregated from the
    // cupping sessions and authoritative on the cert via that path), so we never
    // write a cupping_scores override from this surface.
    async function saveQuality() {
      if (!qualityDirty || !canEditQuality || !sample) return
      const changed = (a: any, b: any) => JSON.stringify(a) !== JSON.stringify(b)
      const green: Record<string, any> = {}
      const roast: Record<string, any> = {}

      if (changed(draft.defects, initial.defects)) {
        const filtered = draft.defects.filter((d) => d.name.trim())
        const totals = computeDefectTotals(filtered)
        green.defects = {
          defect_list: filtered,
          primary: totals.primary,
          secondary: totals.secondary,
          total: totals.total,
        }
      }
      if (changed(draft.screens, initial.screens)) green.screen_sizes = draft.screens
      if (changed(draft.moisture, initial.moisture)) green.moisture_percentage = draft.moisture
      if (changed(draft.density, initial.density)) green.density = draft.density
      if (changed(draft.greenAspect, initial.greenAspect)) green.green_aspect = draft.greenAspect
      if (changed(draft.cupProfile, initial.cupProfile)) green.cup_profile = draft.cupProfile ?? null
      if (changed(draft.quakers, initial.quakers)) {
        green.quakers = draft.quakers
        roast.quakers = draft.quakers
      }
      if (changed(draft.roastAspect, initial.roastAspect)) roast.roast_aspect = draft.roastAspect
      if (changed(draft.taints, initial.taints)) roast.taints = draft.taints.filter((t) => t.name.trim())
      if (changed(draft.faults, initial.faults)) roast.faults = draft.faults.filter((f) => f.name.trim())

      const body: Record<string, any> = {}
      if (Object.keys(green).length) body.green_bean_data = green
      if (Object.keys(roast).length) body.roast_data = roast
      if (changed(draft.cleanCup, initial.cleanCup)) body.clean_cup = draft.cleanCup
      if (changed(draft.uniformCup, initial.uniformCup)) body.uniform_cup = draft.uniformCup
      if (changed(draft.cuppingComments, initial.cuppingComments)) body.cupping_comments = draft.cuppingComments
      if (changed(draft.gradingComments, initial.gradingComments)) body.grading_comments = draft.gradingComments

      if (!Object.keys(body).length) return
      const res = await fetch(`/api/samples/${sample.id}/quality-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save quality data')
    }
  }, [sample, draft, initial, commercialDirty, qualityDirty, canEditQuality, qualityOptions])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return {
    loading, error, sample, draft, isCVA, cvaMinScore, cvaScore, qualityOptions,
    canEditCommercial, canEditQuality, qualityLockMessage, dirty, saving,
    setDraft, setSampleField, save, reload,
  }
}

'use client'

/**
 * The quality specification editor's working state and its body (grouped
 * section-nav + inline panel), shared by the full-screen editor on Quality
 * Templates (quality-spec-editor.tsx) and the intake's "New quality
 * specification" dialog, which edits a client's copy in place.
 *
 * useSpecEditorState holds a working copy of the template; buildPayload()
 * turns it into the fields the template routes take. SpecEditorBody renders
 * the nav and the active section; each section edits a slice of `params`
 * through `patch`.
 */

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { POPULAR_COFFEE_ORIGINS } from '@/types/micro-region-configuration'
import { ScreenSizesSection } from './sections/screen-sizes-section'
import { AspectSection } from './sections/aspect-section'
import { DefectsSection } from './sections/defects-section'
import { CuppingSection } from './sections/cupping-section'
import { TaintsSection } from './sections/taints-section'
import { MoistureSection } from './sections/moisture-section'
import { QuakerSection } from './sections/quaker-section'
import { CleanCupsSection } from './sections/clean-cups-section'
import { REVIEW_FIELD, ReviewMark, ReviewNotes, sectionTone, type ReviewTone, type SpecReview } from './spec-review'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpecTemplate {
  id?: string
  name_en?: string
  name_pt?: string
  name_es?: string
  description_en?: string
  description_pt?: string
  description_es?: string
  name?: string
  description?: string
  version?: number
  parameters: any
  is_active?: boolean
  is_global?: boolean
  laboratory_id?: string | null
  assigned_laboratories?: string[]
  created_by?: string
  created_at?: string
  methodology?: 'commodity' | 'cva'
  cva_min_score?: number | null
  requires_descriptors?: boolean
}

export type SectionId =
  | 'basic' | 'screen' | 'green' | 'roast' | 'defects'
  | 'moisture' | 'quaker' | 'cupping' | 'taints' | 'clean'

type Sharing = 'private' | 'lab' | 'public'

interface NavItem { id: SectionId; label: string }
interface NavGroup { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  { title: 'Definition', items: [
    { id: 'basic', label: 'Basic information' },
    { id: 'screen', label: 'Screen sizes' },
  ] },
  { title: 'Appearance', items: [
    { id: 'green', label: 'Green aspect' },
    { id: 'roast', label: 'Roast aspect' },
  ] },
  { title: 'Physical', items: [
    { id: 'defects', label: 'Defects' },
    { id: 'moisture', label: 'Moisture %' },
    { id: 'quaker', label: 'Quaker count' },
  ] },
  { title: 'Sensory', items: [
    { id: 'cupping', label: 'Cupping attributes' },
    { id: 'taints', label: 'Taints & faults' },
    { id: 'clean', label: 'Clean / uniform cups' },
  ] },
]

const SECTION_HEADINGS: Record<SectionId, { title: string; subtitle: string }> = {
  basic:    { title: 'Basic information', subtitle: 'Name, origin and how this template is shared.' },
  screen:   { title: 'Screen size requirements', subtitle: 'Constraints applied to the green screen distribution.' },
  green:    { title: 'Green aspect', subtitle: 'Raw bean appearance terminology, ordered low → high quality.' },
  roast:    { title: 'Roast aspect', subtitle: 'Roasted bean appearance terminology, ordered low → high quality.' },
  defects:  { title: 'Defect configuration', subtitle: 'Primary & secondary defects with weights. Thresholds drive pass/fail.' },
  moisture: { title: 'Moisture %', subtitle: 'Acceptable moisture range and measurement standard.' },
  quaker:   { title: 'Quaker count', subtitle: 'Whether quaker counting is required for this quality.' },
  cupping:  { title: 'Cupping attributes', subtitle: 'Sensory attributes and their scoring scales. Drag the handle to reorder.' },
  taints:   { title: 'Taints & faults', subtitle: 'Defect registry, taint thresholds and the deduction formula.' },
  clean:    { title: 'Clean / uniform cups', subtitle: 'How Clean Cup and Uniform Cup are auto-calculated from defect counts.' },
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function useSpecEditorState(
  template: SpecTemplate | undefined,
  options: { initialName?: string; initialSection?: SectionId } = {},
) {
  const [active, setActive] = useState<SectionId>(options.initialSection ?? 'basic')

  // --- Top-level fields ---
  const [name, setName] = useState(options.initialName ?? template?.name_en ?? template?.name ?? '')
  const [description, setDescription] = useState(template?.description_en || template?.description || '')
  const [isActive, setIsActive] = useState(template?.is_active !== false)
  const [sharing, setSharing] = useState<Sharing>(
    template?.is_global ? 'public'
      : (template?.assigned_laboratories?.length || template?.laboratory_id) ? 'lab'
      : 'private'
  )
  const [methodology, setMethodology] = useState<'commodity' | 'cva'>(
    template?.methodology === 'cva' ? 'cva' : 'commodity'
  )
  const [cvaMinScore, setCvaMinScore] = useState<string>(
    template?.cva_min_score != null ? String(template.cva_min_score) : '84'
  )
  const [requiresDescriptors, setRequiresDescriptors] = useState<boolean>(
    !!template?.requires_descriptors
  )

  // --- Parameters working copy (deep-ish clone; sections mutate slices) ---
  const [params, setParams] = useState<any>(() => ({ ...(template?.parameters || {}) }))
  const patch = (slice: Record<string, any>) => setParams((p: any) => ({ ...p, ...slice }))

  // --- Basic info fields backed by params ---
  const origin: string = params?.origin || ''
  const microOrigins: string[] = params?.micro_origins || []
  const sampleSize: string = params?.sample_size_grams != null ? String(params.sample_size_grams) : ''

  const [availableMicroOrigins, setAvailableMicroOrigins] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    let cancelled = false
    async function fetchMicroOrigins() {
      if (!origin) { setAvailableMicroOrigins([]); return }
      try {
        const res = await fetch(`/api/micro-regions?origin=${encodeURIComponent(origin)}`)
        if (!res.ok) { if (!cancelled) setAvailableMicroOrigins([]); return }
        const data = await res.json()
        const regions = Array.isArray(data?.regions) ? data.regions : []
        if (!cancelled) setAvailableMicroOrigins(regions.map((mr: any) => ({ id: mr.id, name: mr.region_name_en })))
      } catch {
        if (!cancelled) setAvailableMicroOrigins([])
      }
    }
    fetchMicroOrigins()
    return () => { cancelled = true }
  }, [origin])

  // --- Live nav summaries (computed from params) ---
  const summaries = useMemo<Record<SectionId, string>>(() => {
    const p = params || {}
    const screens = p.screen_size_requirements?.constraints?.length || 0
    const green = p.green_aspect_configuration?.wordings?.length || 0
    const roast = p.roast_aspect_configuration?.wordings?.length || 0
    const defectsArr = p.defect_configuration?.defects || []
    const defectTotal = p.defect_configuration?.thresholds?.max_total
    const attrs = p.cupping_attributes || []
    const attrMax = attrs.reduce((sum: number, a: any) => sum + (typeof a?.scale?.max === 'number' ? a.scale.max : 0), 0)
    const tf = p.taint_fault_configuration
    const tfActive = (tf?.defects || []).filter((d: any) => d?.active !== false).length
    const sharingLabel = sharing === 'public' ? 'Public' : sharing === 'lab' ? 'Lab' : 'Private'

    return {
      basic: [origin || 'No origin', sampleSize ? `${sampleSize}g` : null, sharingLabel].filter(Boolean).join(' · '),
      screen: screens ? `${screens} constraint${screens === 1 ? '' : 's'}` : 'None',
      green: green ? `${green} levels` : 'None',
      roast: roast ? `${roast} levels` : 'None',
      defects: defectsArr.length
        ? `${defectsArr.length} defects${defectTotal != null ? ` · Total ≤${defectTotal}` : ''}`
        : 'None',
      moisture: (p.moisture_min != null || p.moisture_max != null)
        ? `${p.moisture_min ?? '–'}% – ${p.moisture_max ?? '–'}%`
        : 'Not set',
      quaker: p.max_quakers != null && p.max_quakers > 0 ? `Required · max ${p.max_quakers}` : 'Optional',
      cupping: attrs.length ? `${attrs.length} attributes${attrMax ? ` · max ${attrMax}` : ''}` : 'None',
      taints: tf
        ? `${tfActive} active${tf.rules?.max_taints != null ? ` · T≤${tf.rules.max_taints}` : ''}${tf.rules?.max_faults != null ? ` · F≤${tf.rules.max_faults}` : ''}`
        : 'None',
      clean: 'Auto-calculated',
    }
  }, [params, origin, sampleSize, sharing])

  /** The template fields the template routes take, from the working copy. */
  const buildPayload = () => {
    const nextParams = { ...params }
    // Keep params in sync with Basic info edits
    if (origin) nextParams.origin = origin; else delete nextParams.origin
    if (microOrigins.length) nextParams.micro_origins = microOrigins; else delete nextParams.micro_origins
    if (sampleSize) nextParams.sample_size_grams = parseFloat(sampleSize); else delete nextParams.sample_size_grams

    return {
      ...(template?.id && { id: template.id }),
      name_en: name.trim(),
      name_pt: name.trim(),
      name_es: name.trim(),
      description_en: description.trim() || null,
      description_pt: description.trim() || null,
      description_es: description.trim() || null,
      parameters: nextParams,
      is_active: isActive,
      is_global: sharing === 'public',
      // Preserve existing lab assignment untouched (full sharing UI lands later)
      laboratory_id: sharing === 'public' ? null : (template?.laboratory_id ?? null),
      assigned_laboratories: sharing === 'public' ? [] : (template?.assigned_laboratories ?? []),
      methodology,
      cva_min_score: methodology === 'cva' ? (parseFloat(cvaMinScore) || 84) : null,
      requires_descriptors: methodology === 'cva' ? requiresDescriptors : false,
    }
  }

  return {
    active, setActive,
    name, setName,
    description, setDescription,
    isActive, setIsActive,
    sharing, setSharing,
    methodology, setMethodology,
    cvaMinScore, setCvaMinScore,
    requiresDescriptors, setRequiresDescriptors,
    params, patch,
    origin, microOrigins, sampleSize, availableMicroOrigins,
    summaries,
    buildPayload,
  }
}

export type SpecEditorState = ReturnType<typeof useSpecEditorState>

// ---------------------------------------------------------------------------
// Body: section-nav + panel
// ---------------------------------------------------------------------------

export function SpecEditorBody({
  state,
  variant = 'screen',
  hideSharing = false,
  review,
}: {
  state: SpecEditorState
  /** 'screen' fills the full-screen editor; 'dialog' fits a centered dialog. */
  variant?: 'screen' | 'dialog'
  /** A client's private copy is never shared, so the dialog hides the choice. */
  hideSharing?: boolean
  /** Changes made on the lab's behalf, amber until confirmed (spec-review). */
  review?: SpecReview
}) {
  const [pressing, setPressing] = useState<SectionId | null>(null)
  const { active, setActive, summaries, params, patch } = state
  const reviewItems = review?.items ?? []
  const toneOf = (id: string): ReviewTone | undefined => reviewItems.find((i) => i.id === id)?.status
  const screenTones: Record<string, ReviewTone> = Object.fromEntries(
    reviewItems.filter((i) => i.screen).map((i) => [i.screen!, i.status]),
  )
  const heading = SECTION_HEADINGS[active]
  const dialog = variant === 'dialog'
  const summary = (id: SectionId) =>
    hideSharing && id === 'basic' ? summaries.basic.replace(/ · (Private|Lab|Public)$/, '') : summaries[id]

  return (
    <div className="flex flex-1 min-h-0 flex-col md:flex-row">
      {/* Mobile section selector */}
      <div className="md:hidden shrink-0 bg-background border-b border-border px-4 py-2">
        <Select value={active} onValueChange={(v) => setActive(v as SectionId)}>
          <SelectTrigger aria-label="Section"><SelectValue /></SelectTrigger>
          <SelectContent>
            {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
              <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Left section-nav */}
      <aside
        className={`${dialog ? 'w-[240px] py-2 px-2' : 'w-[300px] py-4 px-3'} shrink-0 border-r border-border bg-muted/40 overflow-y-auto hidden md:block`}
        aria-label="Sections"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className={dialog ? 'mb-2' : 'mb-5'}>
            <div className="px-3 mb-1.5 text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground/70">
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isOn = active === item.id
                const isPressed = pressing === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActive(item.id)}
                    onMouseDown={() => setPressing(item.id)}
                    onMouseUp={() => setPressing(null)}
                    onMouseLeave={() => setPressing(null)}
                    aria-current={isOn ? 'true' : undefined}
                    className={[
                      'w-full text-left rounded-xl px-3 transition-all duration-150',
                      dialog ? 'py-1' : 'py-2',
                      isOn
                        ? 'bg-background shadow-[0_1px_1px_rgba(0,0,0,.03),0_9px_20px_-11px_rgba(20,70,45,.40)]'
                        : 'hover:bg-background/60 hover:-translate-y-px',
                      isPressed ? 'translate-y-0 shadow-inner' : isOn ? '-translate-y-px' : '',
                    ].join(' ')}
                  >
                    <div className={`flex items-center gap-2 text-sm font-semibold ${isOn ? 'text-[#15663f] dark:text-[#5fcf8e]' : 'text-foreground'}`}>
                      {item.label}
                      <ReviewMark tone={sectionTone(reviewItems.filter((i) => i.section === item.id))} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{summary(item.id)}</div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* Main panel */}
      <main className={`flex-1 min-w-0 overflow-y-auto ${dialog ? 'px-4 sm:px-6 py-5' : 'px-4 sm:px-8 py-6 md:py-8'}`}>
        <div className="max-w-4xl">
          {/* In the dialog the highlighted nav item already names the section
              (Daniel 2026-09-29: "they clicked it"), so the heading is for
              screen readers only and the subtitle goes. */}
          <h2 className={dialog ? 'sr-only' : 'text-2xl font-semibold tracking-tight'}>{heading.title}</h2>
          {!dialog && <p className="text-muted-foreground mt-1">{heading.subtitle}</p>}

          <div className={dialog ? '' : 'mt-6'}>
            {review && <ReviewNotes review={review} section={active} />}
            {active === 'basic' ? (
              <BasicInformation state={state} hideSharing={hideSharing} descriptionTone={toneOf('description')} />
            ) : active === 'screen' ? (
              <ScreenSizesSection params={params} patch={patch} tones={screenTones} />
            ) : active === 'green' ? (
              <AspectSection params={params} patch={patch} aspectType="green" />
            ) : active === 'roast' ? (
              <AspectSection params={params} patch={patch} aspectType="roast" />
            ) : active === 'defects' ? (
              <DefectsSection params={params} patch={patch} totalTone={toneOf('defects')} />
            ) : active === 'moisture' ? (
              <MoistureSection params={params} patch={patch} />
            ) : active === 'quaker' ? (
              <QuakerSection params={params} patch={patch} />
            ) : active === 'clean' ? (
              <CleanCupsSection params={params} patch={patch} />
            ) : active === 'cupping' ? (
              <CuppingSection params={params} patch={patch} />
            ) : active === 'taints' ? (
              <TaintsSection params={params} patch={patch} />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Basic information section
// ---------------------------------------------------------------------------

function BasicInformation({ state, hideSharing, descriptionTone }: {
  state: SpecEditorState
  hideSharing: boolean
  descriptionTone?: ReviewTone
}) {
  const { microOrigins, patch } = state
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label htmlFor="tpl-name">{hideSharing ? 'Specification name' : 'Template name'}</Label>
          <Input id="tpl-name" value={state.name} onChange={(e) => state.setName(e.target.value)} placeholder="e.g. Eurodulce 15/16" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tpl-size">Sample size (grams)</Label>
          <Input id="tpl-size" type="number" value={state.sampleSize}
            onChange={(e) => patch({ sample_size_grams: e.target.value === '' ? undefined : e.target.value })} placeholder="300" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label>Origin</Label>
          <Select value={state.origin || undefined} onValueChange={(v) => patch({ origin: v, micro_origins: [] })}>
            <SelectTrigger><SelectValue placeholder="Select origin…" /></SelectTrigger>
            <SelectContent>
              {POPULAR_COFFEE_ORIGINS.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Micro-origins (blends)</Label>
          {!state.origin ? (
            <div className="h-10 flex items-center text-sm text-muted-foreground">Select an origin first</div>
          ) : state.availableMicroOrigins.length === 0 ? (
            <div className="h-10 flex items-center text-sm text-muted-foreground">None available for {state.origin}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {state.availableMicroOrigins.map((mr) => {
                const on = microOrigins.includes(mr.name)
                return (
                  <button
                    key={mr.id}
                    type="button"
                    onClick={() => patch({
                      micro_origins: on ? microOrigins.filter((x) => x !== mr.name) : [...microOrigins, mr.name],
                    })}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                      on
                        ? 'bg-[#e7f2ec] text-[#15663f] border-[#cfe6d9] dark:bg-[#15663f]/25 dark:text-[#7bd6a0] dark:border-[#15663f]/50'
                        : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                    }`}
                  >
                    {mr.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tpl-desc">Description</Label>
        <Textarea id="tpl-desc" value={state.description} onChange={(e) => state.setDescription(e.target.value)} rows={2}
          className={descriptionTone ? REVIEW_FIELD[descriptionTone] : undefined}
          placeholder="Short description shown on the template list…" />
      </div>

      {!hideSharing && (
        <div className="space-y-2 max-w-md">
          <Label>Template sharing</Label>
          <Select value={state.sharing} onValueChange={(v) => state.setSharing(v as Sharing)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private — only visible to you</SelectItem>
              <SelectItem value="lab">Lab — shared with your laboratory</SelectItem>
              <SelectItem value="public">Public — shared across all labs</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label>Grading methodology</Label>
          <Select value={state.methodology} onValueChange={(v) => state.setMethodology(v as 'commodity' | 'cva')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="commodity">Commodity — standard cupping grid</SelectItem>
              <SelectItem value="cva">Specialty — SCA CVA 2024</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Specialty qualities open the immersive CVA tasting journey and score 0–100 on the SCA 2024 standard.
          </p>
        </div>

        {state.methodology === 'cva' && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="space-y-2">
              <Label htmlFor="cva-min">Minimum CVA score to pass</Label>
              <Input id="cva-min" type="number" min={0} max={100} step={0.25} className="w-32"
                value={state.cvaMinScore} onChange={(e) => state.setCvaMinScore(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                e.g. 82 or 84. SCA defines no pass mark — this is the Wolthers/contract threshold.
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
              <Switch checked={state.requiresDescriptors} onCheckedChange={state.setRequiresDescriptors} />
              Require flavor notes (descriptive CATA) before this quality can pass
            </label>
          </div>
        )}
      </div>
    </div>
  )
}

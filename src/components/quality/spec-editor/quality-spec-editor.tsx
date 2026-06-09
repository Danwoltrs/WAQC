'use client'

/**
 * QualitySpecEditor — full-screen quality template editor.
 *
 * Replaces the old nested-modal TemplateBuilder render with a single surface:
 * sticky top bar + grouped left section-nav (raised-card active state) + an
 * inline scrolling panel. No section opens a modal on top of another.
 *
 * Checkpoint 3: the shell, nav (live summaries + raised-card active state),
 * section switching, and a working Basic Information section. The remaining
 * sections render scaffold panels and their existing config round-trips
 * untouched on save (no data loss while they are migrated inline).
 */

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save } from 'lucide-react'
import { POPULAR_COFFEE_ORIGINS } from '@/types/micro-region-configuration'
import { ScreenSizesSection } from './sections/screen-sizes-section'
import { AspectSection } from './sections/aspect-section'
import { DefectsSection } from './sections/defects-section'
import { CuppingSection } from './sections/cupping-section'
import { TaintsSection } from './sections/taints-section'
import { MoistureSection } from './sections/moisture-section'
import { QuakerSection } from './sections/quaker-section'
import { CleanCupsSection } from './sections/clean-cups-section'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Template {
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

interface QualitySpecEditorProps {
  template?: Template
  onSave: (template: any) => Promise<void>
  onCancel: () => void
}

type SectionId =
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
// Component
// ---------------------------------------------------------------------------

export function QualitySpecEditor({ template, onSave, onCancel }: QualitySpecEditorProps) {
  const [active, setActive] = useState<SectionId>('basic')
  const [pressing, setPressing] = useState<SectionId | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- Top-level fields ---
  const [name, setName] = useState(template?.name_en || template?.name || '')
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

  const templateName = name.trim() || 'Untitled template'

  // --- Save ---
  const handleSave = async () => {
    if (!name.trim()) { setError('Template name is required.'); setActive('basic'); return }
    setSaving(true); setError(null)
    try {
      const nextParams = { ...params }
      // Keep params in sync with Basic info edits
      if (origin) nextParams.origin = origin; else delete nextParams.origin
      if (microOrigins.length) nextParams.micro_origins = microOrigins; else delete nextParams.micro_origins
      if (sampleSize) nextParams.sample_size_grams = parseFloat(sampleSize); else delete nextParams.sample_size_grams

      const payload: any = {
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
      await onSave(payload)
    } catch (err: any) {
      setError(err?.message || 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  const heading = SECTION_HEADINGS[active]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Sticky top bar */}
      <header className="flex items-center justify-between gap-4 h-16 px-4 sm:px-6 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onCancel}
            className="h-9 w-9 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            title="Back to templates"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <nav className="flex items-center gap-2 text-sm min-w-0">
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
              Quality Templates
            </button>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-semibold truncate">{templateName}</span>
            {template?.version != null && (
              <span className="font-mono text-[10.5px] font-semibold text-muted-foreground bg-muted rounded px-1.5 py-px shrink-0">
                v{template.version}
              </span>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <label className="hidden sm:flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
            <span className={isActive ? 'text-[#15663f] dark:text-[#5fcf8e]' : 'text-muted-foreground'}>Active</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save template'}
          </Button>
        </div>
      </header>

      {error && (
        <div className="px-6 py-2 text-sm text-[#b0322a] bg-[#fbeceb] dark:bg-[#b0322a]/20 dark:text-[#f0928a] border-b border-border">
          {error}
        </div>
      )}

      {/* Body: nav + panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left section-nav */}
        <aside className="w-[300px] shrink-0 border-r border-border bg-muted/40 overflow-y-auto py-4 px-3 hidden md:block">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-5">
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
                      onClick={() => setActive(item.id)}
                      onMouseDown={() => setPressing(item.id)}
                      onMouseUp={() => setPressing(null)}
                      onMouseLeave={() => setPressing(null)}
                      className={[
                        'w-full text-left rounded-xl px-3 py-2 transition-all duration-150',
                        isOn
                          ? 'bg-background shadow-[0_1px_1px_rgba(0,0,0,.03),0_9px_20px_-11px_rgba(20,70,45,.40)]'
                          : 'hover:bg-background/60 hover:-translate-y-px',
                        isPressed ? 'translate-y-0 shadow-inner' : isOn ? '-translate-y-px' : '',
                      ].join(' ')}
                    >
                      <div className={`text-sm font-semibold ${isOn ? 'text-[#15663f] dark:text-[#5fcf8e]' : 'text-foreground'}`}>
                        {item.label}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{summaries[item.id]}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Mobile section selector */}
        <div className="md:hidden absolute top-16 left-0 right-0 z-10 bg-background border-b border-border px-4 py-2">
          <Select value={active} onValueChange={(v) => setActive(v as SectionId)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Main panel */}
        <main className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-8 py-6 md:py-8 mt-14 md:mt-0">
          <div className="max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-tight">{heading.title}</h2>
            <p className="text-muted-foreground mt-1">{heading.subtitle}</p>

            <div className="mt-6">
              {active === 'basic' ? (
                <BasicInformation
                  name={name} setName={setName}
                  sampleSize={sampleSize} onSampleSize={(v) => patch({ sample_size_grams: v === '' ? undefined : v })}
                  origin={origin} onOrigin={(v) => patch({ origin: v, micro_origins: [] })}
                  microOrigins={microOrigins} availableMicroOrigins={availableMicroOrigins}
                  onToggleMicroOrigin={(n) => patch({
                    micro_origins: microOrigins.includes(n) ? microOrigins.filter((x) => x !== n) : [...microOrigins, n],
                  })}
                  description={description} setDescription={setDescription}
                  sharing={sharing} setSharing={setSharing}
                  methodology={methodology} setMethodology={setMethodology}
                  cvaMinScore={cvaMinScore} setCvaMinScore={setCvaMinScore}
                  requiresDescriptors={requiresDescriptors} setRequiresDescriptors={setRequiresDescriptors}
                />
              ) : active === 'screen' ? (
                <ScreenSizesSection params={params} patch={patch} />
              ) : active === 'green' ? (
                <AspectSection params={params} patch={patch} aspectType="green" />
              ) : active === 'roast' ? (
                <AspectSection params={params} patch={patch} aspectType="roast" />
              ) : active === 'defects' ? (
                <DefectsSection params={params} patch={patch} />
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Basic information section
// ---------------------------------------------------------------------------

function BasicInformation(props: {
  name: string; setName: (v: string) => void
  sampleSize: string; onSampleSize: (v: string) => void
  origin: string; onOrigin: (v: string) => void
  microOrigins: string[]; availableMicroOrigins: Array<{ id: string; name: string }>
  onToggleMicroOrigin: (name: string) => void
  description: string; setDescription: (v: string) => void
  sharing: Sharing; setSharing: (v: Sharing) => void
  methodology: 'commodity' | 'cva'; setMethodology: (v: 'commodity' | 'cva') => void
  cvaMinScore: string; setCvaMinScore: (v: string) => void
  requiresDescriptors: boolean; setRequiresDescriptors: (v: boolean) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label htmlFor="tpl-name">Template name</Label>
          <Input id="tpl-name" value={props.name} onChange={(e) => props.setName(e.target.value)} placeholder="e.g. Eurodulce 15/16" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tpl-size">Sample size (grams)</Label>
          <Input id="tpl-size" type="number" value={props.sampleSize} onChange={(e) => props.onSampleSize(e.target.value)} placeholder="300" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label>Origin</Label>
          <Select value={props.origin || undefined} onValueChange={props.onOrigin}>
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
          {!props.origin ? (
            <div className="h-10 flex items-center text-sm text-muted-foreground">Select an origin first</div>
          ) : props.availableMicroOrigins.length === 0 ? (
            <div className="h-10 flex items-center text-sm text-muted-foreground">None available for {props.origin}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {props.availableMicroOrigins.map((mr) => {
                const on = props.microOrigins.includes(mr.name)
                return (
                  <button
                    key={mr.id}
                    type="button"
                    onClick={() => props.onToggleMicroOrigin(mr.name)}
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
        <Textarea id="tpl-desc" value={props.description} onChange={(e) => props.setDescription(e.target.value)} rows={2}
          placeholder="Short description shown on the template list…" />
      </div>

      <div className="space-y-2 max-w-md">
        <Label>Template sharing</Label>
        <Select value={props.sharing} onValueChange={(v) => props.setSharing(v as Sharing)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="private">Private — only visible to you</SelectItem>
            <SelectItem value="lab">Lab — shared with your laboratory</SelectItem>
            <SelectItem value="public">Public — shared across all labs</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label>Grading methodology</Label>
          <Select value={props.methodology} onValueChange={(v) => props.setMethodology(v as 'commodity' | 'cva')}>
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

        {props.methodology === 'cva' && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="space-y-2">
              <Label htmlFor="cva-min">Minimum CVA score to pass</Label>
              <Input id="cva-min" type="number" min={0} max={100} step={0.25} className="w-32"
                value={props.cvaMinScore} onChange={(e) => props.setCvaMinScore(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                e.g. 82 or 84. SCA defines no pass mark — this is the Wolthers/contract threshold.
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
              <Switch checked={props.requiresDescriptors} onCheckedChange={props.setRequiresDescriptors} />
              Require flavor notes (descriptive CATA) before this quality can pass
            </label>
          </div>
        )}
      </div>
    </div>
  )
}


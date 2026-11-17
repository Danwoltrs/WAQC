'use client'

/**
 * A client's quality specification in the lab spec editor's own sections: the
 * section nav on the left with lots-within counts, the active section on the
 * right. Read-only unless `editing`: the section renders inside a disabled
 * fieldset and its patches are dropped, so `onPatch` only ever fires while
 * editing (Task 12 builds editing on top of this view).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CLIENT_SECTIONS, type ClientSectionId } from '@/lib/portal/portal-qualities'
import { sectionTitle } from '@/components/quality/spec-editor/spec-editor-body'
import { ScreenSizesSection } from '@/components/quality/spec-editor/sections/screen-sizes-section'
import { AspectSection } from '@/components/quality/spec-editor/sections/aspect-section'
import { DefectsSection } from '@/components/quality/spec-editor/sections/defects-section'
import { PhysicalSection } from '@/components/quality/spec-editor/sections/physical-section'
import { CuppingSection } from '@/components/quality/spec-editor/sections/cupping-section'
import { TaintsSection } from '@/components/quality/spec-editor/sections/taints-section'
import { CleanCupsSection } from '@/components/quality/spec-editor/sections/clean-cups-section'
import { SensorySection } from '@/components/quality/spec-editor/sections/sensory-section'
import type { RegionalProfile } from '@/lib/sensory'

export type SectionCounts = Record<ClientSectionId, { within: number; lots: number } | null> | null
type Patch = (slice: Record<string, any>) => void

const dropPatch: Patch = () => {}

/** The same section-to-component mapping as SpecEditorBody, for the client sections. */
function SectionPanel({ id, params, patch, profiles }: { id: ClientSectionId; params: any; patch: Patch; profiles: RegionalProfile[] }) {
  switch (id) {
    case 'screen': return <ScreenSizesSection params={params} patch={patch} />
    case 'green': return <AspectSection params={params} patch={patch} aspectType="green" />
    case 'roast': return <AspectSection params={params} patch={patch} aspectType="roast" />
    case 'defects': return <DefectsSection params={params} patch={patch} />
    case 'physical': return <PhysicalSection params={params} patch={patch} />
    case 'cupping': return <CuppingSection params={params} patch={patch} />
    case 'taints': return <TaintsSection params={params} patch={patch} />
    case 'clean': return <CleanCupsSection params={params} patch={patch} />
    case 'sensory': return <SensorySection params={params} patch={patch} profiles={profiles} readOnlyProfiles />
  }
}

/**
 * Give id-less cupping attributes stable ids. Read mode never patches, so it
 * displays this; editing starts from it too, so the cupping section has no ids
 * to add on mount and the change list never counts editor-added ids.
 */
export function withStableIds(params: any): any {
  const attrs = params?.cupping_attributes
  if (!Array.isArray(attrs) || attrs.every((a: any) => a?.id)) return params
  return { ...params, cupping_attributes: attrs.map((a: any, i: number) => (a?.id ? a : { ...a, id: `attr_${i}` })) }
}

export function SpecSectionsView({ parameters, sections, active, onSelect, editing, onPatch, below, methodology, fetch: portalFetch }: {
  parameters: any
  sections: SectionCounts
  active: ClientSectionId
  onSelect: (id: ClientSectionId) => void
  editing: boolean
  onPatch: Patch
  /** Rendered under the section panel (the versions panel). */
  below?: ReactNode
  /** CVA qualities carry their own sensory capture, so the sensory section is hidden for them. */
  methodology?: 'commodity' | 'cva' | null
  /** Portal fetch (carries the company); the profiles list is read through it. */
  fetch?: (path: string) => Promise<Response>
}) {
  const [profiles, setProfiles] = useState<RegionalProfile[]>([])
  useEffect(() => {
    let cancelled = false
    ;(portalFetch ?? fetch)('/api/portal/regional-profiles')
      .then((res) => (res.ok ? res.json() : { profiles: [] }))
      .then((data) => { if (!cancelled) setProfiles(Array.isArray(data?.profiles) ? data.profiles : []) })
      .catch(() => { if (!cancelled) setProfiles([]) })
    return () => { cancelled = true }
  }, [portalFetch])
  const ids = useMemo(() => CLIENT_SECTIONS.filter((id) => !(id === 'sensory' && methodology === 'cva')), [methodology])

  const shown = useMemo(() => (editing ? parameters ?? {} : withStableIds(parameters ?? {})), [editing, parameters])

  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] md:flex-row">
      <nav aria-label="Sections" className="shrink-0 border-b-[0.5px] border-black/10 p-3 md:w-[240px] md:border-b-0 md:border-r-[0.5px]">
        <div className="space-y-0.5">
          {ids.map((id) => {
            const count = sections?.[id]
            const isOn = id === active
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                aria-current={isOn ? 'true' : undefined}
                className={`w-full rounded-[6px] px-3 py-2 text-left transition-colors ${isOn ? 'bg-black/[0.04]' : 'hover:bg-black/[0.03]'}`}
              >
                <div className="text-sm font-semibold">{sectionTitle(id)}</div>
                {count && count.lots > 0 && (
                  <div className="mt-0.5 text-xs text-black/40">{`${count.within} of ${count.lots} lots within`}</div>
                )}
              </button>
            )
          })}
        </div>
      </nav>
      <div className="min-w-0 flex-1 space-y-6 bg-white p-6">
        <fieldset data-testid="spec-section-panel" disabled={!editing} className="min-w-0">
          <h2 className="mb-4 text-sm font-semibold">{sectionTitle(active)}</h2>
          <SectionPanel id={active} params={shown} patch={editing ? onPatch : dropPatch} profiles={profiles} />
        </fieldset>
        {below}
      </div>
    </div>
  )
}

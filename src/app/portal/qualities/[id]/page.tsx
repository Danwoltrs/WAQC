'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import type { ClientSectionId, PortalVersionView } from '@/lib/portal/portal-qualities'
import type { PortalPeriod } from '@/lib/portal/portal-period'
import { PortalSessionEnded, withCarried } from '@/lib/portal/portal-fetch'
import { PortalNotice, usePortal } from '@/components/portal/portal-context'
import { formatCalendarDate } from '@/components/portal/qualities/qualities-table'
import { SpecSectionsView, withStableIds, type SectionCounts } from '@/components/portal/qualities/spec-sections-view'
import { VersionsPanel } from '@/components/portal/qualities/versions-panel'
import { CancelScheduledDialog, ChangeDialog } from '@/components/portal/qualities/change-dialog'
import { Button } from '@/components/ui/button'

interface QualityDetail {
  period: PortalPeriod
  quality: { id: string; name: string; origin: string | null; methodology: 'commodity' | 'cva' | null }
  inForce: { versionId: string; versionNo: number; effectiveFrom: string; parameters: any; original?: boolean } | null
  versions: PortalVersionView[]
  sections: SectionCounts
  canEdit: boolean
}
interface Key { companyId: string; periodKey: string | null; id: string }
interface Tagged<T> extends Key { value: T }
type Failure = Key & { kind: 'denied' | 'missing' | 'failed' }
/** One working copy for the whole spec, tagged like the data so a company switch drops it. */
interface Edit extends Key {
  baseVersionId: string
  /** The in-force parameters with stable cupping ids: the diff's baseline, so editor-added ids never count. */
  baseline: Record<string, any>
  working: Record<string, any>
}

const noop = () => {}

export default function PortalQualityDetailPage() {
  const { fetch: portalFetch, company } = usePortal()
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const periodKey = searchParams.get('period')
  const [loaded, setLoaded] = useState<Tagged<QualityDetail> | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [active, setActive] = useState<ClientSectionId>('screen')
  const [edit, setEdit] = useState<Edit | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [cancelling, setCancelling] = useState<{ id: string; effectiveFrom: string } | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    const key = { companyId: company.id, periodKey, id }
    ;(async () => {
      try {
        const qs = periodKey ? `?period=${encodeURIComponent(periodKey)}` : ''
        const res = await portalFetch(`/api/portal/qualities/${id}${qs}`)
        if (!live) return
        if (res.status === 403) { setFailure({ ...key, kind: 'denied' }); return }
        if (res.status === 404) { setFailure({ ...key, kind: 'missing' }); return }
        if (!res.ok) { setFailure({ ...key, kind: 'failed' }); return }
        const d = (await res.json()) as QualityDetail
        if (!live) return
        setFailure(null)
        setLoaded({ ...key, value: d })
      } catch (e) {
        if (e instanceof PortalSessionEnded || !live) return
        setFailure({ ...key, kind: 'failed' })
      }
    })()
    return () => { live = false }
  }, [portalFetch, company.id, periodKey, id, reload])

  const same = (t: Key | null) => t != null && t.companyId === company.id && t.periodKey === periodKey && t.id === id
  const data = same(loaded) ? loaded!.value : null
  const failed = same(failure) ? failure!.kind : null
  const editing = same(edit) ? edit : null

  const startEditing = () => {
    if (!data?.inForce) return
    const baseline = withStableIds(data.inForce.parameters ?? {})
    setEdit({ companyId: company.id, periodKey, id, baseVersionId: data.inForce.versionId, baseline, working: baseline })
  }
  const discard = () => { setEdit(null); setReviewing(false) }
  const patch = (slice: Record<string, any>) => setEdit((e) => (e ? { ...e, working: { ...e.working, ...slice } } : e))
  const saved = () => { discard(); setReload((n) => n + 1) }

  const back = (
    <Link
      href={withCarried('/portal/qualities', company.id, periodKey ? `period=${encodeURIComponent(periodKey)}` : '')}
      className="inline-flex items-center gap-1 text-[13px] text-black/40 hover:text-black"
    >
      <ChevronLeft className="h-4 w-4" /> Qualities
    </Link>
  )

  let body
  if (failed === 'denied') {
    body = <PortalNotice>Qualities are not part of your access.</PortalNotice>
  } else if (failed === 'missing') {
    body = <PortalNotice>This quality was not found.</PortalNotice>
  } else if (failed === 'failed') {
    body = <PortalNotice>Could not load this quality. Please refresh.</PortalNotice>
  } else if (!data) {
    body = <div className="text-sm text-black/40">Loading...</div>
  } else {
    const { quality, inForce } = data
    const onCancel = (versionId: string) => {
      const v = data.versions.find((x) => x.id === versionId)
      if (v) setCancelling({ id: v.id, effectiveFrom: v.effectiveFrom })
    }
    const versions = <VersionsPanel versions={data.versions} canEdit={data.canEdit} onCancel={onCancel} />
    const scheduled = data.versions.find((v) => v.status === 'scheduled')
    let actions = null
    if (data.canEdit && inForce) {
      if (editing) {
        actions = (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-[6px]" onClick={discard}>Cancel</Button>
            <Button type="button" size="sm" className="rounded-[6px]" onClick={() => setReviewing(true)}>Review change</Button>
          </div>
        )
      } else if (scheduled) {
        actions = (
          <p className="text-[13px] text-black/40">
            {`A change is scheduled for ${formatCalendarDate(scheduled.effectiveFrom)}. Cancel it to make another.`}
          </p>
        )
      } else {
        actions = <Button type="button" size="sm" className="rounded-[6px]" onClick={startEditing}>Change</Button>
      }
    }
    body = (
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{quality.origin ? `${quality.name} · ${quality.origin}` : quality.name}</h1>
          {inForce && (
            <span className="rounded-[4px] bg-black/5 px-1.5 py-0.5 text-xs">
              {inForce.original
                ? `v${inForce.versionNo} · Original specification`
                : `v${inForce.versionNo} in force since ${formatCalendarDate(inForce.effectiveFrom)}`}
            </span>
          )}
          {actions && <div className="ml-auto">{actions}</div>}
        </div>
        {inForce ? (
          <>
            <p className="mt-1 text-xs text-black/40">{`Lot counts for ${data.period.label}`}</p>
            <div className="mt-[18px]">
              <SpecSectionsView
                parameters={editing ? editing.working : inForce.parameters}
                sections={data.sections}
                active={active}
                onSelect={setActive}
                editing={editing !== null}
                onPatch={editing ? patch : noop}
                below={versions}
              />
            </div>
            {editing && (
              <ChangeDialog
                open={reviewing}
                onOpenChange={setReviewing}
                qualityId={quality.id}
                baseVersionId={editing.baseVersionId}
                baseline={editing.baseline}
                working={editing.working}
                fetch={portalFetch}
                onSaved={saved}
              />
            )}
          </>
        ) : (
          <div className="mt-[18px] space-y-4">
            <p className="text-[13px] text-black/40">This quality has no specification yet.</p>
            {data.versions.length > 0 && (
              <div className="rounded-[10px] border-[0.5px] border-black/10 bg-[#F9F9FA] p-6">{versions}</div>
            )}
          </div>
        )}
      </div>
    )
  }

  const cancelled = () => { setCancelling(null); setReload((n) => n + 1) }

  return (
    <div>
      {back}
      <div className="mt-3">{body}</div>
      <CancelScheduledDialog
        version={cancelling}
        onClose={() => setCancelling(null)}
        qualityId={id}
        fetch={portalFetch}
        onCancelled={cancelled}
      />
    </div>
  )
}

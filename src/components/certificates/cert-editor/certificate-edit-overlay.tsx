'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Loader2, X, Save } from 'lucide-react'
import { useCertEditor } from './use-cert-editor'
import { certTypeLabel } from './shared'
import { InfoStripBand, DetailsEditPanel } from './info-strip'
import { DefectsQuadrant, DefectsEditPanel } from './defects-quadrant'
import { ScreenQuadrant, ScreenEditPanel } from './screen-quadrant'
import { PhysicalQuadrant, PhysicalEditPanel } from './physical-quadrant'
import { CuppingQuadrant, CuppingEditPanel } from './cupping-quadrant'

export interface CertificateEditOverlayProps {
  open: boolean
  sampleId: string | null
  onOpenChange: (open: boolean) => void
  /** Fired after a successful save so the underlying list can refetch in place. */
  onSaved?: () => void
}

type Panel = 'defects' | 'screen' | 'physical' | 'cupping' | 'details' | null

function statusBadge(status: string): { label: string; className: string } {
  const s = (status || '').toLowerCase()
  const map: Record<string, { label: string; className: string }> = {
    approved: { label: 'Approved', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    certified: { label: 'Approved', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    in_progress: { label: 'In Progress', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    pending: { label: 'Pending', className: 'bg-muted text-muted-foreground' },
  }
  return map[s] || { label: status || 'Unknown', className: 'bg-muted text-muted-foreground' }
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-GB')
  } catch {
    return '—'
  }
}

export function CertificateEditOverlay({ open, sampleId, onOpenChange, onSaved }: CertificateEditOverlayProps) {
  const { toast } = useToast()
  const ed = useCertEditor(sampleId, open)
  const [panel, setPanel] = useState<Panel>(null)

  // Reset transient UI when the overlay opens for a new sample.
  useEffect(() => {
    if (open) setPanel(null)
  }, [open, sampleId])

  // Escape closes the top-most surface (panel first, then overlay).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (panel) setPanel(null)
      else onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, panel, onOpenChange])

  if (!open) return null

  const { sample, draft, loading, error, dirty, saving } = ed

  const handleSave = async () => {
    try {
      const ok = await ed.save()
      if (ok) {
        toast({ title: 'Changes saved' })
        onSaved?.()
        onOpenChange(false)
      }
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      })
    }
  }

  const badge = sample ? statusBadge(sample.status) : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Topbar — always visible */}
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-foreground">
              {sample ? sample.tracking_number : 'Loading…'}
            </span>
            {badge ? (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
            ) : null}
            {sample ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {certTypeLabel(draft.sample.sample_type ?? sample.sample_type, ed.isCVA)}
              </span>
            ) : null}
          </div>
          {sample ? (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {[sample.origin, sample.quality_name, `Created ${formatDate(sample.created_at)}`]
                .filter(Boolean)
                .join(' · ')}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {dirty ? <span className="mr-1 text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span> : null}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            <X className="mr-1.5 h-4 w-4" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || loading || !sample}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error || !sample ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <p>{error === 'unauthorized' ? 'You are not authorized to view this sample.' : 'Sample could not be loaded.'}</p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      ) : (
        <>
          <InfoStripBand sample={sample} draftSample={draft.sample} onEdit={() => setPanel('details')} />

          {/* Quadrant dashboard */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
              <DefectsQuadrant
                defects={draft.defects}
                locked={!ed.canEditQuality}
                lockedReason={ed.qualityLockMessage}
                onEdit={() => setPanel('defects')}
              />
              <ScreenQuadrant
                screens={draft.screens}
                locked={!ed.canEditQuality}
                lockedReason={ed.qualityLockMessage}
                onEdit={() => setPanel('screen')}
              />
              <PhysicalQuadrant
                draft={draft}
                locked={!ed.canEditQuality}
                lockedReason={ed.qualityLockMessage}
                onEdit={() => setPanel('physical')}
              />
              <CuppingQuadrant
                draft={draft}
                isCVA={ed.isCVA}
                cvaScore={ed.cvaScore}
                cvaMinScore={ed.cvaMinScore}
                locked={!ed.canEditQuality}
                lockedReason={ed.qualityLockMessage}
                onEdit={() => setPanel('cupping')}
              />
            </div>
          </div>

          {/* Per-quadrant edit panels — conditionally mounted so their local working
              copy re-seeds from the current draft every time they (re)open. */}
          {panel === 'defects' && (
            <DefectsEditPanel
              open
              defects={draft.defects}
              onCancel={() => setPanel(null)}
              onApply={(next) => {
                ed.setDraft((prev) => ({ ...prev, defects: next }))
                setPanel(null)
              }}
            />
          )}
          {panel === 'screen' && (
            <ScreenEditPanel
              open
              screens={draft.screens}
              onCancel={() => setPanel(null)}
              onApply={(next) => {
                ed.setDraft((prev) => ({ ...prev, screens: next }))
                setPanel(null)
              }}
            />
          )}
          {panel === 'physical' && (
            <PhysicalEditPanel
              open
              draft={draft}
              onCancel={() => setPanel(null)}
              onApply={(next) => {
                ed.setDraft((prev) => ({ ...prev, ...next }))
                setPanel(null)
              }}
            />
          )}
          {panel === 'cupping' && (
            <CuppingEditPanel
              open
              draft={draft}
              onCancel={() => setPanel(null)}
              onApply={(next) => {
                ed.setDraft((prev) => ({ ...prev, ...next }))
                setPanel(null)
              }}
            />
          )}
          {panel === 'details' && (
            <DetailsEditPanel
              open
              sample={sample}
              draftSample={draft.sample}
              qualityOptions={ed.qualityOptions}
              lockedQuality={!ed.canEditQuality}
              lockedReason={ed.qualityLockMessage}
              onCancel={() => setPanel(null)}
              onApply={(form) => {
                ed.setDraft((prev) => ({ ...prev, sample: { ...prev.sample, ...form } }))
                setPanel(null)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

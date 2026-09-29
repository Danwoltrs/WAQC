'use client'

import { useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SpecEditorBody, useSpecEditorState, type SectionId, type SpecTemplate } from '@/components/quality/spec-editor/spec-editor-body'
import type { ReviewTone, SpecReview } from '@/components/quality/spec-editor/spec-review'
import { planCopyEdits, type CopyEditId } from '@/lib/quality-copy-edits'

/** One of the client's specifications, as GET /api/clients/[id]/quality-specifications returns it. */
export interface ClientSpecification {
  id: string
  custom_name: string | null
  quality_code?: string | null
  template: (SpecTemplate & { id: string }) | null
}

/**
 * The second stage of the "New quality specification" dialog: a copy of one
 * of the client's specifications, edited in place with the Quality Templates
 * editor's sections (spec-editor-body). Nothing exists until Save, which
 * sends the name and the edited template fields with the duplicate request
 * (POST /api/client-qualities/[id]/duplicate), so Cancel and Back leave no
 * copy behind and a failure never leaves an unedited one. The copy belongs to
 * this client alone, so the sharing choice is hidden.
 *
 * The copy opens already changed toward the contract's quality text
 * (quality-copy-edits: description, screens, defects by NY grade). Each change
 * shows in amber until the lab marks it correct (green) or undoes it.
 */
export function NewSpecEditorStage({
  source,
  clientName,
  initialName,
  contractText,
  contractDescription,
  onBack,
  onCancel,
  onSaved,
}: {
  source: ClientSpecification & { template: SpecTemplate & { id: string } }
  clientName: string
  initialName?: string
  /** The sys contract's quality text the copy is made for. */
  contractText?: string
  /** The full description of the contract's sys quality, when known. */
  contractDescription?: string | null
  onBack: () => void
  onCancel: () => void
  onSaved: (specification: { id: string; custom_name: string | null }) => void
}) {
  const sourceName = source.custom_name || source.template.name_en || source.template.name || 'Unnamed'
  const sourceDescription = source.template.description_en || source.template.description || ''
  const [plan] = useState(() => planCopyEdits({
    contractText,
    contractDescription,
    sourceText: [source.custom_name, source.template.name_en || source.template.name].filter(Boolean).join(' '),
    sourceDescription,
    parameters: source.template.parameters,
  }))
  // The copy starts as the source, changed toward the contract; its version
  // and id are the clone's own.
  const state = useSpecEditorState(
    {
      ...source.template,
      id: undefined,
      version: undefined,
      parameters: plan.parameters,
      description_en: plan.description ?? sourceDescription,
    },
    {
      initialName: initialName || `${sourceName} (copy)`,
      initialSection: (plan.edits[0]?.section as SectionId | undefined) ?? 'screen',
    },
  )
  const [statuses, setStatuses] = useState<Partial<Record<CopyEditId, ReviewTone | 'undone'>>>(
    () => Object.fromEntries(plan.edits.map((e) => [e.id, 'pending'])),
  )
  const undo = (id: CopyEditId) => {
    const original = source.template.parameters || {}
    if (id === 'description') state.setDescription(sourceDescription)
    if (id === 'screen') state.patch({ screen_size_requirements: original.screen_size_requirements })
    if (id === 'defects') {
      const config = state.params.defect_configuration || {}
      state.patch({
        defect_configuration: {
          ...config,
          thresholds: { ...config.thresholds, max_total: original.defect_configuration?.thresholds?.max_total },
        },
      })
    }
    setStatuses((s) => ({ ...s, [id]: 'undone' }))
  }
  const review: SpecReview = {
    items: plan.edits
      .filter((e) => statuses[e.id] && statuses[e.id] !== 'undone')
      .map((e) => ({ ...e, status: statuses[e.id] as ReviewTone })),
    onConfirm: (id) => setStatuses((s) => ({ ...s, [id]: 'confirmed' })),
    onUndo: (id) => undo(id as CopyEditId),
  }
  const toCheck = review.items.filter((i) => i.status === 'pending').length
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const name = state.name.trim()
    if (!name) {
      setError('Give the specification a name.')
      state.setActive('basic')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = state.buildPayload()
      const response = await fetch(`/api/client-qualities/${source.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_name: name,
          template: {
            parameters: payload.parameters,
            description_en: payload.description_en,
            methodology: payload.methodology,
            cva_min_score: payload.cva_min_score,
            requires_descriptors: payload.requires_descriptors,
          },
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        // A taken name is fixed on Basic information, where the name is.
        if (response.status === 409) state.setActive('basic')
        throw new Error(data.error || 'The specification could not be saved')
      }
      onSaved({ id: data.client_quality.id, custom_name: data.client_quality.custom_name ?? name })
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to fetch'
        ? err.message
        : 'The specification could not be saved. Check the connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 text-left sm:px-6">
        <DialogTitle>New quality specification</DialogTitle>
        <DialogDescription className="truncate">
          <span className="font-medium text-foreground">{state.name.trim() || 'Unnamed'}</span>
          {' '}· from {sourceName} · for {clientName} only
        </DialogDescription>
      </DialogHeader>

      {error && (
        <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-6">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <SpecEditorBody state={state} variant="dialog" hideSharing review={review} />

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-6">
        <Button type="button" variant="ghost" onClick={onBack} disabled={saving}>Back</Button>
        <div className="flex items-center gap-2">
          {toCheck > 0 && (
            <span className="mr-2 text-xs text-amber-700 dark:text-amber-300">
              {toCheck} {toCheck === 1 ? 'change' : 'changes'} from the contract to check
            </span>
          )}
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>) : 'Save'}
          </Button>
        </div>
      </footer>
    </>
  )
}

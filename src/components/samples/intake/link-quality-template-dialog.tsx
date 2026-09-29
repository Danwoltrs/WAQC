'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NewSpecEditorStage, type ClientSpecification } from './new-spec-editor-stage'

interface LinkQualityTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  /** The new specification, so a caller can select it at once. */
  onSuccess: (specification?: { id: string; custom_name: string | null }) => void
  /**
   * What the specification starts as: the sys contract's own quality words
   * ("15/16 FC") when the intake found no specification for them.
   */
  initialName?: string
  initialOrigin?: string
  /** The client's specification to start a copy from (the contract's closest match). */
  suggestedSpecId?: string | null
  /** The full description of the contract's sys quality, copied into a new specification. */
  contractDescription?: string | null
}

interface QualityTemplate {
  id: string
  name_en: string
  name_pt?: string
  name_es?: string
  description_en?: string
  version: string
  is_active: boolean
}

type EditableSpec = ClientSpecification & { template: NonNullable<ClientSpecification['template']> }

/**
 * A new quality specification for a client, in one dialog (Daniel
 * 2026-09-29: "duplicate a previous quality, and change some small
 * specifications only, all on this screen"). It starts from either
 *
 * - one of the client's specifications: "Duplicate and edit" opens the copy
 *   in place (NewSpecEditorStage), saved as the client's own variant; or
 * - a shared template, linked as it is (POST /api/clients/[id]/quality-
 *   specifications). A shared template is never edited from here: editing it
 *   would change it for every client that uses it.
 *
 * A client with no specifications yet has only the second.
 */
export function LinkQualityTemplateDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  onSuccess,
  initialName,
  initialOrigin,
  suggestedSpecId,
  contractDescription,
}: LinkQualityTemplateDialogProps) {
  const [templates, setTemplates] = useState<QualityTemplate[]>([])
  const [specs, setSpecs] = useState<EditableSpec[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [stage, setStage] = useState<'start' | 'edit'>('start')
  const [mode, setMode] = useState<'duplicate' | 'link'>('link')
  const [sourceId, setSourceId] = useState('')

  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [origin, setOrigin] = useState('')
  const [customName, setCustomName] = useState('')
  const [qualityCode, setQualityCode] = useState('')

  // Load the client's specifications and the shared templates when the
  // dialog opens, and start from the words the caller brought (the
  // contract's quality), leaving anything typed alone.
  useEffect(() => {
    if (open) {
      setStage('start')
      loadOptions()
      if (initialName) setCustomName((current) => current || initialName)
      if (initialOrigin) setOrigin((current) => current || initialOrigin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId, initialName, initialOrigin])

  const loadOptions = async () => {
    setLoading(true)
    setError(null)
    try {
      const [specsRes, templatesRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/quality-specifications`),
        fetch('/api/quality-templates?is_active=true'),
      ])
      const clientSpecs: EditableSpec[] = specsRes.ok
        ? ((await specsRes.json()).specifications || []).filter((s: ClientSpecification) => s.template)
        : []
      setSpecs(clientSpecs)
      setMode(clientSpecs.length > 0 ? 'duplicate' : 'link')
      setSourceId((current) =>
        clientSpecs.some((s) => s.id === current) ? current
          : clientSpecs.find((s) => s.id === suggestedSpecId)?.id ?? clientSpecs[0]?.id ?? '')

      if (templatesRes.ok) {
        const data = await templatesRes.json()
        setTemplates(data.templates || [])
      } else {
        setError('Failed to load quality templates')
      }
    } catch (err) {
      console.error('Error loading templates:', err)
      setError('Failed to load quality templates')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedTemplateId) {
      setError('Please select a quality template')
      return
    }

    if (!customName) {
      setError('Please provide a custom name for this quality specification')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/clients/${clientId}/quality-specifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplateId,
          origin: origin || null,
          custom_name: customName,
          quality_code: qualityCode || null,
          is_active: true
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to link quality template')
      }

      finish(data.specification)
    } catch (err: any) {
      console.error('Error linking template:', err)
      setError(err.message || 'Failed to link quality template')
    } finally {
      setSubmitting(false)
    }
  }

  // Reset the form and close.
  const finish = (specification?: { id: string; custom_name: string | null }) => {
    setSelectedTemplateId('')
    setOrigin('')
    setCustomName('')
    setQualityCode('')
    setStage('start')
    onSuccess(specification)
    onOpenChange(false)
  }

  const source = specs.find((s) => s.id === sourceId)
  const editing = stage === 'edit' && !!source
  const isNew = !!initialName || specs.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          editing
            // The whole screen unless it is roomy, like the New Sample window
            // it opens from (see INTAKE_DIALOG_CONTENT_CLASS).
            ? '!flex flex-col gap-0 overflow-hidden p-0 sm:p-0 w-screen h-[100dvh] max-w-none rounded-none sm:rounded-none border-0 ' +
              '[@media(min-width:1280px)_and_(min-height:900px)]:w-[min(1100px,94vw)] [@media(min-width:1280px)_and_(min-height:900px)]:h-auto ' +
              '[@media(min-width:1280px)_and_(min-height:900px)]:max-h-[85vh] [@media(min-width:1280px)_and_(min-height:900px)]:rounded-[10px] ' +
              '[@media(min-width:1280px)_and_(min-height:900px)]:border'
            : 'sm:max-w-[600px]',
        )}
      >
        {editing ? (
          <NewSpecEditorStage
            key={source.id}
            source={source}
            clientName={clientName}
            initialName={initialName}
            contractText={initialName}
            contractDescription={contractDescription}
            onBack={() => setStage('start')}
            onCancel={() => onOpenChange(false)}
            onSaved={finish}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{isNew ? 'New quality specification' : 'Link Quality Template'}</DialogTitle>
              <DialogDescription>
                {initialName
                  ? <>No specification for {clientName} matches &ldquo;{initialName}&rdquo;. Start from the closest one and change what differs, or link a shared template. It is added to {clientName}&apos;s specifications and selected for this sample.</>
                  : isNew
                    ? <>Start from one of {clientName}&apos;s specifications and change what differs, or link a shared template.</>
                    : <>Link a quality specification template to {clientName}</>}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {error && (
                <div role="alert" className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {specs.length > 0 && (
                    <div role="group" aria-label="Start from" className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
                      {([
                        ['duplicate', `Copy a ${clientName} specification`],
                        ['link', 'Link a shared template'],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={mode === value}
                          onClick={() => setMode(value)}
                          className={cn(
                            'truncate rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                            mode === value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {mode === 'duplicate' ? (
                    <RadioGroup
                      value={sourceId}
                      onValueChange={setSourceId}
                      aria-label={`${clientName} specifications`}
                      className="max-h-[45vh] gap-1.5 overflow-y-auto"
                    >
                      {specs.map((spec) => {
                        const on = spec.id === sourceId
                        return (
                          <label
                            key={spec.id}
                            htmlFor={`src-${spec.id}`}
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors',
                              on ? 'border-foreground/40 bg-muted/60' : 'border-border hover:bg-muted/40',
                            )}
                          >
                            <RadioGroupItem id={`src-${spec.id}`} value={spec.id} className="mt-0.5" />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 text-sm font-medium">
                                {spec.custom_name || spec.template.name_en || spec.quality_code || 'Unnamed'}
                                {spec.id === suggestedSpecId && (
                                  <span className="rounded-sm border border-border px-1.5 py-px text-[10.5px] font-semibold text-muted-foreground">
                                    Suggested
                                  </span>
                                )}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {specSummary(spec.template.parameters, spec.template.methodology)}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </RadioGroup>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="template">Quality Template *</Label>
                        <Select
                          value={selectedTemplateId}
                          onValueChange={setSelectedTemplateId}
                        >
                          <SelectTrigger id="template">
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name_en} (v{template.version})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          The template that defines quality parameters and scoring
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="custom_name">Custom Name *</Label>
                        <Input
                          id="custom_name"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          placeholder="e.g., Premium Arabica Brazil"
                        />
                        <p className="text-xs text-muted-foreground">
                          A friendly name for this quality specification
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="quality_code">Quality Code</Label>
                        <Input
                          id="quality_code"
                          value={qualityCode}
                          onChange={(e) => setQualityCode(e.target.value)}
                          placeholder="e.g., BR-01, SPEC-A (optional)"
                        />
                        <p className="text-xs text-muted-foreground">
                          Optional code for tracking number generation
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="origin">Origin</Label>
                        <Select
                          value={origin}
                          onValueChange={setOrigin}
                        >
                          <SelectTrigger id="origin">
                            <SelectValue placeholder="Select origin (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No specific origin</SelectItem>
                            <SelectItem value="Brazil">Brazil</SelectItem>
                            <SelectItem value="Colombia">Colombia</SelectItem>
                            <SelectItem value="Ethiopia">Ethiopia</SelectItem>
                            <SelectItem value="Guatemala">Guatemala</SelectItem>
                            <SelectItem value="Peru">Peru</SelectItem>
                            <SelectItem value="Kenya">Kenya</SelectItem>
                            <SelectItem value="Honduras">Honduras</SelectItem>
                            <SelectItem value="Costa Rica">Costa Rica</SelectItem>
                            <SelectItem value="El Salvador">El Salvador</SelectItem>
                            <SelectItem value="Nicaragua">Nicaragua</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Restrict this specification to samples from a specific origin
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              {mode === 'duplicate' ? (
                <Button type="button" onClick={() => setStage('edit')} disabled={loading || !source}>
                  Duplicate and edit
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || submitting || !selectedTemplateId || !customName}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    'Link template'
                  )}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** "Brazil · Screens 16, 14 · Moisture ≤ 12.5%": what tells two specifications apart. */
function specSummary(parameters: any, methodology?: string): string {
  const p = parameters || {}
  const screens: string[] = (p.screen_size_requirements?.constraints || [])
    .map((c: any) => String(c?.screen_size ?? '').trim())
    .filter(Boolean)
  const parts = [
    p.origin || null,
    screens.length ? `Screens ${screens.join(', ')}` : null,
    p.moisture_max != null ? `Moisture ≤ ${p.moisture_max}%` : null,
    methodology === 'cva' ? 'Specialty (CVA)' : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No parameters set'
}

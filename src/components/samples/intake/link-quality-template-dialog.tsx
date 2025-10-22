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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { AlertCircle, Loader2 } from 'lucide-react'

interface LinkQualityTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  onSuccess: () => void
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

export function LinkQualityTemplateDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  onSuccess
}: LinkQualityTemplateDialogProps) {
  const [templates, setTemplates] = useState<QualityTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [origin, setOrigin] = useState('')
  const [customName, setCustomName] = useState('')
  const [qualityCode, setQualityCode] = useState('')

  // Load quality templates when dialog opens
  useEffect(() => {
    if (open) {
      loadTemplates()
    }
  }, [open])

  const loadTemplates = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/quality-templates?is_active=true')
      if (response.ok) {
        const data = await response.json()
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

      // Reset form and close dialog
      setSelectedTemplateId('')
      setOrigin('')
      setCustomName('')
      setQualityCode('')
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('Error linking template:', err)
      setError(err.message || 'Failed to link quality template')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Link Quality Template</DialogTitle>
          <DialogDescription>
            Link a quality specification template to {clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
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
              <div className="space-y-2">
                <Label htmlFor="template">Quality Template *</Label>
                <Select
                  value={selectedTemplateId}
                  onValueChange={setSelectedTemplateId}
                >
                  <SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select origin (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No specific origin</SelectItem>
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
              'Link Template'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

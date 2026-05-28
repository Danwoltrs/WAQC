'use client'

import { useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { X } from 'lucide-react'
import type { OtherSampleSubType, OtherSampleRecipient, StepComponentProps } from './types'

const SUB_TYPE_OPTIONS: { value: OtherSampleSubType; label: string; description: string }[] = [
  { value: 'pss', label: 'PSS', description: 'Pre-shipment sample awaiting client approval' },
  { value: 'ss', label: 'Shipment Sample', description: 'Sample from a shipment in transit' },
  { value: 'stocklot', label: 'Stocklot', description: 'Offered to one or more buyers' },
  { value: 'type', label: 'Type Sample', description: 'Reference/marketing sample for client review' },
]

export function OtherSampleDetailsStep({ formData, updateFormData, clients }: StepComponentProps) {
  const [pendingClientId, setPendingClientId] = useState<string>('')
  const [pendingEmails, setPendingEmails] = useState<string>('')

  const availableClientOptions = useMemo(() => {
    const taken = new Set(formData.recipients.map(r => r.client_id))
    return clients
      .filter(c => !taken.has(c.id))
      .map(c => ({
        value: c.id,
        label: c.fantasy_name || c.company || c.id,
      }))
  }, [clients, formData.recipients])

  const addRecipient = () => {
    if (!pendingClientId) return
    const client = clients.find(c => c.id === pendingClientId)
    if (!client) return
    const emails = pendingEmails
      .split(',')
      .map(e => e.trim())
      .filter(Boolean)
    const recipient: OtherSampleRecipient = {
      client_id: client.id,
      client_name: client.fantasy_name || client.company || '',
      contact_emails: emails,
    }
    updateFormData('recipients', [...formData.recipients, recipient])
    setPendingClientId('')
    setPendingEmails('')
  }

  const removeRecipient = (clientId: string) => {
    updateFormData(
      'recipients',
      formData.recipients.filter(r => r.client_id !== clientId)
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Sample sub-type *</Label>
        <RadioGroup
          value={formData.sample_type || ''}
          onValueChange={(value) => updateFormData('sample_type', value as OtherSampleSubType)}
          className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          {SUB_TYPE_OPTIONS.map(opt => (
            <label
              key={opt.value}
              htmlFor={`other-subtype-${opt.value}`}
              className="flex items-start gap-3 rounded-lg border border-input p-3 cursor-pointer hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-accent/40 transition-colors"
            >
              <RadioGroupItem id={`other-subtype-${opt.value}`} value={opt.value} className="mt-1" />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.description}</div>
              </div>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="awb_number">AWB / courier tracking number</Label>
          <Input
            id="awb_number"
            value={formData.awb_number}
            onChange={(e) => updateFormData('awb_number', e.target.value)}
            placeholder="e.g. 020-12345678"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="courier_name">Courier</Label>
          <Input
            id="courier_name"
            value={formData.courier_name}
            onChange={(e) => updateFormData('courier_name', e.target.value)}
            placeholder="DHL, FedEx, UPS..."
          />
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-input p-3">
        <Checkbox
          id="is_quick_look"
          checked={formData.is_quick_look}
          onCheckedChange={(checked) => updateFormData('is_quick_look', Boolean(checked))}
          className="mt-0.5"
        />
        <label htmlFor="is_quick_look" className="space-y-0.5 cursor-pointer">
          <div className="text-sm font-medium">Quick look</div>
          <div className="text-xs text-muted-foreground">
            Run a lighter preliminary cupping instead of the full SCA workup. The cupping module still
            opens with all fields available; this flag just labels the assessment as preliminary.
          </div>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Label className="text-sm font-semibold">Recipient clients *</Label>
          <span className="text-xs text-muted-foreground">
            {formData.recipients.length} added
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Each client tracks its own approval status. Add at least one before saving.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <SearchableSelect
              options={availableClientOptions}
              value={pendingClientId}
              onValueChange={setPendingClientId}
              placeholder="Select a client..."
              searchPlaceholder="Search clients..."
              emptyMessage="No matching clients"
            />
          </div>
          <Input
            value={pendingEmails}
            onChange={(e) => setPendingEmails(e.target.value)}
            placeholder="Optional override emails (comma-separated)"
            className="flex-1"
          />
          <Button
            type="button"
            onClick={addRecipient}
            disabled={!pendingClientId}
            variant="secondary"
          >
            Add
          </Button>
        </div>

        {formData.recipients.length > 0 && (
          <div className="space-y-2">
            {formData.recipients.map(r => (
              <div
                key={r.client_id}
                className="flex items-start justify-between gap-2 rounded-lg border border-input p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.client_name}</div>
                  {r.contact_emails.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.contact_emails.map(email => (
                        <Badge key={email} variant="secondary" className="text-xs font-normal">
                          {email}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {r.contact_emails.length === 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Will use the client&apos;s default contact email
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeRecipient(r.client_id)}
                  aria-label={`Remove ${r.client_name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

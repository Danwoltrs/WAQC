'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Plus,
  Edit,
  Trash2,
  FileText,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface ClientQualityManagerProps {
  clientId: string
  clientName: string
  defaultFeePrice?: number | null
  defaultFeeCurrency?: string | null
  defaultFeeUnit?: string | null
}

interface ClientQuality {
  id: string
  client_id: string
  template_id: string
  origin: string | null
  custom_name: string | null
  quality_code: string | null
  cups_per_sample: number | null
  is_active: boolean
  notes: string | null
  fee_price: number | null
  fee_currency: string | null
  fee_unit: string | null
  custom_parameters: any
  created_at: string
  updated_at: string
  template: {
    id: string
    name: string
    version: number
  }
}

interface QualityTemplate {
  id: string
  name: string
  description: string | null
  version: number
  is_active: boolean
}

const CURRENCY_OPTIONS = ['USD', 'EUR', 'BRL', 'GBP']
const UNIT_OPTIONS = [
  { value: 'per_pound', label: 'c/lb' },
  { value: 'per_sample', label: '/sample' },
]

function FeePopover({
  quality,
  defaultFeePrice,
  defaultFeeCurrency,
  defaultFeeUnit,
  onUpdate,
}: {
  quality: ClientQuality
  defaultFeePrice?: number | null
  defaultFeeCurrency?: string | null
  defaultFeeUnit?: string | null
  onUpdate: (id: string, field: string, value: any) => void
}) {
  const price = quality.fee_price ?? defaultFeePrice
  const currency = quality.fee_currency || defaultFeeCurrency || 'USD'
  const unit = quality.fee_unit || defaultFeeUnit || 'per_pound'
  const isOverridden = quality.fee_price !== null || quality.fee_currency !== null || quality.fee_unit !== null

  const unitLabel = unit === 'per_sample' ? '/sample' : 'c/lb'
  const displayText = price != null ? `${price} ${currency} ${unitLabel}` : '-'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`text-xs px-2 py-1 rounded-md border transition-colors hover:bg-accent ${
            isOverridden ? 'border-primary/30 bg-primary/5 font-medium' : 'border-transparent'
          }`}
        >
          {displayText}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="center">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Fee Override</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Price</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              defaultValue={price ?? ''}
              placeholder="Client default"
              className="h-8 text-xs"
              onBlur={(e) => {
                const val = e.target.value ? parseFloat(e.target.value) : null
                if (val !== quality.fee_price) {
                  onUpdate(quality.id, 'fee_price', val)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Currency</Label>
            <Select
              value={currency}
              onValueChange={(value) => onUpdate(quality.id, 'fee_currency', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Unit</Label>
            <Select
              value={unit}
              onValueChange={(value) => onUpdate(quality.id, 'fee_unit', value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isOverridden && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 text-muted-foreground"
              onClick={() => {
                onUpdate(quality.id, 'fee_price', null)
                onUpdate(quality.id, 'fee_currency', null)
                onUpdate(quality.id, 'fee_unit', null)
              }}
            >
              Reset to client default
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ClientQualityManager({ clientId, clientName, defaultFeePrice, defaultFeeCurrency, defaultFeeUnit }: ClientQualityManagerProps) {
  const [clientQualities, setClientQualities] = useState<ClientQuality[]>([])
  const [templates, setTemplates] = useState<QualityTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingQuality, setEditingQuality] = useState<ClientQuality | null>(null)
  const [formData, setFormData] = useState({
    template_id: '',
    custom_name: '',
    quality_code: '',
    cups_per_sample: 5,
    notes: '',
    is_active: true
  })

  useEffect(() => {
    fetchClientQualities()
    fetchTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function fetchClientQualities() {
    try {
      const response = await fetch(`/api/client-qualities?client_id=${clientId}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Client qualities API error:', response.status, errorData)
        throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`)
      }
      const data = await response.json()
      setClientQualities(data.client_qualities || [])
    } catch (err: any) {
      console.error('Error fetching client qualities:', err)
      setError(err.message || 'Failed to load quality assignments')
    } finally {
      setLoading(false)
    }
  }

  async function fetchTemplates() {
    try {
      const response = await fetch('/api/quality-templates?is_active=true')
      if (!response.ok) throw new Error('Failed to fetch templates')
      const data = await response.json()
      setTemplates(data.templates || [])
    } catch (err) {
      console.error('Error fetching templates:', err)
    }
  }

  function handleOpenDialog(quality?: ClientQuality) {
    if (quality) {
      setEditingQuality(quality)
      setFormData({
        template_id: quality.template_id,
        custom_name: quality.custom_name || '',
        quality_code: quality.quality_code || '',
        cups_per_sample: quality.cups_per_sample ?? 5,
        notes: quality.notes || '',
        is_active: quality.is_active
      })
    } else {
      setEditingQuality(null)
      setFormData({
        template_id: '',
        custom_name: '',
        quality_code: '',
        cups_per_sample: 5,
        notes: '',
        is_active: true
      })
    }
    setDialogOpen(true)
  }

  async function handleSubmit() {
    try {
      const payload = {
        client_id: clientId,
        template_id: formData.template_id,
        custom_name: formData.custom_name || null,
        quality_code: formData.quality_code || null,
        cups_per_sample: formData.cups_per_sample,
        notes: formData.notes || null,
        is_active: formData.is_active
      }

      if (editingQuality) {
        const response = await fetch(`/api/client-qualities/${editingQuality.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!response.ok) throw new Error('Failed to update quality assignment')
      } else {
        const response = await fetch('/api/client-qualities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!response.ok) throw new Error('Failed to create quality assignment')
      }

      setDialogOpen(false)
      fetchClientQualities()
    } catch (err) {
      console.error('Error saving quality assignment:', err)
      alert('Failed to save quality assignment. Please try again.')
    }
  }

  async function handleDelete(qualityId: string) {
    if (!confirm('Are you sure you want to delete this quality assignment?')) return

    try {
      const response = await fetch(`/api/client-qualities/${qualityId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete quality assignment')
      }

      const result = await response.json()

      if (result.deactivated) {
        alert(result.message || 'Quality specification has been deactivated')
      }

      fetchClientQualities()
    } catch (err) {
      console.error('Error deleting quality assignment:', err)
      alert(err instanceof Error ? err.message : 'Failed to delete quality assignment. Please try again.')
    }
  }

  async function handleInlineUpdate(qualityId: string, field: string, value: any) {
    try {
      const response = await fetch(`/api/client-qualities/${qualityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      if (!response.ok) throw new Error('Failed to update')
      fetchClientQualities()
    } catch (err) {
      console.error('Error updating quality:', err)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Loading quality specifications...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Quality Specifications</CardTitle>
            <CardDescription className="text-xs">
              Quality templates assigned to {clientName}
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingQuality ? 'Edit' : 'Add'} Quality Specification
                </DialogTitle>
                <DialogDescription>
                  {editingQuality
                    ? 'Update the quality specification details'
                    : 'Assign a quality template to this client'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="template">Quality Template</Label>
                  <Select
                    value={formData.template_id}
                    onValueChange={(value) => setFormData({ ...formData, template_id: value })}
                    disabled={!!editingQuality}
                  >
                    <SelectTrigger id="template">
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} (v{template.version})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="custom_name">Custom Name</Label>
                    <Input
                      id="custom_name"
                      value={formData.custom_name}
                      onChange={(e) => setFormData({ ...formData, custom_name: e.target.value })}
                      placeholder="e.g., Alfenas Dulce"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quality_code">Code</Label>
                    <Input
                      id="quality_code"
                      value={formData.quality_code}
                      onChange={(e) => setFormData({ ...formData, quality_code: e.target.value.toUpperCase() })}
                      placeholder="AD"
                      maxLength={4}
                      className="text-center font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cups_per_sample">Cups</Label>
                    <Input
                      id="cups_per_sample"
                      type="number"
                      min={1}
                      max={20}
                      value={formData.cups_per_sample}
                      onChange={(e) => setFormData({ ...formData, cups_per_sample: parseInt(e.target.value) || 5 })}
                      className="text-center"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Internal notes about this quality spec"
                    rows={2}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!formData.template_id}>
                  {editingQuality ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {clientQualities.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No quality specifications assigned</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-medium">Quality Name</th>
                  <th className="text-left py-2 pr-3 font-medium">Code</th>
                  <th className="text-left py-2 pr-3 font-medium">Template</th>
                  <th className="text-center py-2 pr-3 font-medium">Cups</th>
                  <th className="text-center py-2 pr-3 font-medium">Fee</th>
                  <th className="text-center py-2 pr-3 font-medium">Active</th>
                  <th className="text-right py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clientQualities.map((quality) => (
                  <tr key={quality.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="py-2 pr-3">
                      <span className="font-medium">
                        {quality.custom_name || quality.template.name}
                      </span>
                      {!quality.is_active && (
                        <Badge variant="outline" className="text-xs ml-2">Inactive</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {quality.quality_code ? (
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {quality.quality_code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {quality.template.name} v{quality.template.version}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={quality.cups_per_sample ?? 5}
                        onChange={() => {}}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value)
                          if (val >= 1 && val <= 20 && val !== quality.cups_per_sample) {
                            handleInlineUpdate(quality.id, 'cups_per_sample', val)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                        className="w-14 h-7 text-center text-xs mx-auto"
                        defaultValue={quality.cups_per_sample ?? 5}
                      />
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <FeePopover
                        quality={quality}
                        defaultFeePrice={defaultFeePrice}
                        defaultFeeCurrency={defaultFeeCurrency}
                        defaultFeeUnit={defaultFeeUnit}
                        onUpdate={handleInlineUpdate}
                      />
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <Switch
                        checked={quality.is_active}
                        onCheckedChange={() => handleInlineUpdate(quality.id, 'is_active', !quality.is_active)}
                        className="mx-auto"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleOpenDialog(quality)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(quality.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

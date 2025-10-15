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
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  FileText,
  Eye,
  EyeOff
} from 'lucide-react'
import { format } from 'date-fns'
import { Switch } from '@/components/ui/switch'

interface ClientQualityManagerProps {
  clientId: string
  clientName: string
}

interface ClientQuality {
  id: string
  client_id: string
  template_id: string
  origin: string | null
  custom_name: string | null
  is_active: boolean
  notes: string | null
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

export function ClientQualityManager({ clientId, clientName }: ClientQualityManagerProps) {
  const [clientQualities, setClientQualities] = useState<ClientQuality[]>([])
  const [templates, setTemplates] = useState<QualityTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingQuality, setEditingQuality] = useState<ClientQuality | null>(null)
  const [formData, setFormData] = useState({
    template_id: '',
    origin: '',
    custom_name: '',
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
      if (!response.ok) throw new Error('Failed to fetch client qualities')
      const data = await response.json()
      setClientQualities(data.client_qualities || [])
    } catch (err) {
      console.error('Error fetching client qualities:', err)
      setError('Failed to load quality assignments')
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
        origin: quality.origin || '',
        custom_name: quality.custom_name || '',
        notes: quality.notes || '',
        is_active: quality.is_active
      })
    } else {
      setEditingQuality(null)
      setFormData({
        template_id: '',
        origin: '',
        custom_name: '',
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
        origin: formData.origin || null,
        custom_name: formData.custom_name || null,
        notes: formData.notes || null,
        is_active: formData.is_active
      }

      if (editingQuality) {
        // Update existing
        const response = await fetch(`/api/client-qualities/${editingQuality.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!response.ok) throw new Error('Failed to update quality assignment')
      } else {
        // Create new
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
      if (!response.ok) throw new Error('Failed to delete quality assignment')
      fetchClientQualities()
    } catch (err) {
      console.error('Error deleting quality assignment:', err)
      alert('Failed to delete quality assignment. Please try again.')
    }
  }

  async function toggleActive(quality: ClientQuality) {
    try {
      const response = await fetch(`/api/client-qualities/${quality.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !quality.is_active })
      })
      if (!response.ok) throw new Error('Failed to update quality assignment')
      fetchClientQualities()
    } catch (err) {
      console.error('Error toggling quality assignment:', err)
      alert('Failed to update quality assignment. Please try again.')
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
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Quality Specifications</CardTitle>
            <CardDescription>
              Manage quality templates assigned to {clientName}
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Quality Spec
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingQuality ? 'Edit' : 'Add'} Quality Specification
                </DialogTitle>
                <DialogDescription>
                  {editingQuality
                    ? 'Update the quality specification details'
                    : 'Assign a quality template to this client with a custom name'}
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
                  <p className="text-sm text-muted-foreground">
                    The base quality template to use
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="custom_name">Custom Name</Label>
                  <Input
                    id="custom_name"
                    value={formData.custom_name}
                    onChange={(e) => setFormData({ ...formData, custom_name: e.target.value })}
                    placeholder="e.g., Starbucks Natural Brazil 2024"
                  />
                  <p className="text-sm text-muted-foreground">
                    Give this quality spec a custom name for this client
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="origin">Origin (Optional)</Label>
                  <Input
                    id="origin"
                    value={formData.origin}
                    onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                    placeholder="e.g., Brazil, Colombia"
                  />
                  <p className="text-sm text-muted-foreground">
                    Restrict this spec to a specific origin
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Internal Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add any internal notes about this quality spec"
                    rows={3}
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
                  {editingQuality ? 'Update' : 'Create'} Specification
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {clientQualities.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No quality specifications assigned to this client</p>
            <p className="text-sm mt-2">Click &ldquo;Add Quality Spec&rdquo; to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clientQualities.map((quality) => (
              <div
                key={quality.id}
                className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate">
                      {quality.custom_name || quality.template.name}
                    </p>
                    {quality.custom_name && (
                      <Badge variant="secondary" className="text-xs">
                        Custom Name
                      </Badge>
                    )}
                    {!quality.is_active && (
                      <Badge variant="outline" className="text-xs">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>Template: {quality.template.name} (v{quality.template.version})</span>
                    {quality.origin && (
                      <>
                        <span>•</span>
                        <span>Origin: {quality.origin}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>Created {format(new Date(quality.created_at), 'MMM d, yyyy')}</span>
                  </div>
                  {quality.notes && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                      {quality.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleActive(quality)}
                    title={quality.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {quality.is_active ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenDialog(quality)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(quality.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

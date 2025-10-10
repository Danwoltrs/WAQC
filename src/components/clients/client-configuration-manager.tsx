'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Settings,
  FileText,
  AlertTriangle,
  Mail,
  Bell,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  CheckCircle,
  AlertCircle
} from 'lucide-react'

interface ClientConfigurationManagerProps {
  clientId: string
  clientName: string
}

export function ClientConfigurationManager({
  clientId,
  clientName
}: ClientConfigurationManagerProps) {
  const [activeTab, setActiveTab] = useState('quality-specs')
  const [loading, setLoading] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Client Configuration</h2>
          <p className="text-muted-foreground">
            Manage quality specifications and preferences for {clientName}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="quality-specs" className="gap-2">
            <FileText className="h-4 w-4" />
            Quality Specifications
          </TabsTrigger>
          <TabsTrigger value="defects" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Defect Configurations
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Quality Specifications Tab */}
        <TabsContent value="quality-specs" className="space-y-6">
          <QualitySpecificationsTab clientId={clientId} />
        </TabsContent>

        {/* Defect Configurations Tab */}
        <TabsContent value="defects" className="space-y-6">
          <DefectConfigurationsTab clientId={clientId} />
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <NotificationsTab clientId={clientId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Quality Specifications Tab Component
function QualitySpecificationsTab({ clientId }: { clientId: string }) {
  const [specifications, setSpecifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)

  useEffect(() => {
    loadSpecifications()
  }, [clientId])

  const loadSpecifications = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/clients/${clientId}/quality-specifications`)
      const data = await response.json()

      if (response.ok) {
        setSpecifications(data.specifications || [])
      } else {
        console.error('Failed to load specifications:', data.error)
      }
    } catch (error) {
      console.error('Error loading specifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (specId: string) => {
    if (!confirm('Are you sure you want to remove this quality specification?')) {
      return
    }

    try {
      const response = await fetch(
        `/api/clients/${clientId}/quality-specifications/${specId}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        await loadSpecifications()
      } else {
        const error = await response.json()
        alert(`Failed to delete specification: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting specification:', error)
      alert('Failed to delete specification')
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Loading quality specifications...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Assigned Quality Specifications</CardTitle>
              <CardDescription>
                Quality templates and parameters assigned to this client
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Assign Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {specifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No quality specifications assigned yet.</p>
              <p className="text-sm">Click &quot;Assign Template&quot; to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {specifications.map((spec) => (
                <div
                  key={spec.id}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-lg">
                          {spec.template?.name_en || spec.template?.name || 'Unnamed Template'}
                        </h4>
                        {spec.origin && (
                          <span className="text-sm bg-muted px-2 py-1 rounded">
                            Origin: {spec.origin}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {spec.template?.description_en || spec.template?.description || 'No description'}
                      </p>

                      {/* Template Details */}
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        {spec.template?.sample_size_grams && (
                          <div>
                            <span className="text-muted-foreground">Sample Size:</span>
                            <span className="ml-1 font-medium">{spec.template.sample_size_grams}g</span>
                          </div>
                        )}
                        {spec.template?.cupping_scale_type && (
                          <div>
                            <span className="text-muted-foreground">Cupping Scale:</span>
                            <span className="ml-1 font-medium">{spec.template.cupping_scale_type}</span>
                          </div>
                        )}
                        {spec.template?.defect_thresholds_primary && (
                          <div>
                            <span className="text-muted-foreground">Primary Defects:</span>
                            <span className="ml-1 font-medium">≤ {spec.template.defect_thresholds_primary}</span>
                          </div>
                        )}
                        {spec.template?.defect_thresholds_secondary && (
                          <div>
                            <span className="text-muted-foreground">Secondary Defects:</span>
                            <span className="ml-1 font-medium">≤ {spec.template.defect_thresholds_secondary}</span>
                          </div>
                        )}
                      </div>

                      {/* Custom Parameters */}
                      {spec.custom_parameters && Object.keys(spec.custom_parameters).length > 0 && (
                        <div className="mt-3 p-3 bg-muted rounded-md">
                          <p className="text-sm font-medium mb-2">Custom Parameters:</p>
                          <pre className="text-xs overflow-auto">
                            {JSON.stringify(spec.custom_parameters, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(spec.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showAddDialog && (
        <AddSpecificationDialog
          clientId={clientId}
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            setShowAddDialog(false)
            loadSpecifications()
          }}
        />
      )}
    </div>
  )
}

// Defect Configurations Tab Component
function DefectConfigurationsTab({ clientId }: { clientId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Client-Specific Defect Configurations</CardTitle>
        <CardDescription>
          Customize defect definitions and point values for this client
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Defect configuration interface coming soon.</p>
          <p className="text-sm mt-2">
            This will allow customization of defect types, point values, and categories per client.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// Notifications Tab Component
function NotificationsTab({ clientId }: { clientId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email & Notification Preferences</CardTitle>
        <CardDescription>
          Configure how and when to send certificates and notifications
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Notification preferences interface coming soon.</p>
          <p className="text-sm mt-2">
            This will allow configuration of email timing, delivery methods, and certificate formats.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// Add Specification Dialog Component
function AddSpecificationDialog({
  clientId,
  onClose,
  onSuccess
}: {
  clientId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      const response = await fetch('/api/quality-templates?is_active=true')
      const data = await response.json()

      if (response.ok) {
        setTemplates(data.templates || [])
      }
    } catch (error) {
      console.error('Error loading templates:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedTemplate) {
      setError('Please select a quality template')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/clients/${clientId}/quality-specifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplate,
          origin: origin || null
        })
      })

      if (response.ok) {
        onSuccess()
      } else {
        const error = await response.json()
        setError(error.error || 'Failed to assign template')
      }
    } catch (error) {
      console.error('Error assigning template:', error)
      setError('Failed to assign template')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Assign Quality Template</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Select a quality template to assign to this client
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Quality Template *</label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
              >
                <option value="">Select a template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name_en || template.name} - {template.sample_size_grams}g
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Origin (Optional)</label>
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="e.g., Brazil, Colombia, Ethiopia"
                className="w-full px-3 py-2 border rounded-md"
              />
              <p className="text-xs text-muted-foreground">
                Specify an origin to apply this template only to samples from that origin
              </p>
            </div>

            {selectedTemplate && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Template Preview:</p>
                {templates.find((t) => t.id === selectedTemplate) && (
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">Name:</span>{' '}
                      {templates.find((t) => t.id === selectedTemplate)?.name_en}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Description:</span>{' '}
                      {templates.find((t) => t.id === selectedTemplate)?.description_en || 'No description'}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Assigning...' : 'Assign Template'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

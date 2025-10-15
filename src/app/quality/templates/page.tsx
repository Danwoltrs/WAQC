'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { TemplateBuilder } from '@/components/quality/template-builder'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Plus, Search, Edit, Copy, Trash2, Eye, FileText,
  CheckCircle, XCircle, AlertCircle
} from 'lucide-react'

interface Template {
  id: string
  name_en: string
  name_pt?: string
  name_es?: string
  description_en?: string
  description_pt?: string
  description_es?: string
  // Legacy fields for backward compatibility
  name?: string
  description?: string
  version: number
  parameters: any
  is_active: boolean
  is_global: boolean
  laboratory_id?: string | null
  created_by: string
  created_by_name?: string
  created_at: string
  updated_at: string
  updated_by?: string
  updated_by_name?: string
  usage_count?: number
}

export default function QualityTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null)

  // Helper to get display name (prefer English, fallback to legacy name)
  const getTemplateName = (template: Template) => template.name_en || template.name || ''
  const getTemplateDescription = (template: Template) => template.description_en || template.description || ''

  // Helper to get green aspect min label
  const getGreenAspectMinLabel = (template: Template) => {
    const config = template.parameters.green_aspect_configuration
    if (!config?.validation?.min_acceptable_value || !config?.wordings) return '-'
    const wording = config.wordings.find((w: any) => w.value === config.validation?.min_acceptable_value)
    return wording?.label || '-'
  }

  // Helper to get roast aspect min label
  const getRoastAspectMinLabel = (template: Template) => {
    const config = template.parameters.roast_aspect_configuration
    if (!config?.validation?.min_acceptable_value || !config?.wordings) return '-'
    const wording = config.wordings.find((w: any) => w.value === config.validation?.min_acceptable_value)
    return wording?.label || '-'
  }

  useEffect(() => {
    loadTemplates()
  }, [filterActive])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filterActive !== null) params.append('is_active', filterActive.toString())

      const response = await fetch(`/api/quality-templates?${params}`)
      const data = await response.json()

      if (response.ok) {
        setTemplates(data.templates)
      } else {
        console.error('Failed to load templates:', data.error)
      }
    } catch (error) {
      console.error('Error loading templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingTemplate(null)
    setShowBuilder(true)
  }

  const handleEdit = (template: Template) => {
    setEditingTemplate(template)
    setShowBuilder(true)
  }

  const handleClone = async (template: Template) => {
    try {
      const response = await fetch(`/api/quality-templates/${template.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_en: `${getTemplateName(template)} (Copy)`,
          description_en: getTemplateDescription(template)
        })
      })

      if (response.ok) {
        await loadTemplates()
      } else {
        const error = await response.json()
        console.error('Failed to clone template:', error)
        alert(`Failed to clone template: ${error.error}`)
      }
    } catch (error) {
      console.error('Error cloning template:', error)
      alert('Failed to clone template')
    }
  }

  const handleDelete = async (template: Template) => {
    if (template.usage_count && template.usage_count > 0) {
      alert(`Cannot delete template "${getTemplateName(template)}" because it is currently in use by ${template.usage_count} client(s).`)
      return
    }

    if (!confirm(`Are you sure you want to delete template "${getTemplateName(template)}"?`)) {
      return
    }

    try {
      const response = await fetch(`/api/quality-templates/${template.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await loadTemplates()
      } else {
        const error = await response.json()
        console.error('Failed to delete template:', error)
        alert(`Failed to delete template: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Failed to delete template')
    }
  }

  const handleSave = async (templateData: any) => {
    try {
      const url = editingTemplate
        ? `/api/quality-templates/${editingTemplate.id}`
        : '/api/quality-templates'

      const method = editingTemplate ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save template')
      }

      await loadTemplates()
      setShowBuilder(false)
      setEditingTemplate(null)
    } catch (error: any) {
      throw new Error(error.message || 'Failed to save template')
    }
  }

  const filteredTemplates = templates.filter(template => {
    const name = getTemplateName(template).toLowerCase()
    const description = getTemplateDescription(template).toLowerCase()
    const query = searchQuery.toLowerCase()
    return name.includes(query) || description.includes(query)
  })

  if (showBuilder) {
    return (
      <MainLayout>
        <div className="p-6 max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">
              {editingTemplate ? 'Edit Template' : 'Create Quality Template'}
            </h1>
            <p className="text-muted-foreground">
              {editingTemplate
                ? 'Update the quality standards and parameters for this template'
                : 'Define quality standards and parameters for a new template'}
            </p>
          </div>

          <TemplateBuilder
            template={editingTemplate || undefined}
            onSave={handleSave}
            onCancel={() => {
              setShowBuilder(false)
              setEditingTemplate(null)
            }}
          />
        </div>
      </MainLayout>
    )
  }

  if (viewingTemplate) {
    return (
      <MainLayout>
        <div className="p-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{getTemplateName(viewingTemplate)}</h1>
              <p className="text-muted-foreground">{getTemplateDescription(viewingTemplate)}</p>
            </div>
            <Button variant="outline" onClick={() => setViewingTemplate(null)}>
              Back to Library
            </Button>
          </div>

          <div className="space-y-6">
            {/* Template Info */}
            <Card>
              <CardHeader>
                <CardTitle>Template Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Version:</span> v{viewingTemplate.version}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{' '}
                    {viewingTemplate.is_active ? (
                      <Badge variant="default" className="ml-1">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-1">Inactive</Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Used by:</span> {viewingTemplate.usage_count || 0} client(s)
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span> {new Date(viewingTemplate.created_at).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Parameters */}
            <Card>
              <CardHeader>
                <CardTitle>Quality Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <pre className="text-sm bg-muted p-4 rounded-lg overflow-auto">
                  {JSON.stringify(viewingTemplate.parameters, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quality Templates</h1>
            <p className="text-muted-foreground">
              Manage quality standards and specifications for coffee samples
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filterActive === null ? 'default' : 'outline'}
                  onClick={() => setFilterActive(null)}
                  size="sm"
                >
                  All
                </Button>
                <Button
                  variant={filterActive === true ? 'default' : 'outline'}
                  onClick={() => setFilterActive(true)}
                  size="sm"
                >
                  Active
                </Button>
                <Button
                  variant={filterActive === false ? 'default' : 'outline'}
                  onClick={() => setFilterActive(false)}
                  size="sm"
                >
                  Inactive
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Templates Table */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No templates found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? 'Try adjusting your search criteria' : 'Get started by creating your first quality template'}
              </p>
              {!searchQuery && (
                <Button onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left text-sm font-medium">Template</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Sharing</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Created By</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Usage</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Screen Sizes</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Defects</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Green Aspect</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Roast Aspect</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Quakers</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Taints & Faults</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTemplates.map((template) => (
                      <tr key={template.id} className="border-b hover:bg-muted/20 transition-colors">
                        {/* Template Info */}
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <div className="font-medium">{getTemplateName(template)}</div>
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {getTemplateDescription(template) || 'No description'}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {template.is_active ? (
                                <Badge variant="default" className="text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Inactive
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">v{template.version}</Badge>
                            </div>
                          </div>
                        </td>

                        {/* Sharing */}
                        <td className="px-4 py-4">
                          <div className="text-sm">
                            {template.is_global ? (
                              <Badge variant="default" className="text-xs">
                                Global
                              </Badge>
                            ) : template.laboratory_id ? (
                              <Badge variant="secondary" className="text-xs">
                                Lab-Specific
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Private
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Created By */}
                        <td className="px-4 py-4">
                          <div className="text-sm space-y-1">
                            <div className="font-medium">{template.created_by_name || 'Unknown'}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(template.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </td>

                        {/* Usage */}
                        <td className="px-4 py-4">
                          <div className="text-sm">
                            {template.usage_count !== undefined && template.usage_count > 0 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0 hover:underline"
                                onClick={() => {
                                  // TODO: Show dialog with clients using this template
                                  alert(`View clients using "${getTemplateName(template)}"`)
                                }}
                              >
                                <AlertCircle className="h-3 w-3 mr-1 text-amber-500" />
                                {template.usage_count} client{template.usage_count !== 1 ? 's' : ''}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not in use</span>
                            )}
                          </div>
                        </td>

                        {/* Screen Sizes */}
                        <td className="px-4 py-4">
                          <div className="text-sm space-y-1">
                            {template.parameters.screen_size_requirements?.constraints?.length ? (
                              <>
                                <div className="font-medium text-xs mb-1">
                                  {template.parameters.screen_size_requirements.constraints.length} constraint{template.parameters.screen_size_requirements.constraints.length !== 1 ? 's' : ''}
                                </div>
                                <div className="space-y-0.5 max-h-20 overflow-y-auto">
                                  {[...template.parameters.screen_size_requirements.constraints]
                                    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                                    .map((c, idx) => (
                                      <div key={idx} className="text-xs text-muted-foreground">
                                        <span className="font-mono">{c.screen_size}</span>: {c.constraint_type === 'minimum' && `≥${c.min_value}%`}
                                        {c.constraint_type === 'maximum' && `≤${c.max_value}%`}
                                        {c.constraint_type === 'range' && `${c.min_value}-${c.max_value}%`}
                                        {c.constraint_type === 'any' && 'any'}
                                      </div>
                                    ))}
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
                          </div>
                        </td>

                        {/* Defects */}
                        <td className="px-4 py-4">
                          <div className="text-sm space-y-1">
                            {template.parameters.defect_configuration?.defects?.length ? (
                              <>
                                <div className="text-xs space-y-0.5">
                                  <div>
                                    <span className="text-muted-foreground">Primary:</span> ≤{template.parameters.defect_configuration.thresholds?.max_primary ?? '-'}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Secondary:</span> ≤{template.parameters.defect_configuration.thresholds?.max_secondary ?? '-'}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Total:</span> ≤{template.parameters.defect_configuration.thresholds?.max_total ?? '-'}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
                          </div>
                        </td>

                        {/* Green Aspect */}
                        <td className="px-4 py-4">
                          <div className="text-sm">
                            {template.parameters.green_aspect_configuration?.wordings?.length ? (
                              <div className="text-xs">
                                {template.parameters.green_aspect_configuration.wordings.length} level{template.parameters.green_aspect_configuration.wordings.length !== 1 ? 's' : ''}
                                {template.parameters.green_aspect_configuration.validation?.min_acceptable_value && (
                                  <div className="text-muted-foreground">
                                    Min: {getGreenAspectMinLabel(template)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
                          </div>
                        </td>

                        {/* Roast Aspect */}
                        <td className="px-4 py-4">
                          <div className="text-sm">
                            {template.parameters.roast_aspect_configuration?.wordings?.length ? (
                              <div className="text-xs">
                                {template.parameters.roast_aspect_configuration.wordings.length} level{template.parameters.roast_aspect_configuration.wordings.length !== 1 ? 's' : ''}
                                {template.parameters.roast_aspect_configuration.validation?.min_acceptable_value && (
                                  <div className="text-muted-foreground">
                                    Min: {getRoastAspectMinLabel(template)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
                          </div>
                        </td>

                        {/* Quakers */}
                        <td className="px-4 py-4">
                          <div className="text-sm">
                            {template.parameters.max_quakers !== undefined ? (
                              <div className="text-xs">
                                ≤{template.parameters.max_quakers}
                                <div className="text-muted-foreground">
                                  per {template.parameters.roast_sample_size_grams || 300}g
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No limit</span>
                            )}
                          </div>
                        </td>

                        {/* Taints & Faults */}
                        <td className="px-4 py-4">
                          <div className="text-sm">
                            {template.parameters.taint_fault_configuration ? (
                              <div className="text-xs space-y-0.5">
                                {template.parameters.taint_fault_configuration.rules?.zero_tolerance ? (
                                  <Badge variant="destructive" className="text-xs">Zero Tolerance</Badge>
                                ) : (
                                  <>
                                    {template.parameters.taint_fault_configuration.taints?.length > 0 && (
                                      <div>
                                        <span className="text-muted-foreground">Taints:</span> {template.parameters.taint_fault_configuration.taints.length}
                                      </div>
                                    )}
                                    {template.parameters.taint_fault_configuration.faults?.length > 0 && (
                                      <div>
                                        <span className="text-muted-foreground">Faults:</span> {template.parameters.taint_fault_configuration.faults.length}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingTemplate(template)}
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(template)}
                              title="Edit template"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleClone(template)}
                              title="Clone template"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {(!template.usage_count || template.usage_count === 0) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(template)}
                                className="text-destructive hover:text-destructive"
                                title="Delete template"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}

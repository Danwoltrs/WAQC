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
  created_by: string
  created_at: string
  updated_at: string
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

        {/* Templates Grid */}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{getTemplateName(template)}</CardTitle>
                      <div className="flex items-center gap-2 mt-2">
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
                        <Badge variant="outline" className="text-xs">
                          v{template.version}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {getTemplateDescription(template) || 'No description provided'}
                  </p>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {template.usage_count !== undefined && (
                      <>
                        {template.usage_count > 0 ? (
                          <span className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Used by {template.usage_count} client{template.usage_count !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span>Not in use</span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingTemplate(template)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(template)}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClone(template)}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Clone
                    </Button>
                    {(!template.usage_count || template.usage_count === 0) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(template)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}

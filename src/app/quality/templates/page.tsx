'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { QualitySpecEditor } from '@/components/quality/spec-editor/quality-spec-editor'
import { VersionComparisonDialog } from '@/components/quality/version-comparison-dialog'
import { QualityAssignmentDialog } from '@/components/quality-assignments/quality-assignment-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, Search, Edit, Copy, Trash2, Eye, FileText, AlertTriangle
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
  laboratory?: {
    id: string
    name: string
    code: string
  } | null
  assigned_laboratories?: string[]
  created_by: string
  created_by_name?: string
  created_at: string
  updated_at: string
  updated_by?: string
  updated_by_name?: string
  usage_count?: number
  assigned_clients?: Array<{ id: string; name: string; fantasy_name: string; company: string; custom_name: string }>
}

export default function QualityTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null)
  const [clientsUsingTemplate, setClientsUsingTemplate] = useState<any[]>([])
  const [versionDialogOpen, setVersionDialogOpen] = useState(false)
  const [versionComparisonTemplate, setVersionComparisonTemplate] = useState<Template | null>(null)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [assigningTemplateId, setAssigningTemplateId] = useState<string | null>(null)
  // New full-screen spec editor (replaces the nested-modal edit flow)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTemplate, setEditorTemplate] = useState<Template | null>(null)

  // Helper to get display name (prefer English, fallback to legacy name)
  const getTemplateName = (template: Template) => template.name_en || template.name || ''
  const getTemplateDescription = (template: Template) => template.description_en || template.description || ''

  // --- Spec-summary helpers (Part A) ---------------------------------------

  // Numeric sort key for a screen/sieve label. Always order largest -> smallest,
  // with Pan forced to the very end regardless of any number it may contain.
  const screenSortKey = (size: any) => {
    const s = String(size ?? '').trim()
    if (/pan/i.test(s)) return -Infinity
    const m = s.match(/-?\d+(\.\d+)?/)
    return m ? parseFloat(m[0]) : -1
  }

  // Build the monospace screen-profile chips: `16 ≥40%`, `15 any`, `Pan ≤10%`.
  const getScreenChips = (template: Template): string[] => {
    const constraints = template.parameters?.screen_size_requirements?.constraints
    if (!Array.isArray(constraints) || constraints.length === 0) return []
    return [...constraints]
      .sort((a, b) => screenSortKey(b.screen_size) - screenSortKey(a.screen_size))
      .map((c) => {
        // Bare label for the list: "Screen 16" → "16", keep "Pan"/"Peas 11" as-is
        const name = String(c.screen_size ?? '').trim().replace(/^screen\s+/i, '')
        switch (c.constraint_type) {
          case 'minimum': return `${name} ≥${c.min_value}%`
          case 'maximum': return `${name} ≤${c.max_value}%`
          case 'range':   return `${name} ${c.min_value}-${c.max_value}%`
          default:        return `${name} any`
        }
      })
  }

  const getDefectThreshold = (template: Template): number | null => {
    const t = template.parameters?.defect_configuration?.thresholds?.max_total
    return typeof t === 'number' ? t : null
  }

  // Returns max taints/faults plus a zero-tolerance flag (render red).
  const getTaintFault = (template: Template): { t: number; f: number; zero: boolean } | null => {
    const tf = template.parameters?.taint_fault_configuration
    const rules = tf?.rules
    if (!tf || !rules) return null
    const t = typeof rules.max_taints === 'number' ? rules.max_taints : null
    const f = typeof rules.max_faults === 'number' ? rules.max_faults : null
    if (t === null && f === null && !rules.zero_tolerance) return null
    const tv = t ?? 0
    const fv = f ?? 0
    return { t: tv, f: fv, zero: !!rules.zero_tolerance || (tv === 0 && fv === 0) }
  }

  // Quaker chip only when an actual limit is set.
  const getQuakerLimit = (template: Template): number | null => {
    const q = template.parameters?.max_quakers
    return typeof q === 'number' && q > 0 ? q : null
  }

  const formatMetaDate = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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
        // Fetch assigned clients for each template
        const templatesWithClients = await Promise.all(
          data.templates.map(async (template: Template) => {
            try {
              const clientsResponse = await fetch(`/api/client-qualities?template_id=${template.id}&is_active=true`)
              if (clientsResponse.ok) {
                const clientsData = await clientsResponse.json()
                return {
                  ...template,
                  assigned_clients: clientsData.client_qualities.map((cq: any) => ({
                    id: cq.client?.id || '',
                    name: cq.client?.name || '',
                    fantasy_name: cq.client?.fantasy_name || '',
                    company: cq.client?.company || '',
                    custom_name: cq.custom_name || ''
                  }))
                }
              }
              return template
            } catch (error) {
              console.error(`Error fetching clients for template ${template.id}:`, error)
              return template
            }
          })
        )
        setTemplates(templatesWithClients)
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
    setEditorTemplate(null)
    setEditorOpen(true)
  }

  const handleEdit = (template: Template) => {
    setEditorTemplate(template)
    setEditorOpen(true)
  }

  const handleEditorSave = async (templateData: any) => {
    const url = templateData.id
      ? `/api/quality-templates/${templateData.id}`
      : '/api/quality-templates'
    const method = templateData.id ? 'PATCH' : 'POST'
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templateData),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to save template')
    }
    await loadTemplates()
    setEditorOpen(false)
    setEditorTemplate(null)
  }

  const handleView = (template: Template) => {
    setEditorTemplate(template)
    setEditorOpen(true)
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
    // Fetch clients using this template if it's in use
    if (template.usage_count && template.usage_count > 0) {
      try {
        const response = await fetch(`/api/quality-templates/${template.id}/clients`)
        if (response.ok) {
          const data = await response.json()
          setClientsUsingTemplate(data.clients || [])
        }
      } catch (error) {
        console.error('Error fetching clients:', error)
        setClientsUsingTemplate([])
      }
    } else {
      setClientsUsingTemplate([])
    }

    setTemplateToDelete(template)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!templateToDelete) return

    try {
      // Soft delete: mark as inactive instead of hard delete
      const response = await fetch(`/api/quality-templates/${templateToDelete.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false })
      })

      if (response.ok) {
        // Update UI immediately without reloading
        setTemplates(prevTemplates =>
          prevTemplates.map(t =>
            t.id === templateToDelete.id ? { ...t, is_active: false } : t
          )
        )
        setDeleteDialogOpen(false)
        setTemplateToDelete(null)
        setClientsUsingTemplate([])
      } else {
        const error = await response.json()
        console.error('Failed to deactivate template:', error)
        alert(`Failed to deactivate template: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deactivating template:', error)
      alert('Failed to deactivate template')
    }
  }

  const filteredTemplates = templates.filter(template => {
    const name = getTemplateName(template).toLowerCase()
    const description = getTemplateDescription(template).toLowerCase()
    const createdBy = (template.created_by_name || '').toLowerCase()
    const query = searchQuery.toLowerCase()
    return name.includes(query) || description.includes(query) || createdBy.includes(query)
  })

  if (editorOpen) {
    return (
      <QualitySpecEditor
        template={editorTemplate || undefined}
        onSave={handleEditorSave}
        onCancel={() => {
          setEditorOpen(false)
          setEditorTemplate(null)
        }}
      />
    )
  }

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quality Templates</h1>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>

        {/* Toolbar: search + segmented filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 pl-10 rounded-[10px]"
            />
          </div>
          <div className="flex gap-1 p-1 rounded-[10px] bg-muted self-start sm:self-auto">
            {([['All', null], ['Active', true], ['Inactive', false]] as const).map(([label, val]) => (
              <button
                key={label}
                onClick={() => setFilterActive(val)}
                className={`px-4 py-1.5 rounded-[7px] text-[13px] font-medium transition-colors ${
                  filterActive === val
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

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
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Column header */}
            <div className="hidden md:grid grid-cols-[2.5fr_1.1fr_2.3fr_92px] items-center gap-4 px-5 h-11 bg-muted/40 border-b border-border">
              <span className="text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground">Template</span>
              <span className="text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground">Assigned to</span>
              <span className="text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground">Spec summary</span>
              <span aria-hidden className="text-right text-muted-foreground/40">·</span>
            </div>

            {filteredTemplates.map((template) => {
              const screenChips = getScreenChips(template)
              const defThreshold = getDefectThreshold(template)
              const tf = getTaintFault(template)
              const quaker = getQuakerLimit(template)
              const clients = template.assigned_clients || []
              const shownClients = clients.slice(0, 2)
              const overflow = clients.length - shownClients.length

              return (
                <div
                  key={template.id}
                  className="group grid grid-cols-1 md:grid-cols-[2.5fr_1.1fr_2.3fr_92px] items-center gap-3 md:gap-4 px-5 py-4 md:min-h-[74px] border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  {/* Template cell */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14.5px] font-semibold tracking-tight">{getTemplateName(template)}</span>
                      <span className="font-mono text-[10.5px] font-semibold text-muted-foreground bg-muted rounded px-1.5 py-px">
                        v{template.version}
                      </span>
                      {template.is_active ? (
                        <span className="text-[11px] font-medium rounded-full px-2 py-0.5 text-[#15663f] bg-[#e7f2ec] dark:text-[#5fcf8e] dark:bg-[#15663f]/25">
                          Active
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium rounded-full px-2 py-0.5 text-muted-foreground bg-muted">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-[12.5px] text-muted-foreground mt-1 truncate max-w-[440px]">
                      {getTemplateDescription(template) || 'No description'}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">
                      {template.created_by_name || 'Unknown'}
                      {formatMetaDate(template.created_at) && ` · ${formatMetaDate(template.created_at)}`}
                    </div>
                  </div>

                  {/* Assigned to — chips, click to manage */}
                  <button
                    type="button"
                    onClick={() => {
                      setAssigningTemplateId(template.id)
                      setAssignmentDialogOpen(true)
                    }}
                    title="Manage client assignments"
                    className="flex flex-wrap gap-1.5 text-left min-w-0 rounded-md -m-1 p-1 hover:bg-muted/50 transition-colors"
                  >
                    {clients.length > 0 ? (
                      <>
                        {shownClients.map((client) => (
                          <span
                            key={client.id}
                            className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#f1f5f3] text-[#3f6b54] border border-[#e3ece7] dark:bg-[#15663f]/20 dark:text-[#7bd6a0] dark:border-[#15663f]/40 whitespace-nowrap truncate max-w-[120px]"
                          >
                            {client.fantasy_name || client.name}
                          </span>
                        ))}
                        {overflow > 0 && (
                          <span className="text-[11px] text-muted-foreground/70 px-1 py-0.5">+{overflow}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-[12px] text-muted-foreground/70">Unassigned</span>
                    )}
                  </button>

                  {/* Spec summary */}
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {screenChips.map((chip, i) => (
                      <span
                        key={i}
                        className="font-mono text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-background border border-border text-foreground/80 whitespace-nowrap"
                      >
                        {chip}
                      </span>
                    ))}
                    {(defThreshold !== null || tf || quaker) && screenChips.length > 0 && (
                      <span aria-hidden className="w-px h-3.5 bg-border mx-0.5" />
                    )}
                    {defThreshold !== null && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground whitespace-nowrap">
                        Def <b className="font-semibold text-foreground/80">≤{defThreshold}</b>
                      </span>
                    )}
                    {quaker !== null && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground whitespace-nowrap">
                        Quakers <b className="font-semibold text-foreground/80">≤{quaker}</b>
                      </span>
                    )}
                    {tf && (
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${
                          tf.zero
                            ? 'bg-[#fbeceb] text-[#b0322a] dark:bg-[#b0322a]/20 dark:text-[#f0928a] font-semibold'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        T≤{tf.t} · F≤{tf.f}
                      </span>
                    )}
                    {screenChips.length === 0 && defThreshold === null && !tf && !quaker && (
                      <span className="text-[12px] text-muted-foreground/70">No spec set</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-start md:justify-end gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleView(template)} title="View details">
                      <Eye className="h-[15px] w-[15px]" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(template)} title="Edit template">
                      <Edit className="h-[15px] w-[15px]" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleClone(template)} title="Duplicate template">
                      <Copy className="h-[15px] w-[15px]" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(template)} title="Deactivate template">
                      <Trash2 className="h-[15px] w-[15px]" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate Quality Template?</AlertDialogTitle>
              <AlertDialogDescription>
                {templateToDelete && (
                  <div className="space-y-3">
                    <p>
                      You are about to deactivate the template{' '}
                      <strong>{getTemplateName(templateToDelete)}</strong>.
                    </p>

                    {clientsUsingTemplate.length > 0 ? (
                      <div className="space-y-2">
                        <p className="font-medium text-amber-600 dark:text-amber-500">
                          This template is currently in use by {clientsUsingTemplate.length}{' '}
                          client{clientsUsingTemplate.length !== 1 ? 's' : ''}:
                        </p>
                        <div className="max-h-32 overflow-y-auto border rounded-md p-2 bg-muted/30 space-y-1">
                          {clientsUsingTemplate.map((client: any) => (
                            <div key={client.id} className="flex items-center justify-between text-sm">
                              <span>{client.company || client.name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-1 text-xs"
                                onClick={() => {
                                  // TODO: Navigate to client detail page
                                  window.location.href = `/clients/${client.id}`
                                }}
                              >
                                View Client
                              </Button>
                            </div>
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Deactivating this template will not affect existing client assignments,
                          but it will no longer be available for new assignments.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        This template is not currently in use. It will be marked as inactive
                        and will no longer appear in active template lists.
                      </p>
                    )}
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setDeleteDialogOpen(false)
                  setTemplateToDelete(null)
                  setClientsUsingTemplate([])
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Mark as Inactive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Version Comparison Dialog */}
        {versionComparisonTemplate && (
          <VersionComparisonDialog
            open={versionDialogOpen}
            onOpenChange={setVersionDialogOpen}
            templateId={versionComparisonTemplate.id}
            templateName={getTemplateName(versionComparisonTemplate)}
          />
        )}

        {/* Quality Assignment Dialog */}
        {assigningTemplateId && (
          <QualityAssignmentDialog
            open={assignmentDialogOpen}
            onOpenChange={setAssignmentDialogOpen}
            mode="from-template"
            templateId={assigningTemplateId}
            onSuccess={() => {
              loadTemplates()
            }}
          />
        )}
      </div>
    </MainLayout>
  )
}

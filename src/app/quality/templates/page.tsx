'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { QualitySpecEditor } from '@/components/quality/spec-editor/quality-spec-editor'
import { VersionComparisonDialog } from '@/components/quality/version-comparison-dialog'
import { QualityAssignmentDialog } from '@/components/quality-assignments/quality-assignment-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/layout/page-header'
import { TemplateRow, getTemplateName, getTemplateDescription, type Template } from '@/components/quality/template-list/template-row'
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
import { Plus, Search, AlertTriangle } from 'lucide-react'
import { TemplatesEmptyState } from '@/components/quality/template-list/templates-empty-state'
import { templateClientsForDisplay, type TemplateClient } from '@/lib/quality-spec/template-clients'

export default function QualityTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null)
  const [clientsUsingTemplate, setClientsUsingTemplate] = useState<TemplateClient[]>([])
  const [versionDialogOpen, setVersionDialogOpen] = useState(false)
  const [versionComparisonTemplate, setVersionComparisonTemplate] = useState<Template | null>(null)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [assigningTemplateId, setAssigningTemplateId] = useState<string | null>(null)
  // New full-screen spec editor (replaces the nested-modal edit flow)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTemplate, setEditorTemplate] = useState<Template | null>(null)

  // --- Spec-summary helpers (Part A) ---------------------------------------

  // Numeric sort key for a screen/sieve label. Always order largest -> smallest,
  // with Pan forced to the very end regardless of any number it may contain.
  const screenSortKey = (size: any) => {
    const s = String(size ?? '').trim()
    if (/pan/i.test(s)) return -Infinity
    const m = s.match(/-?\d+(\.\d+)?/)
    return m ? parseFloat(m[0]) : -1
  }

  // Readable screen phrases: `Min 40% scr 16`, `Max 10% below 15`, `45–60% Peas 11`.
  // "any" constraints (the in-between screens) are dropped — only the meaningful
  // min/max/range boundaries are shown. Pan isn't a real screen, so a max on Pan
  // reads as "below <smallest specified screen>".
  const getScreenPhrases = (template: Template): string[] => {
    const constraints = template.parameters?.screen_size_requirements?.constraints
    if (!Array.isArray(constraints) || constraints.length === 0) return []
    const isPan = (raw: any) => /pan/i.test(String(raw ?? ''))
    const bare = (raw: any) => String(raw ?? '').trim().replace(/^screen\s+/i, '') // "Screen 15"→"15"
    const label = (raw: any) => {
      const s = String(raw ?? '').trim()
      const m = s.match(/^(?:screen\s+)?(\d+)$/i)
      return m ? `scr ${m[1]}` : s // "Screen 16" → "scr 16"; keep "Pan", "Peas 11"
    }

    // Smallest non-Pan screen present (the reference for "below"), from the full
    // list — even the dropped "any" ones still anchor the boundary.
    const nonPan = constraints.filter((c) => !isPan(c.screen_size))
    const belowRef = nonPan.length
      ? bare(nonPan.reduce((min, c) => (screenSortKey(c.screen_size) < screenSortKey(min.screen_size) ? c : min)).screen_size)
      : null

    return [...constraints]
      .filter((c) => c.constraint_type !== 'any')
      .sort((a, b) => screenSortKey(b.screen_size) - screenSortKey(a.screen_size))
      .map((c) => {
        const l = label(c.screen_size)
        switch (c.constraint_type) {
          case 'minimum': return `Min ${c.min_value}% ${l}`
          case 'maximum': return isPan(c.screen_size) && belowRef
            ? `Max ${c.max_value}% below ${belowRef}`
            : `Max ${c.max_value}% ${l}`
          case 'range':   return `${c.min_value}–${c.max_value}% ${l}`
          default:        return ''
        }
      })
      .filter(Boolean)
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
    // Fetch the clients using this template. Always asked: usage_count counts
    // only direct users, and clients now use private copies made from it.
    try {
      const response = await fetch(`/api/quality-templates/${template.id}/clients`)
      if (response.ok) {
        const data = await response.json()
        setClientsUsingTemplate(templateClientsForDisplay(data.clients))
      } else {
        setClientsUsingTemplate([])
      }
    } catch (error) {
      console.error('Error fetching clients:', error)
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

  const statusValue = filterActive === null ? 'all' : filterActive ? 'active' : 'inactive'
  const setStatus = (v: string) => setFilterActive(v === 'all' ? null : v === 'active')

  const newTemplateButton = (
    <Button aria-label="New template" className="max-sm:w-9 max-sm:px-0" onClick={handleCreate}>
      <Plus />
      <span className="hidden sm:inline">New template</span>
    </Button>
  )

  const chip = 'text-[11px] font-medium px-2 py-0.5 rounded-sm bg-muted text-muted-foreground whitespace-nowrap'

  const renderSpec = (template: Template) => {
    const screenPhrases = getScreenPhrases(template)
    const defThreshold = getDefectThreshold(template)
    const tf = getTaintFault(template)
    const quaker = getQuakerLimit(template)
    const tfLabel = tf
      ? (tf.zero
          ? 'No taints or faults'
          : `${tf.t} taint${tf.t === 1 ? '' : 's'}, ${tf.f} fault${tf.f === 1 ? '' : 's'} allowed`)
      : null
    const chips = (
      <>
        {screenPhrases.map((phrase, i) => (
          <span key={i} className={chip}>{phrase}</span>
        ))}
        {(defThreshold !== null || tf || quaker) && screenPhrases.length > 0 && (
          <span aria-hidden className="w-px h-3.5 bg-border mx-0.5" />
        )}
        {defThreshold !== null && <span className={chip}>Max {defThreshold} defects</span>}
        {quaker !== null && <span className={chip}>Max {quaker} quakers</span>}
        {tfLabel && (
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-sm whitespace-nowrap ${
              tf?.zero
                ? 'bg-[#fbeceb] text-[#b0322a] dark:bg-[#b0322a]/20 dark:text-[#f0928a] font-semibold'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            {tfLabel}
          </span>
        )}
        {screenPhrases.length === 0 && defThreshold === null && !tf && !quaker && (
          <span className="text-[12px] text-muted-foreground/70">No spec set</span>
        )}
      </>
    )
    const text = [...screenPhrases, defThreshold !== null ? `Max ${defThreshold} defects` : '', quaker !== null ? `Max ${quaker} quakers` : '', tfLabel ?? '']
      .filter(Boolean)
      .join(' · ')
    return { chips, text }
  }

  return (
    <MainLayout fullWidth>
      <PageHeader
        crumbs={[{ label: 'Quality Templates' }]}
        count={loading ? undefined : filteredTemplates.length}
        toolbarPlacement="inline"
        toolbar={
          <>
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <Input
                inputSize="sm"
                aria-label="Search templates"
                placeholder="Search templates…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Segmented
              size="sm"
              aria-label="Filter by status"
              className="max-sm:hidden"
              value={statusValue}
              onValueChange={setStatus}
              options={[
                { value: 'all', label: 'All' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
            <div className="sm:hidden w-full">
              <Select value={statusValue} onValueChange={setStatus}>
                <SelectTrigger size="sm" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        }
        actions={newTemplateButton}
      />

      <div>
        {/* Templates table, edge to edge */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <TemplatesEmptyState searching={!!searchQuery} onCreate={handleCreate} />
        ) : (
          <div>
            {/* Column header */}
            <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_96px] items-center gap-x-4 px-6 h-9 bg-muted/40 border-b">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">Template · client</span>
              <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">Spec summary</span>
              <span aria-hidden />
            </div>

            {filteredTemplates.map((template) => {
              const { chips, text } = renderSpec(template)
              return (
                <TemplateRow
                  key={template.id}
                  template={template}
                  spec={chips}
                  specText={text}
                  onView={() => handleView(template)}
                  onEdit={() => handleEdit(template)}
                  onDuplicate={() => handleClone(template)}
                  onManageClients={() => {
                    setAssigningTemplateId(template.id)
                    setAssignmentDialogOpen(true)
                  }}
                  onDeactivate={() => handleDelete(template)}
                />
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
                          {clientsUsingTemplate.map((client) => (
                            <div key={client.id} className="flex items-center justify-between text-sm">
                              <span>
                                {client.label}
                                {client.copy && <span className="ml-1.5 text-xs text-muted-foreground">copy</span>}
                              </span>
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
                variant="destructive"
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

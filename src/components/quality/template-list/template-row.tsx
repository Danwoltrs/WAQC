'use client'

import * as React from 'react'
import { Copy, Eye, Pencil, Trash2, Users } from 'lucide-react'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { RowActions, RowContextMenu, type RowAction } from '@/components/ui/row-actions'

export interface Template {
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
  assigned_clients?: Array<{ id?: string; name?: string | null; fantasy_name?: string | null; company?: string | null; custom_name?: string | null }>
}

export const getTemplateName = (template: Template) => template.name_en || template.name || ''
export const getTemplateDescription = (template: Template) => template.description_en || template.description || ''

/** First two client names (fantasy names first), then " +N". Empty when none. */
export function clientsLabel(clients: Array<{ name?: string | null; fantasy_name?: string | null; company?: string | null }>): string {
  const names = clients.map((c) => companyDisplayName({ name: c.name || c.company || '', fantasy_name: c.fantasy_name ?? null } as any)).filter(Boolean)
  if (names.length === 0) return ''
  const shown = names.slice(0, 2).join(', ')
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown
}

const formatMetaDate = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Initials of the first two name parts: "Anderson Nunes dos Santos" -> "AN"
const getInitials = (name?: string) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return ((parts[0][0] || '') + (parts[1]?.[0] || '')).toUpperCase()
}

// Creator / last-editor badge: initials, date, tooltip text
const getAuthorBadge = (template: Template) => {
  const edited = !!template.updated_at && template.updated_at !== template.created_at
  const name = (edited ? template.updated_by_name : template.created_by_name) || template.created_by_name || 'Unknown'
  const when = formatMetaDate(edited ? template.updated_at : template.created_at)
  const verb = edited ? 'Edited by' : 'Created by'
  return { initials: getInitials(name), date: when, title: `${verb} ${name}${when ? ` · ${when}` : ''}` }
}

export const TEMPLATE_GRID = 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_96px]'

export interface TemplateRowProps {
  template: Template
  onView: () => void
  onEdit: () => void
  onDuplicate: () => void
  onManageClients: () => void
  onDeactivate: () => void
  /** Spec chips (desktop). */
  spec: React.ReactNode
  /** Spec summary as plain text (phone). */
  specText?: string
}

export function TemplateRow({ template, onView, onEdit, onDuplicate, onManageClients, onDeactivate, spec, specText }: TemplateRowProps) {
  const clients = template.assigned_clients || []
  const label = clientsLabel(clients)
  const description = getTemplateDescription(template)
  const author = getAuthorBadge(template)

  const inline: RowAction[] = [
    { id: 'edit', label: 'Edit template', icon: Pencil, onSelect: onEdit },
    { id: 'duplicate', label: 'Duplicate template', icon: Copy, onSelect: onDuplicate },
  ]
  const actions: RowAction[] = [
    { id: 'view', label: 'View', icon: Eye, onSelect: onView },
    { id: 'clients', label: 'Manage clients', icon: Users, onSelect: onManageClients },
    { id: 'deactivate', label: 'Deactivate', icon: Trash2, onSelect: onDeactivate, destructive: true },
  ]

  return (
    <RowContextMenu actions={[...inline, ...actions]}>
      <div
        onClick={onView}
        className={`grid ${TEMPLATE_GRID} items-center gap-x-4 gap-y-1 px-6 py-3 border-b cursor-pointer hover:bg-muted/30 transition-colors`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold truncate min-w-0">{getTemplateName(template)}</span>
            <span className="font-mono text-[10.5px] font-semibold text-muted-foreground bg-muted rounded-sm px-1.5 py-px shrink-0">
              v{template.version}
            </span>
            {template.is_active ? (
              <span className="text-[11px] font-medium rounded-sm px-2 py-0.5 text-primary bg-primary/10 shrink-0">Active</span>
            ) : (
              <span className="text-[11px] font-medium rounded-sm px-2 py-0.5 text-muted-foreground bg-muted shrink-0">Inactive</span>
            )}
            <span title={author.title} className="inline-flex items-center gap-1.5 cursor-default shrink-0">
              <span className="h-5 min-w-5 px-1 grid place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground/80">
                {author.initials}
              </span>
              {author.date && <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap hidden lg:inline">{author.date}</span>}
            </span>
            {label && <span className="ml-auto pl-2 text-xs font-medium text-foreground truncate md:hidden">{label}</span>}
          </div>
          <div data-testid="template-row-line2" className="hidden md:block mt-0.5 truncate text-xs text-muted-foreground">
            {label && <span className="font-medium text-foreground">{label}</span>}
            {label && description && ' · '}
            {description || (!label ? 'No description' : '')}
          </div>
          <div className="md:hidden mt-0.5 truncate text-xs text-muted-foreground">{description || 'No description'}</div>
          {specText && <div className="md:hidden mt-0.5 truncate text-xs text-muted-foreground">{specText}</div>}
        </div>

        <div className="hidden md:flex flex-wrap gap-1.5 items-center">{spec}</div>

        <div onClick={(e) => e.stopPropagation()}>
          <RowActions inline={inline} actions={actions} />
        </div>
      </div>
    </RowContextMenu>
  )
}

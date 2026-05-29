'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Trash2, Loader2, Copy, Check, FileText, Eye, Upload, Pencil, X,
} from 'lucide-react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { AddClientModal } from '@/components/clients/add-client-modal'
import { QualityAssignmentDialog } from '@/components/quality-assignments/quality-assignment-dialog'
import { BulkOperationsDialog } from '@/components/clients/bulk-operations-dialog'
import { cn } from '@/lib/utils'

interface AssignedQuality {
  id: string
  custom_name: string
  quality_code?: string
  cups_per_sample?: number
  template_id: string
  template_name: string
  is_active: boolean
}

interface Client {
  id: string
  slug?: string
  name: string
  company: string
  fantasy_name?: string
  email?: string
  phone?: string
  is_active: boolean
  created_at: string
  client_types?: string[]
  is_qc_client?: boolean
  pricing_model?: 'per_sample' | 'per_pound' | 'complimentary'
  price_per_sample?: number
  price_per_pound_cents?: number
  currency?: string
  billing_basis?: 'approved_only' | 'approved_and_rejected'
  assigned_qualities?: AssignedQuality[]
}

type FilterKey = 'all' | 'qc' | 'trading' | 'inactive'

const TYPE_LABEL: Record<string, string> = {
  producer: 'Producer',
  producer_exporter: 'Exporter',
  cooperative: 'Cooperative',
  exporter: 'Exporter',
  importer_buyer: 'Trader',
  importer: 'Trader',
  roaster: 'Roaster',
  roaster_final_buyer: 'Roaster',
  final_buyer: 'Final Buyer',
  end_client: 'Final Buyer',
  service_provider: 'Service',
}

function formatTypeLabels(types?: string[]): string[] {
  if (!types || types.length === 0) return []
  const labels = types.map(t =>
    TYPE_LABEL[t] || t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
  )
  return Array.from(new Set(labels))
}

function currencySymbol(code?: string): string {
  switch ((code || 'USD').toUpperCase()) {
    case 'EUR': return '€'
    case 'BRL': return 'R$'
    case 'GBP': return '£'
    default: return '$'
  }
}

function billingBasisLabel(b?: Client['billing_basis']): string {
  if (b === 'approved_and_rejected') return 'all samples'
  return 'approved only'
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const [togglingStatus, setTogglingStatus] = useState<string | null>(null)
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)
  const [disableQcClient, setDisableQcClient] = useState<Client | null>(null)
  const [disableQcProcessing, setDisableQcProcessing] = useState(false)

  const [addClientModalOpen, setAddClientModalOpen] = useState(false)
  const [bulkOperationsDialogOpen, setBulkOperationsDialogOpen] = useState(false)

  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [assigningClientId, setAssigningClientId] = useState<string | null>(null)

  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteConfirmClient, setDeleteConfirmClient] = useState<Client | null>(null)
  const [deleteLinkedRecords, setDeleteLinkedRecords] = useState<
    { samples: number; contracts: number; qualities: number } | null
  >(null)
  const [deleteProcessing, setDeleteProcessing] = useState(false)

  useEffect(() => {
    loadClients()
  }, [searchQuery])

  async function loadClients() {
    try {
      setLoading(true)
      const params = new URLSearchParams({ is_qc_client: 'all', limit: '500' })
      if (searchQuery) params.append('search', searchQuery)

      // `is_qc_client=all` opts the API out of the QC filter so we get both
      // QC and trading-only rows. The chip filter / split happens client-side.
      const response = await fetch(`/api/clients?${params}`)
      const data = await response.json()

      if (!response.ok) {
        console.error('Failed to load clients:', data.error)
        setClients([])
        return
      }

      // The list rows show a specs count, which currently lives on a sibling endpoint.
      // Keep the per-client fetch behaviour the old page had — small list, fine for now.
      const withQualities = await Promise.all(
        (data.clients || []).map(async (client: Client) => {
          try {
            const r = await fetch(
              `/api/client-qualities?client_id=${client.id}&is_active=true`,
            )
            if (!r.ok) return client
            const j = await r.json()
            return {
              ...client,
              assigned_qualities: (j.client_qualities || []).map((cq: any) => ({
                id: cq.id,
                custom_name: cq.custom_name || cq.template?.name_en || '',
                quality_code: cq.quality_code,
                cups_per_sample: cq.cups_per_sample,
                template_id: cq.template_id,
                template_name: cq.template?.name_en || '',
                is_active: cq.is_active,
              })),
            }
          } catch (err) {
            console.error(`Error fetching qualities for client ${client.id}:`, err)
            return client
          }
        }),
      )
      setClients(withQualities)
    } catch (err) {
      console.error('Error loading clients:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleActive(client: Client) {
    try {
      setTogglingStatus(client.id)
      const response = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !client.is_active }),
      })
      if (response.ok) {
        await loadClients()
      } else {
        const error = await response.json()
        alert(`Failed to update client status: ${error.error}`)
      }
    } catch (err) {
      console.error('Error toggling client status:', err)
      alert('Failed to update client status')
    } finally {
      setTogglingStatus(null)
    }
  }

  async function handleDelete(client: Client) {
    try {
      setDeleteError(null)
      const response = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' })
      if (response.ok) {
        await loadClients()
        return
      }
      const data = await response.json()
      if (data.error === 'confirm_delete' && data.linked_records) {
        setDeleteConfirmClient(client)
        setDeleteLinkedRecords(data.linked_records)
      } else {
        setDeleteError(data.error || 'Failed to delete client')
      }
    } catch (err) {
      console.error('Error deleting client:', err)
      setDeleteError('Failed to delete client. Please try again.')
    }
  }

  async function handleConfirmForceDelete() {
    if (!deleteConfirmClient) return
    setDeleteProcessing(true)
    try {
      const response = await fetch(`/api/clients/${deleteConfirmClient.id}?force=true`, {
        method: 'DELETE',
      })
      if (response.ok) {
        setDeleteConfirmClient(null)
        setDeleteLinkedRecords(null)
        await loadClients()
      } else {
        const data = await response.json()
        setDeleteError(data.error || 'Failed to delete client')
        setDeleteConfirmClient(null)
        setDeleteLinkedRecords(null)
      }
    } catch (err) {
      console.error('Error force-deleting client:', err)
      setDeleteError('Failed to delete client. Please try again.')
      setDeleteConfirmClient(null)
      setDeleteLinkedRecords(null)
    } finally {
      setDeleteProcessing(false)
    }
  }

  async function handleConfirmDisableQc() {
    if (!disableQcClient) return
    setDisableQcProcessing(true)
    try {
      const response = await fetch(`/api/clients/${disableQcClient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_qc_client: false }),
      })
      if (response.ok) {
        setDisableQcClient(null)
        await loadClients()
      } else {
        const data = await response.json()
        alert(`Failed to disable QC: ${data.error || 'Unknown error'}`)
        setDisableQcClient(null)
      }
    } catch (err) {
      console.error('Error disabling QC:', err)
      alert('Failed to disable QC')
      setDisableQcClient(null)
    } finally {
      setDisableQcProcessing(false)
    }
  }

  async function handleCopyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email)
      setCopiedEmail(email)
      setTimeout(() => setCopiedEmail(null), 2000)
    } catch (err) {
      console.error('Failed to copy email:', err)
    }
  }

  const counts = useMemo(() => {
    let qc = 0
    let trading = 0
    let inactive = 0
    for (const c of clients) {
      if (!c.is_active) inactive += 1
      if (c.is_qc_client) qc += 1
      else trading += 1
    }
    return { all: clients.length, qc, trading, inactive }
  }, [clients])

  const visibleClients = useMemo(() => {
    switch (filter) {
      case 'qc': return clients.filter(c => c.is_qc_client)
      case 'trading': return clients.filter(c => !c.is_qc_client)
      case 'inactive': return clients.filter(c => !c.is_active)
      default: return clients
    }
  }, [clients, filter])

  return (
    <MainLayout>
      {/* Delete error dialog */}
      <Dialog open={!!deleteError} onOpenChange={() => setDeleteError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
            <DialogDescription>{deleteError}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setDeleteError(null)}>OK</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disable QC confirmation dialog */}
      <Dialog open={!!disableQcClient} onOpenChange={(open) => { if (!open) setDisableQcClient(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable QC for this client?</DialogTitle>
            <DialogDescription>
              &ldquo;{disableQcClient?.fantasy_name || disableQcClient?.name}&rdquo; will no longer
              appear in the QC clients list. Their certificate pattern, pricing &amp; quality specs
              stay saved — re-enabling QC restores them.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDisableQcClient(null)} disabled={disableQcProcessing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDisableQc} disabled={disableQcProcessing}>
              {disableQcProcessing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Disabling…</> : 'Disable QC'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteConfirmClient}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmClient(null)
            setDeleteLinkedRecords(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteConfirmClient?.fantasy_name || deleteConfirmClient?.name}&rdquo;? This client has linked records:
            </DialogDescription>
          </DialogHeader>
          {deleteLinkedRecords && (
            <ul className="text-sm space-y-1 ml-4 list-disc">
              {deleteLinkedRecords.samples > 0 && <li>{deleteLinkedRecords.samples} sample(s)</li>}
              {deleteLinkedRecords.contracts > 0 && <li>{deleteLinkedRecords.contracts} sub-contract(s)</li>}
              {deleteLinkedRecords.qualities > 0 && <li>{deleteLinkedRecords.qualities} quality specification(s)</li>}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            Linked samples and contracts will be unlinked (not deleted). Quality specifications will be removed.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmClient(null)
                setDeleteLinkedRecords(null)
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmForceDelete} disabled={deleteProcessing}>
              {deleteProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete client'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="max-w-[1180px] px-6 py-8 space-y-5">
        {/* Page heading */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight leading-tight">Clients</h1>
            <p className="text-[13.5px] text-muted-foreground mt-1">
              Manage your clients and their quality specifications
            </p>
          </div>
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              className="h-[38px] rounded-[9px] text-[13px] font-medium gap-1.5"
              onClick={() => setBulkOperationsDialogOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Import / Export
            </Button>
            <Button
              className="h-[38px] rounded-[9px] text-[13px] font-medium gap-1.5"
              onClick={() => setAddClientModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add client
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-[17px] w-[17px] text-muted-foreground/70 pointer-events-none" />
          <Input
            placeholder="Search by name, company, or fantasy name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-[46px] pl-11 pr-4 rounded-[11px] text-sm bg-card border-border focus-visible:ring-0 focus-visible:border-foreground/30"
          />
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          <FilterChip label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterChip label="QC clients" count={counts.qc} active={filter === 'qc'} onClick={() => setFilter('qc')} />
          <FilterChip label="Trading only" count={counts.trading} active={filter === 'trading'} onClick={() => setFilter('trading')} />
          <FilterChip label="Inactive" count={counts.inactive} active={filter === 'inactive'} onClick={() => setFilter('inactive')} />
        </div>

        {/* Table */}
        {loading ? (
          <div className="bg-card border border-border rounded-xl py-16 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
            Loading clients…
          </div>
        ) : visibleClients.length === 0 ? (
          <div className="bg-card border border-border rounded-xl py-16 text-center">
            <h3 className="text-base font-semibold mb-1">No clients found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery
                ? 'Try adjusting your search criteria'
                : filter === 'all'
                  ? 'Get started by adding your first client'
                  : 'No clients match this filter'}
            </p>
            {filter === 'all' && !searchQuery && (
              <Button onClick={() => setAddClientModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add client
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[2.4fr_1.6fr_2fr_1.3fr_56px_78px] items-center gap-3.5 h-[42px] px-5 border-b border-border bg-muted/30">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">Client</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">Type</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">Contact</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">QC pricing</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70 text-right">Status</span>
              <span aria-hidden />
            </div>
            {/* Rows */}
            {visibleClients.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                copiedEmail={copiedEmail}
                togglingStatus={togglingStatus}
                onToggleActive={() => handleToggleActive(client)}
                onDelete={() => handleDelete(client)}
                onCopyEmail={() => client.email && handleCopyEmail(client.email)}
                onAssignSpecs={() => {
                  setAssigningClientId(client.id)
                  setAssignmentDialogOpen(true)
                }}
                onDisableQc={() => setDisableQcClient(client)}
              />
            ))}
          </div>
        )}

        {/* Quality assignment dialog */}
        {assigningClientId && (
          <QualityAssignmentDialog
            open={assignmentDialogOpen}
            onOpenChange={setAssignmentDialogOpen}
            mode="from-client"
            clientId={assigningClientId}
            onSuccess={() => loadClients()}
          />
        )}

        {/* Bulk operations dialog */}
        <BulkOperationsDialog
          open={bulkOperationsDialogOpen}
          onOpenChange={setBulkOperationsDialogOpen}
          onSuccess={loadClients}
        />

        {/* Add client modal */}
        <AddClientModal
          open={addClientModalOpen}
          onOpenChange={setAddClientModalOpen}
          onSuccess={() => loadClients()}
        />
      </div>
    </MainLayout>
  )
}

function FilterChip({
  label, count, active, onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-[31px] px-3.5 rounded-full border text-[12.5px] inline-flex items-center gap-1.5 transition-colors',
        active
          ? 'bg-foreground text-background border-foreground'
          : 'bg-card text-muted-foreground border-border hover:text-foreground',
      )}
    >
      {label}
      <span className="font-semibold">{count}</span>
    </button>
  )
}

function ClientRow({
  client,
  copiedEmail,
  togglingStatus,
  onToggleActive,
  onDelete,
  onCopyEmail,
  onAssignSpecs,
  onDisableQc,
}: {
  client: Client
  copiedEmail: string | null
  togglingStatus: string | null
  onToggleActive: () => void
  onDelete: () => void
  onCopyEmail: () => void
  onAssignSpecs: () => void
  onDisableQc: () => void
}) {
  const typeLabels = formatTypeLabels(client.client_types)
  const specsCount = client.assigned_qualities?.length || 0
  const showSpecCount = specsCount > 0
  const showSpecsGap = !showSpecCount && !!client.is_qc_client
  const slug = client.slug || client.id

  return (
    <div
      className={cn(
        'group grid grid-cols-[2.4fr_1.6fr_2fr_1.3fr_56px_78px] items-center gap-3.5 min-h-[56px] px-5 border-b border-border last:border-b-0 transition-colors',
        'hover:bg-muted/40',
        !client.is_active && 'opacity-60',
      )}
    >
      {/* Client cell */}
      <div className="min-w-0">
        <Link
          href={`/clients/${slug}`}
          className="block w-fit max-w-full truncate text-[14px] font-semibold tracking-[-0.01em] leading-[1.25] hover:underline"
        >
          {client.fantasy_name || client.name}
        </Link>
        {showSpecCount && (
          <div className="flex items-center gap-1.5 mt-0.5 text-[11.5px] text-muted-foreground/80 whitespace-nowrap">
            <FileText className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <span>{specsCount} {specsCount === 1 ? 'spec' : 'specs'}</span>
          </div>
        )}
        {showSpecsGap && (
          <button
            type="button"
            onClick={onAssignSpecs}
            className="flex w-fit items-center gap-1.5 mt-0.5 text-[11.5px] text-muted-foreground/80 hover:text-[#15663f] dark:hover:text-emerald-400 transition-colors whitespace-nowrap"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#e0a83a] shrink-0" />
            <span>No specs &mdash; assign</span>
          </button>
        )}
      </div>

      {/* Type cell */}
      <div className="flex flex-wrap gap-1.5">
        {typeLabels.map((label) => (
          <span
            key={label}
            className="text-[11px] font-medium leading-5 px-2.5 py-[3px] rounded-full bg-muted text-muted-foreground"
          >
            {label}
          </span>
        ))}
        {client.is_qc_client && (
          <button
            type="button"
            onClick={onDisableQc}
            title="Click to disable QC for this client"
            className="group/qc text-[11px] font-semibold leading-5 px-2.5 py-[3px] rounded-full bg-[#e7f2ec] text-[#15663f] dark:bg-emerald-950/40 dark:text-emerald-300 inline-flex items-center gap-1 hover:bg-[#dcebe1] dark:hover:bg-emerald-950/60 transition-colors"
          >
            <span>QC</span>
            <X className="h-3 w-3 opacity-0 group-hover/qc:opacity-100 -mr-0.5 transition-opacity" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Contact cell */}
      <div className="min-w-0">
        {client.email ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] truncate text-foreground/80">{client.email}</span>
            <button
              type="button"
              onClick={onCopyEmail}
              className="opacity-0 group-hover:opacity-100 transition-opacity h-[26px] w-[26px] rounded-md inline-flex items-center justify-center text-muted-foreground/70 hover:bg-muted hover:text-foreground shrink-0"
              title={copiedEmail === client.email ? 'Copied' : 'Copy email'}
            >
              {copiedEmail === client.email ? (
                <Check className="h-3.5 w-3.5 text-[#15663f]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : (
          <span className="text-[13px] text-muted-foreground/60">No email on file</span>
        )}
      </div>

      {/* QC pricing cell */}
      <div>
        {client.is_qc_client ? <PricingCell client={client} /> : null}
      </div>

      {/* Status cell — compact switch, right-aligned to sit beside the actions */}
      <div className="flex items-center justify-end">
        <Switch
          checked={client.is_active}
          onCheckedChange={onToggleActive}
          disabled={togglingStatus === client.id}
          className="h-[18px] w-[32px] [&>span]:h-[14px] [&>span]:w-[14px] [&>span[data-state=checked]]:translate-x-[14px] [&>span[data-state=unchecked]]:translate-x-0"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/clients/${slug}`}
          className="h-[30px] w-[30px] rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
          title="View details"
        >
          <Eye className="h-[15px] w-[15px]" />
        </Link>
        <Link
          href={`/clients/${slug}/edit`}
          className="h-[30px] w-[30px] rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Edit client"
        >
          <Pencil className="h-[15px] w-[15px]" />
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="h-[30px] w-[30px] rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Delete client"
        >
          <Trash2 className="h-[15px] w-[15px]" />
        </button>
      </div>
    </div>
  )
}

function PricingCell({ client }: { client: Client }) {
  const slug = client.slug || client.id

  if (client.pricing_model === 'complimentary') {
    return (
      <div>
        <div className="text-[13px] font-semibold tracking-[-0.01em]">Complimentary</div>
      </div>
    )
  }

  if (client.pricing_model === 'per_sample' && client.price_per_sample) {
    return (
      <div>
        <div className="text-[13px] font-semibold tracking-[-0.01em]">
          {currencySymbol(client.currency)}{client.price_per_sample.toFixed(2)}
        </div>
        <div className="text-[11px] text-muted-foreground/70 mt-px">per sample</div>
      </div>
    )
  }

  if (client.pricing_model === 'per_pound' && client.price_per_pound_cents) {
    return (
      <div>
        <div className="text-[13px] font-semibold tracking-[-0.01em]">
          {client.price_per_pound_cents.toFixed(2)}¢ / lb
        </div>
        <div className="text-[11px] text-muted-foreground/70 mt-px">
          {billingBasisLabel(client.billing_basis)}
        </div>
      </div>
    )
  }

  return (
    <Link
      href={`/clients/${slug}`}
      className="text-[11.5px] text-muted-foreground/70 hover:text-[#15663f] dark:hover:text-emerald-400 transition-colors"
    >
      + Set pricing
    </Link>
  )
}

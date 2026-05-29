'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import {
  Mail,
  Phone,
  Calendar,
  Building2,
  Pencil,
  Settings,
  Check,
  RefreshCw,
  PencilLine,
  Link2,
} from 'lucide-react'
import { format } from 'date-fns'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ClientQualityManager } from './client-quality-manager'
import { ClientMetricsTab } from './client-metrics-tab'
import { QcConfigPanel } from './qc-config-panel'
import { DEFAULT_CERTIFICATE_PATTERN } from '@/types/certificate-pattern'
import { cn } from '@/lib/utils'

interface ClientDetailViewProps {
  clientId: string
}

interface ClientData {
  client: any
  samples: any[]
  sampleMetrics: {
    total: number
    received: number
    in_progress: number
    under_review: number
    approved: number
    rejected: number
  }
  qualitySpecs: any[]
  certificatesCount: number
}

const STATUS_COLORS = {
  received: '#94a3b8',
  in_progress: '#3b82f6',
  under_review: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
}

const CLIENT_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'producer', label: 'Producer' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'exporter', label: 'Exporter' },
  { value: 'importer', label: 'Importer' },
  { value: 'roaster', label: 'Roaster' },
  { value: 'final_importer', label: 'Final Importer' },
  { value: 'end_client', label: 'End Client' },
]

// Common countries — order tuned for our roster. "Other" routes to free-text
// fallback (an empty option lets the underlying value pass through).
const COUNTRY_OPTIONS = [
  'Brazil',
  'Colombia',
  'Costa Rica',
  'El Salvador',
  'Ethiopia',
  'Germany',
  'Guatemala',
  'Honduras',
  'Indonesia',
  'Japan',
  'Kenya',
  'Mexico',
  'Netherlands',
  'Nicaragua',
  'Peru',
  'United Kingdom',
  'United States',
  'Vietnam',
]

// Country-driven labels for tax ID + postal code.
// Brazil → CNPJ/CEP; US/UK → ZIP; rest of EU/Latam → VAT/Postcode.
function vatLabelFor(country: string | undefined | null): string {
  if (!country) return 'VAT'
  if (country === 'Brazil') return 'CNPJ'
  return 'VAT'
}

function zipLabelFor(country: string | undefined | null): string {
  if (!country) return 'ZIP'
  if (country === 'Brazil') return 'CEP'
  if (country === 'United States') return 'ZIP'
  if (country === 'United Kingdom') return 'Postcode'
  return 'Postcode'
}

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

function formatTypeLabels(types?: string[]): string {
  if (!types || types.length === 0) return ''
  const labels = types.map(t =>
    TYPE_LABEL[t] || t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
  )
  return Array.from(new Set(labels)).join(' · ')
}

export function ClientDetailView({ clientId }: ClientDetailViewProps) {
  const searchParams = useSearchParams()
  const [data, setData] = useState<ClientData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(searchParams?.get('edit') === 'true')
  const [qcDialogOpen, setQcDialogOpen] = useState(false)
  const [editFormData, setEditFormData] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [bannerPulse, setBannerPulse] = useState(false)

  const fetchClientData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/clients/${clientId}`)
      if (!response.ok) throw new Error('Failed to fetch client data')
      const clientData = await response.json()
      setData(clientData)
    } catch (err) {
      console.error('Error fetching client:', err)
      setError('Failed to load client data')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    if (clientId) fetchClientData()
  }, [clientId, fetchClientData])

  // When the page lands with ?edit=true (or any time edit mode is on without
  // a hydrated form), seed editFormData from the loaded client so the inputs
  // aren't blank. Without this, the legacy /clients/[id]/edit redirect lands
  // on an empty form.
  useEffect(() => {
    if (!isEditing) return
    if (editFormData) return
    if (!data) return
    const { client } = data
    setEditFormData({
      name: client.name || '',
      company: client.company || '',
      fantasy_name: client.fantasy_name || '',
      contact_name: client.contact_name || '',
      email: client.email || '',
      phone: client.phone || '',
      vat_number: client.vat_number || '',
      // Effective address (what the form binds to). Sys snapshots in sys_*.
      address: client.address || '',
      neighborhood: client.neighborhood || '',
      zip_code: client.zip_code || '',
      city: client.city || '',
      state: client.state || '',
      country: client.country || '',
      sys_address: client.sys_address ?? client.address ?? '',
      sys_neighborhood: client.sys_neighborhood ?? client.neighborhood ?? '',
      sys_city: client.sys_city ?? client.city ?? '',
      sys_state: client.sys_state ?? client.state ?? '',
      sys_country: client.sys_country ?? client.country ?? '',
      sys_zip_code: client.sys_zip_code ?? client.zip_code ?? '',
      address_override_active: !!client.address_override_active,
      client_types: client.client_types || [],
      is_qc_client: client.is_qc_client !== false,
      is_active: client.is_active !== false,
    })
  }, [isEditing, editFormData, data])

  function handleEnterEditMode() {
    if (!data) return
    const { client } = data
    setEditFormData({
      name: client.name || '',
      company: client.company || '',
      fantasy_name: client.fantasy_name || '',
      contact_name: client.contact_name || '',
      email: client.email || '',
      phone: client.phone || '',
      vat_number: client.vat_number || '',
      // Effective address (what the form binds to). Sys snapshots in sys_*.
      address: client.address || '',
      neighborhood: client.neighborhood || '',
      zip_code: client.zip_code || '',
      city: client.city || '',
      state: client.state || '',
      country: client.country || '',
      sys_address: client.sys_address ?? client.address ?? '',
      sys_neighborhood: client.sys_neighborhood ?? client.neighborhood ?? '',
      sys_city: client.sys_city ?? client.city ?? '',
      sys_state: client.sys_state ?? client.state ?? '',
      sys_country: client.sys_country ?? client.country ?? '',
      sys_zip_code: client.sys_zip_code ?? client.zip_code ?? '',
      address_override_active: !!client.address_override_active,
      client_types: client.client_types || [],
      is_qc_client: client.is_qc_client !== false,
      is_active: client.is_active !== false,
    })
    setIsEditing(true)
  }

  function handleCancelEdit() {
    setIsEditing(false)
    setEditFormData(null)
  }

  function handleClearAddressOverride() {
    if (!editFormData) return
    // Snap visible fields back to the sys snapshot and mark synced.
    setEditFormData({
      ...editFormData,
      address: editFormData.sys_address || '',
      neighborhood: editFormData.sys_neighborhood || '',
      city: editFormData.sys_city || '',
      state: editFormData.sys_state || '',
      country: editFormData.sys_country || '',
      zip_code: editFormData.sys_zip_code || '',
      address_override_active: false,
    })
    // Brief visual ack so the action doesn't feel silent when sys values
    // already matched (the common case for clients with no local override).
    setBannerPulse(true)
    window.setTimeout(() => setBannerPulse(false), 600)
  }

  function handleEnableAddressOverride() {
    if (!editFormData) return
    // Flip to manual override. Editable fields keep their current effective
    // values (which are the sys values until the user changes them).
    setEditFormData({ ...editFormData, address_override_active: true })
  }

  async function handleSaveEdit() {
    if (!editFormData) return
    setSaving(true)
    try {
      // Build the payload: never write raw address fields back to companies
      // (sys = source of truth). When the override is active, route the address
      // into qc_client_settings.address_override. When inactive, clear it.
      // For trading-only clients (QC off), leave qc_client_settings untouched.
      const payload: Record<string, unknown> = { ...editFormData }
      delete payload.sys_address
      delete payload.sys_neighborhood
      delete payload.sys_city
      delete payload.sys_state
      delete payload.sys_country
      delete payload.sys_zip_code
      delete payload.address_override_active
      delete payload.address
      delete payload.neighborhood
      delete payload.city
      delete payload.state
      delete payload.country
      delete payload.zip_code

      if (editFormData.is_qc_client !== false) {
        payload.address_override = editFormData.address_override_active
          ? {
              street: editFormData.address || null,
              neighborhood: editFormData.neighborhood || null,
              city: editFormData.city || null,
              state: editFormData.state || null,
              country: editFormData.country || null,
              zip_code: editFormData.zip_code || null,
            }
          : null
      }

      const response = await fetch(`/api/clients/${data!.client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        // 404 here usually means the underlying companies row was merged or
        // deleted on sys while this tab was open — the cached UUID is stale.
        // Re-fetch via the slug; the page will pick up the surviving row.
        if (response.status === 404) {
          alert(
            'This client no longer exists at the saved ID. It was likely merged '
            + 'or deleted on Wolthers System. The page will reload to pick up '
            + 'the surviving record.'
          )
          window.location.reload()
          return
        }
        let detail = ''
        try {
          const body = await response.json()
          detail = body?.details || body?.error || ''
        } catch {}
        throw new Error(detail || `HTTP ${response.status}`)
      }
      setIsEditing(false)
      setEditFormData(null)
      await fetchClientData()
    } catch (err) {
      console.error('Error saving client:', err)
      alert(`Failed to save changes${err instanceof Error && err.message ? ': ' + err.message : ''}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleQcConfigSave(configData: any) {
    try {
      const response = await fetch(`/api/clients/${data!.client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificate_pattern: configData.certificatePattern,
          certificate_validity_months: configData.certificateValidityEnabled ? configData.certificateValidityMonths : null,
          pricing_model: configData.pricingModel,
          price_per_sample: configData.pricePerSample,
          price_per_pound_cents: configData.pricePerPoundCents,
          currency: configData.currency,
          billing_basis: configData.billingBasis,
          payment_terms: configData.paymentTerms,
          fee_payer: configData.feePayer,
          billing_notes: configData.billingNotes,
          is_qc_client: true,
        }),
      })
      if (!response.ok) throw new Error('Failed to save QC config')
      setQcDialogOpen(false)
      await fetchClientData()
    } catch (err) {
      console.error('Error saving QC config:', err)
      alert('Failed to save QC configuration')
    }
  }

  function toggleRole(role: string) {
    if (!editFormData) return
    const current = editFormData.client_types || []
    const updated = current.includes(role)
      ? current.filter((r: string) => r !== role)
      : [...current, role]
    setEditFormData({ ...editFormData, client_types: updated })
  }

  if (loading) return <ClientDetailSkeleton />

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-destructive">{error || 'Client not found'}</p>
        </CardContent>
      </Card>
    )
  }

  const { client, samples, sampleMetrics, qualitySpecs, certificatesCount } = data
  const displayName = client.fantasy_name || client.company || client.name
  const legalNameLine =
    client.fantasy_name && client.company && client.company !== client.fantasy_name
      ? client.company
      : null
  const cityLine = [client.city, client.state, client.zip_code].filter(Boolean).join(', ')
  const addressLines = [
    client.address || null,
    client.neighborhood || null,
    cityLine || null,
    client.country || null,
  ].filter((l): l is string => !!l)
  const typeSummary = formatTypeLabels(client.client_types)

  // Editing mode renders a focused form (no stats / no tabs); the dependent
  // QC services + Quality specs cards sit below the form and dim when the
  // QC toggle goes off.
  if (isEditing && editFormData) {
    const qcOn = editFormData.is_qc_client !== false
    const activeOn = editFormData.is_active !== false
    return (
      <div className="space-y-3">
        {/* Top bar */}
        <div className="bg-card border border-border rounded-xl px-5 py-3 flex items-center justify-between">
          <span className="text-[15px] font-semibold">Editing client information</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelEdit}
              disabled={saving}
              className="h-9 rounded-[9px] text-[13px]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={saving}
              className="h-9 rounded-[9px] text-[13px] bg-[#0d0f12] text-white hover:bg-[#0d0f12]/90 dark:bg-white dark:text-[#0d0f12] dark:hover:bg-white/90"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>

        {/* Form card */}
        <div className="bg-card border border-border rounded-xl px-6 py-6">
          {/* COMPANY */}
          <FieldGroup title="Company">
            <div className="grid grid-cols-1 md:grid-cols-[0.72fr_1.25fr_0.9fr_auto] gap-x-3.5 gap-y-4 md:items-end">
              <EditField
                label="Fantasy name"
                value={editFormData.fantasy_name}
                onChange={(v) => setEditFormData({ ...editFormData, fantasy_name: v })}
              />
              <EditField
                label="Legal / company name"
                value={editFormData.name}
                onChange={(v) => setEditFormData({ ...editFormData, name: v })}
              />
              <EditField
                label={`VAT / ${vatLabelFor(editFormData.country)}`}
                value={editFormData.vat_number}
                onChange={(v) => setEditFormData({ ...editFormData, vat_number: v })}
              />
              <div className="flex flex-col items-end gap-2.5 md:pb-1.5">
                <ToggleRow
                  label="QC client"
                  checked={qcOn}
                  tone="green"
                  onChange={(v) => setEditFormData({ ...editFormData, is_qc_client: v })}
                />
                <ToggleRow
                  label="Active"
                  checked={activeOn}
                  tone="ink"
                  onChange={(v) => setEditFormData({ ...editFormData, is_active: v })}
                />
              </div>
            </div>
          </FieldGroup>

          {/* CONTACT */}
          <FieldGroup title="Contact">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <EditField
                label="Contact name"
                value={editFormData.contact_name}
                onChange={(v) => setEditFormData({ ...editFormData, contact_name: v })}
              />
              <EditField
                label="Email"
                type="email"
                value={editFormData.email}
                onChange={(v) => setEditFormData({ ...editFormData, email: v })}
              />
              <EditField
                label="Phone"
                value={editFormData.phone}
                onChange={(v) => setEditFormData({ ...editFormData, phone: v })}
              />
            </div>
          </FieldGroup>

          {/* ADDRESS — synced from sys; manual override goes to qc_client_settings */}
          <FieldGroup title="Address">
            <SyncBanner
              mode={editFormData.address_override_active ? 'manual' : 'synced'}
              legalName={editFormData.name || client.name || ''}
              sysRef={
                client.legacy_client_id
                  ? `SYS#${client.legacy_client_id}`
                  : `SYS#${String(client.id || '').slice(0, 8)}`
              }
              pulse={bannerPulse}
              onRepull={handleClearAddressOverride}
              onToggleManual={
                editFormData.address_override_active
                  ? handleClearAddressOverride
                  : handleEnableAddressOverride
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <EditSelect
                label="Country"
                value={editFormData.country}
                options={COUNTRY_OPTIONS}
                onChange={(v) => setEditFormData({ ...editFormData, country: v })}
                disabled={!editFormData.address_override_active}
              />
              <div className="md:col-span-2">
                <EditField
                  label="Street address"
                  value={editFormData.address}
                  onChange={(v) => setEditFormData({ ...editFormData, address: v })}
                  disabled={!editFormData.address_override_active}
                />
              </div>
              <div className="md:col-span-3">
                <EditField
                  label="Neighborhood"
                  value={editFormData.neighborhood}
                  onChange={(v) => setEditFormData({ ...editFormData, neighborhood: v })}
                  disabled={!editFormData.address_override_active}
                />
              </div>
              <EditField
                label="City"
                value={editFormData.city}
                onChange={(v) => setEditFormData({ ...editFormData, city: v })}
                disabled={!editFormData.address_override_active}
              />
              <EditField
                label="State / Province"
                value={editFormData.state}
                onChange={(v) => setEditFormData({ ...editFormData, state: v })}
                disabled={!editFormData.address_override_active}
              />
              <EditField
                label={zipLabelFor(editFormData.country)}
                value={editFormData.zip_code}
                onChange={(v) => setEditFormData({ ...editFormData, zip_code: v })}
                disabled={!editFormData.address_override_active}
              />
            </div>
          </FieldGroup>

          {/* CLIENT ROLES */}
          <FieldGroup title="Client roles">
            <div className="flex flex-wrap gap-2.5">
              {CLIENT_ROLE_OPTIONS.map((role) => {
                const active = (editFormData.client_types || []).includes(role.value)
                return (
                  <RoleChip
                    key={role.value}
                    label={role.label}
                    active={active}
                    onClick={() => toggleRole(role.value)}
                  />
                )
              })}
            </div>
          </FieldGroup>
        </div>

        {/* Dependent sections — dim + disable when QC is off, never deleted */}
        <div
          className={cn(
            'space-y-2.5 transition-opacity duration-200',
            !qcOn && 'opacity-40 pointer-events-none',
          )}
        >
          <DependentCard
            title="QC services"
            description="Certificate pattern, pricing & billing"
            actionLabel="Configure"
            actionIcon={<Settings className="h-3.5 w-3.5" />}
            onAction={() => setQcDialogOpen(true)}
          />
          <DependentCard
            title="Quality specifications"
            description={`${qualitySpecs.length} template${qualitySpecs.length === 1 ? '' : 's'} assigned to this client`}
            actionLabel="+ Add"
            onAction={() => {
              // Specs management lives in the Quality Specs tab. Exit edit mode
              // and the tab will be visible; ClientQualityManager handles the add UX.
              setIsEditing(false)
              setEditFormData(null)
            }}
          />
        </div>

        {!qcOn && (
          <div className="text-[12.5px] rounded-[10px] border border-[#f5e2c8] bg-[#fff7ed] text-[#9a6b08] px-3.5 py-3 leading-relaxed dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200">
            Turning off <strong className="text-[#7a5406] dark:text-amber-100">QC client</strong> hides certificate pattern, pricing and quality specs — this client becomes trading-only. Existing config is kept, just hidden, and can be restored by switching it back on.
          </div>
        )}

        {/* QC Config Dialog (kept mounted so unsaved edits survive toggling) */}
        <QcConfigPanel
          open={qcDialogOpen}
          onOpenChange={setQcDialogOpen}
          data={{
            certificatePattern: client.certificate_pattern || DEFAULT_CERTIFICATE_PATTERN,
            certificateValidityEnabled: !!client.certificate_validity_months,
            certificateValidityMonths: client.certificate_validity_months || 6,
            pricingModel: client.pricing_model || 'per_pound',
            pricePerSample: client.price_per_sample,
            pricePerPoundCents: client.price_per_pound_cents,
            currency: client.currency || 'USD',
            billingBasis: client.billing_basis || 'approved_only',
            paymentTerms: client.payment_terms || '',
            feePayer: client.fee_payer || 'client_pays',
            billingNotes: client.billing_notes || '',
            logoUrl: client.logo_url,
          }}
          onSave={handleQcConfigSave}
          clientId={client.id}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-card border border-border rounded-xl px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-5 min-w-0">
            {client.logo_url && (
              <>
                <div className="h-[52px] flex items-center justify-center flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={client.logo_url}
                    alt={`${displayName} logo`}
                    className="h-[52px] w-auto object-contain"
                  />
                </div>
                <div className="h-10 w-px bg-border" />
              </>
            )}
            <div className="min-w-0 flex items-baseline gap-3 flex-wrap">
              <h1 className="text-[23px] font-bold tracking-[-0.02em] leading-tight">
                {displayName}
              </h1>
              {legalNameLine && (
                <span className="text-[14px] text-muted-foreground truncate">{legalNameLine}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {client.is_qc_client && (
              <span className="text-[12px] font-semibold px-3 py-1 rounded-full bg-[#e7f2ec] text-[#15663f] dark:bg-emerald-950/40 dark:text-emerald-300">
                QC client
              </span>
            )}
            <span
              className={cn(
                'text-[12px] font-medium px-3 py-1 rounded-full border',
                client.is_active
                  ? 'bg-[#e7f2ec] text-[#15663f] border-[#d4e7dc] dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900'
                  : 'bg-muted text-muted-foreground border-border',
              )}
            >
              {client.is_active ? 'Active' : 'Inactive'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnterEditMode}
              className="h-9 rounded-[9px] text-[13px] font-medium gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </div>

        {/* Multi-line address — mirrors sys layout (street / bairro / city·state·zip / country) */}
        {addressLines.length > 0 && (
          <div className="mt-2 space-y-0.5 text-[13px] text-muted-foreground/85 leading-snug">
            {addressLines.map((line, i) => (
              <div key={i} className="truncate">{line}</div>
            ))}
          </div>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 mt-5">
          {client.email && (
            <div className="flex items-center gap-2 text-[13px] text-foreground/80 min-w-0">
              <Mail className="h-[15px] w-[15px] text-muted-foreground/70 shrink-0" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-2 text-[13px] text-foreground/80">
              <Phone className="h-[15px] w-[15px] text-muted-foreground/70 shrink-0" />
              <span>{client.phone}</span>
            </div>
          )}
          {typeSummary && (
            <div className="flex items-center gap-2 text-[13px] text-foreground/80">
              <Building2 className="h-[15px] w-[15px] text-muted-foreground/70 shrink-0" />
              <span>{typeSummary}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[13px] text-foreground/80">
            <Calendar className="h-[15px] w-[15px] text-muted-foreground/70 shrink-0" />
            <span>Joined {format(new Date(client.created_at), 'MMM d, yyyy')}</span>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard n={sampleMetrics.total} label="Samples" />
        <StatCard n={sampleMetrics.approved} label="Approved" tone="good" />
        <StatCard n={qualitySpecs.length} label="Quality specs" />
        <StatCard n={certificatesCount} label="Certificates" />
      </div>

      {/* QC services entry card — only for QC clients */}
      {client.is_qc_client && (
        <div className="bg-card border border-border rounded-xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">QC services</div>
            <div className="text-[12.5px] text-muted-foreground mt-0.5">
              Certificate pattern, pricing &amp; billing for this client
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQcDialogOpen(true)}
            className="h-9 rounded-[9px] text-[13px] font-medium gap-1.5"
          >
            <Settings className="h-3.5 w-3.5" />
            Configure
          </Button>
        </div>
      )}

      {/* Tabbed Content */}
      <Tabs defaultValue="specs" className="w-full">
        <TabsList className="inline-flex bg-muted rounded-[10px] p-1 h-auto">
          <TabsTrigger value="specs" className="px-4 py-1.5 text-[13px] rounded-[7px] data-[state=active]:shadow-sm">
            Quality Specs
          </TabsTrigger>
          <TabsTrigger value="samples" className="px-4 py-1.5 text-[13px] rounded-[7px] data-[state=active]:shadow-sm">
            Samples
          </TabsTrigger>
          <TabsTrigger value="metrics" className="px-4 py-1.5 text-[13px] rounded-[7px] data-[state=active]:shadow-sm">
            Metrics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="specs" className="space-y-4 mt-4">
          <ClientQualityManager
            clientId={client.id}
            clientName={client.fantasy_name || client.company}
            defaultFeePrice={client.pricing_model === 'per_pound' ? client.price_per_pound_cents : client.pricing_model === 'per_sample' ? client.price_per_sample : null}
            defaultFeeCurrency={client.currency || 'USD'}
            defaultFeeUnit={client.pricing_model === 'complimentary' ? null : (client.pricing_model || 'per_pound')}
            hasQualityCode={client.certificate_pattern?.has_quality_code || false}
          />
        </TabsContent>

        <TabsContent value="samples" className="space-y-4 mt-4">
          <SamplesTab samples={samples} />
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4 mt-4">
          <ClientMetricsTab
            clientId={client.id}
            clientName={client.fantasy_name || client.company}
            sampleMetrics={sampleMetrics}
            samples={samples}
          />
        </TabsContent>
      </Tabs>

      {/* QC Config Dialog */}
      <QcConfigPanel
        open={qcDialogOpen}
        onOpenChange={setQcDialogOpen}
        data={{
          certificatePattern: client.certificate_pattern || DEFAULT_CERTIFICATE_PATTERN,
          certificateValidityEnabled: !!client.certificate_validity_months,
          certificateValidityMonths: client.certificate_validity_months || 6,
          pricingModel: client.pricing_model || 'per_pound',
          pricePerSample: client.price_per_sample,
          pricePerPoundCents: client.price_per_pound_cents,
          currency: client.currency || 'USD',
          billingBasis: client.billing_basis || 'approved_only',
          paymentTerms: client.payment_terms || '',
          feePayer: client.fee_payer || 'client_pays',
          billingNotes: client.billing_notes || '',
          logoUrl: client.logo_url,
        }}
        onSave={handleQcConfigSave}
        clientId={client.id}
      />
    </div>
  )
}

function StatCard({ n, label, tone }: { n: number | string; label: string; tone?: 'good' }) {
  return (
    <div className="bg-card border border-border rounded-[11px] px-4 py-4">
      <div className="text-[22px] font-bold tracking-[-0.02em] leading-none">{n}</div>
      <div
        className={cn(
          'text-[12px] mt-1.5',
          tone === 'good' ? 'text-[#15663f] dark:text-emerald-400' : 'text-muted-foreground',
        )}
      >
        {label}
      </div>
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold tracking-[0.07em] uppercase text-muted-foreground/70">
          {title}
        </span>
        <span className="flex-1 h-px bg-border" />
      </div>
      {children}
    </div>
  )
}

function EditField({
  label, value, onChange, type, placeholder, disabled,
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] text-muted-foreground font-normal block">{label}</label>
      <Input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        readOnly={disabled}
        className={cn(
          'h-[42px] text-[13.5px] rounded-[9px] px-3.5 focus-visible:ring-2 focus-visible:ring-[#15663f]/15 focus-visible:border-[#15663f]',
          disabled && 'bg-muted/60 text-foreground/80 cursor-default focus-visible:ring-0 focus-visible:border-input',
        )}
      />
    </div>
  )
}

function EditSelect({
  label, value, options, onChange, disabled,
}: {
  label: string
  value: string | undefined
  options: string[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] text-muted-foreground font-normal block">{label}</label>
      <div className="relative">
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            'h-[42px] w-full appearance-none rounded-[9px] border border-input bg-background px-3.5 pr-10 text-[13.5px]',
            'focus:outline-none focus:ring-2 focus:ring-[#15663f]/15 focus:border-[#15663f]',
            disabled && 'bg-muted/60 text-foreground/80 cursor-default',
          )}
        >
          <option value="">Select country…</option>
          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 14 14"
          className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        >
          <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    </div>
  )
}

function SyncBanner({
  mode, legalName, sysRef, pulse, onRepull, onToggleManual,
}: {
  mode: 'synced' | 'manual'
  legalName: string
  sysRef: string
  pulse?: boolean
  onRepull: () => void
  onToggleManual: () => void
}) {
  const isManual = mode === 'manual'
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] border px-3.5 py-2.5 text-[12.5px] mb-3.5 transition-colors duration-300',
        isManual
          ? 'border-[#f5e2c8] bg-[#fff7ed] text-[#9a6b08] dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200'
          : 'border-[#dbe6fa] bg-[#eef4ff] text-[#2c5db0] dark:border-sky-900/40 dark:bg-sky-900/15 dark:text-sky-200',
        pulse && !isManual && 'bg-[#dff0e2] border-[#c0e0c8] text-[#15663f]',
      )}
    >
      <RefreshCw className="h-[15px] w-[15px] shrink-0" />
      {isManual ? (
        <span className="min-w-0">
          <strong className="font-semibold">Manual override</strong>
          <span className="opacity-80"> — changes stay in QC and won&apos;t sync from the system</span>
        </span>
      ) : (
        <span className="min-w-0">
          Synced from{' '}
          <strong className="font-semibold">Wolthers System</strong>
          {legalName && <> · {legalName}</>}
          {sysRef && (
            <span className="ml-1 font-mono text-[11.5px] opacity-75">· {sysRef}</span>
          )}
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onRepull}
          className="inline-flex items-center gap-1.5 font-medium hover:underline"
        >
          <RefreshCw className="h-[13px] w-[13px]" />
          Re-pull
        </button>
        <button
          type="button"
          onClick={onToggleManual}
          className="inline-flex items-center gap-1.5 font-medium hover:underline"
        >
          {isManual ? (
            <>
              <Link2 className="h-[13px] w-[13px]" />
              Re-link &amp; sync
            </>
          ) : (
            <>
              <PencilLine className="h-[13px] w-[13px]" />
              Edit manually
            </>
          )}
        </button>
      </span>
    </div>
  )
}

function ToggleRow({
  label, checked, onChange, tone,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  tone: 'green' | 'ink'
}) {
  // h-4 + gap-2.5 between rows → 16 + 10 + 16 = 42px (matches input height).
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[12px] font-medium text-foreground/70 leading-none">{label}</span>
      <SwitchPrimitives.Root
        checked={checked}
        onCheckedChange={onChange}
        className={cn(
          'peer inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
          'data-[state=unchecked]:bg-muted-foreground/30',
          tone === 'green' && 'data-[state=checked]:bg-[#15663f]',
          tone === 'ink' && 'data-[state=checked]:bg-[#0d0f12] dark:data-[state=checked]:bg-white',
        )}
      >
        <SwitchPrimitives.Thumb className="pointer-events-none block h-3 w-3 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0" />
      </SwitchPrimitives.Root>
    </div>
  )
}

function RoleChip({
  label, active, onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-[13px] font-medium transition-colors',
        active
          ? 'border-[#15663f] bg-[#f3f9f5] text-[#15663f] dark:border-emerald-500/50 dark:bg-emerald-900/25 dark:text-emerald-200'
          : 'border-border bg-card text-foreground/70 hover:text-foreground hover:border-border/80',
      )}
    >
      <span
        className={cn(
          'w-[15px] h-[15px] rounded-[5px] border-[1.5px] grid place-items-center',
          active
            ? 'bg-[#15663f] border-[#15663f] dark:bg-emerald-500 dark:border-emerald-500'
            : 'border-border',
        )}
      >
        {active && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
      </span>
      <span>{label}</span>
    </button>
  )
}

function DependentCard({
  title, description, actionLabel, actionIcon, onAction,
}: {
  title: string
  description: string
  actionLabel: string
  actionIcon?: React.ReactNode
  onAction: () => void
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold">{title}</div>
        <div className="text-[12.5px] text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onAction}
        className="h-9 rounded-[9px] text-[13px] font-medium gap-1.5"
      >
        {actionIcon}
        {actionLabel}
      </Button>
    </div>
  )
}

function SamplesTab({ samples }: { samples: any[] }) {
  if (samples.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No samples found for this client
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sample History</CardTitle>
        <CardDescription className="text-xs">Recent samples from this client (up to 50)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Tracking Number</th>
                <th className="text-left py-2 pr-3 font-medium">Origin</th>
                <th className="text-left py-2 pr-3 font-medium">Date</th>
                <th className="text-right py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((sample) => (
                <tr key={sample.id} className="border-b last:border-0 hover:bg-accent/50">
                  <td className="py-2 pr-3 font-medium">{sample.tracking_number}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{sample.origin || '-'}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {format(new Date(sample.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="py-2 text-right">
                    <Badge
                      variant="outline"
                      className="capitalize"
                      style={{
                        backgroundColor: `${STATUS_COLORS[sample.status as keyof typeof STATUS_COLORS]}20`,
                        borderColor: STATUS_COLORS[sample.status as keyof typeof STATUS_COLORS],
                      }}
                    >
                      {sample.status.replace('_', ' ')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function ClientDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl px-6 py-5">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-48 mt-2" />
        <div className="flex gap-6 mt-5">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-4 w-32" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3.5">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[68px] rounded-[11px]" />
        ))}
      </div>
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}

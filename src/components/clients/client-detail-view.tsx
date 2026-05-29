'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Mail,
  Phone,
  Calendar,
  Building2,
  Pencil,
  Settings,
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

const CLIENT_ROLE_OPTIONS = [
  'producer', 'cooperative', 'exporter', 'importer',
  'roaster', 'final_importer', 'end_client',
]

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
      email: client.email || '',
      phone: client.phone || '',
      vat_number: client.vat_number || '',
      address: client.address || '',
      zip_code: client.zip_code || '',
      city: client.city || '',
      state: client.state || '',
      country: client.country || '',
      client_types: client.client_types || [],
    })
  }, [isEditing, editFormData, data])

  function handleEnterEditMode() {
    if (!data) return
    const { client } = data
    setEditFormData({
      name: client.name || '',
      company: client.company || '',
      fantasy_name: client.fantasy_name || '',
      email: client.email || '',
      phone: client.phone || '',
      vat_number: client.vat_number || '',
      address: client.address || '',
      zip_code: client.zip_code || '',
      city: client.city || '',
      state: client.state || '',
      country: client.country || '',
      client_types: client.client_types || [],
    })
    setIsEditing(true)
  }

  function handleCancelEdit() {
    setIsEditing(false)
    setEditFormData(null)
  }

  async function handleSaveEdit() {
    setSaving(true)
    try {
      const response = await fetch(`/api/clients/${data!.client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      })
      if (!response.ok) throw new Error('Failed to save')
      setIsEditing(false)
      setEditFormData(null)
      await fetchClientData()
    } catch (err) {
      console.error('Error saving client:', err)
      alert('Failed to save changes')
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
  const sublineParts = [
    client.fantasy_name ? client.company : null,
    client.country,
  ].filter(Boolean)
  const subline = sublineParts.join(' · ')
  const typeSummary = formatTypeLabels(client.client_types)

  return (
    <div className="space-y-4">
      {/* Save/Cancel Bar for Edit Mode */}
      {isEditing && (
        <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-background border border-border shadow-sm rounded-xl">
          <span className="text-sm font-medium">Editing client information</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

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
            <div className="min-w-0">
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editFormData?.fantasy_name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, fantasy_name: e.target.value })}
                    className="text-[23px] font-bold tracking-[-0.02em] h-auto py-1 px-2"
                    placeholder="Fantasy name"
                  />
                  <Input
                    value={editFormData?.company || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                    className="text-sm h-auto py-1 px-2"
                    placeholder="Company name"
                  />
                </div>
              ) : (
                <>
                  <h1 className="text-[23px] font-bold tracking-[-0.02em] leading-tight truncate">
                    {displayName}
                  </h1>
                  {subline && (
                    <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{subline}</p>
                  )}
                </>
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
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnterEditMode}
                className="h-9 rounded-[9px] text-[13px] font-medium gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* Meta row */}
        {!isEditing && (
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
        )}

        {/* Inline edit body */}
        {isEditing && editFormData && (
          <div className="mt-6 space-y-7">
            <EditSection title="Identity">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                <EditField label="Contact name" value={editFormData.name} onChange={(v) => setEditFormData({ ...editFormData, name: v })} />
                <EditField label="VAT / CNPJ" value={editFormData.vat_number} onChange={(v) => setEditFormData({ ...editFormData, vat_number: v })} />
                <EditField label="Email" type="email" value={editFormData.email} onChange={(v) => setEditFormData({ ...editFormData, email: v })} />
                <EditField label="Phone" value={editFormData.phone} onChange={(v) => setEditFormData({ ...editFormData, phone: v })} />
              </div>
            </EditSection>

            <EditSection title="Address">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-x-5 gap-y-4">
                <div className="md:col-span-4">
                  <EditField label="Street address" value={editFormData.address} onChange={(v) => setEditFormData({ ...editFormData, address: v })} />
                </div>
                <div className="md:col-span-2">
                  <EditField label="ZIP / CEP" value={editFormData.zip_code} onChange={(v) => setEditFormData({ ...editFormData, zip_code: v })} />
                </div>
                <div className="md:col-span-2">
                  <EditField label="City" value={editFormData.city} onChange={(v) => setEditFormData({ ...editFormData, city: v })} />
                </div>
                <div className="md:col-span-2">
                  <EditField label="State / Province" value={editFormData.state} onChange={(v) => setEditFormData({ ...editFormData, state: v })} />
                </div>
                <div className="md:col-span-2">
                  <EditField label="Country" value={editFormData.country} onChange={(v) => setEditFormData({ ...editFormData, country: v })} />
                </div>
              </div>
            </EditSection>

            <EditSection title="Client roles">
              <div className="flex flex-wrap gap-2">
                {CLIENT_ROLE_OPTIONS.map((role) => {
                  const active = (editFormData.client_types || []).includes(role)
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={cn(
                        'inline-flex items-center gap-2 h-9 px-3 rounded-full border text-[12.5px] transition-colors',
                        active
                          ? 'bg-[#15663f]/10 text-[#15663f] border-[#15663f]/30 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-card text-muted-foreground border-border hover:text-foreground',
                      )}
                    >
                      <Checkbox
                        checked={active}
                        onCheckedChange={() => toggleRole(role)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 rounded-[4px]"
                      />
                      <span className="capitalize">{role.replace('_', ' ')}</span>
                    </button>
                  )
                })}
              </div>
            </EditSection>
          </div>
        )}
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

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground/70">
        {title}
      </div>
      {children}
    </div>
  )
}

function EditField({
  label, value, onChange, type,
}: {
  label: string
  value: string | undefined
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-muted-foreground font-normal">{label}</Label>
      <Input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="h-[38px] text-[13px] rounded-lg"
      />
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

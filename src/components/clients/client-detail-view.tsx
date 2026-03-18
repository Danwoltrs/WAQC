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
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  TrendingUp,
  CheckCircle2,
  Package,
  Pencil,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ClientQualityManager } from './client-quality-manager'
import { ClientMetricsTab } from './client-metrics-tab'
import { QcConfigPanel } from './qc-config-panel'
import { DEFAULT_CERTIFICATE_PATTERN } from '@/types/certificate-pattern'

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

  function getQcBadgeLabel() {
    if (!client.is_qc_client) return 'Not a QC Client'
    if (client.pricing_model === 'complimentary') return 'QC Client · Complimentary'
    if (client.price_per_pound_cents) {
      return `QC Client · ${client.price_per_pound_cents} ${client.currency || 'USD'} c/lb`
    }
    if (client.price_per_sample) {
      return `QC Client · ${client.price_per_sample} ${client.currency || 'USD'}/sample`
    }
    return 'QC Client'
  }

  return (
    <div className="space-y-6">
      {/* Save/Cancel Bar for Edit Mode */}
      {isEditing && (
        <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-background border-b shadow-sm rounded-lg">
          <span className="text-sm font-medium">Editing client information</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              {client.logo_url && (
                <>
                  <div className="h-[60px] flex items-center justify-center flex-shrink-0">
                    <img
                      src={client.logo_url}
                      alt={`${client.company} logo`}
                      className="h-[60px] w-auto object-contain"
                    />
                  </div>
                  <div className="h-12 w-px bg-border" />
                </>
              )}
              <div>
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={editFormData?.fantasy_name || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, fantasy_name: e.target.value })}
                      className="text-2xl font-semibold h-auto py-1 px-2"
                      placeholder="Fantasy Name"
                    />
                    <Input
                      value={editFormData?.company || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                      className="text-base h-auto py-1 px-2"
                      placeholder="Company Name"
                    />
                  </div>
                ) : (
                  <>
                    <CardTitle className="text-2xl">{client.fantasy_name || client.company}</CardTitle>
                    <CardDescription className="text-base mt-1">{client.name}</CardDescription>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Interactive QC Badge */}
              <button
                onClick={() => setQcDialogOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors hover:opacity-80 cursor-pointer border"
                style={{
                  backgroundColor: client.is_qc_client ? 'hsl(var(--primary))' : undefined,
                  color: client.is_qc_client ? 'hsl(var(--primary-foreground))' : undefined,
                }}
              >
                {getQcBadgeLabel()}
              </button>

              {client.qc_enabled ? (
                <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300">
                  Inactive
                </Badge>
              )}

              {!isEditing && (
                <Button variant="outline" size="sm" onClick={handleEnterEditMode}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Contact Name</Label>
                  <Input
                    value={editFormData?.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    placeholder="Contact Name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    value={editFormData?.email || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    placeholder="Email"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    value={editFormData?.phone || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="Phone"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">VAT/CNPJ</Label>
                  <Input
                    value={editFormData?.vat_number || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, vat_number: e.target.value })}
                    placeholder="VAT/CNPJ Number"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <Input
                    value={editFormData?.address || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                    placeholder="Street Address"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">ZIP/CEP</Label>
                  <Input
                    value={editFormData?.zip_code || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, zip_code: e.target.value })}
                    placeholder="ZIP/CEP Code"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">City</Label>
                  <Input
                    value={editFormData?.city || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                    placeholder="City"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">State/Province</Label>
                  <Input
                    value={editFormData?.state || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                    placeholder="State/Province"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Country</Label>
                  <Input
                    value={editFormData?.country || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, country: e.target.value })}
                    placeholder="Country"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Client Roles</Label>
                <div className="flex flex-wrap gap-4">
                  {CLIENT_ROLE_OPTIONS.map((role) => (
                    <div key={role} className="flex items-center gap-2">
                      <Checkbox
                        id={`role-${role}`}
                        checked={(editFormData?.client_types || []).includes(role)}
                        onCheckedChange={() => toggleRole(role)}
                      />
                      <Label htmlFor={`role-${role}`} className="text-sm capitalize">
                        {role.replace('_', ' ')}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                {client.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span>{client.phone}</span>
                  </div>
                )}
              </div>
              {(client.address || client.city || client.country) && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <span className="flex-1">
                    {[client.address, client.city, client.state, client.country]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              )}
              {client.client_types && client.client_types.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex flex-wrap gap-1">
                    {client.client_types.map((type: string) => (
                      <Badge key={type} variant="secondary" className="text-xs">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>
                  Joined {format(new Date(client.created_at), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compact Stats Row */}
      <div className="flex items-center gap-6 px-4 py-2 rounded-lg border bg-card text-sm">
        <div className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Samples</span>
          <span className="font-semibold">{sampleMetrics.total}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          <span className="text-muted-foreground">Approved</span>
          <span className="font-semibold text-green-600 dark:text-green-400">{sampleMetrics.approved}</span>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Quality Specs</span>
          <span className="font-semibold">{qualitySpecs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Certificates</span>
          <span className="font-semibold">{certificatesCount}</span>
        </div>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="specs" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="specs">Quality Specs</TabsTrigger>
          <TabsTrigger value="samples">Samples</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="specs" className="space-y-4">
          <ClientQualityManager
            clientId={client.id}
            clientName={client.fantasy_name || client.company}
            defaultFeePrice={client.pricing_model === 'per_pound' ? client.price_per_pound_cents : client.pricing_model === 'per_sample' ? client.price_per_sample : null}
            defaultFeeCurrency={client.currency || 'USD'}
            defaultFeeUnit={client.pricing_model === 'complimentary' ? null : (client.pricing_model || 'per_pound')}
            hasQualityCode={client.certificate_pattern?.has_quality_code || false}
          />
        </TabsContent>

        <TabsContent value="samples" className="space-y-4">
          <SamplesTab samples={samples} />
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96" />
    </div>
  )
}

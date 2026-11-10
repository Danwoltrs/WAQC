'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientQualityManager } from './client-quality-manager'
import { ClientMetricsTab } from './client-metrics-tab'
import { QcConfigPanel } from './qc-config-panel'
import { ClientRail } from './client-page/client-rail'
import { ClientSamplesSummary } from './client-page/client-samples-summary'
import { ClientPeopleTab } from './client-page/client-people-tab'
import { ClientEditForm } from './client-page/client-edit-form'
import { DEFAULT_CERTIFICATE_PATTERN } from '@/types/certificate-pattern'
import type { ClientSummaryResponse } from '@/lib/clients/client-summary'
import type { QcSettingsLike } from '@/lib/clients/qc-settings-summary'

interface ClientDetailViewProps {
  clientId: string
}

interface ClientData {
  client: any
  qualitySpecs: any[]
}

const TABS = [
  { value: 'samples', label: 'Samples' },
  { value: 'specs', label: 'Quality specs' },
  { value: 'metrics', label: 'Metrics' },
  { value: 'people', label: 'Contacts and portal' },
] as const
type TabValue = (typeof TABS)[number]['value']

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

/** The QC settings as the panel edits them, from the client row. */
function qcSettingsOf(client: any) {
  return {
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
    qcFeeCoBrokerCompanyId: client.qc_fee_co_broker_company_id ?? null,
    toleranceAutoApprove: client.tolerance_auto_approve ?? false,
    certificatesToAllParties: client.certificates_to_all_parties ?? false,
    billingNotes: client.billing_notes || '',
    logoUrl: client.logo_url,
  }
}

/**
 * The client page: a rail on the left (in the app menu's place, see
 * MainLayout `replaceSidebar`) and four tabs on the right.
 */
export function ClientDetailView({ clientId }: ClientDetailViewProps) {
  const searchParams = useSearchParams()
  const initialTab = searchParams?.get('tab')
  const [data, setData] = useState<ClientData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ClientSummaryResponse | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(searchParams?.get('edit') === 'true')
  const [qcPanelOpen, setQcPanelOpen] = useState(false)
  const [tab, setTab] = useState<TabValue>(
    TABS.some((t) => t.value === initialTab) ? (initialTab as TabValue) : 'samples',
  )

  const fetchClientData = useCallback(async () => {
    setError(null)
    try {
      const response = await fetch(`/api/clients/${clientId}`)
      if (!response.ok) throw new Error('Failed to fetch client data')
      const body = await response.json()
      setData({ client: body.client, qualitySpecs: body.qualitySpecs ?? [] })
    } catch (err) {
      console.error('Error fetching client:', err)
      setError('Failed to load client data')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  const fetchSummary = useCallback(async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/summary`)
      if (!response.ok) throw new Error()
      setSummary(await response.json())
      setSummaryError(null)
    } catch {
      setSummaryError('The sample figures could not be loaded.')
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    fetchClientData()
    fetchSummary()
  }, [clientId, fetchClientData, fetchSummary])

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
          qc_fee_co_broker_company_id: configData.qcFeeCoBrokerCompanyId,
          tolerance_auto_approve: configData.toleranceAutoApprove,
          certificates_to_all_parties: configData.certificatesToAllParties,
          billing_notes: configData.billingNotes,
          is_qc_client: true,
        }),
      })
      if (!response.ok) {
        // Carry the route's `details` (the real Postgres/PostgREST message)
        // through to the alert — see the matching note in clients/page.tsx.
        const err = await response.json().catch(() => ({}))
        throw new Error(
          [err.error || response.statusText, err.details].filter(Boolean).join(' — ')
        )
      }
      setQcPanelOpen(false)
      await fetchClientData()
    } catch (err) {
      console.error('Error saving QC config:', err)
      alert(
        `Failed to save QC configuration: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  if (loading) return <ClientDetailSkeleton />

  if (error || !data) {
    return (
      <div className="p-8">
        <p className="text-center text-destructive">{error || 'Client not found'}</p>
      </div>
    )
  }

  const { client, qualitySpecs } = data
  const displayName = client.fantasy_name || client.company || client.name
  const cityLine = [client.city, client.state, client.zip_code].filter(Boolean).join(', ')
  const addressLines = [
    client.address || null,
    client.neighborhood || null,
    cityLine || null,
    client.country || null,
  ].filter((l): l is string => !!l)
  const qcSettings = qcSettingsOf(client)
  const railQc: QcSettingsLike = {
    ...qcSettings,
    certificateValidityMonths: client.certificate_validity_months ?? null,
  }

  return (
    <div className="flex flex-col lg:h-full lg:flex-row">
      <ClientRail
        client={client}
        displayName={displayName}
        typeSummary={formatTypeLabels(client.client_types)}
        addressLines={addressLines}
        summary={summary}
        qc={railQc}
        onEdit={() => setIsEditing(true)}
        onConfigure={() => setQcPanelOpen(true)}
      />

      <div className="min-w-0 flex-1 lg:overflow-y-auto">
        {isEditing ? (
          <div className="px-4 py-6 lg:px-8">
            <ClientEditForm
              client={client}
              qualitySpecsCount={qualitySpecs.length}
              onCancel={() => setIsEditing(false)}
              onSaved={async () => { setIsEditing(false); await fetchClientData() }}
              onConfigureQc={() => setQcPanelOpen(true)}
              onShowSpecs={() => { setIsEditing(false); setTab('specs') }}
            />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
            <div className="sticky top-0 z-10 border-b border-border bg-background px-4 lg:px-8">
              <TabsList className="h-auto gap-6 overflow-x-auto rounded-none bg-transparent p-0">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="-mb-px rounded-none border-b-2 border-transparent px-0 py-3 text-[13px] font-normal text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    {t.label}
                    <TabCount tab={t.value} summary={summary} specs={qualitySpecs.length} />
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="px-4 py-6 lg:px-8">
              <TabsContent value="samples" className="mt-0">
                <ClientSamplesSummary summary={summary} error={summaryError} />
              </TabsContent>
              <TabsContent value="specs" className="mt-0">
                <ClientQualityManager
                  clientId={client.id}
                  clientName={client.fantasy_name || client.company}
                  defaultFeePrice={client.pricing_model === 'per_pound' ? client.price_per_pound_cents : client.pricing_model === 'per_sample' ? client.price_per_sample : null}
                  defaultFeeCurrency={client.currency || 'USD'}
                  defaultFeeUnit={client.pricing_model === 'complimentary' ? null : (client.pricing_model || 'per_pound')}
                  hasQualityCode={client.certificate_pattern?.has_quality_code || false}
                  specStats={summary?.specs}
                />
              </TabsContent>
              <TabsContent value="metrics" className="mt-0">
                <ClientMetricsTab clientId={client.id} summary={summary} error={summaryError} />
              </TabsContent>
              <TabsContent value="people" className="mt-0">
                <ClientPeopleTab companyId={client.id} companyName={displayName} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>

      {/* QC settings panel (kept mounted so unsaved edits survive closing) */}
      <QcConfigPanel
        open={qcPanelOpen}
        onOpenChange={setQcPanelOpen}
        clientName={displayName}
        data={qcSettings}
        onSave={handleQcConfigSave}
        clientId={client.id}
      />
    </div>
  )
}

function TabCount({ tab, summary, specs }: { tab: TabValue; summary: ClientSummaryResponse | null; specs: number }) {
  const n = tab === 'samples' ? summary?.counts.total : tab === 'specs' ? specs : undefined
  if (n == null) return null
  return <span className="ml-1.5 tabular-nums text-muted-foreground/70">{n}</span>
}

function ClientDetailSkeleton() {
  return (
    <div className="flex flex-col lg:h-full lg:flex-row">
      <div className="space-y-4 border-border p-5 lg:w-[304px] lg:border-r">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="flex-1 space-y-5 px-4 py-6 lg:px-8">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-[68px] rounded-[10px]" />
        <Skeleton className="h-[260px] rounded-[10px]" />
      </div>
    </div>
  )
}

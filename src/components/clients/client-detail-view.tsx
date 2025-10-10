'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
} from 'lucide-react'
import { format } from 'date-fns'
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts'

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

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export function ClientDetailView({ clientId }: ClientDetailViewProps) {
  const [data, setData] = useState<ClientData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchClientData() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/clients/${clientId}`)

        if (!response.ok) {
          throw new Error('Failed to fetch client data')
        }

        const clientData = await response.json()
        setData(clientData)
      } catch (err) {
        console.error('Error fetching client:', err)
        setError('Failed to load client data')
      } finally {
        setLoading(false)
      }
    }

    if (clientId) {
      fetchClientData()
    }
  }, [clientId])

  if (loading) {
    return <ClientDetailSkeleton />
  }

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

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{client.name}</CardTitle>
              {client.fantasy_name && (
                <CardDescription className="text-base mt-1">{client.fantasy_name}</CardDescription>
              )}
            </div>
            <div className="flex gap-2">
              {client.is_qc_client && (
                <Badge variant="default">QC Client</Badge>
              )}
              {client.qc_enabled ? (
                <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300">
                  Inactive
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Contact Info */}
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

            {/* Address */}
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

            {/* Client Type */}
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

            {/* Created Date */}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span>
                Joined {format(new Date(client.created_at), 'MMM d, yyyy')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Samples"
          value={sampleMetrics.total}
          icon={<Package className="h-4 w-4" />}
        />
        <StatsCard
          title="Approved"
          value={sampleMetrics.approved}
          icon={<CheckCircle2 className="h-4 w-4" />}
          valueColor="text-green-600 dark:text-green-400"
        />
        <StatsCard
          title="Quality Specs"
          value={qualitySpecs.length}
          icon={<FileText className="h-4 w-4" />}
        />
        <StatsCard
          title="Certificates"
          value={certificatesCount}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="samples">Samples</TabsTrigger>
          <TabsTrigger value="specs">Quality Specs</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewTab client={client} />
        </TabsContent>

        <TabsContent value="samples" className="space-y-4">
          <SamplesTab samples={samples} />
        </TabsContent>

        <TabsContent value="specs" className="space-y-4">
          <QualitySpecsTab specs={qualitySpecs} />
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <MetricsTab sampleMetrics={sampleMetrics} samples={samples} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatsCard({ title, value, icon, valueColor = 'text-foreground' }: any) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-2xl font-semibold mt-1 ${valueColor}`}>{value}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OverviewTab({ client }: { client: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Client Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InfoField label="Company" value={client.company} />
          <InfoField label="Fantasy Name" value={client.fantasy_name} />
          <InfoField label="Email" value={client.email} />
          <InfoField label="Phone" value={client.phone} />
          <InfoField
            label="Address"
            value={[client.address, client.city, client.state, client.country]
              .filter(Boolean)
              .join(', ')}
          />
          <InfoField
            label="Pricing Model"
            value={client.pricing_model?.replace('_', ' ').toUpperCase()}
          />
          {client.pricing_model === 'per_sample' && (
            <InfoField
              label="Price per Sample"
              value={`${client.currency || 'USD'} ${client.price_per_sample || 0}`}
            />
          )}
          {client.pricing_model === 'per_pound' && (
            <InfoField
              label="Price per Pound"
              value={`${client.currency || 'USD'} ${((client.price_per_pound_cents || 0) / 100).toFixed(2)}`}
            />
          )}
          <InfoField label="Fee Payer" value={client.fee_payer?.replace('_', ' ')} />
          <InfoField label="Payment Terms" value={client.payment_terms} />
        </div>
      </CardContent>
    </Card>
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
        <CardTitle>Sample History</CardTitle>
        <CardDescription>Recent samples from this client (up to 50)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {samples.map((sample) => (
            <div
              key={sample.id}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{sample.tracking_number}</p>
                <p className="text-sm text-muted-foreground">{sample.origin}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {format(new Date(sample.created_at), 'MMM d, yyyy')}
                </span>
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
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function QualitySpecsTab({ specs }: { specs: any[] }) {
  if (specs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No quality specifications assigned to this client
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {specs.map((spec) => (
        <Card key={spec.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{spec.template?.name || 'Custom Specification'}</CardTitle>
                {spec.template?.description && (
                  <CardDescription className="mt-1">{spec.template.description}</CardDescription>
                )}
              </div>
              {spec.origin && (
                <Badge variant="secondary">{spec.origin}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Created {format(new Date(spec.created_at), 'MMMM d, yyyy')}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function MetricsTab({ sampleMetrics, samples }: { sampleMetrics: any; samples: any[] }) {
  // Prepare pie chart data
  const pieData = [
    { name: 'Approved', value: sampleMetrics.approved, color: '#10b981' },
    { name: 'Rejected', value: sampleMetrics.rejected, color: '#ef4444' },
    { name: 'Under Review', value: sampleMetrics.under_review, color: '#f59e0b' },
    { name: 'In Progress', value: sampleMetrics.in_progress, color: '#3b82f6' },
    { name: 'Received', value: sampleMetrics.received, color: '#94a3b8' },
  ].filter(item => item.value > 0)

  // Prepare bar chart data - samples by origin
  const samplesByOrigin = samples.reduce((acc: any, sample) => {
    const origin = sample.origin || 'Unknown'
    acc[origin] = (acc[origin] || 0) + 1
    return acc
  }, {})

  const barData = Object.entries(samplesByOrigin)
    .map(([origin, count]) => ({ origin, count }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 10)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Sample Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Sample Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-12">No sample data available</p>
          )}
        </CardContent>
      </Card>

      {/* Samples by Origin */}
      <Card>
        <CardHeader>
          <CardTitle>Samples by Origin</CardTitle>
        </CardHeader>
        <CardContent>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <XAxis dataKey="origin" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-12">No origin data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null

  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium mt-1">{value}</p>
    </div>
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

      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Skeleton className="h-96" />
    </div>
  )
}

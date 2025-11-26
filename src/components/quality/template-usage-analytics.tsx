'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts'
import {
  TrendingUp,
  Users,
  FileText,
  BarChart3,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react'
import { format } from 'date-fns'

interface TemplateAnalytics {
  template_id: string
  template_name: string
  usage_count: number
  active_clients: number
  total_samples: number
  approved_samples: number
  rejected_samples: number
  avg_approval_rate: number
  first_used: string | null
  last_used: string | null
  usage_by_month: Array<{
    month: string
    count: number
  }>
  usage_by_origin: Array<{
    origin: string
    count: number
  }>
  top_clients: Array<{
    client_name: string
    usage_count: number
  }>
}

interface TemplateUsageAnalyticsProps {
  templateId: string
}

const COLORS = ['#556b2f', '#a9a454', '#efe4d4', '#b07946', '#445763', '#151618']

export function TemplateUsageAnalytics({ templateId }: TemplateUsageAnalyticsProps) {
  const [analytics, setAnalytics] = useState<TemplateAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    fetchAnalytics()
  }, [templateId])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/quality-templates/${templateId}/analytics`)

      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }

      const data = await response.json()
      setAnalytics(data.analytics)
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Template Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!analytics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Template Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              No analytics data available
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const approvalRate = analytics.total_samples > 0
    ? ((analytics.approved_samples / analytics.total_samples) * 100).toFixed(1)
    : '0'

  const rejectionRate = analytics.total_samples > 0
    ? ((analytics.rejected_samples / analytics.total_samples) * 100).toFixed(1)
    : '0'

  const sampleStatusData = [
    { name: 'Approved', value: analytics.approved_samples, color: '#556b2f' },
    { name: 'Rejected', value: analytics.rejected_samples, color: '#b07946' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Template Analytics
        </CardTitle>
        <CardDescription>
          Usage patterns and performance metrics
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="usage">Usage Trends</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <Users className="h-8 w-8 text-muted-foreground mb-2" />
                    <div className="text-2xl font-bold">{analytics.active_clients}</div>
                    <div className="text-xs text-muted-foreground">Active Clients</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                    <div className="text-2xl font-bold">{analytics.total_samples}</div>
                    <div className="text-xs text-muted-foreground">Total Samples</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
                    <div className="text-2xl font-bold">{approvalRate}%</div>
                    <div className="text-xs text-muted-foreground">Approval Rate</div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <TrendingUp className="h-8 w-8 text-muted-foreground mb-2" />
                    <div className="text-2xl font-bold">{analytics.usage_count}</div>
                    <div className="text-xs text-muted-foreground">Times Used</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sample Status Distribution */}
            {analytics.total_samples > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Sample Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={sampleStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {sampleStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm">Approved</span>
                      </div>
                      <span className="font-bold">{analytics.approved_samples}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm">Rejected</span>
                      </div>
                      <span className="font-bold">{analytics.rejected_samples}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Clients */}
            {analytics.top_clients && analytics.top_clients.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Top Clients</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {analytics.top_clients.map((client, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{index + 1}</Badge>
                            <span className="text-sm font-medium">{client.client_name}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {client.usage_count} samples
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="usage" className="space-y-6">
            {/* Usage by Month */}
            {analytics.usage_by_month && analytics.usage_by_month.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Usage Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.usage_by_month}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#556b2f"
                        strokeWidth={2}
                        name="Samples"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Usage by Origin */}
            {analytics.usage_by_origin && analytics.usage_by_origin.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Usage by Origin</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.usage_by_origin}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="origin" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#a9a454" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            {(analytics.first_used || analytics.last_used) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analytics.first_used && (
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">First Used</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(analytics.first_used), 'PPP')}
                          </div>
                        </div>
                      </div>
                    )}
                    {analytics.last_used && (
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">Last Used</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(analytics.last_used), 'PPP')}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            {/* Performance Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center py-6">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-green-600">{approvalRate}%</div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {analytics.approved_samples} of {analytics.total_samples} samples
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Rejection Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center py-6">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-red-600">{rejectionRate}%</div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {analytics.rejected_samples} of {analytics.total_samples} samples
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {analytics.total_samples === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">
                      No sample data available yet
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

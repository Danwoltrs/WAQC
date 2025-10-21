'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns'

interface ClientAnalyticsDashboardProps {
  clientId: string
  clientName: string
}

interface AnalyticsData {
  volumeTrends: Array<{
    month: string
    samples: number
    approved: number
    rejected: number
  }>
  qualityTrends: Array<{
    month: string
    avgScore: number
    minScore: number
    maxScore: number
  }>
  certificateStats: {
    total: number
    thisMonth: number
    lastMonth: number
    avgDeliveryTime: number
  }
  engagementMetrics: {
    totalSamples: number
    avgSamplesPerMonth: number
    responseTime: number
    approvalRate: number
  }
  performanceIndicators: {
    qualityScore: number
    onTimeDelivery: number
    satisfactionRating: number
  }
}

const CHART_COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  purple: '#8b5cf6',
  pink: '#ec4899',
}

export function ClientAnalyticsDashboard({ clientId, clientName }: ClientAnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'6' | '12' | '24'>('12')

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true)
      try {
        const response = await fetch(`/api/clients/${clientId}/analytics?months=${timeRange}`)
        if (!response.ok) throw new Error('Failed to fetch analytics')
        const analyticsData = await response.json()
        setData(analyticsData)
      } catch (error) {
        console.error('Error fetching analytics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [clientId, timeRange])

  const handleExport = async (type: 'csv' | 'xlsx') => {
    try {
      const response = await fetch(`/api/clients/${clientId}/analytics/export?format=${type}`)
      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${clientName}-analytics-${format(new Date(), 'yyyy-MM-dd')}.${type}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Export error:', error)
    }
  }

  if (loading) {
    return <div className="space-y-4">Loading analytics...</div>
  }

  if (!data) {
    return <div className="text-center text-muted-foreground">No analytics data available</div>
  }

  return (
    <div className="space-y-6">
      {/* Header with Export */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Performance Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Comprehensive insights for {clientName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('csv')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('xlsx')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2">
        {(['6', '12', '24'] as const).map((months) => (
          <Button
            key={months}
            variant={timeRange === months ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeRange(months)}
          >
            {months} Months
          </Button>
        ))}
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Quality Score"
          value={data.performanceIndicators.qualityScore}
          suffix="/100"
          trend={data.performanceIndicators.qualityScore >= 80 ? 'up' : 'down'}
          trendValue={5.2}
        />
        <KPICard
          title="Approval Rate"
          value={data.engagementMetrics.approvalRate}
          suffix="%"
          trend={data.engagementMetrics.approvalRate >= 90 ? 'up' : 'neutral'}
          trendValue={2.1}
        />
        <KPICard
          title="Avg Response Time"
          value={data.engagementMetrics.responseTime}
          suffix=" days"
          trend={data.engagementMetrics.responseTime <= 3 ? 'up' : 'down'}
          trendValue={-0.5}
        />
      </div>

      {/* Charts Tabs */}
      <Tabs defaultValue="volume" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="volume">Sample Volume</TabsTrigger>
          <TabsTrigger value="quality">Quality Trends</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
        </TabsList>

        <TabsContent value="volume" className="space-y-4">
          <SampleVolumeChart data={data.volumeTrends} />
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <QualityTrendsChart data={data.qualityTrends} />
        </TabsContent>

        <TabsContent value="certificates" className="space-y-4">
          <CertificateStatsCard stats={data.certificateStats} />
        </TabsContent>

        <TabsContent value="engagement" className="space-y-4">
          <EngagementMetricsCard metrics={data.engagementMetrics} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function KPICard({
  title,
  value,
  suffix = '',
  trend,
  trendValue,
}: {
  title: string
  value: number
  suffix?: string
  trend: 'up' | 'down' | 'neutral'
  trendValue: number
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor =
    trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-600'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div className="text-3xl font-bold">
            {value.toFixed(1)}
            <span className="text-lg text-muted-foreground">{suffix}</span>
          </div>
          <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
            <TrendIcon className="h-4 w-4" />
            <span>{Math.abs(trendValue).toFixed(1)}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SampleVolumeChart({ data }: { data: AnalyticsData['volumeTrends'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sample Volume Over Time</CardTitle>
        <CardDescription>Monthly sample intake, approvals, and rejections</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorSamples" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="samples"
              stroke={CHART_COLORS.primary}
              fill="url(#colorSamples)"
              name="Total Samples"
            />
            <Line
              type="monotone"
              dataKey="approved"
              stroke={CHART_COLORS.success}
              strokeWidth={2}
              name="Approved"
            />
            <Line
              type="monotone"
              dataKey="rejected"
              stroke={CHART_COLORS.danger}
              strokeWidth={2}
              name="Rejected"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function QualityTrendsChart({ data }: { data: AnalyticsData['qualityTrends'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quality Score Trends</CardTitle>
        <CardDescription>Average cupping scores with min/max ranges</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis domain={[0, 100]} fontSize={12} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="avgScore"
              stroke={CHART_COLORS.primary}
              strokeWidth={3}
              name="Average Score"
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="maxScore"
              stroke={CHART_COLORS.success}
              strokeWidth={1}
              strokeDasharray="5 5"
              name="Max Score"
            />
            <Line
              type="monotone"
              dataKey="minScore"
              stroke={CHART_COLORS.danger}
              strokeWidth={1}
              strokeDasharray="5 5"
              name="Min Score"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function CertificateStatsCard({ stats }: { stats: AnalyticsData['certificateStats'] }) {
  const monthlyChange =
    stats.lastMonth > 0 ? ((stats.thisMonth - stats.lastMonth) / stats.lastMonth) * 100 : 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Certificate Generation</CardTitle>
          <CardDescription>Monthly certificate issuance statistics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Certificates</p>
            <p className="text-3xl font-bold">{stats.total}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">This Month</p>
              <p className="text-xl font-semibold">{stats.thisMonth}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Month</p>
              <p className="text-xl font-semibold">{stats.lastMonth}</p>
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">Monthly Change</p>
            <p
              className={`text-xl font-semibold ${
                monthlyChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {monthlyChange >= 0 ? '+' : ''}
              {monthlyChange.toFixed(1)}%
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Performance</CardTitle>
          <CardDescription>Average certificate delivery metrics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Avg Delivery Time</p>
            <p className="text-3xl font-bold">
              {stats.avgDeliveryTime.toFixed(1)}
              <span className="text-lg text-muted-foreground ml-1">days</span>
            </p>
          </div>
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">Target: 2-3 days</p>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  stats.avgDeliveryTime <= 3 ? 'bg-green-500' : 'bg-yellow-500'
                }`}
                style={{ width: `${Math.min((3 / stats.avgDeliveryTime) * 100, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function EngagementMetricsCard({ metrics }: { metrics: AnalyticsData['engagementMetrics'] }) {
  const metricsData = [
    { name: 'Total Samples', value: metrics.totalSamples },
    { name: 'Avg/Month', value: metrics.avgSamplesPerMonth.toFixed(1) },
    { name: 'Response Time', value: `${metrics.responseTime} days` },
    { name: 'Approval Rate', value: `${metrics.approvalRate.toFixed(1)}%` },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engagement Metrics</CardTitle>
        <CardDescription>Client activity and interaction statistics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {metricsData.map((metric, index) => (
            <div key={index} className="text-center">
              <p className="text-sm text-muted-foreground mb-2">{metric.name}</p>
              <p className="text-2xl font-bold">{metric.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'

const STATUS_COLORS: Record<string, string> = {
  approved: '#10b981',
  rejected: '#ef4444',
  under_review: '#f59e0b',
  in_progress: '#3b82f6',
  received: '#94a3b8',
}

const CHART_COLORS = ['#556b2f', '#a9a454', '#b07946', '#445763', '#efe4d4', '#151618']

interface ClientMetricsTabProps {
  clientId: string
  clientName: string
  sampleMetrics: {
    total: number
    received: number
    in_progress: number
    under_review: number
    approved: number
    rejected: number
  }
  samples: any[]
}

interface SupplierMetric {
  name: string
  total: number
  approved: number
  approvalRate: string
}

interface DefectData {
  grading_defects: Array<{ name: string; count: number }>
  cupping_defects: Array<{ name: string; count: number }>
}

export function ClientMetricsTab({ clientId, clientName, sampleMetrics, samples }: ClientMetricsTabProps) {
  const [supplierData, setSupplierData] = useState<SupplierMetric[]>([])
  const [defectData, setDefectData] = useState<DefectData | null>(null)
  const [cropYear, setCropYear] = useState('25/26')
  const [qualityFilter, setQualityFilter] = useState('all')

  useEffect(() => {
    fetchSupplierMetrics()
  }, [clientId, qualityFilter])

  useEffect(() => {
    fetchDefectSummary()
  }, [clientId, cropYear])

  async function fetchSupplierMetrics() {
    try {
      const url = `/api/clients/${clientId}/supplier-metrics${qualityFilter !== 'all' ? `?quality_id=${qualityFilter}` : ''}`
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setSupplierData(data.suppliers || [])
      }
    } catch (err) {
      console.error('Error fetching supplier metrics:', err)
    }
  }

  async function fetchDefectSummary() {
    try {
      const response = await fetch(`/api/clients/${clientId}/defect-summary?crop_year=${cropYear}`)
      if (response.ok) {
        const data = await response.json()
        setDefectData(data)
      }
    } catch (err) {
      console.error('Error fetching defect summary:', err)
    }
  }

  // Pie chart data
  const pieData = [
    { name: 'Approved', value: sampleMetrics.approved, color: STATUS_COLORS.approved },
    { name: 'Rejected', value: sampleMetrics.rejected, color: STATUS_COLORS.rejected },
    { name: 'Under Review', value: sampleMetrics.under_review, color: STATUS_COLORS.under_review },
    { name: 'In Progress', value: sampleMetrics.in_progress, color: STATUS_COLORS.in_progress },
    { name: 'Received', value: sampleMetrics.received, color: STATUS_COLORS.received },
  ].filter(item => item.value > 0)

  // Bar chart data - samples by origin
  const samplesByOrigin = samples.reduce((acc: Record<string, number>, sample) => {
    const origin = sample.origin || 'Unknown'
    acc[origin] = (acc[origin] || 0) + 1
    return acc
  }, {})

  const barData = Object.entries(samplesByOrigin)
    .map(([origin, count]) => ({ origin, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Combined defect data for chart
  const allDefects = [
    ...(defectData?.grading_defects || []).map(d => ({ ...d, type: 'Grading' })),
    ...(defectData?.cupping_defects || []).map(d => ({ ...d, type: 'Cupping' })),
  ].sort((a, b) => b.count - a.count).slice(0, 6)

  // Check if supply chain has enough entities for Sankey
  const distinctEntities = new Set<string>()
  samples.forEach((s) => {
    if (s.seller_id) distinctEntities.add(`seller-${s.seller_id}`)
    if (s.exporter_id) distinctEntities.add(`exporter-${s.exporter_id}`)
  })
  const hasMultipleEntities = distinctEntities.size >= 2

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Approval Rate</p>
            <p className="text-2xl font-semibold mt-1">
              {sampleMetrics.total > 0
                ? `${((sampleMetrics.approved / sampleMetrics.total) * 100).toFixed(1)}%`
                : 'N/A'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Samples</p>
            <p className="text-2xl font-semibold mt-1">{sampleMetrics.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Rejected</p>
            <p className="text-2xl font-semibold mt-1 text-red-600 dark:text-red-400">
              {sampleMetrics.rejected}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Suppliers */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Top Suppliers</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {supplierData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={supplierData} layout="vertical">
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      if (name === 'total') return [value, 'Samples']
                      return [value, name]
                    }}
                    labelFormatter={(label) => {
                      const supplier = supplierData.find(s => s.name === label)
                      return supplier ? `${label} (${supplier.approvalRate}% approved)` : label
                    }}
                  />
                  <Bar dataKey="total" fill={CHART_COLORS[0]} radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12 text-sm">No supplier data available</p>
            )}
          </CardContent>
        </Card>

        {/* Top Defects */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Top Defects</CardTitle>
              <Select value={cropYear} onValueChange={setCropYear}>
                <SelectTrigger className="w-24 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25/26">25/26</SelectItem>
                  <SelectItem value="24/25">24/25</SelectItem>
                  <SelectItem value="23/24">23/24</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {allDefects.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={allDefects} layout="vertical">
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_COLORS[3]} radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12 text-sm">No defect data for crop year {cropYear}</p>
            )}
          </CardContent>
        </Card>

        {/* Sample Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sample Status Distribution</CardTitle>
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
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
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
              <p className="text-center text-muted-foreground py-12 text-sm">No sample data available</p>
            )}
          </CardContent>
        </Card>

        {/* Samples by Origin */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Samples by Origin</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <XAxis dataKey="origin" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12 text-sm">No origin data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Supply Chain Sankey — conditional */}
      {hasMultipleEntities && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Supply Chain Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground py-8 text-sm">
              Supply chain visualization available when more sample data is present
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

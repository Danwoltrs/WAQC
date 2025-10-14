'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'
import { FileText, Download, FileSpreadsheet, CheckCircle, XCircle, Package } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface CertificateStats {
  totalCertificates: number
  totalBags: number
  approvedCount: number
  rejectedCount: number
  byRoaster: { name: string; count: number; bags: number }[]
  byImporter: { name: string; count: number; bags: number }[]
  byStatus: { status: string; count: number }[]
  byMonth: { month: string; count: number }[]
}

type TimeRange = 'week' | 'month' | 'quarter' | 'year' | 'custom'

export default function CertificateStatisticsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<CertificateStats | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('month')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const { user, profile } = useAuth()

  useEffect(() => {
    if (user && profile) {
      fetchCertificateStats()
    }
  }, [user, profile, timeRange, startDate, endDate])

  const getDateRange = (): { start: string; end: string } => {
    const now = new Date()
    const end = now.toISOString()
    let start: Date

    switch (timeRange) {
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3)
        start = new Date(now.getFullYear(), quarter * 3, 1)
        break
      case 'year':
        start = new Date(now.getFullYear(), 0, 1)
        break
      case 'custom':
        return { start: startDate, end: endDate }
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1)
    }

    return { start: start.toISOString(), end }
  }

  const fetchCertificateStats = async () => {
    if (!user || !profile) return

    try {
      setLoading(true)
      setError(null)

      const { start, end } = getDateRange()

      // Build query
      let query = supabase
        .from('samples')
        .select('status, roaster, importer, bags, created_at')
        .in('status', ['approved', 'rejected'])
        .gte('created_at', start)
        .lte('created_at', end)

      // Apply lab filter based on role
      if (profile.qc_role === 'lab_personnel' ||
          profile.qc_role === 'lab_quality_manager' ||
          profile.qc_role === 'lab_finance_manager') {
        if (profile.laboratory_id) {
          query = query.eq('laboratory_id', profile.laboratory_id)
        }
      }

      const { data: certificates, error: queryError } = await query

      if (queryError) throw queryError

      // Aggregate statistics
      const roasterMap = new Map<string, { count: number; bags: number }>()
      const importerMap = new Map<string, { count: number; bags: number }>()
      const statusMap = new Map<string, number>()
      const monthMap = new Map<string, number>()

      let totalBags = 0
      let approvedCount = 0
      let rejectedCount = 0

      certificates?.forEach(cert => {
        const bags = cert.bags || 0
        totalBags += bags

        if (cert.status === 'approved') approvedCount++
        else rejectedCount++

        // By roaster
        if (cert.roaster) {
          const existing = roasterMap.get(cert.roaster)
          if (existing) {
            existing.count++
            existing.bags += bags
          } else {
            roasterMap.set(cert.roaster, { count: 1, bags })
          }
        }

        // By importer
        if (cert.importer) {
          const existing = importerMap.get(cert.importer)
          if (existing) {
            existing.count++
            existing.bags += bags
          } else {
            importerMap.set(cert.importer, { count: 1, bags })
          }
        }

        // By status
        if (cert.status) {
          statusMap.set(cert.status, (statusMap.get(cert.status) || 0) + 1)
        }

        // By month
        if (cert.created_at) {
          const monthKey = new Date(cert.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1)
        }
      })

      setStats({
        totalCertificates: certificates?.length || 0,
        totalBags,
        approvedCount,
        rejectedCount,
        byRoaster: Array.from(roasterMap.entries())
          .map(([name, data]) => ({ name, count: data.count, bags: data.bags }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        byImporter: Array.from(importerMap.entries())
          .map(([name, data]) => ({ name, count: data.count, bags: data.bags }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        byStatus: Array.from(statusMap.entries())
          .map(([status, count]) => ({ status, count })),
        byMonth: Array.from(monthMap.entries())
          .map(([month, count]) => ({ month, count }))
          .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      })
    } catch (err) {
      console.error('Error fetching certificate stats:', err)
      setError(err instanceof Error ? err.message : 'Failed to load certificate statistics')
    } finally {
      setLoading(false)
    }
  }

  const handlePDFExport = () => {
    // TODO: Implement PDF export with Brazil flag branding
    alert('PDF export coming soon!')
  }

  const handleExcelExport = () => {
    // TODO: Implement Excel export
    alert('Excel export coming soon!')
  }

  const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6']

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error) {
    return (
      <MainLayout>
        <div className="p-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-red-500">{error}</p>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Certificate Statistics</h1>
            <p className="text-lg text-muted-foreground">
              Comprehensive analytics and export reports
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handlePDFExport} variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
            <Button onClick={handleExcelExport} variant="outline" size="sm">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          </div>
        </div>

        {/* Time Range Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Time Period</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                variant={timeRange === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeRange('week')}
              >
                This Week
              </Button>
              <Button
                variant={timeRange === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeRange('month')}
              >
                This Month
              </Button>
              <Button
                variant={timeRange === 'quarter' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeRange('quarter')}
              >
                This Quarter
              </Button>
              <Button
                variant={timeRange === 'year' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeRange('year')}
              >
                This Year
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Certificates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <p className="text-2xl font-bold">{stats?.totalCertificates || 0}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Bags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <p className="text-2xl font-bold">{stats?.totalBags.toLocaleString() || 0}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Approved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-2xl font-bold text-green-600">{stats?.approvedCount || 0}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <p className="text-2xl font-bold text-red-600">{stats?.rejectedCount || 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Status Distribution</CardTitle>
              <CardDescription>Approval vs rejection breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats?.byStatus || []}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label
                  >
                    {stats?.byStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.status === 'approved' ? '#10b981' : '#ef4444'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Certificates Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Certificates Over Time</CardTitle>
              <CardDescription>Monthly certificate issuance trend</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats?.byMonth || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Roasters */}
          <Card>
            <CardHeader>
              <CardTitle>Top Roasters</CardTitle>
              <CardDescription>By certificate count</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats?.byRoaster || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Importers */}
          <Card>
            <CardHeader>
              <CardTitle>Top Importers</CardTitle>
              <CardDescription>By certificate count</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats?.byImporter || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}

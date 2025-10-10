'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { SupplyChainSankey } from '@/components/metrics/supply-chain-sankey'
import { MetricsFilters, FilterState } from '@/components/metrics/metrics-filters'
import { SamplesPerWeekCard } from '@/components/metrics/samples-per-week-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { SampleTin } from '@/components/icons/sample-tin'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'

interface TopPerformer {
  supplier: string
  approvalRate: number
  totalBags: number
  origin?: string
}

interface RouteData {
  route: string
  bags: number
}

interface MetricsSummary {
  totalBags: number
  activeExporters: number
  approvalRate: number
  approvedCount: number
  totalCount: number
  activeRoasters: number
}

export default function OverviewDashboard() {
  const [filters, setFilters] = useState<FilterState>({
    year: new Date().getFullYear(),
    month: null,
    quarter: null,
    minBags: 0
  })
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([])
  const [mostActiveRoute, setMostActiveRoute] = useState<RouteData | null>(null)
  const [origins, setOrigins] = useState<string[]>([])
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const { user, profile } = useAuth()

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters)
  }

  useEffect(() => {
    if (user && profile) {
      fetchDashboardData()
    }
  }, [user, profile, filters])

  const fetchDashboardData = async () => {
    if (!user || !profile) return

    try {
      setLoading(true)

      // Build query
      const year = filters.year || new Date().getFullYear()
      const month = filters.month
      const minBags = filters.minBags || 0

      let query = supabase
        .from('samples')
        .select('supplier, importer, roaster, bags_quantity_mt, status, created_at, client_id, origin')
        .not('supplier', 'is', null)
        .in('status', ['approved', 'rejected'])
        .gte('bags_quantity_mt', minBags)

      // Apply stakeholder filters
      if (filters.supplier) {
        query = query.eq('supplier', filters.supplier)
      }
      if (filters.importer) {
        query = query.eq('importer', filters.importer)
      }
      if (filters.roaster) {
        query = query.eq('roaster', filters.roaster)
      }
      if (filters.client) {
        query = query.eq('client_id', filters.client)
      }

      // Apply year filter
      if (year) {
        query = query
          .gte('created_at', `${year}-01-01`)
          .lt('created_at', `${year + 1}-01-01`)
      }

      // Apply month filter if provided
      if (month && month >= 1 && month <= 12) {
        const startDate = new Date(year, month - 1, 1)
        const endDate = new Date(year, month, 1)
        query = query
          .gte('created_at', startDate.toISOString())
          .lt('created_at', endDate.toISOString())
      }

      // Apply lab filter based on user role
      if (profile.qc_role === 'lab_personnel' ||
          profile.qc_role === 'lab_quality_manager' ||
          profile.qc_role === 'lab_finance_manager') {
        query = query.eq('laboratory_id', profile.laboratory_id)
      }

      const { data: samples, error } = await query

      if (error) throw error

      if (!samples || samples.length === 0) {
        setTopPerformers([])
        setMostActiveRoute(null)
        setOrigins([])
        setMetrics({
          totalBags: 0,
          activeExporters: 0,
          approvalRate: 0,
          approvedCount: 0,
          totalCount: 0,
          activeRoasters: 0
        })
        return
      }

      // Calculate top performers
      const supplierMap = new Map<string, { approved: number; total: number; bags: number; origin?: string }>()

      samples.forEach(sample => {
        const existing = supplierMap.get(sample.supplier)
        const isApproved = sample.status === 'approved'

        if (existing) {
          existing.total += 1
          if (isApproved) existing.approved += 1
          existing.bags += sample.bags_quantity_mt || 0
        } else {
          supplierMap.set(sample.supplier, {
            approved: isApproved ? 1 : 0,
            total: 1,
            bags: sample.bags_quantity_mt || 0,
            origin: sample.origin
          })
        }
      })

      const performers = Array.from(supplierMap.entries())
        .map(([supplier, data]) => ({
          supplier,
          approvalRate: Math.round((data.approved / data.total) * 100),
          totalBags: Math.round(data.bags),
          origin: data.origin
        }))
        .filter(p => p.approvalRate === 100) // Only perfect performers
        .sort((a, b) => b.totalBags - a.totalBags)
        .slice(0, 3)

      setTopPerformers(performers)

      // Calculate most active route
      const routeMap = new Map<string, number>()

      samples.forEach(sample => {
        if (sample.supplier && sample.importer && sample.roaster) {
          const route = `${sample.supplier} → ${sample.importer} → ${sample.roaster}`
          const bags = sample.bags_quantity_mt || 0
          routeMap.set(route, (routeMap.get(route) || 0) + bags)
        }
      })

      if (routeMap.size > 0) {
        const topRoute = Array.from(routeMap.entries())
          .sort((a, b) => b[1] - a[1])[0]
        setMostActiveRoute({
          route: topRoute[0],
          bags: Math.round(topRoute[1])
        })
      }

      // Get unique origins
      const uniqueOrigins = [...new Set(samples.map(s => s.origin).filter(Boolean))] as string[]
      setOrigins(uniqueOrigins.sort())

      // Calculate summary metrics
      const totalBags = samples.reduce((sum, s) => sum + (s.bags_quantity_mt || 0), 0)
      const approvedCount = samples.filter(s => s.status === 'approved').length
      const activeExporters = new Set(samples.map(s => s.supplier)).size
      const activeRoasters = new Set(samples.map(s => s.roaster).filter(Boolean)).size

      setMetrics({
        totalBags: Math.round(totalBags),
        activeExporters,
        approvalRate: Math.round((approvedCount / samples.length) * 100),
        approvedCount,
        totalCount: samples.length,
        activeRoasters
      })

    } catch (err) {
      console.error('Error fetching dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Supply Chain Overview</h1>
          <p className="text-lg text-muted-foreground">
            Comprehensive view of coffee supply chain flows and performance metrics
          </p>
        </div>

        {/* Filters */}
        <MetricsFilters onFilterChange={handleFilterChange} />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Bags
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <SampleTin className="h-5 w-5 text-muted-foreground" />
                    <p className="text-2xl font-bold">{metrics?.totalBags.toLocaleString() || 0}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Across all flows
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Exporters
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                    <p className="text-2xl font-bold">{metrics?.activeExporters || 0}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supplying this period
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Approval Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <p className="text-2xl font-bold">{metrics?.approvalRate || 0}%</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {metrics?.approvedCount || 0} of {metrics?.totalCount || 0} samples approved
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <SamplesPerWeekCard />
        </div>

        {/* Sankey Chart */}
        <SupplyChainSankey
          filters={{
            year: filters.year,
            month: filters.month,
            minBags: filters.minBags,
            client: filters.client,
            supplier: filters.supplier,
            importer: filters.importer,
            roaster: filters.roaster
          }}
        />

        {/* Additional Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Performers</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : topPerformers.length > 0 ? (
                <div className="space-y-4">
                  {topPerformers.map((performer, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{performer.supplier}</p>
                        {performer.origin && (
                          <p className="text-sm text-muted-foreground">{performer.origin}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">{performer.approvalRate}%</p>
                        <p className="text-xs text-muted-foreground">{performer.totalBags.toLocaleString()} bags</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No top performers found for this period.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Supply Chain Insights</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  {mostActiveRoute ? (
                    <div>
                      <p className="text-sm font-medium mb-2">Most Active Route</p>
                      <p className="text-sm text-muted-foreground">
                        {mostActiveRoute.route}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{mostActiveRoute.bags.toLocaleString()} bags</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium mb-2">Most Active Route</p>
                      <p className="text-sm text-muted-foreground">No route data available</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium mb-2">Diversification</p>
                    <p className="text-sm text-muted-foreground">
                      {metrics?.activeExporters || 0} active exporters to {metrics?.activeRoasters || 0} roasters
                    </p>
                  </div>
                  {origins.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Geographic Distribution</p>
                      <p className="text-sm text-muted-foreground">
                        Origins: {origins.join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}

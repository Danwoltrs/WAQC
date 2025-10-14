'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { PerformanceLeaderboard } from '@/components/metrics/performance-leaderboard'
import { MetricsFilters, FilterState } from '@/components/metrics/metrics-filters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'

interface InsightsData {
  totalSuppliers: number
  pssApprovalRate: number
  ssApprovalRate: number
  topApprovalRate: number
  averageApprovalRate: number
}

export default function SupplierReviewPage() {
  const currentYear = new Date().getFullYear()
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3)

  const [filters, setFilters] = useState<FilterState>({
    year: currentYear,
    month: null,
    quarter: currentQuarter,
    minBags: 0
  })
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const { user, profile } = useAuth()

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters)
  }

  useEffect(() => {
    if (user && profile) {
      fetchInsights()
    }
  }, [user, profile, filters])

  const fetchInsights = async () => {
    if (!user || !profile) return

    try {
      setLoading(true)

      // Calculate date range
      let startDate: string
      let endDate: string

      if (filters.quarter) {
        const quarterStartMonth = (filters.quarter - 1) * 3
        startDate = new Date(filters.year, quarterStartMonth, 1).toISOString()
        endDate = new Date(filters.year, quarterStartMonth + 3, 1).toISOString()
      } else {
        startDate = new Date(filters.year, 0, 1).toISOString()
        endDate = new Date(filters.year + 1, 0, 1).toISOString()
      }

      // Build query
      let query = supabase
        .from('samples')
        .select('supplier, sample_type, status, created_at')
        .not('supplier', 'is', null)
        .in('status', ['approved', 'rejected'])
        .gte('created_at', startDate)
        .lt('created_at', endDate)

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

      // Apply lab filter based on role
      if (profile.qc_role === 'lab_personnel' ||
          profile.qc_role === 'lab_quality_manager' ||
          profile.qc_role === 'lab_finance_manager') {
        if (profile.laboratory_id) {
          query = query.eq('laboratory_id', profile.laboratory_id)
        }
      }

      const { data: samples, error } = await query

      if (error) throw error

      if (!samples || samples.length === 0) {
        setInsights({
          totalSuppliers: 0,
          pssApprovalRate: 0,
          ssApprovalRate: 0,
          topApprovalRate: 0,
          averageApprovalRate: 0
        })
        return
      }

      // Calculate insights
      const suppliers = new Set(samples.map(s => s.supplier))

      const pssSamples = samples.filter(s => s.sample_type === 'pss')
      const ssSamples = samples.filter(s => s.sample_type === 'ss')

      const pssApproved = pssSamples.filter(s => s.status === 'approved').length
      const ssApproved = ssSamples.filter(s => s.status === 'approved').length

      const pssApprovalRate = pssSamples.length > 0
        ? Math.round((pssApproved / pssSamples.length) * 100)
        : 0

      const ssApprovalRate = ssSamples.length > 0
        ? Math.round((ssApproved / ssSamples.length) * 100)
        : 0

      // Calculate per-supplier approval rates
      const supplierMap = new Map<string, { approved: number; total: number }>()

      samples.forEach(sample => {
        const existing = supplierMap.get(sample.supplier)
        const isApproved = sample.status === 'approved'

        if (existing) {
          existing.total += 1
          if (isApproved) existing.approved += 1
        } else {
          supplierMap.set(sample.supplier, {
            approved: isApproved ? 1 : 0,
            total: 1
          })
        }
      })

      const supplierRates = Array.from(supplierMap.values())
        .map(s => (s.approved / s.total) * 100)

      const topApprovalRate = supplierRates.length > 0
        ? Math.round(Math.max(...supplierRates))
        : 0

      const averageApprovalRate = supplierRates.length > 0
        ? Math.round(supplierRates.reduce((sum, rate) => sum + rate, 0) / supplierRates.length)
        : 0

      setInsights({
        totalSuppliers: suppliers.size,
        pssApprovalRate,
        ssApprovalRate,
        topApprovalRate,
        averageApprovalRate
      })

    } catch (err) {
      console.error('Error fetching insights:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Supplier Performance Review</h1>
          <p className="text-lg text-muted-foreground">
            Quarterly performance rankings and quality metrics comparison
          </p>
        </div>

        {/* Filters */}
        <MetricsFilters onFilterChange={handleFilterChange} />

        {/* Performance Leaderboard */}
        <PerformanceLeaderboard
          year={filters.year}
          quarter={filters.quarter || undefined}
          filters={filters}
        />

        {/* Additional Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Key Insights</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : insights ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/20">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                      Top Performer
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                      Highest approval rate: {insights.topApprovalRate}% | Average: {insights.averageApprovalRate}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Sample Distribution
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      PSS approval rate: {insights.pssApprovalRate}% | SS approval rate: {insights.ssApprovalRate}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                    <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                      Active Suppliers
                    </p>
                    <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                      {insights.totalSuppliers} suppliers evaluated this period
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No insights available for this period.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Understanding the Rankings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div>
                  <p className="font-semibold text-foreground mb-1">Ranking Criteria</p>
                  <p>Suppliers are ranked by approval rate first, then by total sample volume.</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">Performance Metrics</p>
                  <p>Both PSS and SS samples are included in the overall approval rate calculation.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { PerformanceLeaderboard } from '@/components/metrics/performance-leaderboard'
import { MetricsFilters, FilterState } from '@/components/metrics/metrics-filters'
import { Card, CardContent } from '@/components/ui/card'
import { Users, TrendingUp, Award, FileCheck2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'

interface InsightsData {
  totalSuppliers: number
  totalSamples: number
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

      let query = supabase
        .from('samples')
        .select(`
          sample_type,
          status,
          created_at,
          seller:exporters!samples_seller_id_fkey(id, name)
        `)
        .not('seller_id', 'is', null)
        .in('status', ['approved', 'rejected'])
        .gte('created_at', startDate)
        .lt('created_at', endDate)

      if (filters.supplier) query = query.eq('seller_id', filters.supplier)
      if (filters.importer) query = query.eq('importer_id', filters.importer)
      if (filters.roaster) query = query.eq('roaster_id', filters.roaster)
      if (filters.client) query = query.eq('client_id', filters.client)

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
          totalSamples: 0,
          pssApprovalRate: 0,
          ssApprovalRate: 0,
          topApprovalRate: 0,
          averageApprovalRate: 0
        })
        return
      }

      const suppliers = new Set(samples.map((s: any) => s.seller?.name).filter(Boolean))

      const pssSamples = samples.filter((s: any) => s.sample_type === 'pss')
      const ssSamples = samples.filter((s: any) => s.sample_type === 'ss')

      const pssApproved = pssSamples.filter((s: any) => s.status === 'approved').length
      const ssApproved = ssSamples.filter((s: any) => s.status === 'approved').length

      const pssApprovalRate = pssSamples.length > 0
        ? Math.round((pssApproved / pssSamples.length) * 100)
        : 0
      const ssApprovalRate = ssSamples.length > 0
        ? Math.round((ssApproved / ssSamples.length) * 100)
        : 0

      const supplierMap = new Map<string, { approved: number; total: number }>()
      samples.forEach((sample: any) => {
        const supplierName = sample.seller?.name
        if (!supplierName) return
        const existing = supplierMap.get(supplierName)
        const isApproved = sample.status === 'approved'
        if (existing) {
          existing.total += 1
          if (isApproved) existing.approved += 1
        } else {
          supplierMap.set(supplierName, { approved: isApproved ? 1 : 0, total: 1 })
        }
      })

      const supplierRates = Array.from(supplierMap.values()).map(s => (s.approved / s.total) * 100)

      const topApprovalRate = supplierRates.length > 0 ? Math.round(Math.max(...supplierRates)) : 0
      const averageApprovalRate = supplierRates.length > 0
        ? Math.round(supplierRates.reduce((sum, rate) => sum + rate, 0) / supplierRates.length)
        : 0

      setInsights({
        totalSuppliers: suppliers.size,
        totalSamples: samples.length,
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
        <div className="space-y-1">
          <h1 className="text-sm font-semibold tracking-tight">Supplier Performance Review</h1>
          <p className="text-xs text-muted-foreground">
            Approval-rate rankings and quality metrics, filtered by period and stakeholder
          </p>
        </div>

        {/* Filters */}
        <MetricsFilters onFilterChange={handleFilterChange} />

        {/* KPI strip — the numbers that used to be buried in the bottom "Insights"
            card are now hero stats up top, where readers actually look first. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Suppliers"
            value={loading ? null : insights?.totalSuppliers ?? 0}
            sublabel="evaluated in period"
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
          <KpiCard
            label="Avg Approval Rate"
            value={loading ? null : `${insights?.averageApprovalRate ?? 0}%`}
            sublabel="across all suppliers"
            icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            accent={performanceAccent(insights?.averageApprovalRate)}
          />
          <KpiCard
            label="Top Performer"
            value={loading ? null : `${insights?.topApprovalRate ?? 0}%`}
            sublabel="highest single-supplier rate"
            icon={<Award className="h-4 w-4 text-muted-foreground" />}
            accent={performanceAccent(insights?.topApprovalRate)}
          />
          <KpiCard
            label="Total Samples"
            value={loading ? null : insights?.totalSamples ?? 0}
            sublabel={
              insights
                ? `PSS ${insights.pssApprovalRate}% · SS ${insights.ssApprovalRate}%`
                : 'PSS · SS approval'
            }
            icon={<FileCheck2 className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        {/* Leaderboard table */}
        <PerformanceLeaderboard
          year={filters.year}
          quarter={filters.quarter || undefined}
          filters={filters}
        />
      </div>
    </MainLayout>
  )
}

// Single KPI card matching the project's design system (rounded-[20px],
// 24px padding, subtle border, generous spacing). Loading state shows a small
// spinner instead of a placeholder number so readers don't anchor on "0".
function KpiCard({
  label,
  value,
  sublabel,
  icon,
  accent
}: {
  label: string
  value: string | number | null
  sublabel: string
  icon: React.ReactNode
  accent?: string
}) {
  return (
    <Card className="rounded-[20px]">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        {value === null ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <div className={`text-[24px] font-semibold leading-none ${accent ?? ''}`}>
            {value}
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-2">{sublabel}</div>
      </CardContent>
    </Card>
  )
}

// Tints the KPI number using the project's chart palette to communicate band
// at-a-glance without a separate legend.
function performanceAccent(rate: number | undefined): string {
  if (rate === undefined) return ''
  if (rate >= 90) return 'text-[#556b2f] dark:text-[#a9a454]'
  if (rate >= 70) return 'text-[#a9a454]'
  return 'text-[#ef4444]'
}

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'
import { Award, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface SupplierPerformance {
  supplier: string
  totalSamples: number
  approvedSamples: number
  rejectedSamples: number
  approvalRate: number
  pssCount: number
  ssCount: number
  pssApprovalRate: number
  ssApprovalRate: number
  rank: number
}

interface PerformanceLeaderboardProps {
  year: number
  quarter?: number | null
  filters?: {
    client?: string
    supplier?: string
    importer?: string
    roaster?: string
  }
}

export function PerformanceLeaderboard({ year, quarter, filters }: PerformanceLeaderboardProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierPerformance[]>([])
  const { user, profile } = useAuth()

  useEffect(() => {
    if (user && profile) {
      fetchSupplierPerformance()
    }
  }, [user, profile, year, quarter, filters])

  const fetchSupplierPerformance = async () => {
    if (!user || !profile) return

    try {
      setLoading(true)
      setError(null)

      // Calculate date range
      let startDate: string
      let endDate: string

      if (quarter) {
        // Quarterly view
        const quarterStartMonth = (quarter - 1) * 3
        startDate = new Date(year, quarterStartMonth, 1).toISOString()
        endDate = new Date(year, quarterStartMonth + 3, 1).toISOString()
      } else {
        // Yearly view
        startDate = new Date(year, 0, 1).toISOString()
        endDate = new Date(year + 1, 0, 1).toISOString()
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
      if (filters?.supplier) {
        query = query.eq('supplier', filters.supplier)
      }
      if (filters?.importer) {
        query = query.eq('importer', filters.importer)
      }
      if (filters?.roaster) {
        query = query.eq('roaster', filters.roaster)
      }
      if (filters?.client) {
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

      const { data: samples, error: queryError } = await query

      if (queryError) throw queryError

      // Aggregate by supplier
      const supplierMap = new Map<string, {
        totalSamples: number
        approvedSamples: number
        rejectedSamples: number
        pssCount: number
        ssCount: number
        pssApproved: number
        ssApproved: number
      }>()

      samples?.forEach(sample => {
        const existing = supplierMap.get(sample.supplier)
        const isPSS = sample.sample_type === 'PSS'
        const isApproved = sample.status === 'approved'

        if (existing) {
          existing.totalSamples += 1
          if (isApproved) existing.approvedSamples += 1
          else existing.rejectedSamples += 1

          if (isPSS) {
            existing.pssCount += 1
            if (isApproved) existing.pssApproved += 1
          } else {
            existing.ssCount += 1
            if (isApproved) existing.ssApproved += 1
          }
        } else {
          supplierMap.set(sample.supplier, {
            totalSamples: 1,
            approvedSamples: isApproved ? 1 : 0,
            rejectedSamples: isApproved ? 0 : 1,
            pssCount: isPSS ? 1 : 0,
            ssCount: isPSS ? 0 : 1,
            pssApproved: isPSS && isApproved ? 1 : 0,
            ssApproved: !isPSS && isApproved ? 1 : 0
          })
        }
      })

      // Transform to array and calculate rates
      const performanceData: SupplierPerformance[] = Array.from(supplierMap.entries())
        .map(([supplier, data]) => ({
          supplier,
          totalSamples: data.totalSamples,
          approvedSamples: data.approvedSamples,
          rejectedSamples: data.rejectedSamples,
          approvalRate: data.totalSamples > 0
            ? Math.round((data.approvedSamples / data.totalSamples) * 100)
            : 0,
          pssCount: data.pssCount,
          ssCount: data.ssCount,
          pssApprovalRate: data.pssCount > 0
            ? Math.round((data.pssApproved / data.pssCount) * 100)
            : 0,
          ssApprovalRate: data.ssCount > 0
            ? Math.round((data.ssApproved / data.ssCount) * 100)
            : 0,
          rank: 0 // Will be set after sorting
        }))
        .sort((a, b) => {
          // Sort by approval rate descending, then by total samples descending
          if (b.approvalRate !== a.approvalRate) {
            return b.approvalRate - a.approvalRate
          }
          return b.totalSamples - a.totalSamples
        })
        .map((item, index) => ({ ...item, rank: index + 1 }))

      // Anonymize competitors if user is not global admin
      const isGlobalUser = profile.qc_role === 'global_admin' ||
                          profile.qc_role === 'global_quality_admin' ||
                          profile.qc_role === 'santos_hq_finance' ||
                          profile.qc_role === 'global_finance_admin'

      if (!isGlobalUser) {
        // Anonymize all suppliers except top performer
        performanceData.forEach((supplier, index) => {
          if (index > 0) {
            supplier.supplier = `Supplier ${String.fromCharCode(65 + index)}` // A, B, C, etc.
          }
        })
      }

      setSuppliers(performanceData)
    } catch (err) {
      console.error('Error fetching supplier performance:', err)
      setError(err instanceof Error ? err.message : 'Failed to load supplier performance')
    } finally {
      setLoading(false)
    }
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Award className="h-5 w-5 text-yellow-500" />
    if (rank === 2) return <Award className="h-5 w-5 text-gray-400" />
    if (rank === 3) return <Award className="h-5 w-5 text-orange-600" />
    return <span className="h-5 w-5 flex items-center justify-center text-sm font-semibold text-muted-foreground">{rank}</span>
  }

  const getApprovalRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600'
    if (rate >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getApprovalRateBg = (rate: number) => {
    if (rate >= 90) return 'bg-green-100 dark:bg-green-900/20'
    if (rate >= 70) return 'bg-yellow-100 dark:bg-yellow-900/20'
    return 'bg-red-100 dark:bg-red-900/20'
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Supplier Performance Rankings</CardTitle>
          <CardDescription>
            {quarter ? `Q${quarter} ${year}` : `${year}`} - Loading...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Supplier Performance Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (suppliers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Supplier Performance Rankings</CardTitle>
          <CardDescription>
            {quarter ? `Q${quarter} ${year}` : `${year}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No supplier data available for this period.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplier Performance Rankings</CardTitle>
        <CardDescription>
          {quarter ? `Q${quarter} ${year}` : `${year}`} - Ranked by approval rate and volume
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {suppliers.map((supplier) => (
            <div
              key={supplier.supplier}
              className={`p-4 rounded-lg border ${getApprovalRateBg(supplier.approvalRate)} transition-all hover:shadow-md`}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Rank and Name */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {getRankIcon(supplier.rank)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-base truncate">{supplier.supplier}</h4>
                    <p className="text-sm text-muted-foreground">
                      {supplier.totalSamples} sample{supplier.totalSamples !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Approval Rate */}
                <div className="flex-shrink-0 text-right">
                  <p className={`text-2xl font-bold ${getApprovalRateColor(supplier.approvalRate)}`}>
                    {supplier.approvalRate}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {supplier.approvedSamples} approved
                  </p>
                </div>
              </div>

              {/* PSS vs SS Breakdown */}
              {(supplier.pssCount > 0 || supplier.ssCount > 0) && (
                <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-4">
                  {/* PSS */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">PSS</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{supplier.pssCount} samples</span>
                      {supplier.pssCount > 0 && (
                        <span className={`text-sm font-bold ${getApprovalRateColor(supplier.pssApprovalRate)}`}>
                          {supplier.pssApprovalRate}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* SS */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">SS</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{supplier.ssCount} samples</span>
                      {supplier.ssCount > 0 && (
                        <span className={`text-sm font-bold ${getApprovalRateColor(supplier.ssApprovalRate)}`}>
                          {supplier.ssApprovalRate}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

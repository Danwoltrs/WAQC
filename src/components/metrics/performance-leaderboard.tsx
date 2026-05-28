'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'
import { Award, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { cropYearRange, formatCropYear } from '@/lib/crop-year'

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
  // When set, overrides year + quarter and queries the Sep–Aug window.
  cropYear?: number | null
  filters?: {
    client?: string
    supplier?: string
    importer?: string
    roaster?: string
  }
}

type SortKey = 'rank' | 'supplier' | 'totalSamples' | 'pssCount' | 'ssCount' | 'approvalRate'
type SortDir = 'asc' | 'desc'

export function PerformanceLeaderboard({ year, quarter, cropYear, filters }: PerformanceLeaderboardProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierPerformance[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const { user, profile } = useAuth()

  useEffect(() => {
    if (user && profile) {
      fetchSupplierPerformance()
    }
  }, [user, profile, year, quarter, cropYear, filters])

  const fetchSupplierPerformance = async () => {
    if (!user || !profile) return

    try {
      setLoading(true)
      setError(null)

      // Calculate date range. Crop year takes precedence — when set, the
      // calendar year + quarter are ignored.
      let startDate: string
      let endDate: string

      if (cropYear != null) {
        const range = cropYearRange(cropYear)
        startDate = range.start.toISOString()
        endDate = range.end.toISOString()
      } else if (quarter) {
        const quarterStartMonth = (quarter - 1) * 3
        startDate = new Date(year, quarterStartMonth, 1).toISOString()
        endDate = new Date(year, quarterStartMonth + 3, 1).toISOString()
      } else {
        startDate = new Date(year, 0, 1).toISOString()
        endDate = new Date(year + 1, 0, 1).toISOString()
      }

      let query = supabase
        .from('samples')
        .select(`
          sample_type,
          status,
          created_at,
          seller:companies!samples_seller_id_fkey(name)
        `)
        .not('seller_id', 'is', null)
        .in('status', ['approved', 'rejected'])
        .gte('created_at', startDate)
        .lt('created_at', endDate)

      if (filters?.supplier) {
        query = query.eq('seller_id', filters.supplier)
      }
      if (filters?.importer) {
        query = query.eq('importer_id', filters.importer)
      }
      if (filters?.roaster) {
        query = query.eq('roaster_id', filters.roaster)
      }
      if (filters?.client) {
        query = query.eq('client_id', filters.client)
      }

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

      samples?.forEach((sample: any) => {
        const supplierName = sample.seller?.name
        if (!supplierName) return

        const existing = supplierMap.get(supplierName)
        const isPSS = sample.sample_type === 'pss'
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
          supplierMap.set(supplierName, {
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
          rank: 0
        }))
        .sort((a, b) => {
          if (b.approvalRate !== a.approvalRate) return b.approvalRate - a.approvalRate
          return b.totalSamples - a.totalSamples
        })
        .map((item, index) => ({ ...item, rank: index + 1 }))

      // Anonymize for non-global users (keep top performer named)
      const isGlobalUser = profile.qc_role === 'global_admin' ||
                          profile.qc_role === 'global_quality_admin' ||
                          profile.qc_role === 'santos_hq_finance' ||
                          profile.qc_role === 'global_finance_admin'

      if (!isGlobalUser) {
        performanceData.forEach((supplier, index) => {
          if (index > 0) {
            supplier.supplier = `Supplier ${String.fromCharCode(65 + index)}`
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

  // Memoized sorted view — the underlying rank still reflects approval rate ranking.
  const sortedSuppliers = useMemo(() => {
    const arr = [...suppliers]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'rank': cmp = a.rank - b.rank; break
        case 'supplier': cmp = a.supplier.localeCompare(b.supplier); break
        case 'totalSamples': cmp = a.totalSamples - b.totalSamples; break
        case 'pssCount': cmp = a.pssCount - b.pssCount; break
        case 'ssCount': cmp = a.ssCount - b.ssCount; break
        case 'approvalRate': cmp = a.approvalRate - b.approvalRate; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [suppliers, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      // Default direction depends on column — descending for numeric is more useful
      setSortDir(key === 'supplier' ? 'asc' : 'desc')
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />
  }

  // Color the approval-rate bar by performance band. Uses the project palette
  // (olive #556b2f for top, yellowish #a9a454 for mid, validation red for low).
  const barColor = (rate: number): string => {
    if (rate >= 90) return 'bg-[#556b2f]'
    if (rate >= 70) return 'bg-[#a9a454]'
    return 'bg-[#ef4444]'
  }

  const textColor = (rate: number): string => {
    if (rate >= 90) return 'text-[#556b2f] dark:text-[#a9a454]'
    if (rate >= 70) return 'text-[#a9a454]'
    return 'text-[#ef4444]'
  }

  const rankBadge = (rank: number) => {
    if (rank === 1) return <Award className="h-4 w-4 text-[#d4af37]" aria-label="1st" />
    if (rank === 2) return <Award className="h-4 w-4 text-[#a8a8a8]" aria-label="2nd" />
    if (rank === 3) return <Award className="h-4 w-4 text-[#b07946]" aria-label="3rd" />
    return <span className="inline-flex w-4 justify-center text-xs font-medium text-muted-foreground">{rank}</span>
  }

  const periodLabel = cropYear != null
    ? `Crop ${formatCropYear(cropYear)} (Sep–Aug)`
    : (quarter ? `Q${quarter} ${year}` : `${year}`)

  if (loading) {
    return (
      <Card className="rounded-[20px]">
        <CardHeader>
          <CardTitle className="text-sm">Supplier Performance Rankings</CardTitle>
          <CardDescription>{periodLabel} — Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="rounded-[20px]">
        <CardHeader><CardTitle className="text-sm">Supplier Performance Rankings</CardTitle></CardHeader>
        <CardContent><p className="text-[#ef4444] text-sm">{error}</p></CardContent>
      </Card>
    )
  }

  if (suppliers.length === 0) {
    return (
      <Card className="rounded-[20px]">
        <CardHeader>
          <CardTitle className="text-sm">Supplier Performance Rankings</CardTitle>
          <CardDescription>{periodLabel}</CardDescription>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No supplier data available for this period.</p></CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-[20px]">
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <CardTitle className="text-sm">Supplier Performance Rankings</CardTitle>
            <CardDescription className="text-xs">
              {periodLabel} — Ranked by approval rate, then volume
            </CardDescription>
          </div>
          <span className="text-xs text-muted-foreground">
            {suppliers.length} supplier{suppliers.length === 1 ? '' : 's'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 text-xs">
                <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs"
                  onClick={() => toggleSort('rank')}>
                  # <SortIcon k="rank" />
                </Button>
              </TableHead>
              <TableHead className="text-xs">
                <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs"
                  onClick={() => toggleSort('supplier')}>
                  Supplier <SortIcon k="supplier" />
                </Button>
              </TableHead>
              <TableHead className="text-right text-xs w-20">
                <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs"
                  onClick={() => toggleSort('totalSamples')}>
                  Total <SortIcon k="totalSamples" />
                </Button>
              </TableHead>
              <TableHead className="text-right text-xs w-20">
                <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs"
                  onClick={() => toggleSort('pssCount')}>
                  PSS <SortIcon k="pssCount" />
                </Button>
              </TableHead>
              <TableHead className="text-right text-xs w-20">
                <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs"
                  onClick={() => toggleSort('ssCount')}>
                  SS <SortIcon k="ssCount" />
                </Button>
              </TableHead>
              <TableHead className="text-xs">
                <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs"
                  onClick={() => toggleSort('approvalRate')}>
                  Approval Rate <SortIcon k="approvalRate" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSuppliers.map(s => (
              <TableRow key={s.supplier} className="text-sm">
                <TableCell className="py-2">{rankBadge(s.rank)}</TableCell>
                <TableCell className="py-2 font-medium">{s.supplier}</TableCell>
                <TableCell className="py-2 text-right tabular-nums">{s.totalSamples}</TableCell>
                <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                  {s.pssCount > 0 ? (
                    <span title={`${s.pssApprovalRate}% approved`}>
                      {s.pssCount}
                      <span className="ml-1 text-[10px]">({s.pssApprovalRate}%)</span>
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                  {s.ssCount > 0 ? (
                    <span title={`${s.ssApprovalRate}% approved`}>
                      {s.ssCount}
                      <span className="ml-1 text-[10px]">({s.ssApprovalRate}%)</span>
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center gap-3">
                    {/* Custom progress bar — keeps the brand palette and lets us
                        color by band without theming the shadcn Progress component. */}
                    <div className="flex-1 h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor(s.approvalRate)} transition-[width] duration-300`}
                        style={{ width: `${s.approvalRate}%` }}
                      />
                    </div>
                    <span className={`text-sm font-semibold tabular-nums w-12 text-right ${textColor(s.approvalRate)}`}>
                      {s.approvalRate}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

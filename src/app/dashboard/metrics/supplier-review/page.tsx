'use client'

import { useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { PerformanceLeaderboard } from '@/components/metrics/performance-leaderboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function SupplierReviewPage() {
  const currentYear = new Date().getFullYear()
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3)

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(currentQuarter)

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const quarters = [1, 2, 3, 4]

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

        {/* Time Period Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Time Period</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {/* Year Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Year</label>
                <div className="flex gap-2">
                  {years.map((year) => (
                    <Button
                      key={year}
                      variant={selectedYear === year ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedYear(year)}
                    >
                      {year}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Quarter Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Quarter</label>
                <div className="flex gap-2">
                  <Button
                    variant={selectedQuarter === null ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedQuarter(null)}
                  >
                    Full Year
                  </Button>
                  {quarters.map((quarter) => (
                    <Button
                      key={quarter}
                      variant={selectedQuarter === quarter ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedQuarter(quarter)}
                    >
                      Q{quarter}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Leaderboard */}
        <PerformanceLeaderboard
          year={selectedYear}
          quarter={selectedQuarter}
        />

        {/* Additional Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Key Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/20">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    Top Performer
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    Maintains highest approval rate with consistent quality across PSS and SS samples
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Sample Distribution
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    PSS samples typically show higher approval rates than sealed samples
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                  <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                    Consistency Matters
                  </p>
                  <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                    Suppliers with balanced PSS/SS performance rank higher
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Understanding the Rankings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div>
                  <p className="font-semibold text-foreground mb-1">PSS (Pre-Shipment Sample)</p>
                  <p>Samples sent before shipping for pre-approval. Typically show supplier's best quality.</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">SS (Sealed Sample)</p>
                  <p>Representative samples sealed at the warehouse. True indicator of shipment quality.</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">Ranking Criteria</p>
                  <p>Suppliers are ranked by approval rate first, then by total sample volume.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}

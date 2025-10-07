'use client'

import { useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { SupplyChainSankey } from '@/components/metrics/supply-chain-sankey'
import { MetricsFilters, FilterState } from '@/components/metrics/metrics-filters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, Package, CheckCircle, XCircle } from 'lucide-react'

export default function OverviewDashboard() {
  const [filters, setFilters] = useState<FilterState>({
    year: new Date().getFullYear(),
    month: null,
    quarter: null,
    minBags: 0
  })

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters)
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
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <p className="text-2xl font-bold">2,460</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all flows
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Exporters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <p className="text-2xl font-bold">8</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Supplying this period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Approval Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-2xl font-bold">67%</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                2 of 3 samples approved
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Roasters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <p className="text-2xl font-bold">8</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Receiving shipments
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sankey Chart */}
        <SupplyChainSankey
          filters={{
            year: filters.year,
            month: filters.month,
            minBags: filters.minBags
          }}
        />

        {/* Additional Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Performers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Fazenda Sertão</p>
                    <p className="text-sm text-muted-foreground">Brazil</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">100%</p>
                    <p className="text-xs text-muted-foreground">520 bags</p>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Hacienda Sonora</p>
                    <p className="text-sm text-muted-foreground">Costa Rica</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">100%</p>
                    <p className="text-xs text-muted-foreground">180 bags</p>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">COMSA Cooperative</p>
                    <p className="text-sm text-muted-foreground">Honduras</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">100%</p>
                    <p className="text-xs text-muted-foreground">410 bags</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Supply Chain Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Most Active Route</p>
                  <p className="text-sm text-muted-foreground">
                    Fazenda Sertão → Americas Coffee → Peets Coffee
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">520 bags</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Diversification</p>
                  <p className="text-sm text-muted-foreground">
                    8 unique exporter-roaster relationships
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Geographic Distribution</p>
                  <p className="text-sm text-muted-foreground">
                    Origins: Brazil, Colombia, Guatemala, Costa Rica, Ethiopia, Kenya, Honduras, Nicaragua
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}

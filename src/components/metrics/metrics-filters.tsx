'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Filter, Calendar } from 'lucide-react'

interface MetricsFiltersProps {
  onFilterChange: (filters: FilterState) => void
}

export interface FilterState {
  year: number
  month: number | null
  quarter: number | null
  laboratoryId?: string
  minBags?: number
}

export function MetricsFilters({ onFilterChange }: MetricsFiltersProps) {
  const currentYear = new Date().getFullYear()
  const [filters, setFilters] = useState<FilterState>({
    year: currentYear,
    month: null,
    quarter: null,
    minBags: 0
  })

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ]

  const handleFilterUpdate = (key: keyof FilterState, value: any) => {
    const updated = { ...filters, [key]: value }
    setFilters(updated)
    onFilterChange(updated)
  }

  const resetFilters = () => {
    const reset = {
      year: currentYear,
      month: null,
      quarter: null,
      minBags: 0
    }
    setFilters(reset)
    onFilterChange(reset)
  }

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Year filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Year</label>
            <select
              value={filters.year}
              onChange={(e) => handleFilterUpdate('year', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {/* Month filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Month</label>
            <select
              value={filters.month || ''}
              onChange={(e) => handleFilterUpdate('month', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">All Year</option>
              {months.map(month => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </div>

          {/* Quarter filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Quarter</label>
            <select
              value={filters.quarter || ''}
              onChange={(e) => handleFilterUpdate('quarter', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">All Quarters</option>
              <option value="1">Q1 (Jan-Mar)</option>
              <option value="2">Q2 (Apr-Jun)</option>
              <option value="3">Q3 (Jul-Sep)</option>
              <option value="4">Q4 (Oct-Dec)</option>
            </select>
          </div>

          {/* Min Bags filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Min Bags</label>
            <input
              type="number"
              value={filters.minBags}
              onChange={(e) => handleFilterUpdate('minBags', parseInt(e.target.value) || 0)}
              min="0"
              step="50"
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
              placeholder="0"
            />
          </div>

          {/* Reset button */}
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={resetFilters}
              className="w-full"
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Quick presets */}
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const updated = { ...filters, month: new Date().getMonth() + 1 }
              setFilters(updated)
              onFilterChange(updated)
            }}
          >
            <Calendar className="h-3 w-3 mr-1" />
            This Month
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const currentQ = Math.floor(new Date().getMonth() / 3) + 1
              const updated = { ...filters, quarter: currentQ, month: null }
              setFilters(updated)
              onFilterChange(updated)
            }}
          >
            <Calendar className="h-3 w-3 mr-1" />
            Current Quarter
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const updated = { ...filters, month: null, quarter: null }
              setFilters(updated)
              onFilterChange(updated)
            }}
          >
            <Calendar className="h-3 w-3 mr-1" />
            Full Year
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

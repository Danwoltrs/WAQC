'use client'

import { useState, useEffect } from 'react'
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
  client?: string
  supplier?: string
  importer?: string
  roaster?: string
}

export function MetricsFilters({ onFilterChange }: MetricsFiltersProps) {
  const currentYear = new Date().getFullYear()
  const [filters, setFilters] = useState<FilterState>({
    year: currentYear,
    month: null,
    quarter: null,
    minBags: 0,
    client: undefined,
    supplier: undefined,
    importer: undefined,
    roaster: undefined
  })

  const [stakeholders, setStakeholders] = useState<{
    clients: string[]
    suppliers: string[]
    importers: string[]
    roasters: string[]
  }>({
    clients: [],
    suppliers: [],
    importers: [],
    roasters: []
  })

  // Load stakeholder options
  useEffect(() => {
    loadStakeholders()
  }, [])

  const loadStakeholders = async () => {
    try {
      // Fetch unique values from samples - for now just get from samples directly
      // In production, you'd want to fetch from dedicated stakeholder tables
      const response = await fetch('/api/samples?limit=1000')
      const data = await response.json()

      if (response.ok) {
        const clientIds = new Set<string>()
        const suppliers = new Set<string>()
        const importers = new Set<string>()
        const roasters = new Set<string>()

        data.samples.forEach((sample: any) => {
          // For clients, we'll just use IDs for now since we don't have names in the response
          // TODO: Join with clients table to get actual names
          if (sample.client_id) clientIds.add(sample.client_id)
          if (sample.supplier) suppliers.add(sample.supplier)
          if (sample.importer) importers.add(sample.importer)
          if (sample.roaster) roasters.add(sample.roaster)
        })

        setStakeholders({
          clients: Array.from(clientIds).sort(),
          suppliers: Array.from(suppliers).sort(),
          importers: Array.from(importers).sort(),
          roasters: Array.from(roasters).sort()
        })
      }
    } catch (error) {
      console.error('Error loading stakeholders:', error)
    }
  }

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
      minBags: 0,
      client: undefined,
      supplier: undefined,
      importer: undefined,
      roaster: undefined
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

        {/* Stakeholder Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          {/* Client filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Client</label>
            <select
              value={filters.client || ''}
              onChange={(e) => handleFilterUpdate('client', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">All Clients</option>
              {stakeholders.clients.map(client => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
          </div>

          {/* Supplier/Exporter filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Exporter</label>
            <select
              value={filters.supplier || ''}
              onChange={(e) => handleFilterUpdate('supplier', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">All Exporters</option>
              {stakeholders.suppliers.map(supplier => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
            </select>
          </div>

          {/* Importer filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Importer</label>
            <select
              value={filters.importer || ''}
              onChange={(e) => handleFilterUpdate('importer', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">All Importers</option>
              {stakeholders.importers.map(importer => (
                <option key={importer} value={importer}>{importer}</option>
              ))}
            </select>
          </div>

          {/* Roaster filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Roaster</label>
            <select
              value={filters.roaster || ''}
              onChange={(e) => handleFilterUpdate('roaster', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">All Roasters</option>
              {stakeholders.roasters.map(roaster => (
                <option key={roaster} value={roaster}>{roaster}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Time & Volume Filters */}
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

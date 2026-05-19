'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Filter, Calendar, Sprout } from 'lucide-react'
import {
  getCurrentCropYearStart,
  formatCropYear,
} from '@/lib/crop-year'

interface MetricsFiltersProps {
  onFilterChange: (filters: FilterState) => void
}

export interface FilterState {
  year: number
  month: number | null
  quarter: number | null
  // Crop year start year (e.g. 2025 = "25/26"). When set, it overrides
  // year/month/quarter for date-range computation downstream.
  cropYear: number | null
  laboratoryId?: string
  minBags?: number
  client?: string
  supplier?: string
  importer?: string
  roaster?: string
}

export function MetricsFilters({ onFilterChange }: MetricsFiltersProps) {
  const currentYear = new Date().getFullYear()
  const currentCropStart = getCurrentCropYearStart()
  const [filters, setFilters] = useState<FilterState>({
    year: currentYear,
    month: null,
    quarter: null,
    cropYear: null,
    minBags: 0,
    client: undefined,
    supplier: undefined,
    importer: undefined,
    roaster: undefined
  })

  // Entities are { id, label } — id is the FK used in filter queries, label is the
  // human name shown in the dropdown. Previously the client dropdown showed raw UUIDs
  // because we'd pulled client_id strings off /api/samples. Now we fetch each entity
  // table directly so the labels come from clients.fantasy_name / company / name etc.
  type Option = { id: string; label: string }
  const [stakeholders, setStakeholders] = useState<{
    clients: Option[]
    suppliers: Option[]
    importers: Option[]
    roasters: Option[]
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
      // Pull from each entity table directly. /api/clients limits to 50 by default
      // so we ask for a higher cap; if your QC client list grows past 500, swap to
      // a paginated combobox.
      const [clientsRes, exportersRes, importersRes, roastersRes] = await Promise.all([
        fetch('/api/clients?is_qc_client=true&limit=500'),
        fetch('/api/exporters?limit=500'),
        fetch('/api/importers?limit=500'),
        fetch('/api/roasters?limit=500'),
      ])

      const [clientsJson, exportersJson, importersJson, roastersJson] = await Promise.all([
        clientsRes.ok ? clientsRes.json() : Promise.resolve({}),
        exportersRes.ok ? exportersRes.json() : Promise.resolve({}),
        importersRes.ok ? importersRes.json() : Promise.resolve({}),
        roastersRes.ok ? roastersRes.json() : Promise.resolve({}),
      ])

      // /api/clients returns { clients: [...] }; entity APIs may return { exporters: [...] }
      // or just arrays. Handle both shapes defensively.
      const pickArr = (json: any, key: string): any[] =>
        Array.isArray(json) ? json : Array.isArray(json?.[key]) ? json[key] : []

      const toOption = (e: any, labelKeys: string[]): Option | null => {
        if (!e?.id) return null
        for (const k of labelKeys) {
          if (typeof e[k] === 'string' && e[k].trim().length > 0) {
            return { id: e.id, label: e[k] }
          }
        }
        return { id: e.id, label: e.id }
      }

      const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label)

      setStakeholders({
        clients: pickArr(clientsJson, 'clients')
          .map(c => toOption(c, ['fantasy_name', 'company', 'name']))
          .filter((x): x is Option => x !== null)
          .sort(byLabel),
        suppliers: pickArr(exportersJson, 'exporters')
          .map(e => toOption(e, ['name']))
          .filter((x): x is Option => x !== null)
          .sort(byLabel),
        importers: pickArr(importersJson, 'importers')
          .map(e => toOption(e, ['name']))
          .filter((x): x is Option => x !== null)
          .sort(byLabel),
        roasters: pickArr(roastersJson, 'roasters')
          .map(e => toOption(e, ['name']))
          .filter((x): x is Option => x !== null)
          .sort(byLabel),
      })
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
    // Crop year is mutually exclusive with year/month/quarter — changing
    // one side clears the other so the resulting query is never ambiguous.
    let updated: FilterState = { ...filters, [key]: value }
    if (key === 'cropYear' && value !== null) {
      updated = { ...updated, month: null, quarter: null }
    } else if ((key === 'year' || key === 'month' || key === 'quarter') && filters.cropYear !== null) {
      updated = { ...updated, cropYear: null }
    }
    setFilters(updated)
    onFilterChange(updated)
  }

  const resetFilters = () => {
    const reset: FilterState = {
      year: currentYear,
      month: null,
      quarter: null,
      cropYear: null,
      minBags: 0,
      client: undefined,
      supplier: undefined,
      importer: undefined,
      roaster: undefined
    }
    setFilters(reset)
    onFilterChange(reset)
  }

  // Offer previous, current, and next crop year. Anything older is a
  // dashboard noise — the legacy reports cover prior seasons.
  const cropYearOptions = [
    currentCropStart - 1,
    currentCropStart,
    currentCropStart + 1,
  ]

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
                <option key={client.id} value={client.id}>{client.label}</option>
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
                <option key={supplier.id} value={supplier.id}>{supplier.label}</option>
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
                <option key={importer.id} value={importer.id}>{importer.label}</option>
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
                <option key={roaster.id} value={roaster.id}>{roaster.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Time & Volume Filters */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {/* Year filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Year</label>
            <select
              value={filters.year}
              onChange={(e) => handleFilterUpdate('year', parseInt(e.target.value))}
              disabled={filters.cropYear !== null}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background disabled:opacity-50 disabled:cursor-not-allowed"
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
              disabled={filters.cropYear !== null}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background disabled:opacity-50 disabled:cursor-not-allowed"
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
              disabled={filters.cropYear !== null}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">All Quarters</option>
              <option value="1">Q1 (Jan-Mar)</option>
              <option value="2">Q2 (Apr-Jun)</option>
              <option value="3">Q3 (Jul-Sep)</option>
              <option value="4">Q4 (Oct-Dec)</option>
            </select>
          </div>

          {/* Crop Year filter — overrides year/month/quarter when set.
              Coffee crop year runs Sep–Aug. */}
          <div>
            <label className="text-sm font-medium mb-2 block">Crop Year</label>
            <select
              value={filters.cropYear ?? ''}
              onChange={(e) => handleFilterUpdate('cropYear', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background"
            >
              <option value="">Off</option>
              {cropYearOptions.map(startYear => (
                <option key={startYear} value={startYear}>
                  {formatCropYear(startYear)}
                </option>
              ))}
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
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const updated = {
                ...filters,
                cropYear: null,
                month: new Date().getMonth() + 1,
                year: currentYear,
              }
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
              const updated = {
                ...filters,
                cropYear: null,
                quarter: currentQ,
                month: null,
                year: currentYear,
              }
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
              const updated = {
                ...filters,
                cropYear: null,
                month: null,
                quarter: null,
                year: currentYear,
              }
              setFilters(updated)
              onFilterChange(updated)
            }}
          >
            <Calendar className="h-3 w-3 mr-1" />
            Full Year
          </Button>
          <Button
            variant={filters.cropYear === currentCropStart ? 'default' : 'secondary'}
            size="sm"
            onClick={() => {
              const updated: FilterState = {
                ...filters,
                cropYear: currentCropStart,
                month: null,
                quarter: null,
              }
              setFilters(updated)
              onFilterChange(updated)
            }}
          >
            <Sprout className="h-3 w-3 mr-1" />
            Current Crop ({formatCropYear(currentCropStart)})
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

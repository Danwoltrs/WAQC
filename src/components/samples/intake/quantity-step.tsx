'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StepComponentProps } from './types'
import { Info } from 'lucide-react'

// Standard bag weights
const BAG_WEIGHTS = {
  jute_bag: [
    { value: '30', label: '30 kg', equivalent: 0.5 },
    { value: '59', label: '59 kg', equivalent: 0.983 },
    { value: '60', label: '60 kg', equivalent: 1.0 },
    { value: '70', label: '70 kg', equivalent: 1.167 },
  ],
  pp_bag: [
    { value: '30', label: '30 kg', equivalent: 0.5 },
    { value: '59', label: '59 kg', equivalent: 0.983 },
    { value: '60', label: '60 kg', equivalent: 1.0 },
    { value: '70', label: '70 kg', equivalent: 1.167 },
  ],
  big_bag: [
    { value: '1000', label: '1 M/T (1000 kg)', equivalent: 16.667 },
  ],
  bulk: [
    { value: '21600', label: '21.6 M/T (Bulk Container)', equivalent: 360 },
  ],
}

export function QuantityStep({ formData, updateFormData }: StepComponentProps) {
  const [customWeight, setCustomWeight] = useState(false)

  // Auto-select bag weight when bag type changes
  useEffect(() => {
    if (!formData.bag_type) return

    // Big Bag: Auto-select 1 M/T (1000 kg)
    if (formData.bag_type === 'big_bag') {
      updateFormData('bag_weight_kg', '1000')
      setCustomWeight(false)
    }

    // Bulk: Auto-select 21.6 M/T per container
    else if (formData.bag_type === 'bulk') {
      updateFormData('bag_weight_kg', '21600')
      setCustomWeight(false)
    }

    // Jute/PP Bag: Auto-select based on origin
    else if (formData.bag_type === 'jute_bag' || formData.bag_type === 'pp_bag') {
      const isBrazil = formData.origin?.toLowerCase() === 'brazil'
      updateFormData('bag_weight_kg', isBrazil ? '60' : '70')
      setCustomWeight(false)
    }
  }, [formData.bag_type])

  // Calculate derived values when inputs change
  useEffect(() => {
    const bagCount = parseInt(formData.bag_count) || 0
    const bagWeight = parseFloat(formData.bag_weight_kg) || 0

    if (bagCount > 0 && bagWeight > 0) {
      let totalMT: number
      let equivalent: number

      if (formData.bag_type === 'bulk') {
        // For bulk: bag_count is equivalent 60kg bags (user input)
        // So: totalMT = equivalent_bags * 60kg / 1000
        totalMT = (bagCount * 60) / 1000
        equivalent = bagCount // bag_count IS the equivalent 60kg bags
      } else {
        // For regular bags/big bags: normal calculation
        totalMT = (bagCount * bagWeight) / 1000
        equivalent = (bagCount * bagWeight) / 60
      }

      updateFormData('bags_quantity_mt', totalMT.toFixed(3))
      updateFormData('equivalent_60kg_bags', equivalent.toFixed(2))
    } else {
      updateFormData('bags_quantity_mt', '')
      updateFormData('equivalent_60kg_bags', '')
    }
  }, [formData.bag_count, formData.bag_weight_kg, formData.bag_type])

  const availableWeights = formData.bag_type ? BAG_WEIGHTS[formData.bag_type as keyof typeof BAG_WEIGHTS] : []

  return (
    <div className="space-y-4">
      <div className="bg-muted/50 p-4 rounded-lg">
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Quantity Priority
        </p>
        <p className="text-xs text-muted-foreground">
          M/T (Metric Tons) is displayed as the primary quantity. Provide at least one quantity measurement.
        </p>
      </div>

      {/* All bag fields in one row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Bag Type Selection */}
        <div className="space-y-2">
          <Label htmlFor="bag_type">Type of Bag *</Label>
          <Select
            value={formData.bag_type}
            onValueChange={(value) => {
              updateFormData('bag_type', value)
              updateFormData('bag_weight_kg', '') // Reset weight when type changes
              setCustomWeight(false)
            }}
          >
            <SelectTrigger id="bag_type">
              <SelectValue placeholder="Select bag type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jute_bag">Jute Bag</SelectItem>
              <SelectItem value="pp_bag">PP Bag (Polypropylene)</SelectItem>
              <SelectItem value="big_bag">Big Bag (1 M/T)</SelectItem>
              <SelectItem value="bulk">Bulk (21.6 M/T Container)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bag Count - Different behavior for Bulk */}
        <div className="space-y-2">
          <Label htmlFor="bag_count">
            {formData.bag_type === 'bulk' ? 'Equiv. 60kg Bags *' : 'Qty of Bags *'}
          </Label>
          <Input
            id="bag_count"
            type="number"
            min="1"
            value={formData.bag_count}
            onChange={(e) => {
              const value = e.target.value
              updateFormData('bag_count', value)

              // For bulk: auto-calculate container count from 60kg bags
              if (formData.bag_type === 'bulk' && value) {
                const kg60Bags = parseInt(value) || 0
                const totalKg = kg60Bags * 60
                const totalMT = totalKg / 1000
                const containers = Math.ceil(totalKg / 21600) // Round up to nearest container

                // Store the actual container count separately for display
                updateFormData('bulk_container_count', containers.toString())
              }
            }}
            placeholder={formData.bag_type === 'bulk' ? 'e.g., 360' : 'e.g., 300'}
          />
          <p className="text-xs text-muted-foreground">
            {formData.bag_type === 'bulk'
              ? 'Number of 60kg equivalent bags'
              : 'Number of bags/units'
            }
          </p>
        </div>

        {/* Bag Weight */}
        <div className="space-y-2">
          <Label htmlFor="bag_weight_kg">Bag Weight *</Label>

          {!customWeight && formData.bag_type ? (
            <div className="space-y-2">
              <Select
                value={formData.bag_weight_kg}
                onValueChange={(value) => {
                  if (value === 'custom') {
                    setCustomWeight(true)
                    updateFormData('bag_weight_kg', '')
                  } else {
                    updateFormData('bag_weight_kg', value)
                  }
                }}
              >
                <SelectTrigger id="bag_weight_kg">
                  <SelectValue placeholder="Select weight" />
                </SelectTrigger>
                <SelectContent>
                  {availableWeights.map((weight) => (
                    <SelectItem key={weight.value} value={weight.value}>
                      {weight.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom weight...</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                id="bag_weight_kg"
                type="number"
                step="0.01"
                min="0"
                value={formData.bag_weight_kg}
                onChange={(e) => updateFormData('bag_weight_kg', e.target.value)}
                placeholder="e.g., 60"
              />
              {formData.bag_type && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomWeight(false)
                    updateFormData('bag_weight_kg', '')
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Use standard weights
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Weight per bag in kg
          </p>
        </div>

        {/* Shipment Month */}
        <div className="space-y-2">
          <Label htmlFor="shipment_month">Shipment Month</Label>
          <Input
            id="shipment_month"
            type="month"
            value={formData.shipment_month}
            onChange={(e) => updateFormData('shipment_month', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Expected shipment
          </p>
        </div>
      </div>

      {/* Calculated Values */}
      {formData.bag_count && formData.bag_weight_kg && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="bg-primary/5 p-4 rounded-lg">
            <p className="text-sm font-medium mb-1 flex items-center gap-2">
              Total M/T
              <Badge variant="outline" className="text-xs">Auto-calculated</Badge>
            </p>
            <p className="text-2xl font-semibold">
              {formData.bags_quantity_mt} M/T
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {parseFloat(formData.bags_quantity_mt) * 2204.62 > 0
                ? `≈ ${(parseFloat(formData.bags_quantity_mt) * 2204.62).toFixed(0)} lbs`
                : ''
              }
            </p>
          </div>

          <div className="bg-primary/5 p-4 rounded-lg">
            <p className="text-sm font-medium mb-1 flex items-center gap-2">
              Equivalent 60kg Bags
              <Badge variant="outline" className="text-xs">For reference</Badge>
            </p>
            <p className="text-2xl font-semibold">
              {formData.equivalent_60kg_bags} bags
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Standard 60kg bag equivalent
            </p>
          </div>
        </div>
      )}

      {/* Info box for bulk */}
      {formData.bag_type === 'bulk' && formData.bag_count && formData.bulk_container_count && (
        <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-medium mb-1 text-blue-900 dark:text-blue-100">
            Bulk Container Info
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300">
            {formData.bag_count} equivalent 60kg bags = {formData.bulk_container_count} container(s)
          </p>
        </div>
      )}
    </div>
  )
}

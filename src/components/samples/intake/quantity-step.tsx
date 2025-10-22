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

  // Calculate derived values when inputs change
  useEffect(() => {
    const bagCount = parseInt(formData.bag_count) || 0
    const bagWeight = parseFloat(formData.bag_weight_kg) || 0

    if (bagCount > 0 && bagWeight > 0) {
      // Calculate total M/T
      const totalMT = (bagCount * bagWeight) / 1000
      updateFormData('bags_quantity_mt', totalMT.toFixed(3))

      // Calculate equivalent 60kg bags
      const equivalent = (bagCount * bagWeight) / 60
      updateFormData('equivalent_60kg_bags', equivalent.toFixed(2))
    } else {
      updateFormData('bags_quantity_mt', '')
      updateFormData('equivalent_60kg_bags', '')
    }
  }, [formData.bag_count, formData.bag_weight_kg])

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

      {/* Bag Type Selection */}
      <div className="space-y-2">
        <Label htmlFor="bag_type" className="flex items-center gap-2">
          Type of Bag *
          <Badge variant="secondary" className="text-xs">Required</Badge>
        </Label>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bag Count */}
        <div className="space-y-2">
          <Label htmlFor="bag_count" className="flex items-center gap-2">
            Quantity of Bags *
            <Badge variant="secondary" className="text-xs">Required</Badge>
          </Label>
          <Input
            id="bag_count"
            type="number"
            min="1"
            value={formData.bag_count}
            onChange={(e) => updateFormData('bag_count', e.target.value)}
            placeholder="e.g., 300"
          />
          <p className="text-xs text-muted-foreground">
            Number of bags/units
          </p>
        </div>

        {/* Bag Weight */}
        <div className="space-y-2">
          <Label htmlFor="bag_weight_kg" className="flex items-center gap-2">
            Bag Weight *
            <Badge variant="secondary" className="text-xs">Required</Badge>
          </Label>

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
            Weight per bag in kilograms
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
      {formData.bag_type === 'bulk' && formData.bag_count && (
        <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-medium mb-1 text-blue-900 dark:text-blue-100">
            Bulk Container Info
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300">
            {parseInt(formData.bag_count)} container(s) = {formData.equivalent_60kg_bags} equivalent 60kg bags
          </p>
        </div>
      )}
    </div>
  )
}

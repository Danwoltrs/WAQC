'use client'

import { useEffect, useId, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BULK_MAX_EQUIVALENT_BAGS,
  BULK_MAX_MT,
  bagTypeChange,
  contractQuantities,
  quantityIssues,
  standardBagWeight,
  type QuantityFields,
} from './quantity-model'

const MONTHS = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' }, { value: '04', label: 'Apr' },
  { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' }, { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
]

const YEARS = (() => {
  const y = new Date().getFullYear()
  return [y, y + 1, y + 2].map(String)
})()

const BAG_WEIGHTS: Record<string, { value: string; label: string }[]> = {
  jute_bag: [
    { value: '30', label: '30 kg' }, { value: '59', label: '59 kg' },
    { value: '60', label: '60 kg' }, { value: '70', label: '70 kg' },
  ],
  pp_bag: [
    { value: '30', label: '30 kg' }, { value: '59', label: '59 kg' },
    { value: '60', label: '60 kg' }, { value: '70', label: '70 kg' },
  ],
  big_bag: [{ value: '1000', label: '1 M/T (1000 kg)' }],
}

export type QuantityValue = QuantityFields & { shipment_month: string }

/**
 * Bag type, quantity, bag weight and shipment month, with the live 60 kg
 * equivalent and total MT under them. The same control for the sample's own
 * quantity and every contract row, so bags and bulk behave identically
 * wherever a quantity is entered. Holds no rules of its own: the numbers,
 * the bulk cap and the bag-type change come from quantity-model.
 */
export function QuantityInputs({
  value,
  onChange,
  origin,
}: {
  value: QuantityValue
  /** Several fields at once (a bag-type change resets the quantity); apply in order. */
  onChange: (patch: Partial<QuantityValue>) => void
  origin?: string | null
}) {
  const id = useId()
  const isBulk = value.bag_type === 'bulk'
  const standardWeights = value.bag_type ? BAG_WEIGHTS[value.bag_type] ?? [] : []
  const [customWeight, setCustomWeight] = useState(
    () => !!value.bag_weight_kg && !isBulk && !standardWeights.some((w) => w.value === value.bag_weight_kg),
  )
  const q = contractQuantities(value)
  const overCap = isBulk && (q.bag_count ?? 0) > BULK_MAX_EQUIVALENT_BAGS

  // A bag type that arrived without a weight (a linked contract, a PSS)
  // takes its standard one, so the quantity resolves without a trip here.
  useEffect(() => {
    if (!value.bag_type || value.bag_weight_kg) return
    const weight = standardBagWeight(value.bag_type, origin)
    if (weight) onChange({ bag_weight_kg: weight })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.bag_type, value.bag_weight_kg])

  const [year, month] = (value.shipment_month || '').split('-')
  const setShipment = (nextYear: string | undefined, nextMonth: string | undefined) => {
    const now = new Date()
    onChange({
      shipment_month: `${nextYear || String(now.getFullYear())}-${nextMonth || String(now.getMonth() + 1).padStart(2, '0')}`,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-type`} className="text-xs text-muted-foreground">Type of bag *</Label>
          <Select
            value={value.bag_type}
            onValueChange={(next) => {
              setCustomWeight(false)
              onChange(bagTypeChange(value, next as QuantityFields['bag_type'], origin))
            }}
          >
            <SelectTrigger id={`${id}-type`} className="h-9">
              <SelectValue placeholder="Select bag type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jute_bag">Jute bags</SelectItem>
              <SelectItem value="pp_bag">PP bags</SelectItem>
              <SelectItem value="big_bag">Big bags (1 M/T)</SelectItem>
              <SelectItem value="bulk">Bulk</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-count`} className="text-xs text-muted-foreground">
            {isBulk ? 'Quantity (60 kg bag equivalents) *' : 'Qty of bags *'}
          </Label>
          <Input
            id={`${id}-count`}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            max={isBulk ? BULK_MAX_EQUIVALENT_BAGS : undefined}
            value={value.bag_count}
            onChange={(e) => onChange({ bag_count: e.target.value })}
            placeholder={isBulk ? `e.g. 340 (max ${BULK_MAX_EQUIVALENT_BAGS})` : 'e.g. 300'}
            aria-invalid={overCap || undefined}
            className={`h-9 ${overCap ? 'border-destructive' : ''}`}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-weight`} className="text-xs text-muted-foreground">Bag weight (kg) *</Label>
          {isBulk ? (
            <div className="flex h-9 items-center text-sm text-muted-foreground">60 kg equivalent</div>
          ) : !customWeight && standardWeights.length > 0 ? (
            <Select
              value={value.bag_weight_kg}
              onValueChange={(next) => {
                if (next === 'custom') {
                  setCustomWeight(true)
                  onChange({ bag_weight_kg: '' })
                } else {
                  onChange({ bag_weight_kg: next })
                }
              }}
            >
              <SelectTrigger id={`${id}-weight`} className="h-9">
                <SelectValue placeholder="Select weight" />
              </SelectTrigger>
              <SelectContent>
                {standardWeights.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
                <SelectItem value="custom">Custom weight...</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${id}-weight`}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={value.bag_weight_kg}
              onChange={(e) => onChange({ bag_weight_kg: e.target.value })}
              placeholder="e.g. 60"
              className="h-9"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Shipment month</Label>
          <div className="flex">
            <Select value={month ?? ''} onValueChange={(m) => setShipment(year, m)}>
              <SelectTrigger aria-label="Shipment month" className="h-9 w-[80px] rounded-r-none border-r-0">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year ?? ''} onValueChange={(y) => setShipment(y, month)}>
              <SelectTrigger aria-label="Shipment year" className="h-9 w-[90px] rounded-l-none">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {(year && !YEARS.includes(year) ? [year, ...YEARS] : YEARS).map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <QuantityReadout value={value} />
      {overCap && (
        <p className="text-xs text-destructive" role="alert">{quantityIssues(value)[0]}</p>
      )}
      {isBulk && !overCap && (
        <p className="text-xs text-muted-foreground">
          One bulk sample is one container: up to {BULK_MAX_EQUIVALENT_BAGS} × 60 kg bags ({BULK_MAX_MT} MT).
        </p>
      )}
    </div>
  )
}

/** The live 60 kg equivalent and total MT of a quantity, as the user types it. */
export function QuantityReadout({ value }: { value: QuantityFields }) {
  const q = contractQuantities(value)
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-1 rounded-lg bg-muted/40 px-4 py-2.5 text-sm" aria-live="polite">
      <div>
        <span className="text-muted-foreground">60 kg equivalent: </span>
        <span className="font-semibold" data-testid="quantity-equivalent">
          {q.equivalent_60kg_bags != null ? `${q.equivalent_60kg_bags} bags` : '—'}
        </span>
      </div>
      <div>
        <span className="text-muted-foreground">Total: </span>
        <span className="font-semibold" data-testid="quantity-mt">
          {q.bags_quantity_mt != null ? `${Number(q.bags_quantity_mt.toFixed(3))} MT` : '—'}
        </span>
      </div>
    </div>
  )
}

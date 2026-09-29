'use client'

import { useEffect, useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { FieldBox, PREFILLED_CONTROL, PREFILLED_SEGMENTED } from './field-box'
import { SegmentedControl } from './segmented-control'
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

type BagKind = 'jute_bag' | 'pp_bag' | 'big_bag'
const BAG_KINDS: { value: BagKind; label: string }[] = [
  { value: 'jute_bag', label: 'Jute' },
  { value: 'pp_bag', label: 'PP' },
  { value: 'big_bag', label: 'Big bag' },
]

export type QuantityValue = QuantityFields & { shipment_month: string }

/**
 * Bags or bulk, quantity, bag weight and shipment month. The same control for
 * the sample's own quantity and every contract row, so bags and bulk behave
 * identically wherever a quantity is entered. Bags / Bulk is the first
 * choice; bags then name their kind (jute, PP, big bag), which is what the
 * data stores. Holds no rules of its own: the numbers, the bulk cap and the
 * bag-type change come from quantity-model.
 */
export function QuantityInputs({
  value,
  onChange,
  origin,
  readout = true,
  prefilled = () => false,
  layout = 'stacked',
}: {
  value: QuantityValue
  /** Several fields at once (a bag-type change resets the quantity); apply in order. */
  onChange: (patch: Partial<QuantityValue>) => void
  origin?: string | null
  /** The live 60 kg equivalent and MT under the inputs. Off where a panel shows it instead. */
  readout?: boolean
  /** Whether a field still holds the linked contract's value (tagged and tinted, see field-box). */
  prefilled?: (key: keyof QuantityValue) => boolean
  /** 'row': packing and the numbers on one line from lg up (a full-width card). */
  layout?: 'stacked' | 'row'
}) {
  const id = useId()
  const isBulk = value.bag_type === 'bulk'
  const mode: 'bags' | 'bulk' | '' = isBulk ? 'bulk' : value.bag_type ? 'bags' : ''
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

  const changeType = (next: QuantityFields['bag_type']) => {
    if (next === value.bag_type) return
    setCustomWeight(false)
    onChange(bagTypeChange(value, next, origin))
  }

  const [year, month] = (value.shipment_month || '').split('-')
  const setShipment = (nextYear: string | undefined, nextMonth: string | undefined) => {
    const now = new Date()
    onChange({
      shipment_month: `${nextYear || String(now.getFullYear())}-${nextMonth || String(now.getMonth() + 1).padStart(2, '0')}`,
    })
  }

  return (
    <div className="space-y-4">
      <div className={cn('space-y-4', layout === 'row' && 'lg:flex lg:items-start lg:gap-6 lg:space-y-0')}>
        <div className={cn('flex flex-wrap items-end gap-x-6 gap-y-3', layout === 'row' && 'lg:flex-none')}>
          <FieldBox label="Packing" field="bag_type" required prefilled={prefilled('bag_type')}>
            <SegmentedControl
              ariaLabel="Packing"
              className={prefilled('bag_type') ? PREFILLED_SEGMENTED : undefined}
              value={mode}
              options={[{ value: 'bags', label: 'Bags' }, { value: 'bulk', label: 'Bulk' }]}
              onChange={(next) => changeType(next === 'bulk' ? 'bulk' : value.bag_type && value.bag_type !== 'bulk' ? value.bag_type : 'jute_bag')}
            />
          </FieldBox>
          {mode === 'bags' && (
            <FieldBox label="Bag">
              <SegmentedControl
                ariaLabel="Bag"
                className={prefilled('bag_type') ? PREFILLED_SEGMENTED : undefined}
                value={value.bag_type as BagKind}
                options={BAG_KINDS}
                onChange={changeType}
              />
            </FieldBox>
          )}
        </div>

        {/* In a row the numbers keep their own widths rather than stretching
            across the card (a quantity and a weight are a few digits). */}
        <div
          className={cn(
            'grid grid-cols-1 gap-4 sm:grid-cols-3',
            layout === 'row' && 'lg:flex-none',
            layout === 'row' && (isBulk ? 'lg:grid-cols-[16rem_11rem_15rem]' : 'lg:grid-cols-[11rem_11rem_15rem]'),
          )}
        >
          <FieldBox
            label={isBulk ? 'Quantity (60 kg bag equivalents)' : 'Qty of bags'}
            htmlFor={`${id}-count`}
            field="bag_count"
            required
            prefilled={prefilled('bag_count')}
          >
            <Input
              id={`${id}-count`}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              max={isBulk ? BULK_MAX_EQUIVALENT_BAGS : undefined}
              value={value.bag_count}
              onChange={(e) => onChange({ bag_count: e.target.value })}
              placeholder={isBulk ? `max ${BULK_MAX_EQUIVALENT_BAGS}` : 'e.g. 320'}
              disabled={!mode}
              aria-invalid={overCap || undefined}
              aria-describedby={isBulk ? `${id}-cap` : undefined}
              className={cn(
                'h-9 tabular-nums',
                prefilled('bag_count') && PREFILLED_CONTROL,
                overCap && 'border-[#ef4444] focus-visible:ring-[#ef4444]',
              )}
            />
          </FieldBox>

          <FieldBox label="Bag weight (kg)" htmlFor={`${id}-weight`} field="bag_weight" required={!isBulk} prefilled={prefilled('bag_weight_kg')}>
            {isBulk ? (
              <div className="flex h-9 items-center text-sm text-muted-foreground">60 kg equivalent</div>
            ) : !mode ? (
              <div className="flex h-9 items-center text-sm text-muted-foreground">Pick bags or bulk first</div>
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
                <SelectTrigger id={`${id}-weight`} className={cn('h-9', prefilled('bag_weight_kg') && PREFILLED_CONTROL)}>
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
                className={cn('h-9 tabular-nums', prefilled('bag_weight_kg') && PREFILLED_CONTROL)}
              />
            )}
          </FieldBox>

          <FieldBox label="Shipment month" prefilled={prefilled('shipment_month')}>
            <div className="flex">
              <Select value={month ?? ''} onValueChange={(m) => setShipment(year, m)}>
                <SelectTrigger aria-label="Shipment month" className={cn('h-9 flex-1 !rounded-r-none border-r-0', prefilled('shipment_month') && PREFILLED_CONTROL)}>
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={year ?? ''} onValueChange={(y) => setShipment(y, month)}>
                <SelectTrigger aria-label="Shipment year" className={cn('h-9 flex-1 !rounded-l-none', prefilled('shipment_month') && PREFILLED_CONTROL)}>
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {(year && !YEARS.includes(year) ? [year, ...YEARS] : YEARS).map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FieldBox>
        </div>
      </div>

      {isBulk && <BulkCapMeter id={`${id}-cap`} equivalents={q.bag_count} />}
      {overCap && (
        <p className="text-xs text-[#ef4444]" role="alert">{quantityIssues(value)[0]}</p>
      )}
      {readout && <QuantityReadout value={value} />}
    </div>
  )
}

/**
 * How much of one bulk container a sample fills: the cap is 360 × 60 kg bag
 * equivalents (21.6 MT), shown as the user types rather than as an error
 * after Create.
 */
export function BulkCapMeter({ equivalents, id }: { equivalents: number | null; id?: string }) {
  const eq = equivalents ?? 0
  const over = eq > BULK_MAX_EQUIVALENT_BAGS
  const pct = Math.min(100, (eq / BULK_MAX_EQUIVALENT_BAGS) * 100)
  const mt = Number(((eq * 60) / 1000).toFixed(3))
  return (
    <div id={id} className="space-y-1.5">
      <div className="h-1.5 w-full bg-muted" aria-hidden>
        <div className={cn('h-full transition-[width]', over ? 'bg-[#ef4444]' : 'bg-[#556b2f] dark:bg-[#a9b87a]')} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn('text-xs tabular-nums', over ? 'text-[#ef4444]' : 'text-muted-foreground')}>
        {eq} of {BULK_MAX_EQUIVALENT_BAGS} bag equivalents · {mt} of {BULK_MAX_MT} MT, one container
      </p>
    </div>
  )
}

/** The live 60 kg equivalent and total MT of a quantity, as the user types it. */
export function QuantityReadout({ value, className }: { value: QuantityFields; className?: string }) {
  const q = contractQuantities(value)
  return (
    <div className={cn('flex flex-wrap gap-x-8 gap-y-1 rounded-lg bg-muted/60 px-4 py-2.5 text-sm', className)} aria-live="polite">
      <div>
        <span className="text-muted-foreground">60 kg equivalent: </span>
        <span className="font-semibold tabular-nums" data-testid="quantity-equivalent">
          {q.equivalent_60kg_bags != null ? `${q.equivalent_60kg_bags} bags` : '—'}
        </span>
      </div>
      <div>
        <span className="text-muted-foreground">Total: </span>
        <span className="font-semibold tabular-nums" data-testid="quantity-mt">
          {q.bags_quantity_mt != null ? `${Number(q.bags_quantity_mt.toFixed(3))} MT` : '—'}
        </span>
      </div>
    </div>
  )
}

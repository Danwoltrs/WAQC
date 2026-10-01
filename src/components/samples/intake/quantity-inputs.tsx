'use client'

import { useEffect, useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CONTAINER_SIZES, countsEquivalents, maxMtPerBox } from '@/lib/container-quantity'
import { FieldBox, PREFILLED_CONTROL } from './field-box'
import { PackagingPicker, WeightPicker } from './packaging-picker'
import {
  boxFigures,
  contractQuantities,
  overBoxMessage,
  packagingChange,
  quantityIssues,
  quantitySummary,
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

/** Digits and one decimal point, a comma read as the point. */
function cleanDecimal(raw: string, decimals: boolean): string {
  const s = raw.replace(',', '.').replace(decimals ? /[^\d.]/g : /[^\d]/g, '')
  const dot = s.indexOf('.')
  return dot >= 0 ? s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '') : s
}

export type QuantityValue = QuantityFields & { shipment_month: string }

/**
 * Boxes · Container · Bags/box · MT/box · Packaging · Weight (bags only), then the
 * shipment month: a quantity entered the way sys.wolthers.com quotes a
 * contract. Bags per box defaults from the packaging and container and can be
 * typed over (decimals for bulk and big bags, which count 60 kg equivalents);
 * MT per box follows it, and typing an MT works the bags back from it. The
 * same control serves the sample's own quantity and every contract row. It
 * holds no rules of its own: the numbers and the limits come from
 * quantity-model.
 */
export function QuantityInputs({
  value,
  onChange,
  origin,
  readout = true,
  prefilled = () => false,
  layout = 'stacked',
  singleBox = false,
}: {
  value: QuantityValue
  /** Several fields at once (a packaging change resets the per-box figures); apply in order. */
  onChange: (patch: Partial<QuantityValue>) => void
  origin?: string | null
  /** The summary line under the inputs. Off where a panel shows it instead. */
  readout?: boolean
  /** Whether a field still holds the linked contract's value (tagged and tinted, see field-box). */
  prefilled?: (key: keyof QuantityValue) => boolean
  /** 'row': every input on one line from lg up (a full-width card). */
  layout?: 'stacked' | 'row'
  /** A shipment sample is the sample of one container: Boxes stays 1. */
  singleBox?: boolean
}) {
  const id = useId()
  const kind = value.bag_type || null
  const equivalents = countsEquivalents(kind)
  const f = boxFigures(value)
  const overBox = f.mtPerBox != null && f.mtPerBox > maxMtPerBox(f.size)
  // While the MT is being typed it shows exactly what was typed, so "19." survives a render.
  const [mtDraft, setMtDraft] = useState<string | null>(null)

  // A bag packaging that arrived without a weight (a linked contract, a PSS)
  // takes its standard one, so the quantity resolves without a trip here.
  useEffect(() => {
    if (!kind || equivalents || value.bag_weight_kg) return
    const weight = standardBagWeight(kind, origin)
    if (weight) onChange({ bag_weight_kg: weight })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, value.bag_weight_kg])

  useEffect(() => {
    if (singleBox && value.container_count !== '1') onChange({ container_count: '1' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleBox, value.container_count])

  const tint = (key: keyof QuantityValue) => prefilled(key) && PREFILLED_CONTROL
  const [year, month] = (value.shipment_month || '').split('-')
  const setShipment = (nextYear: string | undefined, nextMonth: string | undefined) => {
    const now = new Date()
    onChange({
      shipment_month: `${nextYear || String(now.getFullYear())}-${nextMonth || String(now.getMonth() + 1).padStart(2, '0')}`,
    })
  }

  const mtShown = mtDraft ?? (f.mtPerBox != null ? String(f.mtPerBox) : '')
  const issues = kind ? quantityIssues(value) : []

  return (
    <div className="space-y-3">
      <div className={cn('flex flex-wrap items-end gap-x-3 gap-y-3', layout === 'row' && 'lg:flex-nowrap')}>
        <FieldBox label="Boxes" htmlFor={`${id}-boxes`} field="container_count" required prefilled={prefilled('container_count')} className="w-[5.5rem] flex-none">
          <Input
            id={`${id}-boxes`}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={value.container_count}
            onChange={(e) => onChange({ container_count: cleanDecimal(e.target.value, false) })}
            placeholder="1"
            disabled={singleBox}
            title={singleBox ? 'A shipment sample is the sample of one container' : undefined}
            className={cn('h-9 text-right tabular-nums', tint('container_count'))}
          />
        </FieldBox>

        <FieldBox label="Container" field="container_size" prefilled={prefilled('container_size')} className="w-[5.5rem] flex-none">
          <Select
            value={f.size}
            onValueChange={(size) => onChange({ container_size: size, bags_per_box: '', mt_per_box: '' })}
          >
            <SelectTrigger aria-label="Container size" className={cn('h-9 tabular-nums', tint('container_size'))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTAINER_SIZES.map((size) => (
                <SelectItem key={size} value={size}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldBox>

        <FieldBox
          label={equivalents ? 'Bags eq./box' : 'Bags/box'}
          htmlFor={`${id}-bpb`}
          field="bags_per_box"
          prefilled={prefilled('bags_per_box')}
          className="w-[6.5rem] flex-none"
        >
          <Input
            id={`${id}-bpb`}
            type="text"
            inputMode={equivalents ? 'decimal' : 'numeric'}
            value={value.bags_per_box}
            onChange={(e) => onChange({ bags_per_box: cleanDecimal(e.target.value, equivalents), mt_per_box: '' })}
            onBlur={() => {
              if (value.bags_per_box && Number(value.bags_per_box) === f.defaultBagsPerBox) onChange({ bags_per_box: '' })
            }}
            placeholder={f.bagsPerBox != null ? String(f.bagsPerBox) : '—'}
            disabled={!kind}
            title={
              equivalents
                ? '60 kg bag equivalents per container (decimals allowed). Clear it to use the default.'
                : 'Bags per container. Clear it to use the default for the bag weight and container.'
            }
            className={cn(
              'h-9 text-right tabular-nums placeholder:italic placeholder:text-muted-foreground/60',
              tint('bags_per_box'),
            )}
          />
        </FieldBox>

        <FieldBox label="MT/box" htmlFor={`${id}-mt`} field="mt_per_box" prefilled={prefilled('mt_per_box')} className="w-[6.5rem] flex-none">
          <Input
            id={`${id}-mt`}
            type="text"
            inputMode="decimal"
            value={mtShown}
            onChange={(e) => {
              const typed = cleanDecimal(e.target.value, true)
              setMtDraft(typed)
              onChange({ mt_per_box: typed, bags_per_box: '' })
            }}
            onBlur={() => {
              setMtDraft(null)
              // An MT equal to the default's is no override at all.
              if (value.mt_per_box && f.defaultBagsPerBox && f.unitKg) {
                const defaultMt = Number(((f.defaultBagsPerBox * f.unitKg) / 1000).toFixed(3))
                if (Number(value.mt_per_box) === defaultMt) onChange({ mt_per_box: '' })
              }
            }}
            placeholder="—"
            disabled={!kind}
            aria-invalid={overBox || undefined}
            title="Metric tonnes per container. Typing it works the bags per box back from it."
            className={cn(
              'h-9 text-right tabular-nums',
              tint('mt_per_box'),
              overBox && 'border-[#ef4444] focus-visible:ring-[#ef4444]',
            )}
          />
        </FieldBox>

        <FieldBox label="Packaging" field="bag_type" required prefilled={prefilled('bag_type')} className="w-[11rem] flex-none">
          <PackagingPicker
            value={{ bag_type: value.bag_type, bag_liner: value.bag_liner }}
            onChange={(next) => onChange(packagingChange(value, next, origin))}
            className={cn(tint('bag_type'))}
          />
        </FieldBox>

        {kind && !equivalents && (
          <FieldBox label="Weight" field="bag_weight" required prefilled={prefilled('bag_weight_kg')} className="w-[8.5rem] flex-none">
            <WeightPicker
              value={value.bag_weight_kg}
              onChange={(kg) => onChange({ bag_weight_kg: kg, bags_per_box: '', mt_per_box: '' })}
              className={cn(tint('bag_weight_kg'))}
            />
          </FieldBox>
        )}

        <FieldBox label="Shipment month" prefilled={prefilled('shipment_month')} className={cn('w-[13rem] flex-none', layout === 'row' && 'lg:ml-3')}>
          <div className="flex">
            <Select value={month ?? ''} onValueChange={(m) => setShipment(year, m)}>
              <SelectTrigger aria-label="Shipment month" className={cn('h-9 flex-1 !rounded-r-none border-r-0', tint('shipment_month'))}>
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year ?? ''} onValueChange={(y) => setShipment(y, month)}>
              <SelectTrigger aria-label="Shipment year" className={cn('h-9 flex-1 !rounded-l-none', tint('shipment_month'))}>
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

      {overBox && (
        <p className="text-xs text-[#ef4444]" role="alert">{overBoxMessage(f.size)}</p>
      )}
      {readout && <QuantityReadout value={value} issues={issues.filter((i) => i !== overBoxMessage(f.size))} />}
    </div>
  )
}

/**
 * The sys-style summary of a quantity as the user types it:
 * "3 × 20' Jute 59 kg · 325 bags/box · 19.175 MT/box = 975 bags · 57.525 MT".
 */
export function QuantityReadout({
  value,
  issues = [],
  className,
}: {
  value: QuantityFields
  issues?: string[]
  className?: string
}) {
  const line = quantitySummary(value)
  const q = contractQuantities(value)
  return (
    <p
      className={cn('text-sm tabular-nums', issues.length && !line ? 'text-[#ef4444]' : 'text-muted-foreground', className)}
      aria-live="polite"
      data-testid="quantity-summary"
      data-mt={q.bags_quantity_mt ?? undefined}
    >
      {line ?? (issues.length ? `Still needed: ${issues.join(', ')}` : 'Pick a packaging to see the totals')}
    </p>
  )
}

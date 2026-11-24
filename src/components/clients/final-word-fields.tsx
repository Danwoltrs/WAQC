'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { DestinationPicker } from '@/components/seller-requests/destination-picker'
import type { DestinationOption } from '@/lib/seller-requests/destinations'
import type {
  BuyerSampleDestination, FinalWord, FinalWordOverrides, FinalWordSettings, StuffingRule,
} from '@/lib/seller-requests/types'

interface Props {
  value: FinalWordOverrides
  onChange: (v: FinalWordOverrides) => void
  /** Quality rows: the buyer's settings. Each field then has an "as {client}" choice that writes null. */
  inherit?: FinalWordSettings | null
  clientId: string
  clientName: string
}

const AS_CLIENT = 'inherit'

const STUFFING: { value: StuffingRule; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'prechecked', label: 'Pre-checked' },
  { value: 'fixed_on', label: 'Fixed on' },
]

/** The final word, its Fixed lock, the buyer sample address and the stuffing request. */
export function FinalWordFields({ value, onChange, inherit, clientId, clientName }: Props) {
  const inheriting = !!inherit
  const asClient = `as ${clientName}`
  const [options, setOptions] = useState<DestinationOption[] | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/companies/${clientId}/sample-destinations`)
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((j) => { if (live) setOptions(j.options ?? []) })
      .catch(() => { if (live) setOptions([]) })
    return () => { live = false }
  }, [clientId])

  const patch = (p: Partial<FinalWordOverrides>) => onChange({ ...value, ...p })

  // `fixed` belongs to whichever level supplies the final word: on a quality
  // row it is only usable once the quality sets its own.
  const finalWordInherited = inheriting && value.finalWord === null
  const stuffingValue = value.stuffing ?? (inheriting ? AS_CLIENT : 'off')

  const picked: BuyerSampleDestination | null =
    value.addressId && options
      ? options.find((o) => o.destination.savedAddressId === value.addressId)?.destination ?? null
      : null
  const addressMissing = !!value.addressId && options !== null && !picked

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Final word</Label>
        <RadioGroup
          value={value.finalWord ?? (inheriting ? AS_CLIENT : 'wolthers')}
          onValueChange={(v) => {
            if (v === AS_CLIENT) onChange({ ...value, finalWord: null, fixed: null })
            else patch({ finalWord: v as FinalWord })
          }}
        >
          {inheriting && <Choice id="fw-inherit" value={AS_CLIENT} label={asClient} />}
          <Choice id="fw-wolthers" value="wolthers" label="Wolthers: our approval is final" />
          <Choice id="fw-pre" value="pre_approval" label={`Pre-approval: seller sends a sample to ${clientName}, ${clientName} decides`} />
        </RadioGroup>
        <div className="flex items-center gap-2">
          <Checkbox
            id="fw-fixed"
            checked={!!value.fixed}
            disabled={finalWordInherited}
            onCheckedChange={(c) => patch({ fixed: c === true })}
          />
          <Label htmlFor="fw-fixed" className="text-sm font-normal">Fixed</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Fixed locks the choice: the seller email cannot change it.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Sample address</Label>
        <div className="flex items-center gap-2">
          <DestinationPicker
            clientId={clientId}
            clientName={clientName}
            importerId={null}
            roasterId={null}
            value={picked}
            onChange={(d) => patch({ addressId: d.savedAddressId })}
          />
          {inheriting && value.addressId && (
            <Button type="button" variant="ghost" size="sm" onClick={() => patch({ addressId: null })}>
              {asClient}
            </Button>
          )}
        </div>
        {addressMissing && <p className="text-xs text-muted-foreground">Address no longer on file</p>}
        {!value.addressId && (
          <p className="text-xs text-muted-foreground">
            {inheriting ? asClient : `Falls through to ${clientName}'s company address`}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Stuffing request</Label>
        <RadioGroup
          value={stuffingValue}
          onValueChange={(v) => patch({ stuffing: v === AS_CLIENT ? null : (v as StuffingRule) })}
        >
          {inheriting && <Choice id="st-inherit" value={AS_CLIENT} label={asClient} />}
          {STUFFING.map((s) => <Choice key={s.value} id={`st-${s.value}`} value={s.value} label={s.label} />)}
        </RadioGroup>
      </div>
    </div>
  )
}

function Choice({ id, value, label }: { id: string; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem id={id} value={value} />
      <Label htmlFor={id} className="text-sm font-normal">{label}</Label>
    </div>
  )
}

/** The one-line read-out: "as Blaser", "Pre-approval · fixed", "Wolthers". */
export function finalWordSummary(v: FinalWordOverrides, clientName: string): string {
  if (v.finalWord === null) return `as ${clientName}`
  return v.finalWord === 'pre_approval'
    ? `Pre-approval${v.fixed ? ' · fixed' : ''}`
    : `Wolthers${v.fixed ? ' · fixed' : ''}`
}

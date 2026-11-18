"use client"

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import type { SellerRequestState } from '@/lib/seller-requests/store'
import type { BuyerSampleDestination, SellerRequests } from '@/lib/seller-requests/types'

interface Props {
  members: SellerRequestState[]
  value: Record<string, SellerRequests>
  onChange: (next: Record<string, SellerRequests>) => void
}

function destinationLine(d: BuyerSampleDestination): string {
  return `${d.companyName} · ${d.lines.join(', ')}${d.country ? ', ' + d.country : ''}`
}

/**
 * The two seller requests a master cupper can make at finalize, one row per
 * contract (one samples row per contract). Locked boxes come from the buyer's /
 * quality's final-word settings and say why.
 */
export function SellerRequestTicks({ members, value, onChange }: Props) {
  const several = members.length > 1
  // Buyer-sample ticked on while no destination is picked yet (the picker comes
  // next); the saved value stays null until one is chosen.
  const [ticked, setTicked] = useState<Set<string>>(() => new Set())

  const update = (id: string, patch: Partial<SellerRequests>) => {
    const current = value[id]
    if (!current) return
    onChange({ ...value, [id]: { ...current, ...patch } })
  }

  return (
    <div className="space-y-3">
      {members.map((m) => {
        const current = value[m.sampleId] ?? m.requests
        const buyerOn = current.buyerSample !== null || ticked.has(m.sampleId)
        return (
          <div key={m.sampleId} className="space-y-2">
            {several && (
              <p className="text-xs font-medium">{m.contractNumber ?? ''} · {m.clientName ?? ''}</p>
            )}
            <Row
              id={`sr-buyer-${m.sampleId}`}
              label="Send sample to buyer"
              checked={buyerOn}
              locked={m.locks.buyerSample.locked}
              reason={m.locks.buyerSample.reason}
              onChange={(on) => {
                if (on) {
                  setTicked((t) => new Set(t).add(m.sampleId))
                  update(m.sampleId, { buyerSample: m.requests.buyerSample })
                } else {
                  setTicked((t) => { const n = new Set(t); n.delete(m.sampleId); return n })
                  update(m.sampleId, { buyerSample: null })
                }
              }}
            />
            {buyerOn && (
              <p className="pl-6 text-xs text-muted-foreground">
                {current.buyerSample ? destinationLine(current.buyerSample) : 'Pick where the sample goes'}
              </p>
            )}
            <Row
              id={`sr-stuffing-${m.sampleId}`}
              label="Inform stuffing date/time/place"
              checked={current.stuffing}
              locked={m.locks.stuffing.locked}
              reason={m.locks.stuffing.reason}
              onChange={(on) => update(m.sampleId, { stuffing: on })}
            />
          </div>
        )
      })}
    </div>
  )
}

function Row({ id, label, checked, locked, reason, onChange }: {
  id: string; label: string; checked: boolean; locked: boolean; reason: string | null
  onChange: (on: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Checkbox
        id={id}
        aria-label={label}
        checked={checked}
        disabled={locked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <label htmlFor={id} className="text-sm">{label}</label>
      {locked && reason && <span className="text-xs text-muted-foreground">{reason}</span>}
    </div>
  )
}

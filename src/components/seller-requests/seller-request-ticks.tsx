"use client"

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { DestinationPicker } from '@/components/seller-requests/destination-picker'
import type { SellerRequestState } from '@/lib/seller-requests/store'
import type { SellerRequests, TickLocks } from '@/lib/seller-requests/types'

/** One contract's ticks: its starting values, its locks and who the buyer is. */
export interface RequestMember {
  sampleId: string
  /** Shown above the rows; null shows none. */
  heading: string | null
  /** The stored-or-starting values; ticking buyer sample back on restores this destination. */
  requests: SellerRequests
  locks: TickLocks
  clientId: string | null
  clientName: string | null
  importerId: string | null
  roasterId: string | null
}

interface RowsProps {
  members: RequestMember[]
  value: Record<string, SellerRequests>
  onChange: (next: Record<string, SellerRequests>) => void
  /** Members with buyer sample ticked on while no destination is picked yet;
   *  their value stays null until one is chosen. */
  pending: ReadonlySet<string>
  onPendingChange: (next: Set<string>) => void
}

/**
 * The two seller requests, one block per contract (one samples row per
 * contract): "Send sample to buyer" with the destination picker while ticked,
 * and "Inform stuffing date/time/place". Locked boxes come from the buyer's /
 * quality's final-word settings and say why; a locked buyer sample can still
 * change its address. Controlled, so the composer can hold Send while a ticked
 * buyer sample has no destination.
 */
export function SellerRequestRows({ members, value, onChange, pending, onPendingChange }: RowsProps) {
  const update = (id: string, patch: Partial<SellerRequests>) => {
    const current = value[id]
    if (!current) return
    onChange({ ...value, [id]: { ...current, ...patch } })
  }
  const setPending = (id: string, on: boolean) => {
    const next = new Set(pending)
    if (on) next.add(id)
    else next.delete(id)
    onPendingChange(next)
  }

  return (
    <div className="space-y-3">
      {members.map((m) => {
        const current = value[m.sampleId] ?? m.requests
        const buyerOn = current.buyerSample !== null || pending.has(m.sampleId)
        return (
          <div key={m.sampleId} className="space-y-2">
            {m.heading && <p className="text-xs font-medium">{m.heading}</p>}
            <Row
              id={`sr-buyer-${m.sampleId}`}
              label="Send sample to buyer"
              checked={buyerOn}
              locked={m.locks.buyerSample.locked}
              reason={m.locks.buyerSample.reason}
              onChange={(on) => {
                // Back on: the starting destination, else wait for a pick.
                const start = on ? m.requests.buyerSample : null
                setPending(m.sampleId, on && start === null)
                update(m.sampleId, { buyerSample: start })
              }}
            />
            {buyerOn && (
              <div className="pl-6">
                <DestinationPicker
                  clientId={m.clientId}
                  clientName={m.clientName}
                  importerId={m.importerId}
                  roasterId={m.roasterId}
                  value={current.buyerSample}
                  onChange={(d) => {
                    setPending(m.sampleId, false)
                    update(m.sampleId, { buyerSample: d })
                  }}
                />
              </div>
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

interface Props {
  members: SellerRequestState[]
  value: Record<string, SellerRequests>
  onChange: (next: Record<string, SellerRequests>) => void
}

/** The finalize modal's ticks: one row per contract, a heading only when the lot has several. */
export function SellerRequestTicks({ members, value, onChange }: Props) {
  const several = members.length > 1
  const [pending, setPending] = useState<Set<string>>(() => new Set())
  // A fresh members list (the modal reloaded the lot) starts with nothing pending.
  const [seen, setSeen] = useState(members)
  if (seen !== members) {
    setSeen(members)
    setPending(new Set())
  }

  const rows: RequestMember[] = members.map((m) => ({
    sampleId: m.sampleId,
    heading: several ? `${m.contractNumber ?? ''} · ${m.clientName ?? ''}` : null,
    requests: m.requests,
    locks: m.locks,
    clientId: m.clientId,
    clientName: m.clientName,
    importerId: m.importerId,
    roasterId: m.roasterId,
  }))

  return (
    <SellerRequestRows members={rows} value={value} onChange={onChange} pending={pending} onPendingChange={setPending} />
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

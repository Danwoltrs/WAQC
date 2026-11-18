"use client"

import { Checkbox } from '@/components/ui/checkbox'
import { DestinationPicker } from '@/components/seller-requests/destination-picker'
import type { SellerRequestState } from '@/lib/seller-requests/store'
import { buyerSampleOn, type RequestMember } from '@/lib/seller-requests/tick-state'
import type { SellerRequests } from '@/lib/seller-requests/types'

export type { RequestMember }

interface RowsProps {
  members: RequestMember[]
  value: Record<string, SellerRequests>
  onChange: (next: Record<string, SellerRequests>) => void
  /** Members with buyer sample ticked on while no destination is picked yet;
   *  their value stays null until one is chosen. */
  pending: ReadonlySet<string>
  onPendingChange: (next: Set<string>) => void
  /** Everything read-only (a send or finalize in flight). */
  disabled?: boolean
}

/** The finalize modal's members: a heading (contract · client) only when the lot has several. */
export function stateMembers(states: SellerRequestState[]): RequestMember[] {
  const several = states.length > 1
  return states.map((m) => ({
    sampleId: m.sampleId,
    heading: several ? `${m.contractNumber ?? ''} · ${m.clientName ?? ''}` : null,
    requests: m.requests,
    locks: m.locks,
    clientId: m.clientId,
    clientName: m.clientName,
    importerId: m.importerId,
    roasterId: m.roasterId,
  }))
}

/**
 * The two seller requests, one block per contract (one samples row per
 * contract): "Send sample to buyer" with the destination picker while ticked,
 * and "Inform stuffing date/time/place". Locked boxes come from the buyer's /
 * quality's final-word settings and say why; a locked buyer sample can still
 * change its address. Controlled: the parent owns the pending set, so it can
 * hold Send / Finalize while a ticked buyer sample has no destination
 * (`missingDestination`).
 */
export function SellerRequestRows({ members, value, onChange, pending, onPendingChange, disabled = false }: RowsProps) {
  const several = members.length > 1
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
        const buyerOn = buyerSampleOn(m, value, pending)
        const grouped = several && !!m.heading
        return (
          <div
            key={m.sampleId}
            className="space-y-2"
            role={grouped ? 'group' : undefined}
            aria-label={grouped ? m.heading! : undefined}
          >
            {m.heading && <p className="text-xs font-medium">{m.heading}</p>}
            <Row
              id={`sr-buyer-${m.sampleId}`}
              label="Send sample to buyer"
              checked={buyerOn}
              locked={m.locks.buyerSample.locked}
              disabled={disabled}
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
                  disabled={disabled}
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
              disabled={disabled}
              reason={m.locks.stuffing.reason}
              onChange={(on) => update(m.sampleId, { stuffing: on })}
            />
          </div>
        )
      })}
    </div>
  )
}

function Row({ id, label, checked, locked, disabled, reason, onChange }: {
  id: string; label: string; checked: boolean; locked: boolean; disabled: boolean; reason: string | null
  onChange: (on: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Checkbox
        id={id}
        aria-label={label}
        checked={checked}
        disabled={locked || disabled}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <label htmlFor={id} className="text-sm">{label}</label>
      {locked && reason && <span className="text-xs text-muted-foreground">{reason}</span>}
    </div>
  )
}

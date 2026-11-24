"use client"

import { Checkbox } from '@/components/ui/checkbox'
import { DestinationPicker } from '@/components/seller-requests/destination-picker'
import { cn } from '@/lib/utils'
import type { SellerRequestState } from '@/lib/seller-requests/store'
import { buyerSampleOn, finalClientOn, type RequestMember } from '@/lib/seller-requests/tick-state'
import type { FinalClientPurpose, SellerRequests } from '@/lib/seller-requests/types'

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
  /** Two columns from `md` up: the samples to send on the left, the lab
   *  requests on the right. The send composer is wide; the finalize modal is not. */
  columns?: boolean
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

const PURPOSES: Array<{ value: FinalClientPurpose; label: string }> = [
  { value: 'pre_approval', label: 'Our pre-approval' },
  { value: 'final_approval', label: "Final client's approval" },
]

/**
 * The seller requests, one block per contract (one samples row per contract):
 * "Send sample to buyer" and "Send sample to final client", each with the
 * destination picker while ticked (the final client also says why: our
 * pre-approval or their approval), then "Send additional sample to Wolthers
 * lab", "Send one shipment sample of each container" and "Inform stuffing
 * date/time/place". Locked boxes come from the buyer's / quality's final-word
 * settings and say why; a locked buyer sample can still change its address.
 * Controlled: the parent owns the pending set, so it can hold Send / Finalize
 * while a ticked sample has no destination (`missingDestination`).
 */
export function SellerRequestRows({
  members, value, onChange, pending, onPendingChange, disabled = false, columns = false,
}: RowsProps) {
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
    <div className="space-y-4">
      {members.map((m) => {
        const current = value[m.sampleId] ?? m.requests
        const buyerOn = buyerSampleOn(m, value, pending)
        const finalOn = finalClientOn(m, value)
        const finalClient = current.finalClientSample ?? null
        const grouped = several && !!m.heading
        const picker = (pickerValue: typeof current.buyerSample, onPick: (d: NonNullable<typeof pickerValue>) => void) => (
          <DestinationPicker
            clientId={m.clientId}
            clientName={m.clientName}
            importerId={m.importerId}
            roasterId={m.roasterId}
            value={pickerValue}
            disabled={disabled}
            onChange={onPick}
          />
        )
        return (
          <div
            key={m.sampleId}
            className="space-y-2"
            role={grouped ? 'group' : undefined}
            aria-label={grouped ? m.heading! : undefined}
          >
            {m.heading && <p className="text-xs font-medium">{m.heading}</p>}
            <div className={cn('grid gap-x-8 gap-y-2', columns && 'md:grid-cols-2')}>
              <div className="space-y-2">
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
                    {picker(current.buyerSample, (d) => {
                      setPending(m.sampleId, false)
                      update(m.sampleId, { buyerSample: d })
                    })}
                  </div>
                )}
                <Row
                  id={`sr-final-${m.sampleId}`}
                  label="Send sample to final client"
                  checked={finalOn}
                  locked={false}
                  disabled={disabled}
                  reason={null}
                  onChange={(on) =>
                    // Back on: the stored one, else a pre-approval waiting for its address.
                    update(m.sampleId, {
                      finalClientSample: on
                        ? m.requests.finalClientSample ?? { destination: null, purpose: 'pre_approval' }
                        : null,
                    })
                  }
                />
                {finalOn && finalClient && (
                  <div className="space-y-2 pl-6">
                    <PurposeToggle
                      value={finalClient.purpose}
                      disabled={disabled}
                      onChange={(purpose) => update(m.sampleId, { finalClientSample: { ...finalClient, purpose } })}
                    />
                    {picker(finalClient.destination, (d) =>
                      update(m.sampleId, { finalClientSample: { ...finalClient, destination: d } }),
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Row
                  id={`sr-additional-${m.sampleId}`}
                  label="Send additional sample to Wolthers lab"
                  checked={!!current.additionalSample}
                  locked={false}
                  disabled={disabled}
                  reason={null}
                  onChange={(on) => update(m.sampleId, { additionalSample: on })}
                />
                <Row
                  id={`sr-ss-${m.sampleId}`}
                  label="Send one shipment sample of each container"
                  checked={!!current.ssPerContainer}
                  locked={false}
                  disabled={disabled}
                  reason={null}
                  onChange={(on) => update(m.sampleId, { ssPerContainer: on })}
                />
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
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Why the final client gets the sample; sets the line the seller reads. */
function PurposeToggle({ value, disabled, onChange }: {
  value: FinalClientPurpose; disabled: boolean; onChange: (v: FinalClientPurpose) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Why the final client gets the sample"
      className="inline-flex overflow-hidden rounded-[4px] border border-black/10 dark:border-white/15"
    >
      {PURPOSES.map((p) => (
        <button
          key={p.value}
          type="button"
          role="radio"
          aria-checked={value === p.value}
          disabled={disabled}
          onClick={() => onChange(p.value)}
          className={cn(
            'px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
            value === p.value ? 'bg-primary text-primary-foreground' : 'opacity-70 hover:bg-black/5 dark:hover:bg-white/10',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

function Row({ id, label, checked, locked, disabled, reason, onChange }: {
  id: string; label: string; checked: boolean; locked: boolean; disabled: boolean; reason: string | null
  onChange: (on: boolean) => void
}) {
  // The box stays beside the first line of a long label; a lock's reason sits under the label.
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        aria-label={label}
        checked={checked}
        disabled={locked || disabled}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm">{label}</label>
        {locked && reason && <div className="text-xs text-muted-foreground">{reason}</div>}
      </div>
    </div>
  )
}

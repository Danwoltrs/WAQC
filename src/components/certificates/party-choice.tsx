'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { partyLabel } from '@/lib/approval-notification/batch-send'
import type { PartyOption } from '@/lib/approval-notification/certificate-parties'
import { ALL_PARTIES, type CertificateParty } from '@/lib/approval-notification/types'

interface ChoiceProps {
  value: CertificateParty[]
  onChange: (next: CertificateParty[]) => void
  /** The parties present on the selection, in display order. Without it all four are listed. */
  options?: PartyOption[]
}

/** "<Party> · A, B +N": the first two company names, then how many more. */
function optionLabel({ party, companies }: PartyOption): string {
  const names = companies.slice(0, 2).map((c) => c.name).join(', ')
  const more = companies.length - 2
  return `${partyLabel(party)} · ${names}${more > 0 ? ` +${more}` : ''}`
}

/** Which parties get an email. The client is always one of them. */
export function PartyChoice({ value, onChange, options }: ChoiceProps) {
  const rows = options
    ? options.map((o) => ({ party: o.party, label: optionLabel(o) }))
    : ALL_PARTIES.map((p) => ({ party: p, label: partyLabel(p) }))
  const listed = rows.map((r) => r.party)
  // Without options the client is always a recipient; with options only when it is listed.
  const clientLocked = !options || listed.includes('buyer')
  const all = listed.every((p) => value.includes(p))

  const emit = (next: Set<CertificateParty>) => {
    if (clientLocked) next.add('buyer')
    onChange(ALL_PARTIES.filter((p) => next.has(p)))
  }
  const toggleAll = () => {
    const next = new Set(value)
    for (const p of listed) {
      if (all) next.delete(p)
      else next.add(p)
    }
    emit(next)
  }
  const toggle = (party: CertificateParty) => {
    if (party === 'buyer' && clientLocked) return
    const next = new Set(value)
    if (next.has(party)) next.delete(party)
    else next.add(party)
    emit(next)
  }

  return (
    <div className="rounded-lg border border-black/10 px-4 py-3 dark:border-white/15">
      <label className="flex cursor-pointer items-center gap-3 py-1 text-sm font-semibold">
        <Checkbox checked={all} onCheckedChange={toggleAll} />
        All parties
      </label>
      {rows.map(({ party, label }) => (
        <label key={party} className="flex cursor-pointer items-center gap-3 py-1 pl-6 text-sm">
          <Checkbox
            checked={party === 'buyer' && clientLocked ? true : value.includes(party)}
            disabled={party === 'buyer' && clientLocked}
            onCheckedChange={() => toggle(party)}
          />
          {label}
        </label>
      ))}
    </div>
  )
}

interface StepProps {
  count: number
  onContinue: (parties: CertificateParty[], includeSent: boolean) => void
}

/**
 * @deprecated Selection mode's old first step. The Send popover replaces it; kept only until
 * batch-approval-send-view drops it (Task 5).
 */
export function PartyStep({ count, onContinue }: StepProps) {
  const [parties, setParties] = useState<CertificateParty[]>([...ALL_PARTIES])
  const [includeSent, setIncludeSent] = useState(false)

  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <h3 className="text-sm font-semibold">Who should receive them</h3>
      <p className="mt-1 text-xs opacity-60">
        Clients first, then importers and roasters. Sellers follow, one email for each client.
      </p>
      <div className="mt-4">
        <PartyChoice value={parties} onChange={setParties} />
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm">
        <Checkbox checked={includeSent} onCheckedChange={(c) => setIncludeSent(c === true)} />
        Include already sent
      </label>
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-xs opacity-60">
          {count} certificate{count === 1 ? '' : 's'} selected
        </span>
        <Button type="button" onClick={() => onContinue(parties, includeSent)}>
          Continue
        </Button>
      </div>
    </div>
  )
}

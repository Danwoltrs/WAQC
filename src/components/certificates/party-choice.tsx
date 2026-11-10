'use client'

import { useState } from 'react'
import { partyLabel } from '@/lib/approval-notification/batch-send'
import { ALL_PARTIES, type CertificateParty } from '@/lib/approval-notification/types'

interface ChoiceProps {
  value: CertificateParty[]
  onChange: (next: CertificateParty[]) => void
}

/** Which parties get an email. The client is always one of them. */
export function PartyChoice({ value, onChange }: ChoiceProps) {
  const all = ALL_PARTIES.every((p) => value.includes(p))

  const toggleAll = () => onChange(all ? ['buyer'] : [...ALL_PARTIES])
  const toggle = (party: CertificateParty) => {
    if (party === 'buyer') return
    const next = value.includes(party) ? value.filter((p) => p !== party) : [...value, party]
    onChange(ALL_PARTIES.filter((p) => next.includes(p)))
  }

  return (
    <div className="rounded-[16px] border border-black/10 px-4 py-3 dark:border-white/15">
      <label className="flex cursor-pointer items-center gap-3 py-1 text-sm font-semibold">
        <input type="checkbox" checked={all} onChange={toggleAll} />
        All parties
      </label>
      {ALL_PARTIES.map((party) => (
        <label key={party} className="flex cursor-pointer items-center gap-3 py-1 pl-6 text-sm">
          <input
            type="checkbox"
            checked={value.includes(party)}
            disabled={party === 'buyer'}
            onChange={() => toggle(party)}
          />
          {partyLabel(party)}
        </label>
      ))}
    </div>
  )
}

interface StepProps {
  count: number
  onContinue: (parties: CertificateParty[], includeSent: boolean) => void
}

/** Selection mode's first step: the parties, and whether to repeat sends. */
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
        <input type="checkbox" checked={includeSent} onChange={(e) => setIncludeSent(e.target.checked)} />
        Include already sent
      </label>
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-xs opacity-60">
          {count} certificate{count === 1 ? '' : 's'} selected
        </span>
        <button
          type="button"
          onClick={() => onContinue(parties, includeSent)}
          className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

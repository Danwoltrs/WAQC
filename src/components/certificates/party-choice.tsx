'use client'

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

/** Which parties get an email. Any of them can be left out, the client included;
 *  the caller refuses an empty choice. */
export function PartyChoice({ value, onChange, options }: ChoiceProps) {
  const rows = options
    ? options.map((o) => ({ party: o.party, label: optionLabel(o) }))
    : ALL_PARTIES.map((p) => ({ party: p, label: partyLabel(p) }))
  const listed = rows.map((r) => r.party)
  const all = listed.every((p) => value.includes(p))

  const emit = (next: Set<CertificateParty>) => onChange(ALL_PARTIES.filter((p) => next.has(p)))
  const toggleAll = () => {
    const next = new Set(value)
    for (const p of listed) {
      if (all) next.delete(p)
      else next.add(p)
    }
    emit(next)
  }
  const toggle = (party: CertificateParty) => {
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
          <Checkbox checked={value.includes(party)} onCheckedChange={() => toggle(party)} />
          {label}
        </label>
      ))}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { PartyChoice } from '@/components/certificates/party-choice'
import type { QcClientOption } from '@/lib/approval-notification/qc-client-filter'
import { ALL_PARTIES, type CertificateParty } from '@/lib/approval-notification/types'

interface Props {
  clients: QcClientOption[]
  onContinue: (clientIds: string[], parties: CertificateParty[]) => void
}

/**
 * First step of "Send unsent": which QC clients to email, and to which parties.
 * Every client with something left to send starts ticked. Their emails go
 * first, then importers and roasters; the sellers follow last, one email for
 * each QC client kept, so a seller supplying several clients gets one per client.
 */
export function QcClientStep({ clients, onContinue }: Props) {
  const [parties, setParties] = useState<CertificateParty[]>([...ALL_PARTIES])
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(clients.map((c) => c.id)))

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const kept = clients.filter((c) => chosen.has(c.id))
  const certificates = kept.reduce((sum, c) => sum + c.certificates, 0)

  return (
    <div className="mx-auto w-full max-w-xl p-6">
      <h3 className="text-sm font-semibold">QC clients</h3>
      <p className="mt-1 text-xs opacity-60">
        Clients first, then importers and roasters. Sellers follow, one email for each client.
      </p>

      <div className="mt-4">
        <PartyChoice value={parties} onChange={setParties} />
      </div>

      <ul className="mt-4 divide-y divide-black/10 rounded-[16px] border border-black/10 dark:divide-white/15 dark:border-white/15">
        {clients.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm">
              <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="flex-1">{c.name}</span>
              <span className="text-xs opacity-60">
                {c.certificates} certificate{c.certificates === 1 ? '' : 's'}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-xs opacity-60">
          {certificates} certificate{certificates === 1 ? '' : 's'} from {kept.length} client
          {kept.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() => onContinue(kept.map((c) => c.id), parties)}
          disabled={kept.length === 0}
          className="rounded-lg bg-[#556b2f] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

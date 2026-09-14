'use client'

import { useState } from 'react'
import type { QcClientOption } from '@/lib/approval-notification/qc-client-filter'

interface Props {
  clients: QcClientOption[]
  onContinue: (clientIds: string[]) => void
}

/**
 * First step of "Send unsent": which QC clients to email. Every client with
 * something left to send starts ticked. Their emails go first; the sellers
 * follow, one email each covering all the clients kept — a seller can supply
 * several QC clients, which is why sellers go last.
 */
export function QcClientStep({ clients, onContinue }: Props) {
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
        Their emails go first. Sellers follow, one email each for every client you keep.
      </p>

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
          onClick={() => onContinue(kept.map((c) => c.id))}
          disabled={kept.length === 0}
          className="rounded-lg bg-[#556b2f] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

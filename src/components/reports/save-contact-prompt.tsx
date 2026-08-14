'use client'

/**
 * Inline "this address isn't on file — save it?" panel for the report send
 * dialog. Opens under the To field when an unrecognised address is committed,
 * or when the sender clicks a chip's save affordance.
 *
 * Never blocks the send: skipping leaves the address in To as an ephemeral
 * recipient. Saving POSTs to the existing QC-contacts upsert, which tags the
 * contact `qc_certificates` — so a saved report recipient also starts
 * receiving certificate emails. The panel says so; there is no separate
 * reports tag to opt into.
 */

import { useState } from 'react'
import type { QcContactRecord } from '@/lib/qc-contacts/tags'

interface Props {
  companyId: string
  companyName: string
  email: string
  onSaved: (contact: QcContactRecord) => void
  onSkip: () => void
}

export function SaveContactPrompt({ companyId, companyName, email, onSaved, onSkip }: Props) {
  const [isGroup, setIsGroup] = useState(false)
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/companies/${companyId}/qc-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: name.trim() || null,
          nickname: isGroup ? null : nickname.trim() || null,
          isGroup,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Could not save this contact.')
        return
      }
      onSaved(data.contact as QcContactRecord)
    } catch {
      setError('Could not save this contact.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[12px] border border-amber-400/50 bg-amber-50/50 p-3 dark:border-amber-400/30 dark:bg-amber-400/5">
      <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
        <span className="font-mono">{email}</span> isn&apos;t saved for {companyName}. Save it so
        future reports pre-fill?
      </p>

      <div className="mb-2 inline-flex rounded-[10px] bg-black/5 p-1 dark:bg-white/10">
        <button
          type="button"
          onClick={() => setIsGroup(false)}
          className={`rounded-[7px] px-3 py-1 text-xs ${!isGroup ? 'bg-white font-medium shadow-sm dark:bg-[#2A2A2A]' : 'opacity-60'}`}
        >
          Person
        </button>
        <button
          type="button"
          onClick={() => setIsGroup(true)}
          className={`rounded-[7px] px-3 py-1 text-xs ${isGroup ? 'bg-white font-medium shadow-sm dark:bg-[#2A2A2A]' : 'opacity-60'}`}
        >
          Group inbox
        </button>
      </div>

      <input
        className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={
          isGroup ? 'Name (optional, e.g. Ahold QC Team)' : 'Name (optional, for the greeting)'
        }
      />

      {!isGroup && (
        <input
          className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Nickname (optional, preferred greeting)"
        />
      )}

      <p className="mb-2 text-xs opacity-60">
        Saved contacts receive QC certificates and reports for {companyName}.
      </p>

      {error && <p className="mb-2 text-xs text-[#ef4444]">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-[#556b2f] px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs underline opacity-70 disabled:opacity-40"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

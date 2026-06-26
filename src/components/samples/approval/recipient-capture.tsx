'use client'

import { useState } from 'react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  /** Company the recipient belongs to; null disables "save for future" (ephemeral only). */
  companyId: string | null
  companyName: string
  /** Called once with the email after a successful add (post-persist when saving). */
  onAdd: (email: string) => void
}

/**
 * Inline capture for a missing QC-certificate recipient, shared by the single and
 * batch send composers. Asks group-or-person and, when a company is known, offers
 * to persist the address as a QC-cert recipient for next time (Phase 1 upsert).
 * Persist happens BEFORE the email is accepted, so a failed save surfaces first.
 */
export function RecipientCaptureForm({ companyId, companyName, onAdd }: Props) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [saveForFuture, setSaveForFuture] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setEmail('')
    setName('')
    setIsGroup(false)
    setSaveForFuture(false)
    setError(null)
  }

  const add = async () => {
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    if (saveForFuture && companyId) {
      setBusy(true)
      try {
        const res = await fetch(`/api/companies/${companyId}/qc-contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: value, name: isGroup ? null : name.trim() || null, isGroup }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data?.error || 'Failed to save recipient.')
          return
        }
      } catch {
        setError('Failed to save recipient.')
        return
      } finally {
        setBusy(false)
      }
    }
    onAdd(value)
    reset()
  }

  return (
    <div className="rounded-[12px] border border-amber-400/50 bg-amber-50/50 p-3 dark:border-amber-400/30 dark:bg-amber-400/5">
      <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
        No QC-certificate recipient for {companyName}. Add an email or group inbox to send.
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
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@company.com"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
      />

      {!isGroup && (
        <input
          className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional, for the greeting)"
        />
      )}

      {companyId && (
        <label className="mb-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={saveForFuture} onChange={(e) => setSaveForFuture(e.target.checked)} />
          Also save as a QC-certificate recipient for {companyName}.
        </label>
      )}

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      <button
        type="button"
        onClick={add}
        disabled={busy}
        className="rounded-lg bg-[#556b2f] px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Add recipient'}
      </button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { usePickableContacts } from '@/lib/qc-contacts/use-pickable-contacts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  /** Company the recipient belongs to; null disables pick + "save for future" (ephemeral free-type only). */
  companyId: string | null
  companyName: string
  /** Called once with the email after a successful add (post-persist when saving). */
  onAdd: (email: string) => void
}

/**
 * Inline capture for a missing QC-certificate recipient, shared by the single and
 * batch send composers. When the company is known, the sender can PICK an existing
 * contact (combobox) or add a NEW one (free-type: group/person, name, nickname).
 * "Save as a QC-cert recipient" persists via the Phase 1 upsert BEFORE the email is
 * accepted, so a failed save surfaces first; unchecked is ephemeral (this send only).
 */
export function RecipientCaptureForm({ companyId, companyName, onAdd }: Props) {
  const { options, byId, error: loadError } = usePickableContacts(companyId)
  // No company → no pool to pick from; go straight to free-type.
  const [mode, setMode] = useState<'pick' | 'new'>(companyId ? 'pick' : 'new')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [isGroup, setIsGroup] = useState(false)
  const [picked, setPicked] = useState<string>('') // contact id, '' when none
  const [saveForFuture, setSaveForFuture] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setEmail(''); setName(''); setNickname(''); setIsGroup(false); setPicked('')
    setSaveForFuture(false); setError(null); setMode(companyId ? 'pick' : 'new')
  }

  const onPick = (id: string) => {
    setPicked(id)
    const c = id ? byId[id] : undefined
    if (c) { setEmail(c.email); setName(c.name); setNickname(c.nickname ?? ''); setIsGroup(c.isGroup) }
    else { setEmail('') }
    setError(null)
  }

  const goNew = () => {
    setMode('new'); setPicked(''); setEmail(''); setName(''); setNickname(''); setIsGroup(false); setError(null)
  }
  const goPick = () => {
    setMode('pick'); setEmail(''); setName(''); setNickname(''); setIsGroup(false); setError(null)
  }

  const add = async () => {
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setError('Choose a contact or enter a valid email address.')
      return
    }
    setError(null)
    if (saveForFuture && companyId) {
      setBusy(true)
      try {
        const res = await fetch(`/api/companies/${companyId}/qc-contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: value,
            name: isGroup ? null : name.trim() || null,
            nickname: isGroup ? null : nickname.trim() || null,
            isGroup,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError(data?.error || 'Failed to save recipient.'); return }
      } catch {
        setError('Failed to save recipient.'); return
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
        No QC-certificate recipient for {companyName}. Pick an existing contact or add a new one to send.
      </p>

      {mode === 'pick' && companyId ? (
        <div className="mb-2 space-y-2">
          <SearchableSelect
            options={options}
            value={picked}
            onValueChange={onPick}
            substringMatch
            allowCreate
            onCreateNew={goNew}
            createLabel="+ Add new email"
            placeholder="Choose an existing contact…"
            searchPlaceholder="Search contacts…"
            emptyMessage="No matching contacts."
          />
          {loadError && (
            <p className="text-xs opacity-60">Couldn&apos;t load existing contacts — add a new email instead.</p>
          )}
          <button type="button" onClick={goNew} className="text-xs text-[#556b2f] underline">
            Add a new email instead
          </button>
        </div>
      ) : (
        <>
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
            <>
              <input
                className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional, for the greeting)"
              />
              <input
                className="mb-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none dark:border-white/15"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Nickname (optional, preferred greeting)"
              />
            </>
          )}

          {companyId && (
            <button type="button" onClick={goPick} className="mb-2 block text-xs text-[#556b2f] underline">
              Pick an existing contact instead
            </button>
          )}
        </>
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

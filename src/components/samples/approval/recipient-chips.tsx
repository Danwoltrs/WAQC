'use client'

import { useState } from 'react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  label: string
  emails: string[]
  onChange: (emails: string[]) => void
}

export function RecipientChips({ label, emails, onChange }: Props) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const value = draft.trim().replace(/,$/, '')
    if (value && !emails.includes(value)) onChange([...emails, value])
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-black/10 px-2 py-1.5 dark:border-white/15">
      <span className="text-xs uppercase opacity-50">{label}</span>
      {emails.map((e) => (
        <span
          key={e}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
            EMAIL_RE.test(e)
              ? 'bg-black/5 dark:bg-white/10'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {e}
          <button
            type="button"
            aria-label={`Remove ${e}`}
            onClick={() => onChange(emails.filter((x) => x !== e))}
            className="opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          }
        }}
        onBlur={commit}
        placeholder="Add…"
      />
    </div>
  )
}

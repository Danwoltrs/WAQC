'use client'

import { useState } from 'react'
import { isValidEmail } from '@/lib/html'

/** What is known about one address. `contactId: null` means it is not a saved contact. */
export interface RecipientMeta {
  name: string | null
  isGroup: boolean
  contactId: string | null
}

interface Props {
  label: string
  emails: string[]
  onChange: (emails: string[]) => void
  /**
   * Keyed by LOWER-CASED email. Supplying it switches the component into
   * provenance mode: saved contacts render by name with an untag action,
   * everything else gets a save affordance. Omitted (the approval flow) the
   * component renders exactly as it always has.
   */
  meta?: Record<string, RecipientMeta>
  /** Called with the raw address when the sender asks to save an unknown one. */
  onSaveRequest?: (email: string) => void
  /**
   * Called when the sender stops pre-filling a saved contact. The address
   * STAYS in the list — untagging means "don't suggest them next time", not
   * "don't send to them now". Removing from this send is the × button.
   */
  onUntag?: (contactId: string, email: string) => void
  /**
   * True while the list this component displays is about to be replaced out
   * from under the sender (e.g. a pre-fill fetch still in flight). Disables
   * the draft input and every per-chip action button so nothing typed here
   * can be silently lost. Omitted/false: behaviour is unchanged from before
   * this prop existed.
   */
  disabled?: boolean
}

export function RecipientChips({
  label,
  emails,
  onChange,
  meta,
  onSaveRequest,
  onUntag,
  disabled,
}: Props) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    if (disabled) return
    // Split on comma/semicolon/whitespace so pasting a comma-separated list
    // (the pattern the Textarea this replaced supported) yields one chip per
    // address instead of a single unparseable blob.
    const parts = draft
      .split(/[,;\s]+/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 0) {
      const existingLower = new Set(emails.map((e) => e.toLowerCase()))
      const toAdd: string[] = []
      for (const part of parts) {
        const lower = part.toLowerCase()
        if (existingLower.has(lower)) continue
        existingLower.add(lower)
        toAdd.push(part)
      }
      if (toAdd.length > 0) onChange([...emails, ...toAdd])
    }
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-black/10 px-2 py-1.5 dark:border-white/15">
      <span className="text-xs uppercase opacity-50">{label}</span>
      {emails.map((e) => {
        const valid = isValidEmail(e)
        const m = meta?.[e.toLowerCase()]
        const known = !!m?.contactId
        // Provenance affordances only when the caller opted in via `meta`.
        const showSave = !!meta && valid && !known && !!onSaveRequest
        const showUntag = !!meta && known && !!onUntag
        return (
          <span
            key={e}
            title={meta ? e : undefined}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
              valid
                ? 'bg-black/5 dark:bg-white/10'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            }`}
          >
            {meta && valid && (
              <span aria-hidden className={known ? 'text-[#556b2f]' : 'opacity-40'}>
                {known ? '●' : '○'}
              </span>
            )}
            {known && m?.name ? m.name : e}
            {showSave && (
              <button
                type="button"
                aria-label={`Save ${e}`}
                onClick={() => onSaveRequest!(e)}
                disabled={disabled}
                className="opacity-60 hover:opacity-100"
              >
                +
              </button>
            )}
            {showUntag && (
              <button
                type="button"
                aria-label={`Stop pre-filling ${e}`}
                onClick={() => onUntag!(m!.contactId!, e)}
                disabled={disabled}
                className="opacity-60 hover:opacity-100"
              >
                &minus;
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${e}`}
              onClick={() => onChange(emails.filter((x) => x !== e))}
              disabled={disabled}
              className="opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </span>
        )
      })}
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
        disabled={disabled}
        placeholder="Add…"
      />
    </div>
  )
}

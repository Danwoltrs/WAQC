'use client'

import { RecipientChips } from './recipient-chips'

export interface PanelState {
  title: string
  to: string[]
  cc: string[]
  body: string
}

interface Props extends PanelState {
  onChange: (next: PanelState) => void
}

export function RecipientPanel({ title, to, cc, body, onChange }: Props) {
  const state: PanelState = { title, to, cc, body }
  return (
    <div className="rounded-[16px] border border-black/10 p-4 dark:border-white/15">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">{title}</div>
      <div className="space-y-2">
        <RecipientChips label="TO" emails={to} onChange={(v) => onChange({ ...state, to: v })} />
        <RecipientChips label="CC" emails={cc} onChange={(v) => onChange({ ...state, cc: v })} />
        <textarea
          aria-label={`${title} message`}
          className="min-h-[160px] w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          value={body}
          onChange={(e) => onChange({ ...state, body: e.target.value })}
        />
      </div>
    </div>
  )
}

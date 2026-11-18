'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FinalWordFields, finalWordSummary } from './final-word-fields'
import type { FinalWordOverrides, FinalWordSettings } from '@/lib/seller-requests/types'

interface QualityLike {
  id: string
  final_word?: FinalWordOverrides['finalWord']
  final_word_fixed?: boolean | null
  buyer_sample_address_id?: string | null
  stuffing_request?: FinalWordOverrides['stuffing']
}

const FIELDS: [keyof FinalWordOverrides, string][] = [
  ['finalWord', 'final_word'],
  ['fixed', 'final_word_fixed'],
  ['addressId', 'buyer_sample_address_id'],
  ['stuffing', 'stuffing_request'],
]

function overridesOf(q: QualityLike): FinalWordOverrides {
  return {
    finalWord: q.final_word ?? null,
    fixed: q.final_word_fixed ?? null,
    addressId: q.buyer_sample_address_id ?? null,
    stuffing: q.stuffing_request ?? null,
  }
}

/** A quality row's final-word override: a summary button that opens the fields; Save sends the changed columns. */
export function FinalWordCell({ quality, clientId, clientName, buyer, onUpdate }: {
  quality: QualityLike
  clientId: string
  clientName: string
  buyer: FinalWordSettings | null
  onUpdate: (id: string, field: string, value: unknown) => void
}) {
  const saved = overridesOf(quality)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(saved)
  useEffect(() => { if (open) setDraft(overridesOf(quality)) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    for (const [key, column] of FIELDS) {
      if (draft[key] !== saved[key]) onUpdate(quality.id, column, draft[key])
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-left text-xs hover:underline hover:text-primary transition-colors">
          {finalWordSummary(saved, clientName)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="start">
        <FinalWordFields value={draft} onChange={setDraft} inherit={buyer} clientId={clientId} clientName={clientName} />
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={save}>Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

'use client'

import { useRef, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { PartyOption } from '@/lib/approval-notification/certificate-parties'
import type { CertificateParty } from '@/lib/approval-notification/types'
import { PartyChoice } from './party-choice'

interface Props {
  sampleIds: string[]
  onSend: (parties: CertificateParty[], includeSent: boolean) => void
  disabled?: boolean
}

/** The Send dropdown: which parties of the ticked certificates get an email. */
export function SendPartiesPopover({ sampleIds, onSend, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<PartyOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [value, setValue] = useState<CertificateParty[]>([])
  const [includeSent, setIncludeSent] = useState(false)
  // Each opening takes a new number; a response only counts while its number is current.
  const requestId = useRef(0)

  const load = async (ids: string[]) => {
    const id = ++requestId.current
    try {
      const res = await fetch(
        `/api/certificates/batch-send/queue?view=parties&sampleIds=${encodeURIComponent(ids.join(','))}`,
      )
      const body = await res.json().catch(() => ({}))
      if (id !== requestId.current) return
      if (!res.ok) {
        setError(typeof body?.error === 'string' && body.error ? body.error : 'Could not load the parties.')
        return
      }
      const parties: PartyOption[] = Array.isArray(body?.parties) ? body.parties : []
      setOptions(parties)
      setValue(parties.map((p) => p.party))
    } catch {
      if (id === requestId.current) setError('Could not load the parties.')
    }
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setOptions(null)
      setError(null)
      setValue([])
      setIncludeSent(false)
      void load(sampleIds)
    } else {
      requestId.current++
    }
  }

  const empty = options !== null && options.length === 0
  const canSend = options !== null && options.length > 0 && value.length > 0 && !error

  const send = () => {
    setOpen(false)
    requestId.current++
    onSend(value, includeSent)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Mail className="h-4 w-4" />
          Send
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px]">
        <h3 className="text-[13px] font-semibold">Who should receive them</h3>
        <div className="mt-3">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : options === null ? (
            <div role="status" aria-label="Loading parties" className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            </div>
          ) : empty ? (
            <p className="text-sm opacity-60">No one to send these to.</p>
          ) : (
            <PartyChoice value={value} onChange={setValue} options={options} />
          )}
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
          <Checkbox checked={includeSent} onCheckedChange={(c) => setIncludeSent(c === true)} />
          Include already sent
        </label>
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" disabled={!canSend} onClick={send}>
            Send emails
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

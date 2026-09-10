// src/components/samples/intake/contract-number-input.tsx
//
// The Wolthers contract number field. Manual entry only (2026-09-10): the value
// is ALWAYS what the user typed — nothing writes it on the user's behalf, and
// no suggestion is applied unless the user clicks it.
//
// As the user types (>= 2 chars, 300 ms debounce) it searches the sys contract
// register through the same endpoint the Step-1 picker uses and offers the
// matches underneath, so a wrong number is visible immediately instead of
// reaching a certificate. Picking a match is an explicit act: it sets the field
// to that contract's number and, when the host passes onSelectContract, links
// the contract so the parties/quality prefill can run.

'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export interface ContractMatch {
  id: string
  contract_number: string
  seller_reference: string | null
  buyer_reference: string | null
  contract_date: string | null
  crop: string | null
  seller: { fantasy_name: string | null; name: string | null } | null
  buyer: { fantasy_name: string | null; name: string | null } | null
}

// The server strips these before matching (PostgREST .or() delimiters + ILIKE
// wildcards), so the client has to normalise identically to decide whether a
// query is long enough to run at all.
const sanitize = (q: string) => q.trim().replace(/[%_(),]/g, '')

const partyName = (p: ContractMatch['seller']) => p?.fantasy_name || p?.name || null

interface Props {
  value: string
  onChange: (value: string) => void
  /**
   * Called when the user explicitly picks a match. Optional — without it the
   * field is a plain searchable text input and picking a row only fills the
   * number.
   */
  onSelectContract?: (contract: ContractMatch) => void
  /** The contract this sample is already linked to, if any (suppresses its own row). */
  linkedContractId?: string | null
  placeholder?: string
  className?: string
  id?: string
  disabled?: boolean
}

export function ContractNumberInput({
  value,
  onChange,
  onSelectContract,
  linkedContractId,
  placeholder = 'Wolthers ref.',
  className = 'h-9',
  id,
  disabled,
}: Props) {
  const [matches, setMatches] = useState<ContractMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  // Only search what the user typed. Filling the box programmatically (a draft
  // restored from localStorage, a picked match) must not pop the list open.
  const [typed, setTyped] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!typed || sanitize(value).length < 2) {
      setMatches([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/contracts/search?q=${encodeURIComponent(value.trim())}&limit=8`,
          { signal: controller.signal },
        )
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Search failed')
        setMatches(body.contracts || [])
        setOpen(true)
      } catch (err: any) {
        if (err?.name === 'AbortError') return // superseded by a newer keystroke
        setMatches([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      controller.abort()
    }
  }, [value, typed])

  // Close on an outside click; the field keeps whatever was typed.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const visible = matches.filter((m) => m.id !== linkedContractId)
  const exact = visible.some(
    (m) => m.contract_number?.trim().toLowerCase() === value.trim().toLowerCase(),
  )

  const pick = (m: ContractMatch) => {
    onChange(m.contract_number)
    setTyped(false)
    setOpen(false)
    setMatches([])
    onSelectContract?.(m)
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setTyped(true)
          onChange(e.target.value)
        }}
        onFocus={() => { if (visible.length) setOpen(true) }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />

      {loading && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
      {!loading && exact && (
        <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#556b2f]" />
      )}

      {open && visible.length > 0 && (
        <div className="absolute z-50 mt-1 w-[min(28rem,90vw)] max-h-72 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
          <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] text-muted-foreground">
            <Search className="h-3 w-3" />
            <span>{visible.length} matching contract{visible.length === 1 ? '' : 's'}</span>
          </div>
          {visible.map((m) => {
            const parties = [partyName(m.seller), partyName(m.buyer)].filter(Boolean).join(' → ')
            const refs = [
              m.seller_reference ? `seller ${m.seller_reference}` : null,
              m.buyer_reference ? `buyer ${m.buyer_reference}` : null,
              m.crop,
            ].filter(Boolean).join(' · ')
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m)}
                className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
              >
                <div className="text-sm font-medium">{m.contract_number}</div>
                {parties && <div className="text-xs text-muted-foreground truncate">{parties}</div>}
                {refs && <div className="text-[11px] text-muted-foreground truncate">{refs}</div>}
              </button>
            )
          })}
          <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
            Nothing to pick? Keep typing — the number you type is the one that is saved.
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { StorageCompany } from '@/lib/storage/layout'

interface ClientRow { id: string; name?: string | null; company?: string | null }

/**
 * Which client to give the picked cubbies or shelves: General first, then the
 * QC clients the New Sample wizard lists (server search, trade names), and the
 * button that assigns the choice.
 */
export function ZoneAssignBox({ label, onAssign }: { label: string; onAssign: (company: StorageCompany | null) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StorageCompany[]>([])
  const [failed, setFailed] = useState(false)
  // undefined: nothing chosen yet; null: General.
  const [choice, setChoice] = useState<StorageCompany | null | undefined>(undefined)

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients?search=${encodeURIComponent(query.trim())}&limit=8`, { signal: ctrl.signal })
        const body = await res.json().catch(() => ({}))
        setFailed(!res.ok)
        setResults(res.ok
          ? ((body.clients ?? []) as ClientRow[]).map((c) => ({ id: c.id, name: c.company?.trim() || c.name?.trim() || 'Unnamed company' }))
          : [])
      } catch {
        // aborted by the next keystroke
      }
    }, 250)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [query])

  const option = (key: string, text: string, value: StorageCompany | null) => {
    const on = choice !== undefined && (choice?.id ?? null) === (value?.id ?? null)
    return (
      <li key={key}>
        <button type="button" aria-pressed={on} onClick={() => setChoice(value)}
          className={cn('w-full truncate rounded-[4px] px-2 py-1 text-left text-sm hover:bg-muted', on && 'bg-muted font-medium')}>
          {text}
        </button>
      </li>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Assign to</span>
        <span className="relative block">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8"
            placeholder="Search clients" aria-label="Search clients" />
        </span>
      </label>
      <ul className="max-h-56 space-y-px overflow-y-auto" aria-label="Clients">
        {option('general', 'General (no client)', null)}
        {results.map((c) => option(c.id, c.name, c))}
      </ul>
      {failed && <p className="text-xs text-red-600">Clients could not be loaded.</p>}
      <Button size="sm" className="w-full" disabled={choice === undefined}
        onClick={() => { if (choice !== undefined) onAssign(choice) }}>
        {label}
      </Button>
    </div>
  )
}

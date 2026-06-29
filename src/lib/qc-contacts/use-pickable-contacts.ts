'use client'

import { useEffect, useState } from 'react'
import type { SearchableSelectOption } from '@/components/ui/searchable-select'
import type { PickableContact } from './pickable'

/** Pure: map pickable contacts to combobox options + an id→contact lookup. */
export function toContactOptions(contacts: PickableContact[]): {
  options: SearchableSelectOption[]
  byId: Record<string, PickableContact>
} {
  const options: SearchableSelectOption[] = []
  const byId: Record<string, PickableContact> = {}
  for (const c of contacts) {
    const label = c.name ? `${c.name} — ${c.email}` : c.email
    const keywords = [c.email, c.nickname].filter((k): k is string => !!k && !!k.trim())
    options.push({ value: c.id, label, keywords })
    byId[c.id] = c
  }
  return { options, byId }
}

/**
 * Fetch a company's pickable QC-cert contacts and expose them as combobox options.
 * Degrades gracefully: on error, options is empty (the free-type/create path still
 * works) and `error` is set for an optional inline note. No fetch when companyId is null.
 */
export function usePickableContacts(companyId: string | null): {
  options: SearchableSelectOption[]
  byId: Record<string, PickableContact>
  loading: boolean
  error: string | null
} {
  const [contacts, setContacts] = useState<PickableContact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) {
      setContacts([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/companies/${companyId}/contacts`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load contacts')
        return (await r.json()) as { contacts: PickableContact[] }
      })
      .then((data) => { if (!cancelled) setContacts(data.contacts ?? []) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load contacts') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId])

  const { options, byId } = toContactOptions(contacts)
  return { options, byId, loading, error }
}

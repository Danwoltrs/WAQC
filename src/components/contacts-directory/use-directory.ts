'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PersonContact } from '@/lib/contacts/people'
import type { DirectoryCompany, DirectoryRole } from './types'

const PAGE = 50

/** Loads the directory page by page and ticks purposes optimistically. */
export function useDirectory(q: string, role: DirectoryRole) {
  const [companies, setCompanies] = useState<DirectoryCompany[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const seq = useRef(0)
  const loaded = useRef(0)

  /** Reload everything loaded so far (or the first page), dropping stale answers. */
  const load = useCallback(async (reset: boolean) => {
    const id = ++seq.current
    const offset = reset ? 0 : loaded.current
    const limit = reset ? Math.max(PAGE, loaded.current) : PAGE
    setLoading(true)
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: String(Math.min(limit, PAGE)) })
      if (q) params.set('q', q)
      if (role !== 'all') params.set('role', role)
      const res = await fetch(`/api/contacts/directory?${params}`)
      if (!res.ok) throw new Error()
      const body = await res.json()
      if (id !== seq.current) return
      setCompanies((prev) => (reset ? body.companies : [...prev, ...body.companies]))
      loaded.current = offset + body.companies.length
      setTotal(body.total ?? 0)
      setHasMore(!!body.hasMore)
      setTruncated(!!body.truncated)
      setError(null)
    } catch {
      if (id === seq.current) setError('The directory could not be loaded.')
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [q, role])

  useEffect(() => { loaded.current = 0; load(true) }, [load])

  const apply = (contactId: string, purposes: string[]) =>
    setCompanies((cs) => cs.map((co) => ({
      ...co,
      contacts: co.contacts.map((c) => (c.id === contactId ? { ...c, routing_purposes: purposes } : c)),
    })))

  const toggle = useCallback(async (companyId: string, contact: PersonContact, purpose: string, on: boolean) => {
    const key = `${contact.id}:${purpose}`
    const before = contact.routing_purposes ?? []
    setPending((p) => new Set(p).add(key))
    apply(contact.id, on ? [...before.filter((p) => p !== purpose), purpose] : before.filter((p) => p !== purpose))
    try {
      const res = await fetch(`/api/companies/${companyId}/people/${contact.id}/purposes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose, on }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) {
        // Changed elsewhere at the same moment: show what is there now.
        toast.error(body?.error || 'This contact was changed elsewhere. Reloaded.')
        await load(true)
        return
      }
      if (!res.ok) throw new Error(body?.error || 'That change was not saved')
      apply(contact.id, body.contact?.routing_purposes ?? [])
    } catch (e) {
      apply(contact.id, before)
      toast.error(e instanceof Error ? e.message : 'That change was not saved')
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(key); return n })
    }
  }, [load])

  return {
    companies, total, hasMore, truncated, loading, error, pending,
    toggle,
    reload: () => load(true),
    loadMore: () => load(false),
  }
}

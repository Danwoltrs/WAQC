// src/components/samples/intake/contract-search-step.tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  mapContractToFormData,
  toSelectedContract,
  type ContractWithParties,
  type ContractResolution,
} from '@/lib/contract-intake-mapping'
import type { FormData } from './types'

interface SearchResultRow {
  id: string
  contract_number: string
  seller_reference: string | null
  buyer_reference: string | null
  contract_date: string | null
  crop: string | null
  volume_bags: number | null
  bag_type: string | null
  quality_description: string | null
  shipment_period_start: string | null
  seller: { fantasy_name: string | null; name: string | null } | null
  buyer: { fantasy_name: string | null; name: string | null } | null
  sample_count: number
}

// The server strips these characters from the query before matching (PostgREST
// .or() delimiters + ILIKE wildcards), so the client must normalise the same way
// when deciding which column a row matched on.
function sanitizeQuery(q: string): string {
  return q.trim().replace(/[%_(),]/g, '')
}

// Helper: which reference field matched the user's query (case-insensitive substring)?
// Returns null when the match came from contract_number (the primary field — no "via" hint needed).
function matchedRef(q: string, row: SearchResultRow): { label: string; value: string } | null {
  const needle = sanitizeQuery(q).toLowerCase()
  if (!needle) return null
  if (row.contract_number?.toLowerCase().includes(needle)) return null
  if (row.seller_reference?.toLowerCase().includes(needle)) {
    return { label: 'seller ref', value: row.seller_reference }
  }
  if (row.buyer_reference?.toLowerCase().includes(needle)) {
    return { label: 'buyer ref', value: row.buyer_reference }
  }
  return null
}

interface Props {
  formData: FormData
  applyContract: (patch: Partial<FormData>, prefilled: (keyof FormData)[]) => void
  unlinkContract: () => void
  onSkip: () => void
}

export function ContractSearchStep({ formData, applyContract, unlinkContract, onSkip }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultRow[]>([])
  const [loading, setLoading] = useState(false)        // a search request is in flight
  const [pending, setPending] = useState(false)        // a search is queued (debounce armed) but not yet started
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null) // id being fetched
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (sanitizeQuery(query).length < 2) {
      setResults([])
      setError(null)
      setPending(false)
      return
    }

    setPending(true)
    const controller = new AbortController()
    debounceRef.current = setTimeout(async () => {
      setPending(false)
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/contracts/search?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        )
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Search failed')
        setResults(body.contracts || [])
      } catch (err: any) {
        if (err?.name === 'AbortError') return // superseded by a newer query — discard silently
        setError(err.message || 'Search failed')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      controller.abort()
    }
  }, [query])

  const handleSelect = async (row: SearchResultRow) => {
    setSelecting(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/contracts/${row.id}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load contract')
      const contract = body.contract as ContractWithParties
      const resolution = body.resolution as ContractResolution
      const { patch, prefilled } = mapContractToFormData(contract, resolution)
      const fullPatch: Partial<FormData> = { ...patch, selected_contract: toSelectedContract(contract) }
      applyContract(fullPatch, prefilled)
    } catch (err: any) {
      setError(err.message || 'Failed to load contract')
    } finally {
      setSelecting(null)
    }
  }

  const linked = formData.selected_contract

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-1">Find a contract</h3>
        <p className="text-xs text-muted-foreground">
          Search by contract number (or the seller&apos;s / buyer&apos;s reference) to auto-fill the sample details. Skip to enter everything manually.
        </p>
      </div>

      {linked ? (
        <div className="rounded-2xl p-4 bg-[#556b2f]/10 border border-[#556b2f]/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Linked to contract #{linked.contract_number}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {[linked.seller_name, linked.buyer_name].filter(Boolean).join(' → ')}
                {linked.crop ? ` · ${linked.crop}` : ''}
                {linked.volume_bags ? ` · ${linked.volume_bags} bags` : ''}
                {linked.bag_type ? ` · ${linked.bag_type}` : ''}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={unlinkContract}
              className="flex-shrink-0"
            >
              <X className="h-4 w-4 mr-1" />
              Unlink
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type contract number (e.g. 41966)..."
              className="pl-9 rounded-2xl"
              autoFocus
            />
            {(loading || pending) && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          {sanitizeQuery(query).length >= 2 && !loading && !pending && results.length === 0 && !error && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No active contracts match &laquo;{query}&raquo;. Type to refine, or hit <strong>Skip</strong> below.
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {results.map((row) => {
                const sellerName = row.seller?.fantasy_name || row.seller?.name || '—'
                const buyerName = row.buyer?.fantasy_name || row.buyer?.name || '—'
                const refHit = matchedRef(query, row)
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handleSelect(row)}
                    disabled={selecting !== null}
                    className="w-full text-left rounded-2xl p-3 bg-card hover:bg-accent border border-border transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm">#{row.contract_number}</div>
                      {row.sample_count > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {row.sample_count} sample{row.sample_count > 1 ? 's' : ''} already
                        </div>
                      )}
                      {selecting === row.id && <Loader2 className="h-3 w-3 animate-spin" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {sellerName} → {buyerName}
                      {row.crop ? ` · ${row.crop}` : ''}
                      {row.volume_bags ? ` · ${row.volume_bags} bags` : ''}
                      {row.bag_type ? ` · ${row.bag_type}` : ''}
                    </div>
                    {refHit && (
                      <div className="text-xs text-muted-foreground/80 mt-1 italic">
                        via {refHit.label} &laquo;{refHit.value}&raquo;
                      </div>
                    )}
                    {row.quality_description && (
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {row.quality_description}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      <div className="pt-2">
        <Button type="button" variant="outline" onClick={onSkip}>
          Skip — enter manually
        </Button>
      </div>
    </div>
  )
}

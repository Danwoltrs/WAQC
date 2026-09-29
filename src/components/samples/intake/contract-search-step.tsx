// src/components/samples/intake/contract-search-step.tsx
'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { Check, Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  mapContractToFormData,
  toSelectedContract,
  type ContractWithParties,
  type ContractResolution,
} from '@/lib/contract-intake-mapping'
import type { FormData } from './types'
import { contractDisplayNumber } from '@/lib/contract-family'
import { cn } from '@/lib/utils'

interface SearchResultRow {
  id: string
  contract_number: string
  /** Family letter after the year for a same-parties split (42089/26B); null otherwise. */
  split_suffix?: string | null
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

/** An approved PSS offered in the same list (an SS links its PSS first). */
export interface PssPick {
  value: string
  label: string
  keywords?: string[]
}

interface Props {
  formData: FormData
  applyContract: (patch: Partial<FormData>, prefilled: (keyof FormData)[]) => void
  unlinkContract: () => void
  /** The full contract just linked (with its sys family), after the prefill has been applied. */
  onLinked?: (contract: ContractWithParties) => void
  /** "No contract", beside the input: continue with everything entered by hand. */
  onNoContract?: () => void
  /** For a shipment sample: approved PSS rows, listed above the contracts that match. */
  pssOptions?: PssPick[]
  onPickPss?: (value: string) => void
  /** The PSS already linked (a shipment sample), shown in place of the search. */
  linkedPssLabel?: string | null
  onClearPss?: () => void
}

type Item =
  | { kind: 'pss'; key: string; pss: PssPick }
  | { kind: 'contract'; key: string; row: SearchResultRow }

const MAX_PSS_MATCHES = 6

/**
 * The contract field of the New Sample dialog, the way the Wolthers app's New
 * Inquiry finds a contact: one input with "No contract" beside it, and the
 * matches listed under it as the user types. Arrow keys move through the
 * list and Enter links the highlighted match (the first by default). A
 * shipment sample sees its approved PSS rows first, then contracts.
 */
export function ContractSearchStep({
  formData,
  applyContract,
  unlinkContract,
  onLinked,
  onNoContract,
  pssOptions,
  onPickPss,
  linkedPssLabel,
  onClearPss,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultRow[]>([])
  const [loading, setLoading] = useState(false)        // a search request is in flight
  const [pending, setPending] = useState(false)        // a search is queued (debounce armed) but not yet started
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null) // id being fetched
  const [active, setActive] = useState(0)
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
      const fullPatch: Partial<FormData> = {
        ...patch,
        selected_contract: toSelectedContract(contract),
        contract_resolution: {
          seller_match_count: resolution.candidate_seller_exporter_ids.length,
          shipper_match_count: resolution.candidate_shipper_exporter_ids.length,
          multiple_seller_matches: resolution.multiple_seller_matches,
          multiple_shipper_matches: resolution.multiple_shipper_matches,
          importer_resolved: resolution.resolved_client_id !== null || resolution.resolved_importer_id !== null,
          quality_match: resolution.quality_match ?? null,
        },
      }
      applyContract(fullPatch, [...prefilled, 'contract_resolution', 'selected_contract'])
      onLinked?.(contract)
    } catch (err: any) {
      setError(err.message || 'Failed to load contract')
    } finally {
      setSelecting(null)
    }
  }

  const needle = sanitizeQuery(query).toLowerCase()
  const pssMatches = useMemo(() => {
    if (!pssOptions || needle.length < 2) return []
    return pssOptions
      .filter((o) => [o.label, ...(o.keywords ?? [])].some((t) => t.toLowerCase().includes(needle)))
      .slice(0, MAX_PSS_MATCHES)
  }, [pssOptions, needle])

  const items: Item[] = useMemo(
    () => [
      ...pssMatches.map((pss): Item => ({ kind: 'pss', key: `pss-${pss.value}`, pss })),
      ...results.map((row): Item => ({ kind: 'contract', key: row.id, row })),
    ],
    [pssMatches, results],
  )
  useEffect(() => { setActive(0) }, [items])

  const pick = (item: Item | undefined) => {
    if (!item || selecting) return
    if (item.kind === 'pss') onPickPss?.(item.pss.value)
    else void handleSelect(item.row)
  }

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // Never passes on to the wizard: Enter here picks, it does not continue.
      e.preventDefault()
      pick(items[active])
    } else if (e.key === 'Escape' && query) {
      e.preventDefault()
      setQuery('')
    }
  }
  useEffect(() => {
    document.getElementById(`contract-result-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const linked = formData.selected_contract
  const searching = loading || pending
  const tooShort = needle.length < 2

  // Already linked (the user came back to this step): the link in one line,
  // with Change to search again.
  if (linked || linkedPssLabel) {
    const parts = [
      linkedPssLabel && linked ? `contract #${contractDisplayNumber(linked)}` : null,
      linked ? [linked.seller_name, linked.buyer_name].filter(Boolean).join(' → ') : null,
      linked ? formData.importer_contract_nr || null : null,
      linked?.quality_description ?? null,
    ].filter(Boolean)
    return (
      <div className="space-y-1.5">
        <div className="text-[12.5px] font-medium">{linkedPssLabel ? 'PSS' : 'Contract'}</div>
        <div className="flex items-center gap-3 rounded-md border border-[#556b2f]/40 bg-[#556b2f]/[0.06] px-3 py-2">
          <Check className="h-4 w-4 flex-shrink-0 text-[#556b2f]" aria-hidden />
          <div className="min-w-0 flex-1 text-[13px]">
            <span className="font-mono font-semibold">
              {linkedPssLabel ? `#${linkedPssLabel}` : `#${contractDisplayNumber(linked!)}`}
            </span>
            {parts.length > 0 && <span className="text-muted-foreground"> · {parts.join(' · ')}</span>}
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={linkedPssLabel ? onClearPss : unlinkContract}
            className="h-7 flex-shrink-0 px-2.5 text-xs"
          >
            Change
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5" data-enter-scope>
      <label htmlFor="contract-search" className="text-[12.5px] font-medium">
        {pssOptions ? 'PSS or contract' : 'Contract'}
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="contract-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={pssOptions ? 'PSS certificate, contract nr or reference...' : 'Contract nr, seller or buyer reference...'}
            className="h-9 pl-9 pr-9 text-[13px]"
            autoFocus
            autoComplete="off"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="contract-results"
            aria-activedescendant={items.length ? `contract-result-${active}` : undefined}
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Searching" />
          )}
        </div>
        {onNoContract && (
          <Button type="button" variant="outline" size="sm" onClick={onNoContract} className="flex-shrink-0">
            No contract
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>
      )}

      {!tooShort && !searching && items.length === 0 && !error && (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          Nothing matches &laquo;{query}&raquo;. Check the number, or use No contract.
        </p>
      )}

      {items.length > 0 && (
        <div
          id="contract-results"
          role="listbox"
          aria-label="Matches"
          className="max-h-72 overflow-y-auto rounded-lg border bg-background"
        >
          {items.map((item, i) => {
            const isActive = i === active
            const common = {
              id: `contract-result-${i}`,
              role: 'option' as const,
              'aria-selected': isActive,
              tabIndex: -1,
              onMouseEnter: () => setActive(i),
              onClick: () => pick(item),
              disabled: selecting !== null,
              className: cn(
                'flex w-full items-baseline gap-2 border-b px-3 py-2 text-left text-[13px] transition-colors last:border-b-0 disabled:opacity-50',
                isActive ? 'bg-accent' : 'bg-background',
              ),
            }
            if (item.kind === 'pss') {
              return (
                <button key={item.key} type="button" {...common}>
                  <span className="inline-flex h-[18px] flex-shrink-0 items-center rounded-sm border px-1.5 text-[10px] font-semibold text-muted-foreground">PSS</span>
                  <span className="min-w-0 truncate">{item.pss.label}</span>
                </button>
              )
            }
            const row = item.row
            const refHit = matchedRef(query, row)
            const detail = [
              `${row.seller?.fantasy_name || row.seller?.name || '—'} → ${row.buyer?.fantasy_name || row.buyer?.name || '—'}`,
              row.volume_bags ? `${row.volume_bags} bags` : null,
              row.quality_description,
              refHit ? `via ${refHit.label} ${refHit.value}` : null,
            ].filter(Boolean).join(' · ')
            return (
              <button key={item.key} type="button" {...common}>
                <span className="flex-shrink-0 font-mono font-semibold">#{contractDisplayNumber(row)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{detail}</span>
                {row.sample_count > 0 && (
                  <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                    {row.sample_count} sample{row.sample_count > 1 ? 's' : ''}
                  </span>
                )}
                {selecting === row.id && <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" aria-label="Linking" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

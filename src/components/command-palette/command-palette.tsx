'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { getCommandScope } from './command-scope'
import { sampleOpenHref, certOpenHref, samplesFilterHref, certsFilterHref } from './selection'
import { filterNavTargets } from './nav-targets'
import type { SampleHit, CertHit, ContractHit } from './types'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MIN_CHARS = 2
const DEBOUNCE_MS = 250

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const scope = getCommandScope(pathname)

  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [samples, setSamples] = useState<SampleHit[]>([])
  const [certs, setCerts] = useState<CertHit[]>([])
  const [contracts, setContracts] = useState<ContractHit[]>([])

  const navMatches = useMemo(() => filterNavTargets(query), [query])

  // Clear transient state when the palette closes.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setSamples([])
      setCerts([])
      setContracts([])
      setLoading(false)
    }
  }, [open])

  // Debounced, scope-aware search.
  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_CHARS) {
      setSamples([]); setCerts([]); setContracts([]); setLoading(false)
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      const wantSamples = scope === 'samples' || scope === 'global'
      const wantCerts = scope === 'certificates' || scope === 'global'
      const wantContracts = scope === 'global'
      const enc = encodeURIComponent(q)
      const [s, c, k] = await Promise.allSettled([
        wantSamples ? fetch(`/api/samples/search?q=${enc}`).then((r) => (r.ok ? r.json() : { samples: [] })) : Promise.resolve({ samples: [] }),
        wantCerts ? fetch(`/api/certificates?search=${enc}&limit=20`).then((r) => (r.ok ? r.json() : { certificates: [] })) : Promise.resolve({ certificates: [] }),
        wantContracts ? fetch(`/api/contracts/search?q=${enc}`).then((r) => (r.ok ? r.json() : { contracts: [] })) : Promise.resolve({ contracts: [] }),
      ])
      setSamples(s.status === 'fulfilled' ? (s.value.samples ?? []) : [])
      setCerts(c.status === 'fulfilled' ? (c.value.certificates ?? []) : [])
      setContracts(k.status === 'fulfilled' ? (k.value.contracts ?? []) : [])
      setLoading(false)
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query, scope])

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  const hasQuery = query.trim().length >= MIN_CHARS
  const showSamples = scope === 'samples' || scope === 'global'
  const showCerts = scope === 'certificates' || scope === 'global'
  const showContracts = scope === 'global'

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Search certificate # or contract #..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {hasQuery && !loading && samples.length === 0 && certs.length === 0 && contracts.length === 0 && navMatches.length === 0 && (
          <CommandEmpty>No results.</CommandEmpty>
        )}

        {showSamples && samples.length > 0 && (
          <CommandGroup heading="Samples">
            {samples.length > 1 && (
              <CommandItem value={`samples-all-${query}`} onSelect={() => go(samplesFilterHref(query.trim()))}>
                View all {samples.length} samples matching &quot;{query.trim()}&quot;
              </CommandItem>
            )}
            {samples.map((s) => (
              <CommandItem key={s.id} value={`sample-${s.id}`} onSelect={() => go(sampleOpenHref(s.id))}>
                <span className="font-medium">{s.tracking_number || s.id}</span>
                {s.wolthers_contract_nr && <span className="ml-2 text-xs text-muted-foreground">{s.wolthers_contract_nr}</span>}
                {s.origin && <span className="ml-auto text-xs text-muted-foreground">{s.origin}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showCerts && certs.length > 0 && (
          <CommandGroup heading="Certificates">
            {certs.length > 1 && (
              <CommandItem value={`certs-all-${query}`} onSelect={() => go(certsFilterHref(query.trim()))}>
                View all {certs.length} certificates matching &quot;{query.trim()}&quot;
              </CommandItem>
            )}
            {certs.map((c) => (
              <CommandItem
                key={c.id}
                value={`cert-${c.id}`}
                onSelect={() => go(c.sample_id ? certOpenHref(c.sample_id) : certsFilterHref(c.certificate_number || query.trim()))}
              >
                <span className="font-medium">{c.certificate_number || c.id}</span>
                {c.sample?.tracking_number && <span className="ml-2 text-xs text-muted-foreground">{c.sample.tracking_number}</span>}
                {c.origin && <span className="ml-auto text-xs text-muted-foreground">{c.origin}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showContracts && contracts.length > 0 && (
          <CommandGroup heading="Contracts">
            {contracts.map((k) => (
              <CommandItem
                key={k.id}
                value={`contract-${k.id}`}
                onSelect={() => go(samplesFilterHref(k.contract_number || query.trim()))}
              >
                <span className="font-medium">{k.contract_number || k.id}</span>
                {typeof k.sample_count === 'number' && (
                  <span className="ml-auto text-xs text-muted-foreground">{k.sample_count} sample{k.sample_count === 1 ? '' : 's'}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {navMatches.length > 0 && (
          <CommandGroup heading="Go to">
            {navMatches.map((t) => (
              <CommandItem key={t.href} value={`nav-${t.href}`} onSelect={() => go(t.href)}>
                {t.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

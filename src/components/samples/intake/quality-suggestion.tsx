'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { contractDisplayNumber } from '@/lib/contract-family'
import type { QualityMatch } from '@/lib/quality-matching'

/**
 * What the sys contract says about the quality, under a quality dropdown:
 * the contract's own text, and the specification it points to. A confident
 * match that is not the one selected gets a "Use" button; a weak one offers
 * its closest specifications while nothing is selected; and words no
 * specification matches ("15/16 FC" against a client with 14/16 and 17/18)
 * prompt to create that specification, where the host can. Nothing is ever
 * selected from here without a click: an intake auto-selects a confident
 * match itself (contract-intake-mapping), and a saved sample never changes
 * silently.
 */
/** Buttons first, under the specification dropdown; the note beside them. */
const ROW = 'flex flex-wrap items-center gap-x-3 gap-y-1.5'
const BUTTON = 'h-7 shrink-0 px-2.5 text-xs'

export function QualitySuggestion({
  match,
  currentSpecId,
  contractLabel,
  autoSelected = false,
  onUse,
  currentSpecLabel,
  onCreate,
}: {
  match: QualityMatch | null | undefined
  currentSpecId: string | null | undefined
  /** "#41770/26", when the contract's number is known. */
  contractLabel?: string | null
  /** The selected spec is still the one the contract filled in. */
  autoSelected?: boolean
  onUse: (specId: string, label: string | null) => void
  /** The selected specification's name: one named as the contract words it needs no prompt. */
  currentSpecLabel?: string | null
  /** Create a specification named as the contract words it (the host opens its dialog). */
  onCreate?: (name: string) => void
}) {
  const text = match?.source_text?.trim()
  if (!match || !text) return null
  const from = contractLabel ? `Contract ${contractLabel}` : 'The contract'
  const says = (
    <>
      {from} says &ldquo;{text}&rdquo;
    </>
  )

  if (match.confidence === 'high' && match.spec_id) {
    if (match.spec_id === currentSpecId) {
      return (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground" data-testid="quality-suggestion">
          <Check className="mt-px h-3 w-3 flex-shrink-0 text-[#556b2f]" aria-hidden />
          <span>
            {says}. {autoSelected ? 'Selected from it; change if needed.' : 'The selection matches it.'}
          </span>
        </p>
      )
    }
    return (
      <div className={ROW} data-testid="quality-suggestion">
        <Button type="button" variant="outline" onClick={() => onUse(match.spec_id!, match.spec_label)} className={BUTTON}>
          Use {match.spec_label ?? 'the matching specification'}
        </Button>
        <p className="text-[11px] leading-snug text-muted-foreground">{says}.</p>
      </div>
    )
  }

  // No specification matches the contract's words with confidence. One
  // named exactly as the contract words it is the right one; otherwise the
  // words are likely a quality this client has no specification for yet.
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim()
  if (currentSpecId && currentSpecLabel && norm(currentSpecLabel) === norm(text)) return null
  if (currentSpecId && !onCreate) return null
  const create = onCreate && (
    <Button type="button" variant="outline" onClick={() => onCreate(text)} className={BUTTON}>
      Create &ldquo;{text}&rdquo; specification
    </Button>
  )
  const options = currentSpecId ? [] : match.suggestions ?? []
  if (match.confidence === 'low' && options.length > 0) {
    return (
      <div className={ROW} data-testid="quality-suggestion">
        {options.map((s) => (
          <Button key={s.spec_id} type="button" variant="outline" onClick={() => onUse(s.spec_id, s.spec_label)} className={BUTTON}>
            Use {s.spec_label ?? 'this specification'}
          </Button>
        ))}
        {create}
        <p className="text-[11px] leading-snug text-muted-foreground">{says}; these are the closest specifications.</p>
      </div>
    )
  }
  return (
    <div className={ROW} data-testid="quality-suggestion">
      {create}
      <p className="text-[11px] leading-snug text-[#b07946]">
        {says}; no specification {currentSpecId ? 'for this client matches it, so check the selection' : 'matches it clearly'}.
      </p>
    </div>
  )
}

/**
 * The quality match of a sys contract, for a sample that is already saved
 * (the editor): the same GET /api/contracts/[id] the intake links through,
 * whose resolution carries the match. Null while there is no contract, while
 * loading, or when the lookup fails.
 */
export function useContractQualityMatch(contractId: string | null | undefined) {
  const [state, setState] = useState<{ contractLabel: string | null; match: QualityMatch | null } | null>(null)
  useEffect(() => {
    setState(null)
    if (!contractId) return
    const controller = new AbortController()
    fetch(`/api/contracts/${contractId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body?.contract) return
        setState({
          contractLabel: `#${contractDisplayNumber(body.contract)}`,
          match: body.resolution?.quality_match ?? null,
        })
      })
      .catch(() => {
        // A failed lookup only means no suggestion; the dropdown stays as it is.
      })
    return () => controller.abort()
  }, [contractId])
  return state
}

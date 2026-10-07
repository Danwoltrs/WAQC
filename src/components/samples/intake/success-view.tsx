'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { sampleLabelText, type SampleLabelSource } from '@/lib/sample-reference'
import { sampleOpenHref } from '@/components/command-palette/selection'

/** A sample row as POST /api/samples returns it (the lab unit, or a contract sibling). */
export interface CreatedSample extends SampleLabelSource {
  id: string
  wolthers_contract_nr?: string | null
}

interface SuccessViewProps {
  /** The lab unit first, then the contract siblings created with it. */
  samples: CreatedSample[]
  onReset: () => void
  asDialog?: boolean
}

/**
 * After New Sample: what was created, named as the lab names it to anyone,
 * by the lot's own reference and its contract (Daniel 2026-10-07). A new lot
 * has no certificate number yet, and the SAN- lab number is a backend key
 * that is never shown (CLAUDE.md), so it is neither printed nor in the link:
 * View sample opens the lot by its id.
 */
export function SuccessView({ samples, onReset, asDialog = false }: SuccessViewProps) {
  const Wrapper = asDialog ? 'div' : Card
  const Content = asDialog ? 'div' : CardContent
  const labUnit = samples[0]
  const label = labUnit ? sampleLabelText(labUnit, '') : ''
  const contracts = [
    ...new Set(samples.map((s) => (s.wolthers_contract_nr ?? '').trim()).filter((nr) => nr !== '')),
  ]

  return (
    <Wrapper className={asDialog ? '' : 'w-full max-w-4xl mx-auto'}>
      <Content className={asDialog ? '' : 'pt-6'}>
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-2xl font-semibold">
            {samples.length > 1 ? `${samples.length} samples created` : 'Sample created'}
          </h2>
          {(label || contracts.length > 0) && (
            <div className="space-y-1">
              {label && <p className="font-mono text-lg">{label}</p>}
              {contracts.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {contracts.length === 1 ? 'Contract' : 'Contracts'} {contracts.map((nr) => `#${nr}`).join(', ')}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center justify-center gap-3 mt-4">
            {labUnit && (
              <Button asChild variant="outline" size="lg">
                <Link href={sampleOpenHref(labUnit.id)}>View sample</Link>
              </Button>
            )}
            <Button onClick={onReset} size="lg">
              Create another sample
            </Button>
          </div>
        </div>
      </Content>
    </Wrapper>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import { TinLabelSizeDialog } from '@/components/samples/tin-label-size-dialog'

interface PrintTodayTinLabelsButtonProps {
  /**
   * Bump this to refetch. The host page prints tin labels of its own from a
   * row selection, which consumes part of today's batch.
   */
  refreshToken?: number
  /** Fired after a batch has been printed and stamped. */
  onPrinted?: () => void
  className?: string
}

/**
 * One click prints every lot certified today (Santos time) whose tin label has
 * not been printed yet.
 *
 * The count is always shown, zero included. A greyed-out button with no number
 * reads as broken; in practice an empty batch nearly always means the day's
 * labels are already out of the printer, or nothing has been certified yet.
 * The button says which.
 */
export function PrintTodayTinLabelsButton({
  refreshToken = 0,
  onPrinted,
  className,
}: PrintTodayTinLabelsButtonProps) {
  const [sampleIds, setSampleIds] = useState<string[]>([])
  // Why the batch is empty, when it is. Without this a failing lookup and a
  // genuinely quiet day look identical, and the button silently does nothing.
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/samples/tin-labels/pending-today')
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const detail = data?.details || data?.error || `HTTP ${response.status}`
        console.error('Failed to load today\'s unprinted tin labels:', detail)
        setSampleIds([])
        setError(String(detail))
        return
      }
      setSampleIds(Array.isArray(data?.sample_ids) ? data.sample_ids : [])
      setError(null)
    } catch (err) {
      // A broken badge is not worth interrupting the page for, but it must not
      // be indistinguishable from "nothing to print".
      console.error('Failed to load today\'s unprinted tin labels:', err)
      setSampleIds([])
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, refreshToken])

  const empty = sampleIds.length === 0

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        disabled={empty}
        title={
          error
            ? `Could not load today's batch: ${error}`
            : empty
              ? 'Every lot certified today has already had its tin label printed. Certify a sample, or select rows and use Tin Label to reprint.'
              : `Print tin labels for ${sampleIds.length} lot${sampleIds.length === 1 ? '' : 's'} certified today`
        }
        onClick={() => setDialogOpen(true)}
      >
        <Printer className="h-4 w-4 mr-2" />
        {error ? 'Today unavailable' : `Today${loaded ? ` · ${sampleIds.length}` : ''}`}
      </Button>

      <TinLabelSizeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sampleIds={sampleIds}
        onSuccess={() => {
          refresh()
          onPrinted?.()
        }}
      />
    </>
  )
}

'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'

interface OverrideStatusDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  certificateId: string
  certificateNumber: string
  currentlyRejected: boolean
  onSuccess: () => void
}

export function OverrideStatusDialog({
  open,
  onOpenChange,
  certificateId,
  certificateNumber,
  currentlyRejected,
  onSuccess,
}: OverrideStatusDialogProps) {
  const [newStatus, setNewStatus] = useState<'approved' | 'rejected'>(
    currentlyRejected ? 'approved' : 'rejected'
  )
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Buyer-sample requests still open on sys: a rejection reverses the QC
  // pre-approval, so the seller must be told not to ship. Advisory only.
  const [openRequests, setOpenRequests] = useState<string[]>([])

  useEffect(() => {
    if (!open || newStatus !== 'rejected') {
      setOpenRequests([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(`/api/certificates/${certificateId}/override`)
        if (!response.ok) return
        const data = (await response.json()) as { openBuyerRequests?: Array<{ company: string }> }
        if (!cancelled) setOpenRequests((data.openBuyerRequests ?? []).map((r) => r.company))
      } catch {
        // The notice is advisory: a failed lookup shows nothing.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, newStatus, certificateId])

  const handleSubmit = async () => {
    if (comment.trim().length < 3) {
      setError('Comment must be at least 3 characters')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const response = await fetch(`/api/certificates/${certificateId}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, comment: comment.trim() }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Failed to override status')
        return
      }

      setComment('')
      onOpenChange(false)
      onSuccess()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setComment('')
      setError(null)
    } else {
      // Reset status selection based on current state
      setNewStatus(currentlyRejected ? 'approved' : 'rejected')
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Override Certificate Status</DialogTitle>
          <DialogDescription>
            Override the status of certificate {certificateNumber}.
            A comment explaining the reason is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current status */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Current status:</span>
            {currentlyRejected ? (
              <Badge className="bg-red-600 hover:bg-red-700">Rejected</Badge>
            ) : (
              <Badge className="bg-green-600 hover:bg-green-700">Approved</Badge>
            )}
          </div>

          {/* New status selection */}
          <div className="space-y-2">
            <span className="text-sm font-medium">New status:</span>
            <div className="flex gap-2">
              <Button
                variant={newStatus === 'approved' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewStatus('approved')}
                className={newStatus === 'approved' ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                Approved
              </Button>
              <Button
                variant={newStatus === 'rejected' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewStatus('rejected')}
                className={newStatus === 'rejected' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                Rejected
              </Button>
            </div>
          </div>

          {openRequests.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              {openRequests.map((company) => (
                <p key={company}>A sample request to {company} is open on sys. Tell the seller not to ship.</p>
              ))}
            </div>
          )}

          {/* Comment textarea */}
          <div className="space-y-2">
            <label htmlFor="override-comment" className="text-sm font-medium">
              Reason for override *
            </label>
            <Textarea
              id="override-comment"
              placeholder="e.g., Ears exceed 3% limit per client spec"
              value={comment}
              onChange={(e) => {
                setComment(e.target.value)
                if (error) setError(null)
              }}
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || comment.trim().length < 3}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Confirm Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

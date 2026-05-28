'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Mail, Check, X, Clock, Minus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type RecipientStatus = 'pending' | 'approved' | 'rejected' | 'no_response'

export interface OtherSampleRecipientRow {
  id: string
  client_id: string
  contact_emails: string[]
  status: RecipientStatus
  comments: string | null
  sent_at: string | null
  responded_at: string | null
  responded_by: string | null
  client: {
    id: string
    fantasy_name: string | null
    company: string | null
    country: string | null
    email: string | null
  } | null
}

interface Props {
  sampleId: string
  recipients: OtherSampleRecipientRow[]
  onChange: () => void
}

const STATUS_META: Record<RecipientStatus, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-amber-600 dark:text-amber-400' },
  approved: { label: 'Approved', icon: Check, color: 'text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'Rejected', icon: X, color: 'text-red-600 dark:text-red-400' },
  no_response: { label: 'No response', icon: Minus, color: 'text-muted-foreground' },
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function OtherSampleRecipientsPanel({ sampleId, recipients, onChange }: Props) {
  const { toast } = useToast()
  const [sending, setSending] = useState<string | 'all' | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const send = async (recipientIds?: string[]) => {
    const label = recipientIds && recipientIds.length === 1 ? recipientIds[0] : 'all'
    setSending(label)
    try {
      const resp = await fetch(`/api/samples/${sampleId}/send-to-recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipientIds ? { recipient_ids: recipientIds } : {}),
      })
      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data.error || 'Send failed')
      }
      const failed = (data.results || []).filter((r: any) => !r.ok)
      if (failed.length > 0) {
        toast({
          title: `Sent with ${failed.length} failure(s)`,
          description: failed.map((f: any) => f.error).join('; '),
          variant: 'destructive',
        })
      } else {
        toast({ title: 'Preliminary report sent' })
      }
      onChange()
    } catch (err: any) {
      toast({ title: 'Send failed', description: err.message, variant: 'destructive' })
    } finally {
      setSending(null)
    }
  }

  const updateStatus = async (recipientId: string, status: RecipientStatus) => {
    setUpdatingId(recipientId)
    try {
      const resp = await fetch(`/api/samples/${sampleId}/recipients`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: recipientId, status }),
      })
      if (!resp.ok) {
        const data = await resp.json()
        throw new Error(data.error || 'Update failed')
      }
      onChange()
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' })
    } finally {
      setUpdatingId(null)
    }
  }

  if (recipients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recipients</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No recipients have been added to this sample yet.
          </p>
        </CardContent>
      </Card>
    )
  }

  const pendingCount = recipients.filter(r => r.status === 'pending').length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Recipients ({recipients.length})</CardTitle>
        <Button
          size="sm"
          onClick={() => send()}
          disabled={sending === 'all' || pendingCount === 0}
        >
          {sending === 'all' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
          Send to all pending ({pendingCount})
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {recipients.map(r => {
          const meta = STATUS_META[r.status]
          const StatusIcon = meta.icon
          const name = r.client?.fantasy_name || r.client?.company || 'Unknown client'
          const emails = r.contact_emails.length > 0 ? r.contact_emails : (r.client?.email ? [r.client.email] : [])

          return (
            <div key={r.id} className="rounded-lg border border-input p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{name}</div>
                  <div className="text-xs text-muted-foreground">
                    {emails.length > 0 ? emails.join(', ') : 'No email on file'}
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-xs ${meta.color}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {meta.label}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
                <span>Sent: {formatDate(r.sent_at)} · Responded: {formatDate(r.responded_at)}</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={r.status}
                    onValueChange={(value) => updateStatus(r.id, value as RecipientStatus)}
                    disabled={updatingId === r.id}
                  >
                    <SelectTrigger className="h-7 text-xs w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="no_response">No response</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => send([r.id])}
                    disabled={sending === r.id || emails.length === 0}
                  >
                    {sending === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">{r.sent_at ? 'Resend' : 'Send'}</span>
                  </Button>
                </div>
              </div>

              {r.comments && (
                <div className="text-xs text-muted-foreground italic border-l-2 border-muted-foreground/30 pl-2">
                  {r.comments}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

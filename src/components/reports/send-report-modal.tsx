'use client'

/**
 * Send-by-email modal for a Weekly SS report.
 *
 * Behavior:
 *   - On open: fetches /api/reports/recipients?client_id=...&report_type=weekly_ss
 *     and pre-fills To / Cc / Bcc from whatever was sent last time. First open
 *     for a client returns empty arrays — user pastes manually.
 *   - Server always auto-CCs qualitycontrol@wolthers.com (the same mailbox the
 *     email is sent FROM) so replies thread back into the QC shared inbox.
 *     We show this in the UI as a static notice so the user knows it's there
 *     even though they don't see it in the Cc input.
 *   - On successful send, the server upserts the recipient set so the next
 *     open for this client has it pre-filled — including any edits the user
 *     made (deletes count, additions count).
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Send, AlertCircle, Mail } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const REPORT_TYPE = 'weekly_ss'
const AUTO_CC_MAILBOX = 'qualitycontrol@wolthers.com'

interface SendReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  /** Called after a successful send so the parent can chain UI updates
   *  (e.g. close the parent preview modal too). */
  onSent?: () => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseAddresses(input: string): string[] {
  return input
    .split(/[,;\n\s]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

export function SendReportModal({
  open,
  onOpenChange,
  clientId,
  clientName,
  startDate,
  endDate,
  onSent,
}: SendReportModalProps) {
  const { toast } = useToast()

  const defaultSubject = useMemo(() => {
    const start = formatDateLabel(startDate)
    const end = formatDateLabel(endDate)
    return `${clientName} · Weekly SS Certificates · ${start} – ${end}`
  }, [clientName, startDate, endDate])

  const [toRaw, setToRaw] = useState('')
  const [ccRaw, setCcRaw] = useState('')
  const [bccRaw, setBccRaw] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)

  // Reset subject when defaults change (different client / dates).
  useEffect(() => {
    setSubject(defaultSubject)
  }, [defaultSubject])

  // Load saved recipients when the modal opens for a given client.
  useEffect(() => {
    if (!open || !clientId) return
    let cancelled = false
    async function load() {
      setLoadingRecipients(true)
      try {
        const params = new URLSearchParams({ client_id: clientId, report_type: REPORT_TYPE })
        const res = await fetch(`/api/reports/recipients?${params.toString()}`)
        if (!res.ok) return  // 401/500 -> just don't pre-fill; user types manually
        const data = await res.json()
        if (cancelled) return
        // Pre-fill as comma-separated. The textarea accepts any separator on
        // edit, but commas give the cleanest single-line read on display.
        const toList: string[] = Array.isArray(data?.to) ? data.to : []
        const ccList: string[] = Array.isArray(data?.cc) ? data.cc : []
        const bccList: string[] = Array.isArray(data?.bcc) ? data.bcc : []
        setToRaw(toList.join(', '))
        setCcRaw(ccList.join(', '))
        setBccRaw(bccList.join(', '))
        setLastSentAt(data?.last_sent_at ?? null)
      } catch {
        // Network error — fall through to empty inputs.
      } finally {
        if (!cancelled) setLoadingRecipients(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [open, clientId])

  const toEmails = parseAddresses(toRaw)
  const ccEmails = parseAddresses(ccRaw)
  const bccEmails = parseAddresses(bccRaw)
  const invalidEmails = [...toEmails, ...ccEmails, ...bccEmails].filter(e => !EMAIL_RE.test(e))
  const canSend = toEmails.length > 0 && invalidEmails.length === 0 && !sending && !loadingRecipients

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      const startIso = new Date(startDate).toISOString()
      const endIso = new Date(new Date(endDate).getTime() + 86400000).toISOString()

      const res = await fetch('/api/reports/weekly-ss/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          start_date: startIso,
          end_date: endIso,
          to: toEmails,
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          bcc: bccEmails.length > 0 ? bccEmails : undefined,
          subject: subject.trim() || undefined,
          body: body.trim() || undefined,
        }),
      })

      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        toast({
          title: 'Send failed',
          description: data?.details || data?.error || 'Could not send the report',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Report sent',
        description: `Sent to ${toEmails.length} recipient${toEmails.length === 1 ? '' : 's'}${ccEmails.length ? ` · ${ccEmails.length} cc` : ''} · ${AUTO_CC_MAILBOX} cc'd`,
      })
      // Don't reset inputs — saved server-side, next open will pre-fill anyway.
      onOpenChange(false)
      onSent?.()
    } catch (err) {
      console.error('[SendReportModal] send failed:', err)
      toast({
        title: 'Send failed',
        description: 'Network error — please try again',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Send Weekly SS Report</DialogTitle>
          <DialogDescription className="text-xs">
            Sends from <span className="font-medium">{AUTO_CC_MAILBOX}</span> on behalf of you.
            {lastSentAt && (
              <span className="block mt-1">
                Recipients pre-filled from last send on{' '}
                <span className="font-medium">
                  {new Date(lastSentAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs mb-1.5 block">
              To <span className="text-[#ef4444]">*</span>
            </Label>
            <Textarea
              value={toRaw}
              onChange={e => setToRaw(e.target.value)}
              placeholder={loadingRecipients ? 'Loading saved recipients…' : 'recipient@example.com, another@example.com'}
              rows={2}
              disabled={loadingRecipients}
              className="font-mono text-xs"
            />
            {toEmails.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {toEmails.length} recipient{toEmails.length === 1 ? '' : 's'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Cc</Label>
              <Textarea
                value={ccRaw}
                onChange={e => setCcRaw(e.target.value)}
                placeholder="optional"
                rows={2}
                disabled={loadingRecipients}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Bcc</Label>
              <Textarea
                value={bccRaw}
                onChange={e => setBccRaw(e.target.value)}
                placeholder="optional"
                rows={2}
                disabled={loadingRecipients}
                className="font-mono text-xs"
              />
            </div>
          </div>

          {/* Static notice — the mailbox is always added server-side and
              not editable, so showing it as part of the Cc input would
              confuse "is it there or not?". */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
            <Mail className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              <span className="font-medium">{AUTO_CC_MAILBOX}</span> is automatically added to Cc
              on every send.
            </span>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Subject</Label>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={defaultSubject}
            />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">
              Message
              <span className="text-muted-foreground ml-2 font-normal">(optional — default included)</span>
            </Label>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Leave blank to send a default cover note."
              rows={5}
            />
          </div>

          {invalidEmails.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-[#ef4444] bg-[#ef4444]/10 rounded-md p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Invalid address{invalidEmails.length === 1 ? '' : 'es'}:</p>
                <p className="font-mono">{invalidEmails.join(', ')}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="bg-[#556b2f] hover:bg-[#556b2f]/90"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

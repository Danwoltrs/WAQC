'use client'

/**
 * Send-by-email modal for a report.
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
import { RecipientChips, type RecipientMeta } from '@/components/samples/approval/recipient-chips'
import { SaveContactPrompt } from './save-contact-prompt'
import { buildToList } from '@/lib/reports/recipient-prefill'
import type { QcContactRecord } from '@/lib/qc-contacts/tags'
import type { ReportKind } from './preview-report-modal'

const AUTO_CC_MAILBOX = 'qualitycontrol@wolthers.com'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const key = (email: string) => email.trim().toLowerCase()

function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

interface SendReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: ReportKind
  clientId: string
  clientName: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  /** Only used when kind.reportType === 'annual' */
  year?: number
  /** Called after a successful send so the parent can chain UI updates
   *  (e.g. close the parent preview modal too). */
  onSent?: () => void
}

export function SendReportModal({
  open,
  onOpenChange,
  kind,
  clientId,
  clientName,
  startDate,
  endDate,
  year,
  onSent,
}: SendReportModalProps) {
  const { toast } = useToast()

  const defaultSubject = useMemo(() => {
    if (kind.reportType === 'annual') {
      return `${clientName} · ${kind.label} · ${year ?? ''}`
    }
    const start = formatDateLabel(startDate)
    const end = formatDateLabel(endDate)
    return `${clientName} · ${kind.label} · ${start} – ${end}`
  }, [clientName, kind.label, kind.reportType, startDate, endDate, year])

  const [toEmails, setToEmails] = useState<string[]>([])
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [bccEmails, setBccEmails] = useState<string[]>([])
  const [metaByEmail, setMetaByEmail] = useState<Record<string, RecipientMeta>>({})
  const [saveQueue, setSaveQueue] = useState<string[]>([])
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [contactsFailed, setContactsFailed] = useState(false)
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)

  // Reset subject when defaults change (different client / dates).
  useEffect(() => {
    setSubject(defaultSubject)
  }, [defaultSubject])

  // Pre-fill from BOTH sources on open: the company's tagged QC contacts
  // (durable) and the addresses used on the last send (one-off extras).
  // Either failing is non-fatal — the sender can always type addresses.
  useEffect(() => {
    if (!open || !clientId) return
    let cancelled = false
    async function load() {
      setLoadingRecipients(true)
      setContactsFailed(false)
      setSaveQueue([])
      setSkipped(new Set())

      const params = new URLSearchParams({ client_id: clientId, report_type: kind.reportType })
      const [contactsRes, savedRes] = await Promise.allSettled([
        fetch(`/api/companies/${clientId}/qc-contacts`),
        fetch(`/api/reports/recipients?${params.toString()}`),
      ])

      let contacts: QcContactRecord[] = []
      if (contactsRes.status === 'fulfilled' && contactsRes.value.ok) {
        const data = await contactsRes.value.json().catch(() => ({}))
        contacts = [...(data?.people ?? []), ...(data?.groups ?? [])]
      } else if (!cancelled) {
        setContactsFailed(true)
      }

      let savedTo: string[] = []
      if (savedRes.status === 'fulfilled' && savedRes.value.ok) {
        const data = await savedRes.value.json().catch(() => ({}))
        savedTo = Array.isArray(data?.to) ? data.to : []
        if (!cancelled) {
          setCcEmails(Array.isArray(data?.cc) ? data.cc : [])
          setBccEmails(Array.isArray(data?.bcc) ? data.bcc : [])
          setLastSentAt(data?.last_sent_at ?? null)
        }
      }

      if (cancelled) return
      const list = buildToList(contacts, savedTo)
      setToEmails(list.map((r) => r.email))
      setMetaByEmail(
        Object.fromEntries(
          list.map((r) => [key(r.email), { name: r.name, isGroup: r.isGroup, contactId: r.contactId }]),
        ),
      )
      setLoadingRecipients(false)
    }
    load()
    return () => { cancelled = true }
  }, [open, kind.reportType, clientId])

  const invalidEmails = [...toEmails, ...ccEmails, ...bccEmails].filter((e) => !EMAIL_RE.test(e))
  const canSend = toEmails.length > 0 && invalidEmails.length === 0 && !sending && !loadingRecipients

  const pendingSave = saveQueue[0] ?? null

  const enqueueSave = (email: string) => {
    setSaveQueue((q) => (q.some((e) => key(e) === key(email)) ? q : [...q, email]))
  }

  // Prompt only for addresses the sender just added that we know nothing
  // about and haven't already been offered this session.
  //
  // The chip component's own duplicate check is case-sensitive, so typing
  // MARIEKE@ahold.nl next to marieke@ahold.nl would otherwise put both in the
  // list and mail the person twice. De-duplicate case-insensitively here.
  const handleToChange = (next: string[]) => {
    const deduped: string[] = []
    const seen = new Set<string>()
    for (const e of next) {
      if (seen.has(key(e))) continue
      seen.add(key(e))
      deduped.push(e)
    }
    const added = deduped.filter((e) => !toEmails.some((x) => key(x) === key(e)))
    setToEmails(deduped)
    for (const email of added) {
      if (!EMAIL_RE.test(email)) continue
      if (metaByEmail[key(email)]?.contactId) continue
      if (skipped.has(key(email))) continue
      enqueueSave(email)
    }
  }

  const handleSaved = (email: string, contact: QcContactRecord) => {
    setMetaByEmail((m) => ({
      ...m,
      [key(email)]: {
        name: (contact.name ?? '').trim() || null,
        isGroup: !!contact.is_group,
        contactId: contact.id,
      },
    }))
    setSaveQueue((q) => q.slice(1))
  }

  const handleSkip = (email: string) => {
    setSkipped((s) => new Set(s).add(key(email)))
    setSaveQueue((q) => q.slice(1))
  }

  // Untag = stop pre-filling next time. The address stays in this send.
  const handleUntag = async (contactId: string, email: string) => {
    try {
      const res = await fetch(`/api/companies/${clientId}/qc-contacts/${contactId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        toast({ title: 'Could not update the contact', variant: 'destructive' })
        return
      }
      setMetaByEmail((m) => ({
        ...m,
        [key(email)]: { name: m[key(email)]?.name ?? null, isGroup: !!m[key(email)]?.isGroup, contactId: null },
      }))
      toast({
        title: 'Removed from pre-fill',
        description: `${email} won't pre-fill for ${clientName} next time. Still on this send.`,
      })
    } catch {
      toast({ title: 'Could not update the contact', variant: 'destructive' })
    }
  }

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      const basePayload =
        kind.reportType === 'annual'
          ? { client_id: clientId, year }
          : {
              client_id: clientId,
              start_date: new Date(startDate).toISOString(),
              // End is exclusive — include the selected end day in the window.
              end_date: new Date(new Date(endDate).getTime() + 86400000).toISOString(),
            }

      const res = await fetch(kind.sendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...basePayload,
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
          <DialogTitle className="text-sm">Send {kind.label}</DialogTitle>
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
            <RecipientChips
              label="TO"
              emails={toEmails}
              onChange={handleToChange}
              meta={metaByEmail}
              onSaveRequest={enqueueSave}
              onUntag={handleUntag}
            />
            {loadingRecipients && (
              <p className="text-xs text-muted-foreground mt-1">Loading recipients…</p>
            )}
            {contactsFailed && !loadingRecipients && (
              <p className="text-xs text-muted-foreground mt-1">
                Couldn&apos;t load {clientName}&apos;s saved contacts — add recipients manually.
              </p>
            )}
            {toEmails.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {toEmails.length} recipient{toEmails.length === 1 ? '' : 's'}
              </p>
            )}
          </div>

          {pendingSave && (
            <SaveContactPrompt
              key={pendingSave}
              companyId={clientId}
              companyName={clientName}
              email={pendingSave}
              onSaved={(contact) => handleSaved(pendingSave, contact)}
              onSkip={() => handleSkip(pendingSave)}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Cc</Label>
              <RecipientChips label="CC" emails={ccEmails} onChange={setCcEmails} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Bcc</Label>
              <RecipientChips label="BCC" emails={bccEmails} onChange={setBccEmails} />
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

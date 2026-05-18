'use client'

/**
 * Send-by-email modal for a Weekly SS report.
 *
 * Lets the user enter to/cc/bcc recipients (free-form, comma-separated),
 * optionally override the auto-generated subject + body, and dispatches to
 * /api/reports/weekly-ss/send. The server generates the PDF fresh and sends
 * it via Microsoft Graph from qualitycontrol@wolthers.com on behalf of the
 * logged-in user.
 *
 * Recipient suggestions / contact picker are deliberately out of scope for
 * v1 — the user pastes addresses. We'll add an autocomplete fed by
 * company_contacts in a follow-up once we know which contact tables the
 * client cases actually use.
 */

import { useState, useMemo } from 'react'
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
import { Loader2, Send, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface SendReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
}

// Permissive but cheap email check — the server runs the same regex; this
// just gives users feedback before submission.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseAddresses(input: string): string[] {
  // Accept comma, semicolon, newline, or space separators — whatever the user
  // happens to paste from Outlook / a contact list.
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

  // Resync the default subject when the modal is re-opened with new params.
  useMemo(() => setSubject(defaultSubject), [defaultSubject])

  const toEmails = parseAddresses(toRaw)
  const ccEmails = parseAddresses(ccRaw)
  const bccEmails = parseAddresses(bccRaw)
  const invalidEmails = [...toEmails, ...ccEmails, ...bccEmails].filter(e => !EMAIL_RE.test(e))
  const canSend = toEmails.length > 0 && invalidEmails.length === 0 && !sending

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      // Bump end-date to the day after so the server's [start, end) window
      // includes the user-selected end day.
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
        description: `Sent to ${toEmails.length} recipient${toEmails.length === 1 ? '' : 's'}`,
      })
      // Reset and close
      setToRaw('')
      setCcRaw('')
      setBccRaw('')
      setBody('')
      onOpenChange(false)
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
            Sends from <span className="font-medium">qualitycontrol@wolthers.com</span> on behalf of
            you. PDF is regenerated fresh from current data — the recipient sees the same file the
            Generate button would produce.
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
              placeholder="recipient@example.com, another@example.com"
              rows={2}
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
                className="font-mono text-xs"
              />
            </div>
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

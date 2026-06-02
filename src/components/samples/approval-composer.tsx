'use client'

import { useEffect, useState } from 'react'

interface Props {
  sampleId: string
  open: boolean
  onClose: () => void
  onSent?: () => void
}

interface Prefill {
  sample: {
    tracking_number: string
    status: 'approved' | 'rejected' | string
    origin: string | null
    quality_name: string | null
    cupping_score: number | null
    contract_number: string | null
  }
  defaultTo: { name: string | null; email: string }[]
  defaultCc: { name: string | null; email: string }[]
  certificateAvailable: boolean
}

export function ApprovalComposer({ sampleId, open, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [includeCert, setIncludeCert] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch(`/api/samples/${sampleId}/approval-recipients`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load')
        return r.json()
      })
      .then((p: Prefill) => {
        const decision = p.sample.status === 'approved' ? 'approved' : 'rejected'
        setTo(p.defaultTo.map((c) => c.email).join(', '))
        setCc(p.defaultCc.map((c) => c.email).join(', '))
        const word = decision === 'approved' ? 'Approval' : 'Rejection'
        const tail = [p.sample.contract_number, p.sample.quality_name]
          .filter(Boolean)
          .join(' ')
        setSubject(
          `Quality ${word} — ${p.sample.tracking_number}${tail ? ` — ${tail}` : ''}`,
        )
        const verb = decision === 'approved' ? 'APPROVED' : 'REJECTED'
        const lines = [
          'Dear team,',
          '',
          `The quality sample ${p.sample.tracking_number} has been ${verb} by Wolthers Quality Control.`,
          '',
          p.sample.contract_number ? `Contract: ${p.sample.contract_number}` : '',
          p.sample.quality_name ? `Quality: ${p.sample.quality_name}` : '',
          p.sample.origin ? `Origin: ${p.sample.origin}` : '',
          p.sample.cupping_score != null
            ? `Cupping score: ${p.sample.cupping_score}`
            : '',
          `Certificate no.: ${p.sample.tracking_number}`,
          '',
          decision === 'approved'
            ? 'The quality certificate is attached.'
            : 'The rejection certificate is attached.',
          '',
          'Best regards,',
          'Wolthers Quality Control',
        ].filter((l, i, a) => !(l === '' && a[i - 1] === ''))
        setBodyText(lines.join('\n'))
        setIncludeCert(p.certificateAvailable)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, sampleId])

  if (!open) return null

  async function send() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/samples/${sampleId}/notify-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.split(',').map((s) => s.trim()).filter(Boolean),
          cc: cc.split(',').map((s) => s.trim()).filter(Boolean),
          subject,
          bodyText,
          includeCertificate: includeCert,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Send failed')
      onSent?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const input =
    'w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-[20px] bg-white p-6 shadow-xl dark:bg-[#2A2A2A]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Notify counterparties</h2>
          <button onClick={onClose} className="text-sm opacity-60 hover:opacity-100">
            Close
          </button>
        </div>

        {loading ? (
          <p className="text-sm opacity-60">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs opacity-60">To</label>
              <input className={input} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs opacity-60">Cc</label>
              <input className={input} value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div>
              <label className="text-xs opacity-60">Subject</label>
              <input
                className={input}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs opacity-60">Message</label>
              <textarea
                className={`${input} min-h-[180px]`}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeCert}
                onChange={(e) => setIncludeCert(e.target.checked)}
              />
              Attach certificate PDF and annex to contract
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm opacity-70 hover:opacity-100"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={sending || !to.trim()}
                className="rounded-lg bg-[#556b2f] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

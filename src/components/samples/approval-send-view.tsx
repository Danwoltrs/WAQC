'use client'

import { useEffect, useState } from 'react'
import { RecipientPanel, type PanelState } from './approval/recipient-panel'
import { CertificatePreview } from './approval/certificate-preview'
import {
  buildSampleApprovedSubject,
  buildSampleApprovedBody,
} from '@/lib/approval-notification/sample-approved-template'
import type { ApprovalPrefill, ApprovalSide } from '@/lib/approval-notification/types'

interface Props {
  sampleId: string
  open: boolean
  onClose: () => void
  onSent?: () => void
}

interface PanelWithSide extends PanelState {
  side: ApprovalSide
  subject: string
}

export function ApprovalSendView({ sampleId, open, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [certAvailable, setCertAvailable] = useState(true)
  const [includeCert, setIncludeCert] = useState(true)
  const [includeSignature, setIncludeSignature] = useState(true)
  const [panels, setPanels] = useState<PanelWithSide[]>([])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch(`/api/samples/${sampleId}/approval-recipients`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load')
        return (await r.json()) as ApprovalPrefill
      })
      .then((p) => {
        const fields = p.sample
        const make = (side: ApprovalSide, title: string): PanelWithSide => {
          const panel = side === 'seller' ? p.panels.seller : p.panels.buyer
          const tmplInput = {
            decision: fields.status,
            greeting: panel.greeting,
            contractNumber: fields.contractNumber,
            sellerReference: fields.sellerReference,
            buyerReference: fields.buyerReference,
            sampleType: fields.sampleType ?? 'pss',
            sampleCode: fields.sampleCode,
            trackingNumber: fields.trackingNumber,
            awb: fields.awb,
            courier: fields.courier,
            comments: fields.comments,
          }
          return {
            side,
            title,
            to: panel.to.map((c) => c.email),
            cc: panel.cc.map((c) => c.email),
            subject: buildSampleApprovedSubject(tmplInput),
            body: buildSampleApprovedBody(tmplInput),
          }
        }
        // Seller top, Buyer bottom.
        setPanels([make('seller', 'SELLER'), make('buyer', 'BUYER')])
        setCertAvailable(p.certificateAvailable)
        setIncludeCert(p.certificateAvailable)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, sampleId])

  if (!open) return null

  const updatePanel = (i: number, next: PanelState) =>
    setPanels((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...next } : p)))

  async function send() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/samples/${sampleId}/notify-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          includeCertificate: includeCert,
          includeSignature,
          panels: panels
            .filter((p) => p.to.length > 0)
            .map((p) => ({ side: p.side, to: p.to, cc: p.cc, subject: p.subject, bodyText: p.body })),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed')
      const failures = (data.results ?? []).filter((r: { ok: boolean }) => !r.ok)
      if (failures.length > 0) {
        setError(
          `Sent, but delivery failed for: ${failures
            .map((f: { side: string }) => f.side)
            .join(', ')}. You can adjust recipients and retry.`,
        )
        return
      }
      onSent?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-[#2A2A2A]">
      <div className="flex h-12 items-center justify-between border-b border-black/10 px-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">Approval — Send</h2>
        <button onClick={onClose} className="text-sm opacity-60 hover:opacity-100">Close</button>
      </div>
      {loading ? (
        <p className="p-6 text-sm opacity-60">Loading…</p>
      ) : (
        <div className="grid h-[calc(100vh-3rem)] grid-cols-1 gap-4 overflow-auto p-4 lg:grid-cols-2">
          <div className="space-y-4">
            {panels.map((p, i) => (
              <RecipientPanel
                key={p.side}
                title={p.title}
                to={p.to}
                cc={p.cc}
                body={p.body}
                onChange={(next) => updatePanel(i, next)}
              />
            ))}
            <p className="text-xs italic opacity-50">Each recipient sees only their own greeting on send.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeCert} disabled={!certAvailable}
                onChange={(e) => setIncludeCert(e.target.checked)} />
              Attach certificate PDF and annex to contract
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeSignature}
                onChange={(e) => setIncludeSignature(e.target.checked)} />
              Include HTML signature
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end">
              <button
                onClick={send}
                disabled={sending || panels.every((p) => p.to.length === 0)}
                className="rounded-lg bg-[#556b2f] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send to both'}
              </button>
            </div>
          </div>
          <CertificatePreview sampleId={sampleId} available={certAvailable} />
        </div>
      )}
    </div>
  )
}

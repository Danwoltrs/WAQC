'use client'

import type { BatchUnitSample } from '@/lib/approval-notification/batch-send'
import type { SellerRequests } from '@/lib/seller-requests/types'
import { SellerRequestRows, type RequestMember } from './seller-request-ticks'

interface Props {
  /** The email's certificates; only approved PSS with ticks show. */
  samples: BatchUnitSample[]
  value: Record<string, SellerRequests>
  onChange: (next: Record<string, SellerRequests>) => void
  /** Buyer sample ticked with no destination yet (Send waits for a pick). */
  pending: ReadonlySet<string>
  onPendingChange: (next: Set<string>) => void
}

/** The certificates of a seller email that carry seller requests. */
export function requestSamples(samples: BatchUnitSample[]): BatchUnitSample[] {
  return samples.filter(
    (s) => !!s.sellerRequest && s.decision === 'approved' && s.sampleType?.trim().toLowerCase() === 'pss',
  )
}

/** "42235/26 · Cert SAG-011895/26": the contract and the certificate, never the internal sample number. */
function sampleLabel(s: BatchUnitSample): string {
  const parts = [s.contractNumber, s.certNumber ? `Cert ${s.certNumber}` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Certificate'
}

/**
 * The composer's "Requests to seller" card: per approved PSS certificate, send
 * a sample to the buyer (with its destination) and inform the stuffing. Saved
 * on the sample when the email is sent, never on Skip.
 */
export function RequestsCard({ samples, value, onChange, pending, onPendingChange }: Props) {
  const members: RequestMember[] = requestSamples(samples).map((s) => {
    const r = s.sellerRequest!
    return {
      sampleId: s.sampleId,
      heading: sampleLabel(s),
      requests: r.requests,
      locks: r.locks,
      clientId: r.clientId,
      clientName: r.clientName,
      importerId: r.importerId,
      roasterId: r.roasterId,
    }
  })
  if (members.length === 0) return null

  return (
    <div className="rounded-[10px] border border-black/10 p-4 dark:border-white/15">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">Requests to seller</div>
      <SellerRequestRows
        members={members}
        value={value}
        onChange={onChange}
        pending={pending}
        onPendingChange={onPendingChange}
      />
    </div>
  )
}

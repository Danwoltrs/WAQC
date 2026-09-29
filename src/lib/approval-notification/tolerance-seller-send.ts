import type { SupabaseClient } from '@supabase/supabase-js'
import type { BatchUnit } from './batch-send'
import { loadSendQueue } from './send-queue'
import { sendCertificateUnit, type UnitSender } from './send-unit'

export interface SellerNoticeOutcome {
  /** Sellers emailed now. */
  sent: string[]
  /** Sellers not emailed (no QC contact, or the send failed): they stay unsent
   *  for the end-of-day batch. */
  waiting: string[]
}

/**
 * Email the seller of a lot just approved with comments, now.
 *
 * Daniel, 2026-09-29: the seller and the QC department hear at once; the buyer
 * gets the certificate with the rest at the end of the day. The unit is built
 * and sent by the same code as the batch (recipients from contacts tagged
 * qc_certificates, head office CC'd, no certificate attached), and the send is
 * logged per certificate for the seller side, so the evening batch sends the
 * buyer side only.
 *
 * Never throws: the lot is already approved and certified, and a mail failure
 * must not undo that. A seller that could not be emailed is simply left for the
 * batch.
 */
export async function sendSellerNoticeNow(
  db: SupabaseClient<any>,
  sampleIds: string[],
  sender: UnitSender,
): Promise<SellerNoticeOutcome> {
  const out: SellerNoticeOutcome = { sent: [], waiting: [] }
  try {
    const queue = await loadSendQueue(db, {
      wantDecisions: new Set(['approved']),
      explicitIds: sampleIds,
      onlySide: 'seller',
      clientsView: false,
      chosenClients: null,
    })
    const units = ((queue.body.units ?? []) as BatchUnit[]).filter((u) => u.side === 'seller')
    for (const u of units) {
      if (u.needsRecipients || u.to.length === 0) {
        out.waiting.push(u.companyName)
        continue
      }
      const res = await sendCertificateUnit(
        db,
        {
          side: 'seller',
          companyId: u.companyId,
          to: u.to,
          cc: u.cc,
          subject: u.subject,
          bodyText: u.body,
          certRefs: u.samples.map((s) => ({ sampleId: s.sampleId })),
          includeSignature: true,
          includeCertificates: false,
        },
        sender,
        // The caller has already checked the user is lab staff.
        async () => true,
      )
      if (res.status === 200) out.sent.push(u.companyName)
      else {
        console.error(`[seller-notice] send to ${u.companyName} failed:`, res.body.error)
        out.waiting.push(u.companyName)
      }
    }
  } catch (e) {
    console.error('[seller-notice] could not build or send the seller email:', e)
  }
  return out
}

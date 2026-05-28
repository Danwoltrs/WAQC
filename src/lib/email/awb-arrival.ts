import { Resend } from 'resend'
import { escapeHtml, isValidEmail } from '@/lib/html'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface AwbArrivalEmailInput {
  trackingNumber: string
  awbNumber: string
  courierName?: string | null
  buyerName: string
  buyerEmail: string
  sampleSubType?: string | null
  origin?: string | null
  qualityName?: string | null
  senderName?: string | null
}

/**
 * Sends the "your sample arrived" email to the buyer when an Other Sample is
 * received at the lab.
 *
 * All interpolated values are HTML-escaped (most originate in DB / intake-form
 * text, which can contain user-supplied content). The recipient address is
 * validated before being passed to Resend.
 */
export async function sendAwbArrivalEmail(input: AwbArrivalEmailInput): Promise<{ ok: boolean; error?: string }> {
  if (!isValidEmail(input.buyerEmail)) {
    return { ok: false, error: 'Missing or invalid buyer email' }
  }

  const courierLine = input.courierName
    ? `${input.courierName} — AWB ${input.awbNumber}`
    : `AWB ${input.awbNumber}`

  // Subject lines are plain text (no HTML), so they only need to be reasonable
  // length-wise — Resend forwards them as-is in the Subject: header.
  const subject = `AWB ${input.awbNumber} received for sample ${input.trackingNumber}`

  const buyerNameSafe = escapeHtml(input.buyerName)
  const courierLineSafe = escapeHtml(courierLine)
  const trackingNumberSafe = escapeHtml(input.trackingNumber)
  const sampleSubTypeSafe = input.sampleSubType ? escapeHtml(input.sampleSubType.toUpperCase()) : ''
  const originSafe = input.origin ? escapeHtml(input.origin) : ''
  const qualityNameSafe = input.qualityName ? escapeHtml(input.qualityName) : ''
  const senderNameSafe = input.senderName ? escapeHtml(input.senderName) : ''

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #556b2f;">Sample arrived in the lab</h2>
      <p>Hello ${buyerNameSafe},</p>
      <p>The sample shipped under <strong>${courierLineSafe}</strong> has been received at the Wolthers lab and is being processed.</p>
      <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr><td style="color: #888; padding: 4px 12px 4px 0;">Tracking number</td><td><strong>${trackingNumberSafe}</strong></td></tr>
        ${sampleSubTypeSafe ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Sample type</td><td>${sampleSubTypeSafe}</td></tr>` : ''}
        ${originSafe ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Origin</td><td>${originSafe}</td></tr>` : ''}
        ${qualityNameSafe ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Quality</td><td>${qualityNameSafe}</td></tr>` : ''}
        <tr><td style="color: #888; padding: 4px 12px 4px 0;">Courier</td><td>${courierLineSafe}</td></tr>
      </table>
      <p>You will receive a separate email once the preliminary cupping and analysis are complete.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="color: #888; font-size: 12px;">
        ${senderNameSafe ? `Sent by ${senderNameSafe}<br />` : ''}
        Wolthers Quality Control<br />
        This is an automated notification.
      </p>
    </div>
  `

  try {
    const { error } = await resend.emails.send({
      from: 'Wolthers QC <qualitycontrol@wolthers.com>',
      to: input.buyerEmail,
      subject,
      html,
    })
    if (error) {
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

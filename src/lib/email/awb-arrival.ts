import { Resend } from 'resend'

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

export async function sendAwbArrivalEmail(input: AwbArrivalEmailInput): Promise<{ ok: boolean; error?: string }> {
  if (!input.buyerEmail) {
    return { ok: false, error: 'No buyer email provided' }
  }

  const courierLine = input.courierName
    ? `${input.courierName} — AWB ${input.awbNumber}`
    : `AWB ${input.awbNumber}`

  const subject = `AWB ${input.awbNumber} received for sample ${input.trackingNumber}`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #556b2f;">Sample arrived in the lab</h2>
      <p>Hello ${input.buyerName},</p>
      <p>The sample shipped under <strong>${courierLine}</strong> has been received at the Wolthers lab and is being processed.</p>
      <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr><td style="color: #888; padding: 4px 12px 4px 0;">Tracking number</td><td><strong>${input.trackingNumber}</strong></td></tr>
        ${input.sampleSubType ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Sample type</td><td>${input.sampleSubType.toUpperCase()}</td></tr>` : ''}
        ${input.origin ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Origin</td><td>${input.origin}</td></tr>` : ''}
        ${input.qualityName ? `<tr><td style="color: #888; padding: 4px 12px 4px 0;">Quality</td><td>${input.qualityName}</td></tr>` : ''}
        <tr><td style="color: #888; padding: 4px 12px 4px 0;">Courier</td><td>${courierLine}</td></tr>
      </table>
      <p>You will receive a separate email once the preliminary cupping and analysis are complete.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="color: #888; font-size: 12px;">
        ${input.senderName ? `Sent by ${input.senderName}<br />` : ''}
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

/**
 * Microsoft Graph email sender.
 *
 * Ported from sys.wolthers.com — handles both small (inline) and large
 * (chunked upload session) attachments transparently. Callers don't pick
 * the path; the router below decides based on total attachment size.
 *
 * For WAQC the primary use case is sending generated report PDFs from
 * qualitycontrol@wolthers.com on behalf of the logged-in user, so Outlook
 * shows "<User Name> on behalf of Quality Control".
 */

import { getGraphToken } from './token'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

/**
 * Inline attachment threshold. Below this we use the fast single-call
 * /sendMail path (base64 contentBytes inlined). Above, we switch to the
 * chunked upload session flow (create draft → createUploadSession → PUT
 * chunks → send) which Graph caps at ~150 MB per attachment.
 *
 * Graph rejects /sendMail payloads >4 MB. After base64 inflation (~33%),
 * 2.5 MB raw stays under that limit even with subject/body overhead.
 */
const INLINE_ATTACHMENT_THRESHOLD = 2.5 * 1024 * 1024

/**
 * Hard ceiling per attachment. Graph's chunked upload session accepts up
 * to 150 MB; we surface a clean error above that so callers don't get an
 * opaque Graph 413.
 */
export const MAX_ATTACHMENT_BYTES = 150 * 1024 * 1024

/**
 * Chunk size for the upload session PUT loop. Graph recommends multiples
 * of 320 KB (327,680 B). 10 × 320 KB = 3.1 MB balances throughput with
 * memory + latency and stays under Graph's per-chunk cap.
 */
const UPLOAD_CHUNK_SIZE = 10 * 327_680

export interface GraphSendAttachment {
  name: string
  contentType: string
  bytes: Uint8Array
}

export interface GraphSendParams {
  /** The "from" mailbox — must be a real mailbox in the tenant. */
  mailbox: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  /** Plain-text body. Sent as contentType "Text" when bodyHtml is absent;
   *  used as the fallback plain-text part otherwise. */
  bodyText: string
  /** HTML body. When provided, the email is sent as HTML and bodyText is
   *  ignored (Graph only supports one content type). */
  bodyHtml?: string
  attachments?: GraphSendAttachment[]
  saveToSentItems?: boolean
  /**
   * "Send on Behalf Of" — the individual user who actually composed the
   * message. Graph renders this in Outlook as:
   *   "Daniel Wolthers <wolthers@gmail.com> on behalf of
   *    Quality Control <qualitycontrol@wolthers.com>"
   * Requires Send-on-Behalf-Of permission granted on the mailbox in
   * Exchange admin (or Mail.Send application permission, which we use).
   */
  senderEmail?: string
  senderName?: string
}

export class GraphSendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly graphCode: string | null,
    public readonly details: unknown,
  ) {
    super(message)
    this.name = 'GraphSendError'
  }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

async function throwGraphError(
  res: Response,
  context: string,
): Promise<never> {
  let graphCode: string | null = null
  let details: unknown = null
  try {
    const errBody = (await res.json()) as {
      error?: { code?: string; message?: string; innerError?: unknown }
    }
    graphCode = errBody.error?.code ?? null
    details = errBody.error ?? null
  } catch {
    details = await res.text().catch(() => null)
  }
  // Log the full Graph error (incl. innerError + request-id) so failures like
  // 403 ErrorAccessDenied can be diagnosed from server logs, not just the terse
  // "<context>: 403 ErrorAccessDenied" string surfaced to callers.
  console.error(`[graph] ${context}:`, res.status, graphCode, JSON.stringify(details))
  throw new GraphSendError(
    `${context}: ${res.status} ${graphCode ?? ''}`.trim(),
    res.status,
    graphCode,
    details,
  )
}

/**
 * Public entry point. Routes to inline or chunked path based on total
 * attachment bytes.
 */
export async function sendMail(params: GraphSendParams): Promise<void> {
  const attachments = params.attachments ?? []
  for (const att of attachments) {
    if (att.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new GraphSendError(
        `Attachment "${att.name}" is ${(att.bytes.byteLength / 1024 / 1024).toFixed(1)} MB; max per attachment is ${(MAX_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0)} MB.`,
        413,
        'attachment_too_large',
        { name: att.name, size: att.bytes.byteLength },
      )
    }
  }

  const totalBytes = attachments.reduce(
    (s, a) => s + a.bytes.byteLength,
    0,
  )

  if (totalBytes <= INLINE_ATTACHMENT_THRESHOLD) {
    await sendInline(params)
  } else {
    await sendChunked(params)
  }
}

function buildMessagePayload(params: GraphSendParams) {
  const useHtml = !!params.bodyHtml
  const msg: Record<string, unknown> = {
    subject: params.subject,
    body: useHtml
      ? { contentType: 'HTML', content: params.bodyHtml }
      : { contentType: 'Text', content: params.bodyText },
    toRecipients: params.to.map((addr) => ({
      emailAddress: { address: addr },
    })),
    ccRecipients: (params.cc ?? []).map((addr) => ({
      emailAddress: { address: addr },
    })),
    bccRecipients: (params.bcc ?? []).map((addr) => ({
      emailAddress: { address: addr },
    })),
  }
  // "Send on behalf of" only works for a mailbox the QC mailbox can act for —
  // i.e. another tenant (@wolthers.com) user. Setting `sender` to an external
  // address (e.g. a personal gmail used as a profile email) makes Graph reject
  // the send with 403 ErrorAccessDenied. For non-tenant senders, omit `sender`
  // so the message goes out plainly as the mailbox itself.
  // Diagnostic kill-switch: set MICROSOFT_GRAPH_DISABLE_SENDER=true to stop
  // stamping the on-behalf-of sender and send plainly as the mailbox itself.
  // Lets us isolate whether a 403 ErrorAccessDenied comes from the on-behalf-of
  // sender stamp (the app acting for another mailbox) vs the QC mailbox's own
  // Mail.Send authorization (app-permission consent / Exchange app access policy).
  const onBehalfDisabled = process.env.MICROSOFT_GRAPH_DISABLE_SENDER === 'true'
  if (
    !onBehalfDisabled &&
    params.senderEmail &&
    /@wolthers\.com$/i.test(params.senderEmail)
  ) {
    msg.sender = {
      emailAddress: {
        address: params.senderEmail,
        name: params.senderName ?? params.senderEmail,
      },
    }
  }
  return msg
}

/** Fast path: single /sendMail with attachments base64-inlined. */
async function sendInline(params: GraphSendParams): Promise<void> {
  const token = await getGraphToken()
  const attachments = params.attachments ?? []

  const payload = {
    message: {
      ...buildMessagePayload(params),
      attachments: attachments.map((att) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.name,
        contentType: att.contentType,
        contentBytes: toBase64(att.bytes),
      })),
    },
    saveToSentItems: params.saveToSentItems !== false,
  }

  const res = await fetch(
    `${GRAPH_BASE}/users/${encodeURIComponent(params.mailbox)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )

  if (!res.ok) await throwGraphError(res, 'Graph sendMail failed')
}

/**
 * Big-attachment path: create draft → upload each attachment via upload
 * session (PUT in ~3 MB chunks) → POST /send.
 * Requires Mail.ReadWrite to mutate drafts (Mail.Send alone only covers
 * /sendMail). On any failure after draft creation, the draft is deleted so
 * we don't leave orphans in the mailbox's Drafts folder.
 */
async function sendChunked(params: GraphSendParams): Promise<void> {
  const token = await getGraphToken()
  const userBase = `${GRAPH_BASE}/users/${encodeURIComponent(params.mailbox)}`

  const draftRes = await fetch(`${userBase}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildMessagePayload(params)),
  })

  if (!draftRes.ok) {
    await throwGraphError(draftRes, 'Graph draft create failed')
  }

  const draft = (await draftRes.json()) as { id: string }
  const draftId = draft.id

  try {
    for (const att of params.attachments ?? []) {
      await uploadAttachmentChunked(token, userBase, draftId, att)
    }

    const sendRes = await fetch(`${userBase}/messages/${draftId}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!sendRes.ok) {
      await throwGraphError(sendRes, 'Graph draft send failed')
    }
  } catch (err) {
    // Best-effort cleanup; surface the original send failure regardless.
    await fetch(`${userBase}/messages/${draftId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
    throw err
  }
}

async function uploadAttachmentChunked(
  token: string,
  userBase: string,
  draftId: string,
  att: GraphSendAttachment,
): Promise<void> {
  const sessionRes = await fetch(
    `${userBase}/messages/${draftId}/attachments/createUploadSession`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        AttachmentItem: {
          attachmentType: 'file',
          name: att.name,
          size: att.bytes.byteLength,
          contentType: att.contentType,
        },
      }),
    },
  )

  if (!sessionRes.ok) {
    await throwGraphError(
      sessionRes,
      `Graph createUploadSession failed for "${att.name}"`,
    )
  }

  const session = (await sessionRes.json()) as { uploadUrl: string }
  const uploadUrl = session.uploadUrl
  const total = att.bytes.byteLength

  // PUT chunks sequentially. uploadUrl is pre-authenticated so we deliberately
  // DON'T send the Graph bearer token on chunk PUTs (some Graph storage
  // backends return 401 if we do).
  for (let offset = 0; offset < total; offset += UPLOAD_CHUNK_SIZE) {
    const end = Math.min(offset + UPLOAD_CHUNK_SIZE, total)
    const chunk = att.bytes.slice(offset, end)
    const contentRange = `bytes ${offset}-${end - 1}/${total}`

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.byteLength),
        'Content-Range': contentRange,
      },
      body: chunk,
    })

    // 202 Accepted on intermediate chunks, 200/201 on final chunk once
    // the attachment is committed. Anything else is an error.
    if (
      chunkRes.status !== 200 &&
      chunkRes.status !== 201 &&
      chunkRes.status !== 202
    ) {
      await throwGraphError(
        chunkRes,
        `Graph upload chunk failed at ${contentRange} for "${att.name}"`,
      )
    }
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./token', () => ({ getGraphToken: vi.fn(async () => 'token-1') }))

import { sendMail, GraphSendError } from './send'

const USER_BASE = 'https://graph.microsoft.com/v1.0/users/qualitycontrol%40wolthers.com'

const base = {
  mailbox: 'qualitycontrol@wolthers.com',
  to: ['seller@example.com'],
  cc: ['wolthers@wolthers.com'],
  subject: 'PSS Quality Report',
  bodyText: 'Dear all,',
  bodyHtml: '<p>Dear all,</p>',
  senderEmail: 'anderson@wolthers.com',
  senderName: 'Anderson Nunes',
}
const pdf = { name: 'SAK-011877_26.pdf', contentType: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const empty = (status: number) => new Response(null, { status })

let fetchMock: ReturnType<typeof vi.fn>
const calls = () => fetchMock.mock.calls.map(([url, init]) => [(init as RequestInit | undefined)?.method ?? 'GET', url])
const bodyOf = (i: number) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string)

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendMail — returnIds', () => {
  it('posts /messages then /send and returns the draft ids', async () => {
    fetchMock
      .mockResolvedValueOnce(json(201, { id: 'm1', internetMessageId: '<x@y>', conversationId: 'c1' }))
      .mockResolvedValueOnce(empty(202))

    const ids = await sendMail({ ...base, attachments: [pdf], returnIds: true })

    expect(ids).toEqual({ graphMessageId: 'm1', internetMessageId: '<x@y>', conversationId: 'c1' })
    expect(calls()).toEqual([
      ['POST', `${USER_BASE}/messages`],
      ['POST', `${USER_BASE}/messages/m1/send`],
    ])
    // A small attachment rides on the draft itself (no upload session).
    const draft = bodyOf(0)
    expect(draft.subject).toBe('PSS Quality Report')
    expect(draft.body).toEqual({ contentType: 'HTML', content: '<p>Dear all,</p>' })
    expect(draft.toRecipients).toEqual([{ emailAddress: { address: 'seller@example.com' } }])
    expect(draft.attachments).toEqual([
      expect.objectContaining({ '@odata.type': '#microsoft.graph.fileAttachment', name: 'SAK-011877_26.pdf' }),
    ])
    expect(draft.sender).toEqual({ emailAddress: { address: 'anderson@wolthers.com', name: 'Anderson Nunes' } })
  })

  it('reads missing message ids as null', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 'm2' })).mockResolvedValueOnce(empty(202))
    expect(await sendMail({ ...base, returnIds: true })).toEqual({
      graphMessageId: 'm2',
      internetMessageId: null,
      conversationId: null,
    })
  })

  it('a failed /send deletes the draft and throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock
      .mockResolvedValueOnce(json(201, { id: 'm3', internetMessageId: '<a@b>', conversationId: 'c3' }))
      .mockResolvedValueOnce(json(500, { error: { code: 'ErrorInternalServerError' } }))
      .mockResolvedValueOnce(empty(204))

    await expect(sendMail({ ...base, returnIds: true })).rejects.toBeInstanceOf(GraphSendError)
    expect(calls()).toEqual([
      ['POST', `${USER_BASE}/messages`],
      ['POST', `${USER_BASE}/messages/m3/send`],
      ['DELETE', `${USER_BASE}/messages/m3`],
    ])
    err.mockRestore()
  })

  // The QC app may lack Mail.ReadWrite, or Exchange may refuse the on-behalf-of
  // stamp on a draft: a 403 means nothing went out, so the email still goes the
  // way every other QC email does, only without ids.
  it('a 403 on the draft path falls back to /sendMail and returns null', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock
      .mockResolvedValueOnce(json(403, { error: { code: 'ErrorAccessDenied' } }))
      .mockResolvedValueOnce(empty(202))

    expect(await sendMail({ ...base, attachments: [pdf], returnIds: true })).toBeNull()
    expect(calls()).toEqual([
      ['POST', `${USER_BASE}/messages`],
      ['POST', `${USER_BASE}/sendMail`],
    ])
    expect(bodyOf(1).message.attachments).toHaveLength(1)
    err.mockRestore()
  })
})

describe('sendMail — without returnIds (unchanged)', () => {
  it('posts /sendMail and returns null', async () => {
    fetchMock.mockResolvedValueOnce(empty(202))

    expect(await sendMail({ ...base, attachments: [pdf] })).toBeNull()
    expect(calls()).toEqual([['POST', `${USER_BASE}/sendMail`]])
    const payload = bodyOf(0)
    expect(payload.saveToSentItems).toBe(true)
    expect(payload.message.attachments).toHaveLength(1)
  })

  it('throws a GraphSendError when /sendMail fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockResolvedValueOnce(json(403, { error: { code: 'ErrorAccessDenied' } }))
    await expect(sendMail(base)).rejects.toMatchObject({ status: 403, graphCode: 'ErrorAccessDenied' })
    err.mockRestore()
  })
})

// src/lib/portal/invite-email.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => ({ calls: [] as any[], fail: false }))
vi.mock('@/lib/graph/send', () => ({
  sendMail: async (p: any) => {
    if (sent.fail) throw new Error('graph down')
    sent.calls.push(p)
  },
}))

import {
  buildPortalHouseCopy, buildPortalInviteEmail, portalInviteLink, sendPortalHouseCopy, sendPortalInviteEmail,
} from './invite-email'

beforeEach(() => {
  sent.calls = []
  sent.fail = false
  delete process.env.MICROSOFT_GRAPH_TEST_RECIPIENT
})

const input = {
  kind: 'invitation' as const,
  firstName: 'Ana',
  companyName: 'Roastery <One>',
  inviterName: 'Daniel Wolthers',
  keys: { views: ['qc_samples', 'qc_certificates'] as any, capabilities: ['qc_cupping_score'] as any },
  isCompanyAdmin: true,
  link: 'https://qc.wolthers.com/auth/portal-invite?token=abc',
  expiresAt: '2026-10-21T12:00:00.000Z',
}

const house = {
  kind: 'invitation' as const,
  inviterName: 'Daniel Wolthers',
  email: 'ana@client.com',
  companyName: 'Roastery <One>',
  keys: input.keys,
  isCompanyAdmin: true,
}

describe('buildPortalInviteEmail', () => {
  it('names the company, the inviter, what they can use and when it expires', () => {
    const mail = buildPortalInviteEmail(input)
    expect(mail.subject).toBe('Invitation to the Wolthers QC portal for Roastery <One>')
    expect(mail.text).toContain('Daniel Wolthers has invited you to the Wolthers QC portal for Roastery <One>.')
    expect(mail.text).toContain('- Samples and contracts')
    expect(mail.text).toContain('- Score in cupping sessions')
    expect(mail.text).toContain("- Manage your company's team")
    expect(mail.text).toContain('21 October 2026')
    expect(mail.text).toContain(input.link)
  })

  it('escapes names in the HTML', () => {
    expect(buildPortalInviteEmail(input).html).toContain('Roastery &lt;One&gt;')
    expect(buildPortalInviteEmail(input).html).not.toContain('<One>')
  })

  it('an access-added email has no expiry', () => {
    const mail = buildPortalInviteEmail({ ...input, kind: 'access_added', expiresAt: null, isCompanyAdmin: false })
    expect(mail.subject).toBe('The Wolthers QC portal is open to you for Roastery <One>')
    expect(mail.text).not.toContain('expires')
    expect(mail.text).not.toContain('Manage your company')
  })

  it('an access-added email tells password-less users how to set one; an invitation does not', () => {
    const added = buildPortalInviteEmail({ ...input, kind: 'access_added', expiresAt: null })
    const note = 'No password yet? Use \u201cForgot password?\u201d on the sign-in page to set one.'
    expect(added.text).toContain(note)
    expect(added.html).toContain(note)
    expect(buildPortalInviteEmail(input).text).not.toContain('No password yet')
  })
})

describe('portalInviteLink', () => {
  it('points at the accept page and encodes the token', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://qc.wolthers.com/'
    expect(portalInviteLink('a+b')).toBe('https://qc.wolthers.com/auth/portal-invite?token=a%2Bb')
  })
})

describe('sendPortalInviteEmail', () => {
  it('goes to the invitee alone: the link sets a password, so nobody is copied', async () => {
    await sendPortalInviteEmail('ana@client.com', { subject: 'S', text: 'T', html: 'H' })
    expect(sent.calls[0]).toMatchObject({ to: ['ana@client.com'], subject: 'S' })
    expect(sent.calls[0].cc).toBeUndefined()
    expect(sent.calls[0].bcc).toBeUndefined()
  })

  it('is not saved to the shared mailbox Sent Items: it carries the live accept link', async () => {
    await sendPortalInviteEmail('ana@client.com', { subject: 'S', text: 'T', html: 'H' })
    expect(sent.calls[0].saveToSentItems).toBe(false)
  })

  it('redirects to the test recipient in sandbox mode', async () => {
    process.env.MICROSOFT_GRAPH_TEST_RECIPIENT = 'test@wolthers.com'
    await sendPortalInviteEmail('ana@client.com', { subject: 'S', text: 'T', html: 'H' })
    expect(sent.calls[0]).toMatchObject({ to: ['test@wolthers.com'], subject: '[TEST] S' })
  })
})

describe('head-office copy', () => {
  it('says who invited whom to which company, with what access, and carries no link', () => {
    const copy = buildPortalHouseCopy(house)
    expect(copy.subject).toBe("Daniel Wolthers invited ana@client.com to Roastery <One>'s QC portal")
    expect(copy.text).toContain("Daniel Wolthers invited ana@client.com to Roastery <One>'s QC portal.")
    expect(copy.text).toContain('- Samples and contracts')
    expect(copy.text).toContain("- Manage your company's team")
    expect(`${copy.text}${copy.html}`).not.toMatch(/https?:|token|href/i)
    expect(copy.html).toContain('Roastery &lt;One&gt;')
  })

  it('words a resend and an access change', () => {
    expect(buildPortalHouseCopy({ ...house, kind: 'resend' }).subject)
      .toBe("Daniel Wolthers sent ana@client.com a new invitation link for Roastery <One>'s QC portal")
    expect(buildPortalHouseCopy({ ...house, kind: 'access_added' }).subject)
      .toBe("Daniel Wolthers opened Roastery <One>'s QC portal to ana@client.com")
  })

  it('goes to head office only, and reports a failed send instead of throwing', async () => {
    expect(await sendPortalHouseCopy(house)).toBe(true)
    expect(sent.calls[0]).toMatchObject({ to: ['wolthers@wolthers.com'] })
    expect(sent.calls[0].cc).toBeUndefined()
    sent.fail = true
    expect(await sendPortalHouseCopy(house)).toBe(false)
  })

  it('redirects to the test recipient in sandbox mode', async () => {
    process.env.MICROSOFT_GRAPH_TEST_RECIPIENT = 'test@wolthers.com'
    await sendPortalHouseCopy(house)
    expect(sent.calls[0]).toMatchObject({ to: ['test@wolthers.com'] })
    expect(sent.calls[0].subject.startsWith('[TEST] ')).toBe(true)
  })
})

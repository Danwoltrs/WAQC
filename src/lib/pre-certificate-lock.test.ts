import { describe, it, expect } from 'vitest'
import { hasPreCertificate, withPreCertificateLock } from './pre-certificate-lock'
import { computeContentLock } from './sample-edit-permissions'

const db = (rows: unknown[] | null, error: unknown = null) => {
  const calls: unknown[][] = []
  const chain: any = {
    calls,
    from: (...a: unknown[]) => (calls.push(['from', ...a]), chain),
    select: () => chain,
    in: (...a: unknown[]) => (calls.push(['in', ...a]), chain),
    not: (...a: unknown[]) => (calls.push(['not', ...a]), chain),
    is: (...a: unknown[]) => (calls.push(['is', ...a]), chain),
    limit: async () => ({ data: rows, error }),
  }
  return chain
}

const open = computeContentLock({ locked: false, scanned_at: null, certificate_generated_at: null })

describe('the pre-certificate lock', () => {
  it('locks the results of a lot that has a pre-certificate, waiting or final', async () => {
    const d = db([{ id: 'c1' }])
    const lock = await withPreCertificateLock(d, ['s1', 'lab'], open)
    expect(lock).toMatchObject({ contentLocked: true, reason: 'locked_pre_certificate' })
    expect(lock.message).toMatch(/pre-certificate/)
    expect(d.calls).toContainEqual(['in', 'sample_id', ['s1', 'lab']])
    expect(d.calls).toContainEqual(['not', 'standby_at', 'is', null])
    // A voided pre-certificate locks nothing.
    expect(d.calls).toContainEqual(['is', 'voided_at', null])
  })

  it('leaves an ordinary lot as it was', async () => {
    expect(await withPreCertificateLock(db([]), ['s1'], open)).toBe(open)
  })

  it('keeps the reason of a lot that was already locked', async () => {
    const scanned = computeContentLock({ locked: true, scanned_at: '2026-11-01', certificate_generated_at: null })
    expect((await withPreCertificateLock(db([{ id: 'c1' }]), ['s1'], scanned)).reason).toBe('locked_after_scan')
  })

  it('answers no when the certificates cannot be read, and with no sample to ask about', async () => {
    expect(await hasPreCertificate(db(null, { code: '42703' }), ['s1'])).toBe(false)
    expect(await hasPreCertificate(db([{ id: 'c1' }]), [null, undefined, ''])).toBe(false)
    expect(await hasPreCertificate({ from: () => { throw new Error('boom') } } as never, ['s1'])).toBe(false)
  })
})

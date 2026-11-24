import { describe, it, expect, vi } from 'vitest'
import { hasPreCertificate, withPreCertificateLock } from './pre-certificate-lock'
import { computeContentLock } from './sample-edit-permissions'

type Row = { id: string; lab_source_sample_id: string | null }

/**
 * A fake with a samples table (lab unit + contract siblings) and the
 * certificates answer. Records every filter so the tests can see what was asked.
 */
const db = (opts: {
  samples?: Row[]
  certificates?: unknown[] | null
  certificatesError?: unknown
  samplesError?: unknown
}) => {
  const calls: unknown[][] = []
  const samples = opts.samples ?? []
  return {
    calls,
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const q: any = {
        select: () => q,
        in: (col: string, v: unknown) => (calls.push([table, 'in', col, v]), (filters[col] = v), q),
        not: (...a: unknown[]) => (calls.push([table, 'not', ...a]), q),
        is: (...a: unknown[]) => (calls.push([table, 'is', ...a]), q),
        limit: async () => ({ data: opts.certificates ?? [], error: opts.certificatesError ?? null }),
        then: (res: (v: unknown) => unknown) => {
          if (opts.samplesError) return Promise.resolve({ data: null, error: opts.samplesError }).then(res)
          const ids = (filters.id as string[] | undefined) ?? null
          const labs = (filters.lab_source_sample_id as string[] | undefined) ?? null
          const data = samples.filter(
            (s) => (ids && ids.includes(s.id)) || (labs && s.lab_source_sample_id && labs.includes(s.lab_source_sample_id)),
          )
          return Promise.resolve({ data, error: null }).then(res)
        },
      }
      return q
    },
  }
}

const lot: Row[] = [
  { id: 'lab', lab_source_sample_id: null },
  { id: 'sib1', lab_source_sample_id: 'lab' },
  { id: 'sib2', lab_source_sample_id: 'lab' },
]
const certIds = (d: ReturnType<typeof db>) =>
  [...((d.calls.find((c) => c[0] === 'certificates' && c[2] === 'sample_id')?.[3] as string[]) ?? [])].sort()

const open = computeContentLock({ locked: false, scanned_at: null, certificate_generated_at: null })

describe('the pre-certificate lock', () => {
  it('locks the results of a lot that has a pre-certificate, waiting or final', async () => {
    const d = db({ samples: lot, certificates: [{ id: 'c1' }] })
    const lock = await withPreCertificateLock(d as never, ['lab'], open)
    expect(lock).toMatchObject({ contentLocked: true, reason: 'locked_pre_certificate' })
    expect(lock.message).toMatch(/pre-certificate/)
    expect(d.calls).toContainEqual(['certificates', 'not', 'standby_at', 'is', null])
    // A voided pre-certificate locks nothing.
    expect(d.calls).toContainEqual(['certificates', 'is', 'voided_at', null])
  })

  it("asks about the whole contract group: the lab unit's scores are locked by a sibling's pre-certificate", async () => {
    const d = db({ samples: lot, certificates: [{ id: 'c-sib2' }] })
    expect(await hasPreCertificate(d as never, ['lab'])).toBe(true)
    expect(certIds(d)).toEqual(['lab', 'sib1', 'sib2'])
  })

  it('from a sibling, the group reaches the lab unit and the other siblings', async () => {
    const d = db({ samples: lot, certificates: [] })
    expect(await hasPreCertificate(d as never, ['sib1'])).toBe(false)
    expect(certIds(d)).toEqual(['lab', 'sib1', 'sib2'])
  })

  it('leaves an ordinary lot as it was', async () => {
    expect(await withPreCertificateLock(db({ samples: lot }) as never, ['lab'], open)).toBe(open)
  })

  it('keeps the reason of a lot that was already locked', async () => {
    const scanned = computeContentLock({ locked: true, scanned_at: '2026-11-01', certificate_generated_at: null })
    const d = db({ samples: lot, certificates: [{ id: 'c1' }] })
    expect((await withPreCertificateLock(d as never, ['lab'], scanned)).reason).toBe('locked_after_scan')
  })

  it('a database without the setting yet (missing column) answers no; nothing to ask answers no', async () => {
    expect(await hasPreCertificate(db({ samples: lot, certificatesError: { code: '42703' } }) as never, ['lab'])).toBe(false)
    expect(await hasPreCertificate(db({ samples: lot, certificatesError: { code: 'PGRST204' } }) as never, ['lab'])).toBe(false)
    expect(await hasPreCertificate(db({ samples: lot, certificates: [{ id: 'c1' }] }) as never, [null, undefined, ''])).toBe(false)
  })

  it('any other failed read answers yes: a transient error never reopens locked results', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await hasPreCertificate(db({ samples: lot, certificatesError: { code: '57014' } }) as never, ['lab'])).toBe(true)
    expect(await hasPreCertificate(db({ samplesError: { code: '08006' } }) as never, ['lab'])).toBe(true)
    expect(await hasPreCertificate({ from: () => { throw new Error('boom') } } as never, ['lab'])).toBe(true)
    quiet.mockRestore()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A staff write to a client quality's spec (the lab screens) records a dated
 * version through the record_client_quality_version RPC, so new lots pick the
 * new spec and lots already pinned keep theirs.
 */

const state = vi.hoisted(() => ({ admin: null as any }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.admin }))

import {
  recordStaffVersion,
  clientQualityIdsForTemplate,
  specFieldsPresent,
  CLIENT_QUALITY_SPEC_FIELDS,
  SPEC_VERSION_NOT_RECORDED,
} from './record-version'

type Result = { data: unknown; error: unknown }

/** Records every rpc call; `respond` decides each call's result. */
function fakeAdmin(respond: (fn: string, args: any) => Result = () => ({ data: 'v-1', error: null })) {
  const calls: Array<{ fn: string; args: any }> = []
  return {
    calls,
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args })
      return respond(fn, args)
    },
  }
}

/** A from() stand-in: seeded rows per table, narrowed by .eq. */
function fakeDb(rows: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      const matching = () => (rows[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
      const chain: any = {
        select: () => chain,
        eq: (col: string, value: unknown) => { filters.push([col, value]); return chain },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
          Promise.resolve({ data: matching(), error: null }).then(ok, ko),
      }
      return chain
    },
  } as any
}

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
})

describe('recordStaffVersion', () => {
  it('records a wolthers version for the client quality, with no note by default', async () => {
    state.admin = fakeAdmin()
    await recordStaffVersion(['cq1'], 'u1')
    expect(state.admin.calls).toEqual([
      {
        fn: 'record_client_quality_version',
        args: { p_client_quality_id: 'cq1', p_source: 'wolthers', p_user: 'u1', p_note: null },
      },
    ])
  })

  it('makes one call per client quality and passes the note', async () => {
    state.admin = fakeAdmin()
    await recordStaffVersion(['cq1', 'cq2'], 'u1', 'First version')
    expect(state.admin.calls.map((c: any) => [c.args.p_client_quality_id, c.args.p_note])).toEqual([
      ['cq1', 'First version'],
      ['cq2', 'First version'],
    ])
  })

  it('does nothing for no client qualities', async () => {
    state.admin = fakeAdmin()
    await recordStaffVersion([], 'u1')
    expect(state.admin.calls).toEqual([])
  })

  it('logs an RPC error with the quality id and rethrows it', async () => {
    const rpcError = { message: 'no_template', code: 'P0001' }
    state.admin = fakeAdmin(() => ({ data: null, error: rpcError }))
    await expect(recordStaffVersion(['cq9'], 'u1')).rejects.toBe(rpcError)
    expect(errorSpy).toHaveBeenCalled()
    expect(errorSpy.mock.calls.flat().map(String).join(' ')).toContain('cq9')
  })
})

describe('clientQualityIdsForTemplate', () => {
  const rows = {
    quality_templates: [
      { id: 'tpl-base', is_client_variant: false },
      { id: 'tpl-copy', is_client_variant: true },
    ],
    client_qualities: [
      { id: 'cq-a', template_id: 'tpl-copy' },
      { id: 'cq-b', template_id: 'tpl-base' },
      { id: 'cq-c', template_id: 'tpl-copy' },
    ],
  }

  it('returns every client quality on a client copy', async () => {
    expect(await clientQualityIdsForTemplate(fakeDb(rows), 'tpl-copy')).toEqual(['cq-a', 'cq-c'])
  })

  it('returns nothing for a base template, even one a client quality still uses', async () => {
    expect(await clientQualityIdsForTemplate(fakeDb(rows), 'tpl-base')).toEqual([])
  })

  it('returns nothing for an unknown template', async () => {
    expect(await clientQualityIdsForTemplate(fakeDb(rows), 'tpl-gone')).toEqual([])
  })
})

describe('specFieldsPresent', () => {
  it('is true when the write names a spec field, whatever its value', () => {
    for (const f of ['template_id', 'cups_per_sample', 'discrepancy_threshold', 'custom_parameters']) {
      expect(specFieldsPresent({ [f]: null }, CLIENT_QUALITY_SPEC_FIELDS)).toBe(true)
    }
  })

  it('ignores fields outside the spec and undefined values', () => {
    expect(specFieldsPresent({ notes: 'y', custom_name: 'Z', fee_price: 1, cups_per_sample: undefined }, CLIENT_QUALITY_SPEC_FIELDS)).toBe(false)
  })
})

describe('SPEC_VERSION_NOT_RECORDED', () => {
  it('tells the user to save again', () => {
    expect(SPEC_VERSION_NOT_RECORDED).toBe('Saved, but the spec version could not be recorded. Please save again.')
  })
})

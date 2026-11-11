import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A staff write to a client quality's spec (the lab screens) records a dated
 * version through the record_client_quality_version RPC, so new lots pick the
 * new spec and lots already pinned keep theirs.
 */

const state = vi.hoisted(() => ({ admin: null as any, send: vi.fn() }))
vi.mock('@/lib/supabase-service', () => ({ serviceRoleClient: () => state.admin }))
vi.mock('@/lib/portal/spec-change-email', () => ({ sendSpecChangeEmail: state.send }))

import {
  recordStaffVersion,
  clientQualityIdsForTemplate,
  specFieldsPresent,
  CLIENT_QUALITY_SPEC_FIELDS,
  SPEC_VERSION_NOT_RECORDED,
} from './record-version'
import { seededDb, type Row } from './__fixtures__/seeded-db'
import { WOLTHERS_CANCEL_NOTE } from './types'

type Result = { data: unknown; error: unknown }

/** Records every rpc call; `respond` decides each call's result. */
function fakeAdmin(respond: (fn: string, args: any) => Result = () => ({ data: 'v-1', error: null })) {
  const calls: Array<{ fn: string; args: any }> = []
  return {
    calls,
    // No client versions: nothing for the cancel check to find.
    from: seededDb({}).from,
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

describe('recordStaffVersion: client changes the save cancelled (R33)', () => {
  const cv = (over: Row): Row => ({
    client_quality_id: 'cq1', source: 'client', applied_at: null, cancelled_at: null, cancel_note: null, ...over,
  })
  /** The RPC cancels every pending future version of the quality, as record_client_quality_version does. */
  function cancellingDb(rows: Row[]) {
    const db = seededDb({ client_quality_versions: rows }, {
      rpc: (_fn, args) => {
        for (const r of rows) {
          if (r.client_quality_id === args.p_client_quality_id && !r.applied_at && !r.cancelled_at && r.effective_from > '2026-11-11') {
            Object.assign(r, { cancelled_at: new Date().toISOString(), cancelled_by: args.p_user, cancel_note: WOLTHERS_CANCEL_NOTE })
          }
        }
        return { data: 'w-new', error: null }
      },
    })
    return db
  }

  beforeEach(() => {
    state.send.mockReset().mockResolvedValue(true)
  })

  it('returns each client change the save cancelled and emails its cancellation', async () => {
    state.admin = cancellingDb([
      cv({ id: 'c-future', version_no: 3, effective_from: '2099-03-01' }),
      cv({ id: 'c-other-quality', client_quality_id: 'cq2', version_no: 2, effective_from: '2099-04-01' }),
    ])
    const out = await recordStaffVersion(['cq1'], 'staff-1')
    expect(out.cancelledClientChanges).toEqual([{ versionId: 'c-future', clientQualityId: 'cq1', versionNo: 3, effectiveFrom: '2099-03-01' }])
    expect(state.send).toHaveBeenCalledTimes(1)
    expect(state.send).toHaveBeenCalledWith('c-future', state.admin)
  })

  it('reports nothing and sends nothing when the save cancelled nothing', async () => {
    // Already cancelled by the client, applied, or a Wolthers version: none is cancelled by this save.
    state.admin = seededDb({
      client_quality_versions: [
        cv({ id: 'c-own-cancel', version_no: 3, effective_from: '2099-03-01', cancelled_at: '2026-11-01T00:00:00Z', cancel_note: 'Cancelled by Ana' }),
        cv({ id: 'c-applied', version_no: 2, effective_from: '2026-10-01', applied_at: '2026-10-01T09:00:00Z' }),
      ],
    }, { rpc: () => ({ data: 'w-new', error: null }) })
    const out = await recordStaffVersion(['cq1'], 'staff-1')
    expect(out.cancelledClientChanges).toEqual([])
    expect(state.send).not.toHaveBeenCalled()
  })

  it('a version the client cancelled meanwhile (another note) is not counted', async () => {
    const rows = [cv({ id: 'c-future', version_no: 3, effective_from: '2099-03-01' })]
    state.admin = seededDb({ client_quality_versions: rows }, {
      rpc: () => {
        Object.assign(rows[0], { cancelled_at: new Date().toISOString(), cancel_note: 'Cancelled by Ana' })
        return { data: 'w-new', error: null }
      },
    })
    expect((await recordStaffVersion(['cq1'], 'staff-1')).cancelledClientChanges).toEqual([])
    expect(state.send).not.toHaveBeenCalled()
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

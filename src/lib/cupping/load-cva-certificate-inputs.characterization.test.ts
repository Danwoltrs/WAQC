import { describe, it, expect } from 'vitest'
import { loadCvaCertificateInputs } from './load-cva-certificate-inputs'
import { hasPersistedCvaVerdict } from './cva-cupping-data'

/**
 * A minimal stand-in for the Supabase client, covering only the three query
 * shapes load-cva-certificate-inputs.ts uses (quality_assessments,
 * cupping_scores, cupping_sessions). Every builder method returns the same
 * chainable object; awaiting it, or calling .single()/.maybeSingle(), yields
 * whatever was configured for that table.
 *
 * Deliberately local to this file, mirroring compliance.characterization.test.ts:
 * the repo tests pure functions and DB-touching lib functions through a
 * hand-rolled fake rather than a shared Supabase mock.
 */
type TableResult = { data: unknown; error?: unknown }

function fakeSupabase(tables: Record<string, TableResult>) {
  const build = (table: string) => {
    const result: TableResult = tables[table] ?? { data: null, error: null }
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'order', 'limit']) {
      chain[method] = () => chain
    }
    chain.single = async () => result
    chain.maybeSingle = async () => result
    // The cupping_scores read is awaited directly, without a terminal
    // .single()/.maybeSingle(), so the chain itself has to be thenable.
    chain.then = (resolve: (v: TableResult) => unknown) => resolve(result)
    return chain
  }
  return { from: (table: string) => build(table) } as any
}

describe('loadCvaCertificateInputs — characterization', () => {
  it('reports nothing recorded when the sample has no CVA data at all', async () => {
    const supabase = fakeSupabase({
      quality_assessments: { data: null },
      cupping_scores: { data: [] },
    })
    const result = await loadCvaCertificateInputs(supabase, 'sample-1')
    expect(result).toEqual({
      assessment: null,
      verdict: { score: null, minScore: null, passed: null },
    })
  })

  it('degrades to "nothing recorded" rather than throwing when the verdict SELECT errors (migration not applied)', async () => {
    const supabase = fakeSupabase({
      quality_assessments: { data: null, error: { code: '42703', message: 'column cva_score does not exist' } },
      cupping_scores: { data: [] },
    })
    const result = await loadCvaCertificateInputs(supabase, 'sample-1')
    expect(result.verdict).toEqual({ score: null, minScore: null, passed: null })
  })

  it('does not let an empty-string persisted score print as a zero', async () => {
    const supabase = fakeSupabase({
      quality_assessments: { data: { cva_score: '', cva_min_score: 84, cva_passed: true } },
      cupping_scores: { data: [] },
    })
    const result = await loadCvaCertificateInputs(supabase, 'sample-1')
    expect(result.verdict.score).toBeNull()
  })

  it('picks the master cupper\'s row over a newer non-master row within the same session', async () => {
    const supabase = fakeSupabase({
      quality_assessments: { data: { cva_score: 86.5, cva_min_score: 84, cva_passed: true } },
      cupping_scores: {
        data: [
          // Newest first, as the real ordered query returns.
          { cupper_id: 'bob', scores: { sections: {} }, session_id: 'session-A' },
          { cupper_id: 'alice', scores: { sections: { flavor: { impression: 8 } } }, session_id: 'session-A' },
        ],
      },
      cupping_sessions: { data: { master_cupper_id: 'alice' } },
    })
    const result = await loadCvaCertificateInputs(supabase, 'sample-1')
    expect(result.assessment).toEqual({ sections: { flavor: { impression: 8 } } })
  })

  it('never applies one session\'s master-cupper authority to another session\'s rows', async () => {
    // Session-A is the OLD, real cupping: Alice is master there and has a
    // complete assessment. Session-B is a NEWER, unrelated session (e.g. the
    // lot was re-opened) whose designated master is ALSO Alice, but Alice
    // herself has not scored anything there yet — only Dave's empty autosave
    // exists, and it is the newest row overall.
    //
    // The bug this guards: resolving "master = alice" from session-B and then
    // searching every session's rows for cupper_id === 'alice' would find
    // Alice's OLD row from session-A and treat it as this session's
    // authoritative pick — an old session's row paired with a different
    // session's authority. Scoping the candidate rows to session-B (the
    // session the master id actually came from) means Alice's row from
    // session-A is never a candidate here: only Dave's row is, and Dave is
    // not the master, so the newest-row fallback (Dave's empty assessment)
    // is what's returned — not Alice's real one from the other session.
    const supabase = fakeSupabase({
      quality_assessments: { data: { cva_score: 86.5, cva_min_score: 84, cva_passed: true } },
      cupping_scores: {
        data: [
          { cupper_id: 'dave', scores: { sections: {} }, session_id: 'session-B' }, // newest
          { cupper_id: 'alice', scores: { sections: { flavor: { impression: 8 } } }, session_id: 'session-A' },
        ],
      },
      cupping_sessions: { data: { master_cupper_id: 'alice' } }, // session-B's master
    })
    const result = await loadCvaCertificateInputs(supabase, 'sample-1')
    // Must come from session-B (Dave's row), never session-A (Alice's row) —
    // even though Alice is nominally "the master" by the id this code resolved.
    expect(result.assessment).toEqual({ sections: {} })
  })

  it('reports a blob with no persisted verdict, so the certificate stays on the commodity rail', async () => {
    // The mixed case, seen in production on SAN-00612/26 (cert MONT-001178/26):
    // a specialty lot re-cupped on the COMMODITY table and certified there. It
    // has a CVA assessment blob from the specialty journey AND commodity score
    // rows, but no cva_* verdict — the commodity route never writes one.
    //
    // certificate-data.ts must not commit to the CVA rail on the blob alone:
    // buildCvaCuppingData would return overallScore: null and the issued
    // certificate would lose its headline score on the next regeneration.
    // hasPersistedCvaVerdict is the guard, and this is the row shape it has to
    // read as "no verdict".
    const supabase = fakeSupabase({
      // Migration applied, columns present, all three simply never written.
      quality_assessments: { data: { cva_score: null, cva_min_score: null, cva_passed: null } },
      cupping_scores: {
        data: [
          { cupper_id: 'alice', scores: { sections: { flavor: { impression: 8 } } }, session_id: 'session-A' },
        ],
      },
      cupping_sessions: { data: { master_cupper_id: 'alice' } },
    })
    const result = await loadCvaCertificateInputs(supabase, 'sample-1')
    expect(result.assessment).not.toBeNull()
    expect(hasPersistedCvaVerdict(result.verdict)).toBe(false)
  })

  it('reports no verdict when the migration is not applied, blob or not', async () => {
    // Same conclusion via the other route to it: the verdict SELECT fails with
    // 42703 and degrades to "nothing recorded".
    const supabase = fakeSupabase({
      quality_assessments: { data: null, error: { code: '42703', message: 'column cva_score does not exist' } },
      cupping_scores: {
        data: [
          { cupper_id: 'alice', scores: { sections: { flavor: { impression: 8 } } }, session_id: 'session-A' },
        ],
      },
      cupping_sessions: { data: { master_cupper_id: 'alice' } },
    })
    const result = await loadCvaCertificateInputs(supabase, 'sample-1')
    expect(result.assessment).not.toBeNull()
    expect(hasPersistedCvaVerdict(result.verdict)).toBe(false)
  })

  it('falls back to the newest row when the session has no designated master', async () => {
    const supabase = fakeSupabase({
      quality_assessments: { data: { cva_score: 78, cva_min_score: 84, cva_passed: false } },
      cupping_scores: {
        data: [
          { cupper_id: 'carol', scores: { sections: { acidity: { impression: 6 } } }, session_id: 'session-A' },
        ],
      },
      cupping_sessions: { data: { master_cupper_id: null } },
    })
    const result = await loadCvaCertificateInputs(supabase, 'sample-1')
    expect(result.assessment).toEqual({ sections: { acidity: { impression: 6 } } })
  })
})

describe('loadCvaCertificateInputs — contract siblings', () => {
  /** Same fake, but recording every filter so the test can see which id each table was read with. */
  function recordingSupabase(tables: Record<string, TableResult>) {
    const calls: Array<{ table: string; method: string; args: unknown[] }> = []
    const build = (table: string) => {
      const result: TableResult = tables[table] ?? { data: null, error: null }
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'order', 'limit']) {
        chain[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return chain }
      }
      chain.single = async () => result
      chain.maybeSingle = async () => result
      chain.then = (resolve: (v: TableResult) => unknown) => resolve(result)
      return chain
    }
    return { client: { from: (table: string) => build(table) } as any, calls }
  }

  it('reads the verdict and the CVA rows through the lab unit when given a sibling', async () => {
    const { client, calls } = recordingSupabase({
      samples: { data: { id: 'sib-1', lab_source_sample_id: 'lab-1' } },
      quality_assessments: { data: { cva_score: 86.5, cva_min_score: 84, cva_passed: true } },
      cupping_scores: {
        data: [{ cupper_id: 'alice', scores: { sections: { flavor: { impression: 8 } } }, session_id: 'session-A' }],
      },
      cupping_sessions: { data: { master_cupper_id: 'alice' } },
    })
    const result = await loadCvaCertificateInputs(client, 'sib-1')
    expect(result.verdict.score).toBe(86.5)
    expect(result.assessment).toEqual({ sections: { flavor: { impression: 8 } } })
    const eqs = (table: string) => calls.filter((c) => c.table === table && c.method === 'eq').map((c) => c.args)
    expect(eqs('quality_assessments')).toContainEqual(['sample_id', 'lab-1'])
    expect(eqs('cupping_scores')).toContainEqual(['sample_id', 'lab-1'])
    expect(calls.some((c) => c.table !== 'samples' && c.args.includes('sib-1'))).toBe(false)
  })
})

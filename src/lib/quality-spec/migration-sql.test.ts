import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Text checks on the two spec-version pastes (Daniel applies them by hand in
 * the Supabase editor, so nothing here runs them).
 */

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), 'database/migrations', file), 'utf8')
const COPIES = read('20261111000000_client_quality_private_copies.sql')
const VERSIONS = read('20261111000001_client_quality_versions.sql')

/** The body of a plpgsql function: from its CREATE to the closing $$. */
function body(sql: string, fn: string): string {
  const start = sql.indexOf(`FUNCTION public.${fn}(`)
  if (start === -1) throw new Error(`${fn} not found`)
  const open = sql.indexOf('$$', start)
  const close = sql.indexOf('$$', open + 2)
  return sql.slice(open + 2, close)
}

describe('20261111000001 record_client_quality_version', () => {
  it("a quality's first version starts on 2000-01-01, later ones today", () => {
    const fn = body(VERSIONS, 'record_client_quality_version')
    expect(fn).toMatch(/CASE WHEN v_next = 1 THEN DATE '2000-01-01' ELSE v_today END/)
    // The INSERT uses that expression, not a bare v_today.
    const insert = fn.slice(fn.indexOf('INSERT INTO public.client_quality_versions'))
    expect(insert).toMatch(/v_next,\s*CASE WHEN v_next = 1/)
  })
})

describe('20261111000001 permissions', () => {
  it('client_quality_spec_snapshot is executable by the service role only', () => {
    expect(VERSIONS).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.client_quality_spec_snapshot\(uuid\) FROM PUBLIC, anon, authenticated;/,
    )
    expect(VERSIONS).toMatch(/GRANT EXECUTE ON FUNCTION public\.client_quality_spec_snapshot\(uuid\) TO service_role;/)
    expect(VERSIONS).not.toMatch(/client_quality_spec_snapshot\(uuid\) TO authenticated/)
  })
})

describe('20261111000000 paste safety', () => {
  it('gives up on a lock after 3 s, right after BEGIN', () => {
    expect(COPIES).toMatch(/BEGIN;\nSET LOCAL lock_timeout = '3s';/)
  })

  it('the header asks for the generated / identity column check first', () => {
    const header = COPIES.slice(0, COPIES.indexOf('BEGIN;'))
    expect(header).toContain(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='quality_templates' AND (is_generated='ALWAYS' OR is_identity='YES');",
    )
    expect(header).toMatch(/must return 0 rows/i)
  })
})

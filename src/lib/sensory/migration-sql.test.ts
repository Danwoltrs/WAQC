import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/** Text checks on the sensory paste (applied by hand in the Supabase editor, so nothing here runs it). */
const SQL = fs.readFileSync(
  path.join(process.cwd(), 'database/migrations', '20261113000000_sensory_notes_regional_profiles.sql'),
  'utf8',
)

describe('20261113000000 regional_profiles', () => {
  it('created_by never blocks deleting a user: ON DELETE SET NULL, like client_quality_versions', () => {
    const table = SQL.slice(SQL.indexOf('CREATE TABLE IF NOT EXISTS public.regional_profiles'))
    const line = table.split('\n').find((l) => /^\s*created_by\b/.test(l))
    expect(line).toBeDefined()
    expect(line).toMatch(/created_by\s+uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL,/)
  })
})

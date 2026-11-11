import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { SPEC_TEMPLATE_COLUMNS } from './spec-columns'

const MIGRATION = 'database/migrations/20261111000001_client_quality_versions.sql'

/** Body of client_quality_spec_snapshot: from its CREATE to the closing $$. */
function snapshotBody(sql: string): string {
  const start = sql.indexOf('FUNCTION public.client_quality_spec_snapshot(')
  if (start === -1) throw new Error('client_quality_spec_snapshot not found')
  const open = sql.indexOf('$$', start)
  const close = sql.indexOf('$$', open + 2)
  if (open === -1 || close === -1) throw new Error('snapshot body delimiters not found')
  return sql.slice(open + 2, close)
}

describe('SPEC_TEMPLATE_COLUMNS', () => {
  it('lists exactly the template columns a client spec version carries', () => {
    expect([...SPEC_TEMPLATE_COLUMNS]).toEqual([
      'parameters', 'methodology', 'cva_min_score', 'requires_descriptors', 'cva_score_spread_max',
      'cupping_scale_min', 'cupping_scale_max', 'cupping_discrepancy_threshold',
      'defect_thresholds_primary', 'defect_thresholds_secondary', 'max_taints_allowed',
      'max_faults_allowed', 'screen_size_requirements',
    ])
  })

  it('every column is captured by the SQL snapshot function', () => {
    const body = snapshotBody(fs.readFileSync(path.join(process.cwd(), MIGRATION), 'utf8'))
    for (const col of SPEC_TEMPLATE_COLUMNS) {
      expect(body, `snapshot misses ${col}`).toMatch(new RegExp(`'${col}',\\s*(COALESCE\\()?t\\.${col}\\b`))
    }
  })
})

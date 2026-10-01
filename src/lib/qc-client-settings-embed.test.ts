import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * qc_client_settings has two foreign keys to companies (company_id, and
 * qc_fee_co_broker_company_id since 2026-08-24), so an embed that does not name
 * one fails with PGRST201 "more than one relationship". The certificate loader
 * ignored that error and lost the QC client: every certificate rendered
 * without the client's logo or validity until 2026-10-01. Every embed must
 * name the key it means.
 */

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('qc_client_settings embeds', () => {
  it('name the foreign key, so PostgREST can tell company_id from the co-broker key', () => {
    const offenders = sourceFiles(SRC).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return [...source.matchAll(/qc_client_settings\s*\(/g)].map(
        (m) => `${relative(SRC, path)}:${source.slice(0, m.index).split('\n').length}`,
      )
    })
    expect(offenders).toEqual([])
  })
})

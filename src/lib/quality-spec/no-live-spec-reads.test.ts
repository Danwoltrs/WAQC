import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Client quality specs are versioned (client_quality_versions). A lot is
 * judged and rendered by the version it is pinned to, or the version in force
 * on its contract date, never by the live client_qualities/quality_templates
 * rows: a spec change would otherwise rewrite the verdict of lots graded
 * before it. Every reader of a LOT's spec goes through resolveSampleSpec(s).
 *
 * The files on ALLOWED read a template on purpose: the template and spec
 * editors, the pickers, the resolver itself and the generated types.
 */

const REPO = join(__dirname, '..', '..', '..')
const SRC = join(REPO, 'src')

/** Repo-relative paths. A trailing `/**` covers the whole folder. */
const ALLOWED = [
  'src/app/api/quality-templates/**',
  'src/app/api/client-qualities/**',
  'src/app/api/clients/[id]/**',
  'src/app/quality/**',
  'src/components/quality/**',
  'src/components/clients/**',
  'src/components/samples/intake/**',
  // The template id comes from the printed cupping card's QR, not from the lot.
  'src/app/api/cupping/ocr/process-card/route.ts',
  'src/lib/quality-spec/**',
  'src/lib/database.types.ts',
]

const LIVE_READS = [
  /quality_templates[^)]*\bparameters\b/,
  /custom_parameters\s*\|\|\s*\w*\.?parameters/,
]

function toRepoPath(path: string): string {
  return relative(REPO, path).split(sep).join('/')
}

function isAllowed(repoPath: string): boolean {
  return ALLOWED.some((entry) =>
    entry.endsWith('/**') ? repoPath.startsWith(entry.slice(0, -2)) : repoPath === entry,
  )
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('lot spec reads', () => {
  it('go through resolveSampleSpec(s), never the live client quality or template', () => {
    const offenders = sourceFiles(SRC)
      .map(toRepoPath)
      .filter((file) => !isAllowed(file))
      .filter((file) => {
        const source = readFileSync(join(REPO, file), 'utf8')
        return LIVE_READS.some((re) => re.test(source))
      })
      .map((file) => `${file}: read the lot's spec through resolveSampleSpec(s)`)
    expect(offenders).toEqual([])
  })

  it('has an ALLOWED list of real paths', () => {
    const missing = ALLOWED.filter((entry) => !existsSync(join(REPO, entry.replace(/\/\*\*$/, ''))))
    expect(missing).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * `next build` refuses a route file that exports anything but HTTP handlers
 * and route segment config ("X is not a valid Route export field"), while
 * `tsc --noEmit` and vitest accept it. On 2026-09-10 a helper exported from a
 * route for its test broke every Vercel production build for five days
 * without a single local check noticing. Helpers belong in src/lib.
 */

const APP_DIR = join(__dirname, '..')

const ALLOWED = new Set([
  'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE', 'PATCH',
  'dynamic', 'dynamicParams', 'revalidate', 'fetchCache', 'runtime',
  'preferredRegion', 'maxDuration', 'generateStaticParams',
])

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return routeFiles(path)
    return /^route\.(ts|tsx|js)$/.test(name) ? [path] : []
  })
}

/** Value exports (types and interfaces are erased and allowed). */
function valueExports(source: string): string[] {
  const names: string[] = []
  const declared = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/gm
  for (const m of source.matchAll(declared)) names.push(m[1])
  const listed = /^export\s+(?!type\b)\{([^}]*)\}/gm
  for (const m of source.matchAll(listed)) {
    for (const part of m[1].split(',')) {
      const spec = part.trim()
      if (!spec || spec.startsWith('type ')) continue
      names.push(spec.split(/\s+as\s+/).pop()!.trim())
    }
  }
  if (/^export\s+default\b/m.test(source)) names.push('default')
  return names
}

describe('route files export only what Next.js accepts', () => {
  it('has no helper, constant or default export in any route file', () => {
    const offenders = routeFiles(APP_DIR).flatMap((file) =>
      valueExports(readFileSync(file, 'utf8'))
        .filter((name) => !ALLOWED.has(name))
        .map((name) => `${relative(APP_DIR, file)}: ${name}`),
    )
    expect(offenders).toEqual([])
  })
})

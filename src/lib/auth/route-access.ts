// src/lib/auth/route-access.ts
import type { AccessKind } from './access-kind'

/**
 * Which pages and APIs each kind of caller may reach (spec §7.2). Every API
 * route still checks its own caller; this is the outer wall that stops
 * clients and strangers reaching staff routes that only check for a login.
 */

export type RouteDecision =
  | { action: 'allow' }
  | { action: 'redirect'; to: string }
  | { action: 'deny'; status: 403 }

const PUBLIC_PAGES = new Set(['/', '/auth/callback', '/auth/accept-invite', '/auth/portal-invite', '/auth/no-access'])

/** `path` is `base` itself or below it ("/portal" and "/portal/team", never "/portalx"). */
function under(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`)
}

const ALLOW: RouteDecision = { action: 'allow' }
const DENY: RouteDecision = { action: 'deny', status: 403 }

/** Not signed in: unchanged from before (API routes check for themselves). */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PAGES.has(pathname) || under(pathname, '/api') || under(pathname, '/certificate') || under(pathname, '/embed')
}

function isPublicDocument(p: string): boolean {
  return under(p, '/certificate') || under(p, '/api/certificate') || under(p, '/embed') || under(p, '/api/embed')
}

export function decideRouteAccess(pathname: string, kind: AccessKind | null): RouteDecision {
  if (kind === null) return isPublicRoute(pathname) ? ALLOW : { action: 'redirect', to: '/' }
  if (kind === 'staff') return ALLOW

  const isApi = under(pathname, '/api')

  if (kind === 'external') {
    const allowed = under(pathname, '/portal') || under(pathname, '/api/portal') || under(pathname, '/auth') || isPublicDocument(pathname)
    if (allowed) return ALLOW
    return isApi ? DENY : { action: 'redirect', to: '/portal' }
  }

  const allowed =
    under(pathname, '/auth') ||
    isPublicDocument(pathname) ||
    pathname === '/api/portal/accept' ||
    pathname === '/api/profiles/ensure' ||
    under(pathname, '/api/auth')
  if (allowed) return ALLOW
  return isApi ? DENY : { action: 'redirect', to: '/auth/no-access' }
}

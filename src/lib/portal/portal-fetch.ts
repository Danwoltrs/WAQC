/** Portal requests always carry the current company; an ended session goes to sign-in. */

export function withCompany(path: string, companyId: string | null): string {
  if (!companyId) return path
  const [base, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  params.set('company', companyId)
  return `${base}?${params.toString()}`
}

/** A portal link with the company plus the carried period and flow filters ('period=..&seller=..'). */
export function withCarried(path: string, companyId: string | null, carried: string): string {
  const base = withCompany(path, companyId)
  if (!carried) return base
  return `${base}${base.includes('?') ? '&' : '?'}${carried}`
}

export class PortalSessionEnded extends Error {
  constructor() {
    super('Your session has ended')
    this.name = 'PortalSessionEnded'
  }
}

export async function portalFetch(
  path: string,
  companyId: string | null,
  init?: RequestInit,
  go: (url: string) => void = (url) => window.location.assign(url),
): Promise<Response> {
  const res = await fetch(withCompany(path, companyId), init)
  if (res.status === 401) {
    go('/')
    throw new PortalSessionEnded()
  }
  return res
}

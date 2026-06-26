export const EMBED_PARENT_ALLOWLIST: string[] = [
  'https://sys.wolthers.com',
  'https://*.vercel.app',
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000'] : []),
]

export function isAllowedOrigin(origin: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => {
    if (!entry.includes('*')) return origin === entry
    const pattern = '^' + entry.replace(/[.]/g, '\\.').replace('*', '[a-z0-9-]+') + '$'
    return new RegExp(pattern).test(origin)
  })
}

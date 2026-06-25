import type { CommandScope } from './types'

export function getCommandScope(pathname: string): CommandScope {
  if (pathname.startsWith('/samples')) return 'samples'
  if (pathname.startsWith('/certificates')) return 'certificates'
  return 'global'
}

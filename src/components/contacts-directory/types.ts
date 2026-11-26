import type { PersonContact } from '@/lib/contacts/people'

/** One company of the directory with its active contacts (the lab's own rows). */
export interface DirectoryCompany {
  id: string
  name: string
  fantasy_name: string | null
  trading_roles: string[] | null
  contacts: PersonContact[]
}

export type DirectoryRole = 'all' | 'buyers' | 'sellers'

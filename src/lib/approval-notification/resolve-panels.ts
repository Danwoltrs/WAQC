import type { PanelPrefill, RecipientChip } from './types'

export interface ContactRow {
  company_id: string
  email: string | null
  name: string | null
  nickname: string | null
  role: string | null
  is_primary: boolean | null
  is_group_mailbox: boolean | null
  routing_purposes: string[] | null
}

const isInternal = (email: string): boolean => /@wolthers\.com$/i.test(email)

const toChip = (r: ContactRow): RecipientChip => ({
  email: r.email as string,
  name: r.name,
  nickname: r.nickname,
  isGroupMailbox: !!r.is_group_mailbox,
})

function hasPurpose(r: ContactRow, p: string): boolean {
  return Array.isArray(r.routing_purposes) && r.routing_purposes.includes(p)
}

/**
 * Resolve one panel (seller or buyer) from the contact rows of one company.
 * TO = sample_approvals contacts (∪ primary ∪ first), minus internal-only.
 * CC = QC mailbox + group mailboxes + logistics-role contacts.
 * Greeting = first non-group-mailbox TO contact's nickname/name, else "{team} team".
 */
export function resolvePanel(
  allRows: ContactRow[],
  companyId: string | null,
  teamName: string | null,
  qcMailbox: string,
): PanelPrefill {
  const qcChip: RecipientChip = {
    email: qcMailbox,
    name: 'Quality Control',
    nickname: null,
    isGroupMailbox: false,
  }
  if (!companyId) {
    return { greeting: teamName ? `${teamName} team` : 'team', to: [], cc: [qcChip] }
  }

  const rows = allRows.filter(
    (r) => r.company_id === companyId && !!r.email,
  )

  const tagged = rows.filter((r) => hasPurpose(r, 'sample_approvals'))
  let toRows: ContactRow[]
  if (tagged.length > 0) {
    toRows = tagged
  } else {
    const primary = rows.find((r) => r.is_primary)
    toRows = primary ? [primary] : rows[0] ? [rows[0]] : []
  }

  // Never email Wolthers as the counterparty: if all TO are internal, drop them.
  // Group mailboxes go to CC, not TO.
  const toExternal = toRows.filter((r) => !isInternal(r.email as string) && !r.is_group_mailbox)
  const to = toExternal.map(toChip)

  const greetSource = to.find((c) => !c.isGroupMailbox)
  const greeting = greetSource
    ? greetSource.nickname ?? greetSource.name ?? (teamName ? `${teamName} team` : 'team')
    : teamName
      ? `${teamName} team`
      : 'team'

  const cc: RecipientChip[] = [qcChip]
  const seen = new Set<string>([qcMailbox.toLowerCase(), ...to.map((c) => c.email.toLowerCase())])
  for (const r of rows) {
    const email = r.email as string
    const wantCc = r.is_group_mailbox || /logistic|docs|shipping/i.test(r.role ?? '')
    if (wantCc && !seen.has(email.toLowerCase())) {
      cc.push(toChip(r))
      seen.add(email.toLowerCase())
    }
  }

  return { greeting, to, cc }
}

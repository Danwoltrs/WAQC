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

// Sys.wolthers.com "SENDS → QC certificates" checkbox writes this routing
// purpose (sys contact-detail-pane.tsx). It is the ONLY signal for who at a
// counterparty receives our QC certificate / approval emails — no fallback to a
// random primary contact.
export const QC_CERTIFICATES_PURPOSE = 'qc_certificates'

// Locked: every QC email also copies head office. Enforced server-side at send
// time so it cannot be removed in the composer; surfaced here for transparency.
export const HOUSE_CC = 'wolthers@wolthers.com'

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
 * TO/CC are built ONLY from contacts the company has tagged for QC certificates
 * in sys.wolthers.com — never a guessed primary/first contact and never
 * role-based extras (that previously pulled in random people).
 *
 * TO = tagged individuals (external). If a company tagged only group inboxes,
 *      those are promoted to TO so the email still has a recipient.
 * CC = QC mailbox + house office + tagged group inboxes.
 * Greeting = first TO individual's nickname/name, else "{team} team".
 * When a company has no tagged contact, TO is empty (the sender adds one or sets
 * the flag in sys) — we do not invent a recipient.
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
  const houseChip: RecipientChip = {
    email: HOUSE_CC,
    name: 'Wolthers',
    nickname: null,
    isGroupMailbox: true,
  }
  const fallbackTeam = teamName ? `${teamName} team` : 'team'
  const baseCc = (): RecipientChip[] => {
    const cc: RecipientChip[] = [qcChip]
    if (!isInternal(qcMailbox) || qcMailbox.toLowerCase() !== HOUSE_CC.toLowerCase()) cc.push(houseChip)
    return cc
  }
  if (!companyId) {
    return { greeting: fallbackTeam, to: [], cc: baseCc() }
  }

  // Only this company's external contacts that are tagged for QC certificates.
  const tagged = allRows.filter(
    (r) =>
      r.company_id === companyId &&
      !!r.email &&
      !isInternal(r.email as string) &&
      hasPurpose(r, QC_CERTIFICATES_PURPOSE),
  )
  const individuals = tagged.filter((r) => !r.is_group_mailbox)
  const groupInboxes = tagged.filter((r) => r.is_group_mailbox)

  // Tagged individuals are the recipients; if a company tagged only group
  // inboxes, promote them to TO so the message still reaches someone.
  const toRows = individuals.length > 0 ? individuals : groupInboxes
  const ccGroupRows = individuals.length > 0 ? groupInboxes : []
  const to = toRows.map(toChip)

  const greetSource = to.find((c) => !c.isGroupMailbox)
  const greeting = greetSource ? greetSource.nickname ?? greetSource.name ?? fallbackTeam : fallbackTeam

  const cc = baseCc()
  const seen = new Set<string>(cc.map((c) => c.email.toLowerCase()).concat(to.map((c) => c.email.toLowerCase())))
  for (const r of ccGroupRows) {
    const email = (r.email as string).toLowerCase()
    if (!seen.has(email)) {
      cc.push(toChip(r))
      seen.add(email)
    }
  }

  return { greeting, to, cc }
}

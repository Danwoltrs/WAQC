import type { SupabaseClient } from '@supabase/supabase-js'

export interface ContactLite {
  name: string | null
  email: string
}

interface RawContact {
  name: string | null
  email: string | null
  role: string | null
  is_primary: boolean | null
  company_id: string
}

const QC_MAILBOX = 'qualitycontrol@wolthers.com'

function rank(c: RawContact): number {
  if (c.is_primary) return 0
  const role = (c.role ?? '').toLowerCase()
  if (/quality|approval|qc/.test(role)) return 1
  return 2
}

function sortSide(rows: RawContact[]): RawContact[] {
  return [...rows].sort((a, b) => {
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

export interface ResolvedRecipients {
  to: ContactLite[]
  cc: ContactLite[]
}

/**
 * Resolve default To (primary buyer + primary seller contact) and Cc
 * (QC mailbox + any logistics-role contacts on either side).
 */
export async function resolveApprovalRecipients(
  supabase: SupabaseClient,
  buyerId: string | null,
  sellerId: string | null,
): Promise<ResolvedRecipients> {
  const companyIds = [buyerId, sellerId].filter(Boolean) as string[]
  if (companyIds.length === 0) {
    return { to: [], cc: [{ name: 'Quality Control', email: QC_MAILBOX }] }
  }

  const { data } = await supabase
    .from('contacts')
    .select('name, email, role, is_primary, company_id')
    .in('company_id', companyIds)
    .eq('is_active', true)
    .not('email', 'is', null)

  const rows = (data ?? []) as RawContact[]
  const buyer = sortSide(rows.filter((r) => r.company_id === buyerId))
  const seller = sortSide(rows.filter((r) => r.company_id === sellerId))

  const to: ContactLite[] = []
  if (buyer[0]?.email) to.push({ name: buyer[0].name, email: buyer[0].email })
  if (seller[0]?.email) to.push({ name: seller[0].name, email: seller[0].email })

  const logistics = rows.filter((r) => /logistic|docs|shipping/i.test(r.role ?? ''))
  const cc: ContactLite[] = [{ name: 'Quality Control', email: QC_MAILBOX }]
  for (const l of logistics) {
    if (l.email && !cc.some((c) => c.email === l.email)) {
      cc.push({ name: l.name, email: l.email })
    }
  }

  return { to, cc }
}

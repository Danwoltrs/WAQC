import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { loadLabScope, ownerLabFor } from '@/lib/auth/lab-scope'
import { fetchOwnedContacts } from '@/lib/qc-contacts/owned-rows'
import { PERSON_CONTACT_COLUMNS } from '@/lib/contacts/people'

const PAGE_SIZE = 50

const adminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

/**
 * GET /api/contacts/directory?q=&role=buyers|sellers&offset=&limit=
 * One page of companies (A-Z, 50 at a time) with their active contacts.
 * Companies are read with the session client, so the database rules apply: a
 * confined lab sees only its own companies. The contacts are the ones this
 * laboratory owns (fetchOwnedContacts), the same list as the client page.
 * Buyers / Sellers filter on companies.trading_roles, as sys /contacts does.
 * Search matches the company's name or fantasy name, or a contact's name / email.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isStaffSampleManager(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  // Keep filter-grammar characters out of the term (PostgREST .or() syntax).
  const q = (sp.get('q') ?? '').replace(/[,()%*\\]/g, ' ').trim()
  const role = sp.get('role')
  const offset = Math.max(0, parseInt(sp.get('offset') ?? '0', 10) || 0)
  const limit = Math.min(PAGE_SIZE, Math.max(1, parseInt(sp.get('limit') ?? String(PAGE_SIZE), 10) || PAGE_SIZE))

  try {
    const owner = ownerLabFor(await loadLabScope(supabase, user.id))
    const db = adminClient()

    let matchedCompanyIds: string[] = []
    if (q) {
      const { data, error } = await (owner === null
        ? db.from('contacts').select('company_id').eq('is_active', true).is('owner_lab_id', null)
        : db.from('contacts').select('company_id').eq('is_active', true).eq('owner_lab_id', owner)
      ).or(`name.ilike.%${q}%,email.ilike.%${q}%`).limit(500)
      if (error) throw error
      matchedCompanyIds = Array.from(new Set((data ?? []).map((r: any) => r.company_id as string)))
    }

    let query = supabase
      .from('companies')
      .select('id, name, fantasy_name, trading_roles', { count: 'exact' })
      .eq('is_active', true)
    if (role === 'buyers') query = query.contains('trading_roles', ['buyer'])
    if (role === 'sellers') query = query.contains('trading_roles', ['seller'])
    if (q) {
      const parts = [`name.ilike.%${q}%`, `fantasy_name.ilike.%${q}%`]
      if (matchedCompanyIds.length) parts.push(`id.in.(${matchedCompanyIds.join(',')})`)
      query = query.or(parts.join(','))
    }
    const { data: companies, count, error } = await query
      .order('name')
      .range(offset, offset + limit - 1)
    if (error) throw error

    const rows = (companies ?? []) as Array<{ id: string; name: string; fantasy_name: string | null; trading_roles: string[] | null }>
    const contacts = await fetchOwnedContacts<{ company_id: string }>(
      db, rows.map((c) => c.id), owner, { columns: `company_id, ${PERSON_CONTACT_COLUMNS}` },
    )
    const byCompany = new Map<string, any[]>()
    for (const c of contacts) {
      const list = byCompany.get(c.company_id) ?? []
      list.push(c)
      byCompany.set(c.company_id, list)
    }
    const sortContacts = (a: any, b: any) =>
      (a.is_primary ? 0 : 1) - (b.is_primary ? 0 : 1) || (a.name || a.email || '').localeCompare(b.name || b.email || '')

    return NextResponse.json({
      companies: rows.map((c) => ({ ...c, contacts: (byCompany.get(c.id) ?? []).sort(sortContacts) })),
      total: count ?? rows.length,
      hasMore: offset + rows.length < (count ?? 0),
    })
  } catch (error) {
    console.error('contacts directory GET error:', error)
    return NextResponse.json({ error: 'Failed to load the directory' }, { status: 500 })
  }
}

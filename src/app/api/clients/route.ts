import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { activities } from '@/lib/notifications'
import {
  QC_CLIENT_SELECT,
  mapCompanyToClient,
  splitClientPayload,
  fetchClientById,
  mergeTagSets,
  escapeIlike,
} from '@/lib/qc-client-mapper'

// Strip PostgREST/Postgres error internals before serialising for the client.
// The full error always lands in console.error for server-log inspection.
//
// We're intentionally STILL surfacing details in production while the
// consolidation migrations are settling — the WAQC userbase is all
// authenticated Wolthers staff, the alternative is flying blind on schema
// drift, and we hit a real schema mismatch (companies.vat_number) within
// hours of going live. Once the schema is stable, swap this for a tighter
// version that returns `{}` in production. The security review on commit
// 3c05112 flagged this as medium-severity information disclosure; this
// comment is the acknowledgement.
function safeErrorDetails(err: { message?: string; code?: string; hint?: string | null } | null | undefined) {
  if (!err) return {}
  return { details: err.message, code: err.code, hint: err.hint }
}

/**
 * GET /api/clients
 * List QC clients with optional filtering.
 *
 * Post-consolidation: reads from companies (filtered by is_qc_client = true
 * unless caller explicitly says otherwise) joined with qc_client_settings.
 * The response keeps the legacy "client" shape — see qc-client-mapper.ts.
 *
 * Query params: search, client_types, is_active, is_qc_client, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const clientTypesParam = searchParams.get('client_types')
    const isActiveParam = searchParams.get('is_active')
    const isQcClientParam = searchParams.get('is_qc_client')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const clientTypesFilter = clientTypesParam
      ? clientTypesParam.split(',').map(t => t.trim()).filter(Boolean)
      : []

    // Default to is_qc_client=true unless caller explicitly disables it,
    // matching the legacy clients table which only held QC clients.
    // `is_qc_client=all` opts out of the filter entirely (used by the Clients
    // list page so the chip counts can mix QC + trading-only rows).
    const isQcClientMode: 'true' | 'false' | 'all' =
      isQcClientParam === 'all' ? 'all'
      : isQcClientParam === 'false' ? 'false'
      : 'true'
    const isQcClient = isQcClientMode === 'true'

    let query = (supabase as any)
      .from('companies')
      .select(QC_CLIENT_SELECT)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (isQcClientMode !== 'all') {
      query = query.eq('is_qc_client', isQcClient)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,fantasy_name.ilike.%${search}%`)
    }

    if (clientTypesFilter.length > 0) {
      query = query.overlaps('company_types', clientTypesFilter)
    }

    if (isActiveParam !== null) {
      query = query.eq('is_active', isActiveParam === 'true')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching clients:', error)
      return NextResponse.json({
        error: 'Failed to fetch clients',
        ...safeErrorDetails(error),
      }, { status: 500 })
    }

    const clients = (data || []).map(mapCompanyToClient).filter(Boolean)

    // Pagination count — same filters as the data query
    let countQuery = (supabase as any)
      .from('companies')
      .select('id', { count: 'exact', head: true })

    if (isQcClientMode !== 'all') {
      countQuery = countQuery.eq('is_qc_client', isQcClient)
    }

    if (search) {
      countQuery = countQuery.or(`name.ilike.%${search}%,fantasy_name.ilike.%${search}%`)
    }
    if (clientTypesFilter.length > 0) {
      countQuery = countQuery.overlaps('company_types', clientTypesFilter)
    }
    if (isActiveParam !== null) {
      countQuery = countQuery.eq('is_active', isActiveParam === 'true')
    }

    const { count } = await countQuery

    return NextResponse.json({
      clients,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (count || 0),
      },
    })
  } catch (error) {
    console.error('Error in GET /api/clients:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/clients
 * Create a new QC client.
 *
 * Post-consolidation:
 *   - If a company with the same email or name already exists, surface a 409
 *     so the caller can choose to "enable QC on this existing company" instead.
 *   - Otherwise create the companies row, then the qc_client_settings row,
 *     and return the joined "client" shape.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body.name || !body.company) {
      return NextResponse.json({
        error: 'Missing required fields: name, company',
      }, { status: 400 })
    }

    const payload = { ...body, is_qc_client: body.is_qc_client !== false }
    const wantsQc = payload.is_qc_client !== false
    const { companyFields, settingsFields } = splitClientPayload(payload)

    // Look for an existing company by email and/or canonical name match. companies
    // is shared with sys.wolthers.com, so most counterparties already exist —
    // when we find a match we *augment* the existing row (flip is_qc_client when
    // requested, merge role tags, attach qc_client_settings) instead of inserting
    // a duplicate.
    //
    // Security notes (informed by 2026-05-29 review):
    //   1. The name lookup uses an ILIKE with `%`/`_` escaped so a user-supplied
    //      name can't act as a wildcard pattern.
    //   2. The upgrade path NEVER splats incoming companyFields into the UPDATE.
    //      Identity fields (name, email, address, phone, document_*, vat_number,
    //      logo_url, notes, fantasy_name) belong to whoever first registered the
    //      company — usually the sys.wolthers.com trading side. We only ever
    //      touch the WAQC-owned columns: is_qc_client, company_types, trading_roles.
    //      If the caller wants to amend identity fields, they should send a PATCH
    //      to /api/clients/[id] (or work through sys).
    let existing: {
      id: string
      name: string
      fantasy_name: string | null
      is_qc_client: boolean
      company_types: string[] | null
      trading_roles: string[] | null
    } | null = null

    const existingSelect = 'id, name, fantasy_name, is_qc_client, company_types, trading_roles'

    if (body.email) {
      const { data: byEmail } = await (supabase as any)
        .from('companies')
        .select(existingSelect)
        .eq('email', body.email)
        .limit(1)
        .maybeSingle()
      if (byEmail) existing = byEmail
    }

    if (!existing && typeof companyFields.name === 'string' && companyFields.name.trim().length > 0) {
      const { data: byName } = await (supabase as any)
        .from('companies')
        .select(existingSelect)
        .ilike('name', escapeIlike(companyFields.name.trim()))
        .limit(1)
        .maybeSingle()
      if (byName) existing = byName
    }

    if (existing) {
      // Already a QC client — bounce the caller so the UI can route to the edit
      // page rather than silently mutating someone else's data.
      if (existing.is_qc_client && wantsQc) {
        return NextResponse.json({
          error: 'Duplicate client detected',
          message: 'A QC client with this name or email already exists',
          existing_client: existing,
        }, { status: 409 })
      }

      // WAQC-owned columns only — see the security note above.
      const mergedCompanyTypes = mergeTagSets(
        existing.company_types,
        Array.isArray(companyFields.company_types) ? companyFields.company_types as string[] : null,
      )
      const mergedTradingRoles = mergeTagSets(
        existing.trading_roles,
        Array.isArray(companyFields.trading_roles) ? companyFields.trading_roles as string[] : null,
      )

      const upgradePayload: Record<string, unknown> = {
        company_types: mergedCompanyTypes,
        trading_roles: mergedTradingRoles,
      }
      if (wantsQc) upgradePayload.is_qc_client = true

      const { error: upgradeError } = await (supabase as any)
        .from('companies')
        .update(upgradePayload)
        .eq('id', existing.id)

      if (upgradeError) {
        console.error('Error upgrading existing company:', upgradeError)
        return NextResponse.json({
          error: 'Failed to upgrade existing company',
          ...safeErrorDetails(upgradeError),
        }, { status: 500 })
      }

      if (wantsQc) {
        const { error: settingsError } = await (supabase as any)
          .from('qc_client_settings')
          .upsert({ company_id: existing.id, ...settingsFields }, { onConflict: 'company_id' })

        if (settingsError) {
          console.error('Error upserting qc_client_settings on upgrade:', settingsError)
          return NextResponse.json({
            error: 'Failed to attach QC settings to existing company',
            ...safeErrorDetails(settingsError),
          }, { status: 500 })
        }
      }

      const client = await fetchClientById(supabase, existing.id)
      return NextResponse.json({
        client,
        upgraded: true,
        message: wantsQc
          ? 'Existing company upgraded to QC client'
          : 'Existing company updated with new role tags',
      }, { status: 200 })
    }

    // No match — insert new company.
    const { data: createdCompany, error: insertError } = await (supabase as any)
      .from('companies')
      .insert({
        ...companyFields,
        is_active: companyFields.is_active ?? true,
      })
      .select('id, name, fantasy_name')
      .single()

    if (insertError || !createdCompany) {
      console.error('Error creating company:', insertError)
      return NextResponse.json({
        error: 'Failed to create client',
        ...safeErrorDetails(insertError),
      }, { status: 500 })
    }

    // Then insert the qc_client_settings row (only if it's actually a QC client)
    if (wantsQc) {
      const { error: settingsError } = await (supabase as any)
        .from('qc_client_settings')
        .insert({
          company_id: createdCompany.id,
          ...settingsFields,
        })

      if (settingsError) {
        console.error('Error creating qc_client_settings:', settingsError)
        // Roll back the company so we don't leave a half-created client
        await (supabase as any).from('companies').delete().eq('id', createdCompany.id)
        return NextResponse.json({
          error: 'Failed to create QC settings',
          ...safeErrorDetails(settingsError),
        }, { status: 500 })
      }
    }

    // Activity log
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('laboratory_id')
      .eq('id', user.id)
      .single()

    await activities.clientCreated(
      createdCompany.id,
      createdCompany.fantasy_name || createdCompany.name,
      profile?.laboratory_id || undefined,
    )

    const client = await fetchClientById(supabase, createdCompany.id)
    return NextResponse.json({ client }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

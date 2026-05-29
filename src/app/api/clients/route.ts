import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { activities } from '@/lib/notifications'
import {
  QC_CLIENT_SELECT,
  mapCompanyToClient,
  splitClientPayload,
  fetchClientById,
  mergeTagSets,
} from '@/lib/qc-client-mapper'

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
    const isQcClient = isQcClientParam === null ? true : isQcClientParam === 'true'

    let query = (supabase as any)
      .from('companies')
      .select(QC_CLIENT_SELECT)
      .eq('is_qc_client', isQcClient)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

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
      // Surface the PostgREST error message so we can diagnose mismatches between
      // the SELECT clause and the live schema (relation ambiguity, missing column,
      // RLS rejection, etc.) without round-tripping to server logs every time.
      return NextResponse.json({
        error: 'Failed to fetch clients',
        details: error.message,
        code: error.code,
        hint: error.hint,
      }, { status: 500 })
    }

    const clients = (data || []).map(mapCompanyToClient).filter(Boolean)

    // Pagination count — same filters as the data query
    let countQuery = (supabase as any)
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('is_qc_client', isQcClient)

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

    // Look for an existing company by (email, name, fantasy_name). companies is
    // a shared table with sys.wolthers.com, so most counterparties already exist —
    // we want to *upgrade* (merge role tags, flip is_qc_client when requested)
    // rather than reject as a duplicate.
    let existing: { id: string; name: string; fantasy_name: string | null; is_qc_client: boolean; company_types: string[] | null; trading_roles: string[] | null } | null = null

    if (body.email) {
      const { data: byEmail } = await (supabase as any)
        .from('companies')
        .select('id, name, fantasy_name, is_qc_client, company_types, trading_roles')
        .eq('email', body.email)
        .limit(1)
        .maybeSingle()
      if (byEmail) existing = byEmail
    }

    if (!existing && companyFields.name) {
      const { data: byName } = await (supabase as any)
        .from('companies')
        .select('id, name, fantasy_name, is_qc_client, company_types, trading_roles')
        .ilike('name', String(companyFields.name))
        .limit(1)
        .maybeSingle()
      if (byName) existing = byName
    }

    if (existing) {
      // If caller wants this row to be a QC client and it isn't yet, upgrade in place:
      //   - flip is_qc_client = true
      //   - merge any incoming role tags into the existing tag sets
      //   - upsert a qc_client_settings row keyed on company_id
      // If it's already a QC client, we keep returning 409 so the caller can route
      // the user to the existing edit page instead of silently overwriting.
      if (existing.is_qc_client && wantsQc) {
        return NextResponse.json({
          error: 'Duplicate client detected',
          message: 'A QC client with this name or email already exists',
          existing_client: existing,
        }, { status: 409 })
      }

      const mergedCompanyTypes = mergeTagSets(
        existing.company_types,
        Array.isArray(companyFields.company_types) ? companyFields.company_types as string[] : null,
      )
      const mergedTradingRoles = mergeTagSets(
        existing.trading_roles,
        Array.isArray(companyFields.trading_roles) ? companyFields.trading_roles as string[] : null,
      )

      const updatePayload: Record<string, unknown> = { ...companyFields }
      updatePayload.company_types = mergedCompanyTypes
      updatePayload.trading_roles = mergedTradingRoles
      if (wantsQc) updatePayload.is_qc_client = true
      // Don't accidentally null out fields we already have — drop incoming nulls
      // when the existing row has a value for them.
      for (const k of Object.keys(updatePayload)) {
        if (updatePayload[k] === null || updatePayload[k] === '') delete updatePayload[k]
      }

      const { error: upgradeError } = await (supabase as any)
        .from('companies')
        .update(updatePayload)
        .eq('id', existing.id)

      if (upgradeError) {
        console.error('Error upgrading existing company:', upgradeError)
        return NextResponse.json({
          error: 'Failed to upgrade existing company',
          details: upgradeError.message,
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
            details: settingsError.message,
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
        details: insertError?.message,
        code: insertError?.code,
        hint: insertError?.hint,
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
          details: settingsError.message,
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

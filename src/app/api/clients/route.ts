import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { activities } from '@/lib/notifications'
import {
  QC_CLIENT_SELECT,
  mapCompanyToClient,
  splitClientPayload,
  fetchClientById,
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
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
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

    // Dedupe by email — match legacy behavior so callers don't double-create
    if (body.email) {
      const { data: dupes } = await (supabase as any)
        .from('companies')
        .select('id, name, fantasy_name, email')
        .eq('email', body.email)
        .limit(1)

      if (dupes && dupes.length > 0) {
        return NextResponse.json({
          error: 'Duplicate client detected',
          message: 'A company with this email address already exists',
          existing_client: dupes[0],
        }, { status: 409 })
      }
    }

    // Always treat new POSTs as QC clients (matches legacy default)
    const payload = { ...body, is_qc_client: body.is_qc_client !== false }
    const { companyFields, settingsFields } = splitClientPayload(payload)

    // Insert into companies first
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
      }, { status: 500 })
    }

    // Then insert the qc_client_settings row (only if it's actually a QC client)
    if (payload.is_qc_client !== false) {
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

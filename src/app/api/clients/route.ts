import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { serviceRoleClient } from '@/lib/supabase-service'
import { activities } from '@/lib/notifications'
import { loadLabScope, ownerLabFor, readsAllLabs } from '@/lib/auth/lab-scope'
import { loadSettingsLab } from '@/lib/qc-settings/user-lab'
import { loadHqLabId, settingsLabFor } from '@/lib/qc-settings/lab-row'
import { requireRegisterStaff } from '@/lib/company-register/server'
import type { MatchDecision } from '@/lib/company-register/match'
import {
  findCompanyMatch,
  linkCompanyToLab,
  parseNewCompanyRegister,
  saveRegisterRows,
} from '@/lib/company-register/register-company'
import {
  withQcClientSelect,
  mapCompanyToClient,
  splitClientPayload,
  fetchClientById,
  mergeTagSets,
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

    const labId = await loadSettingsLab(supabase as any, user.id)

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

    // withQcClientSelect: retried once without the final-word columns until
    // migration 20261118000001 is applied (the list must not 500 before it).
    const buildQuery = (select: string) => {
      let query = (supabase as any)
        .from('companies')
        .select(select)
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
      return query
    }

    const { data, error } = await withQcClientSelect(buildQuery)

    if (error) {
      console.error('Error fetching clients:', error)
      return NextResponse.json({
        error: 'Failed to fetch clients',
        ...safeErrorDetails(error),
      }, { status: 500 })
    }

    const clients = (data || []).map((row: any) => mapCompanyToClient(row, labId)).filter(Boolean)

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
 * Add a company (a QC client, or a party picked at intake). QC staff only.
 *
 * Match or link (spec 2026-11-24 decision 3), for every caller:
 *   1. The body is validated whole (documents, holders, bank accounts) before
 *      anything is read or written.
 *   2. Candidates are read with the SERVICE ROLE (a confined laboratory cannot
 *      see them) by tax id and normalized name; decideCompanyMatch links or
 *      creates. Only the decision is used: no candidate row leaves the server,
 *      and a create caused by several matches or a conflicting tax id looks
 *      like any other create.
 *   3. Link: a confined laboratory gets company_labs(created_company=false)
 *      (service role); the company is then read with the session and enrolled
 *      as before (role tags, this lab's qc_client_settings row). 409 when this
 *      lab already serves it as a QC client.
 *      Create: the session inserts the company with its documents; a confined
 *      laboratory gets company_labs(created_company=true) (service role; the
 *      companies insert trigger does the same).
 *   4. Holders and bank accounts are inserted with the session, owner_lab_id
 *      = ownerLabFor(scope), accounts checked against the record's country.
 *   5. The response is the company as the session reads it.
 * An email never identifies a company (it is a contact's).
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireRegisterStaff()
    if (!gate.ok) return gate.res
    const supabase = gate.supabase
    const userId = gate.userId

    const register = parseNewCompanyRegister(await request.json().catch(() => null))
    if (!register.ok) {
      return NextResponse.json({ error: register.error, fieldErrors: register.fieldErrors }, { status: 400 })
    }
    const { body } = register.value

    // Settings are written for the caller's own laboratory, never one named in the body.
    const [scope, hqLabId] = await Promise.all([loadLabScope(supabase, userId), loadHqLabId(supabase)])
    const labId = settingsLabFor(scope, hqLabId)
    const confinedLab = readsAllLabs(scope) ? null : scope.ownLabId
    const ownerLabId = ownerLabFor(scope)

    const payload = { ...body, is_qc_client: body.is_qc_client !== false }
    const wantsQc = payload.is_qc_client !== false
    const { companyFields, settingsFields } = splitClientPayload(payload)
    Object.assign(companyFields, register.value.documents)

    const service = serviceRoleClient()
    let decision: MatchDecision
    try {
      decision = await findCompanyMatch(service, { name: String(companyFields.name ?? ''), taxId: register.value.taxId })
    } catch (err) {
      // The message only: never a candidate row.
      console.error('[clients] company match lookup failed:', err instanceof Error ? err.message : 'unknown error')
      return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
    }

    if (decision.kind === 'link') {
      if (confinedLab) {
        const { error: linkError } = await linkCompanyToLab(service, decision.companyId, confinedLab, false, userId)
        if (linkError) {
          console.error('[clients] company_labs link failed:', linkError.code ?? linkError.message)
          return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
        }
      }

      // From here on the caller's session only: the link is what lets a
      // confined laboratory read the record.
      //
      // The upgrade path NEVER splats incoming companyFields into the UPDATE
      // (2026-05-29 review). Identity fields (name, email, address, phone,
      // document_*, vat_number, logo_url, notes, fantasy_name) belong to whoever
      // first registered the company, usually the sys.wolthers.com trading
      // side. Only the WAQC-owned columns are touched: is_qc_client,
      // company_types, trading_roles (and for a confined lab only on a company
      // it created: companies_lab_scope_update). Identity edits go through
      // PATCH /api/companies/[id] or sys.
      const { data: existing } = await (supabase as any)
        .from('companies')
        .select('id, name, fantasy_name, country, is_qc_client, company_types, trading_roles')
        .eq('id', decision.companyId)
        .maybeSingle() as {
          data: {
            id: string
            name: string
            fantasy_name: string | null
            country: string | null
            is_qc_client: boolean
            company_types: string[] | null
            trading_roles: string[] | null
          } | null
        }
      if (!existing) {
        console.error('[clients] linked company not readable with the session')
        return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
      }
      // Already a QC client of THIS laboratory — bounce the caller so the UI can
      // route to the edit page rather than silently mutating someone else's data.
      // A company another laboratory enrolled has no row here yet: that lab adds
      // its own settings row and the other lab's row stays untouched.
      let hasSettingsHere = false
      if (existing.is_qc_client && wantsQc) {
        const { data: ownRow } = await (supabase as any)
          .from('qc_client_settings')
          .select('company_id')
          .eq('company_id', existing.id)
          .eq('laboratory_id', labId)
          .maybeSingle()
        hasSettingsHere = !!ownRow
      }
      if (hasSettingsHere) {
        return NextResponse.json({
          error: 'Duplicate client detected',
          message: 'This laboratory already has this company as a QC client',
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
          .upsert(
            { company_id: existing.id, laboratory_id: labId, ...settingsFields },
            { onConflict: 'company_id,laboratory_id' },
          )

        if (settingsError) {
          console.error('Error upserting qc_client_settings on upgrade:', settingsError)
          return NextResponse.json({
            error: 'Failed to attach QC settings to existing company',
            ...safeErrorDetails(settingsError),
          }, { status: 500 })
        }
      }

      const registerErrors = await saveRegisterRows(supabase, existing.id, existing.country, register.value, userId, ownerLabId)
      const client = await fetchClientById(supabase, existing.id, labId)
      return NextResponse.json({
        client,
        upgraded: true,
        message: wantsQc
          ? 'Existing company upgraded to QC client'
          : 'Existing company updated with new role tags',
        ...(registerErrors.length > 0 ? { register_errors: registerErrors } : {}),
      }, { status: 200 })
    }

    // No match: insert a new company, as the caller.
    const { data: createdCompany, error: insertError } = await (supabase as any)
      .from('companies')
      .insert({
        ...companyFields,
        is_active: companyFields.is_active ?? true,
      })
      .select('id, name, fantasy_name, country')
      .single()

    if (insertError || !createdCompany) {
      console.error('Error creating company:', insertError)
      return NextResponse.json({
        error: 'Failed to create client',
        ...safeErrorDetails(insertError),
      }, { status: 500 })
    }

    if (confinedLab) {
      // The companies insert trigger (qc_link_company_to_scope_lab) links it as
      // well; an existing row is left as it is.
      const { error: linkError } = await linkCompanyToLab(service, createdCompany.id, confinedLab, true, userId)
      if (linkError) console.error('[clients] company_labs link failed:', linkError.code ?? linkError.message)
    }

    // Then insert the qc_client_settings row (only if it's actually a QC client)
    if (wantsQc) {
      const { error: settingsError } = await (supabase as any)
        .from('qc_client_settings')
        .insert({
          company_id: createdCompany.id,
          laboratory_id: labId,
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

    const registerErrors = await saveRegisterRows(
      supabase, createdCompany.id, createdCompany.country ?? null, register.value, userId, ownerLabId,
    )

    await activities.clientCreated(
      createdCompany.id,
      createdCompany.fantasy_name || createdCompany.name,
      scope.ownLabId || undefined,
    )

    const client = await fetchClientById(supabase, createdCompany.id, labId)
    return NextResponse.json({
      client,
      ...(registerErrors.length > 0 ? { register_errors: registerErrors } : {}),
    }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { serviceRoleClient } from '@/lib/supabase-service'
import { activities } from '@/lib/notifications'
import { loadLabScope, ownerLabFor, readsAllLabs } from '@/lib/auth/lab-scope'
import { loadHqLabId, settingsLabFor } from '@/lib/qc-settings/lab-row'
import { requireRegisterStaff } from '@/lib/company-register/server'
import {
  emptyWriteLog,
  findCompanyMatch,
  linkCompanyToLab,
  parseNewCompanyRegister,
  parseRegisterAccounts,
  saveRegisterRows,
  settleLinkedCompany,
  undoWrites,
  type CompanyMatch,
} from '@/lib/company-register/register-company'
import {
  withQcClientSelect,
  mapCompanyToClient,
  splitClientPayload,
  fetchClientById,
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

    const [scope, hqLabId] = await Promise.all([loadLabScope(supabase as any, user.id), loadHqLabId(supabase as any)])
    const labId = settingsLabFor(scope, hqLabId)

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
    // A confined laboratory lists the QC clients it set up itself: those with a
    // qc_client_settings row of its own (ruling 2026-11-26, spec Piece 1b).
    // =all and =false are already limited by the database to what it added.
    const ownClientsOnly = isQcClient && !readsAllLabs(scope)

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
      if (ownClientsOnly) query = query.eq('qc_settings.laboratory_id', labId)

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

    const { data, error } = await withQcClientSelect(buildQuery, { inner: ownClientsOnly })

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
      .select(
        ownClientsOnly ? 'id, qc_settings:qc_client_settings!qc_client_settings_company_id_fkey!inner(laboratory_id)' : 'id',
        { count: 'exact', head: true },
      )

    if (isQcClientMode !== 'all') {
      countQuery = countQuery.eq('is_qc_client', isQcClient)
    }
    if (ownClientsOnly) countQuery = countQuery.eq('qc_settings.laboratory_id', labId)

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
 *   1. Name, company fields, documents and holders are validated before
 *      anything is read or written.
 *   2. Candidates are read with the SERVICE ROLE (a confined laboratory cannot
 *      see them) by tax id and normalized name; decideCompanyMatch links or
 *      creates. Only the decision (and, on a link, the record's country for the
 *      account rules) is used: no candidate row leaves the server, and a create
 *      caused by several matches or a conflicting tax id looks like any other.
 *   3. Every bank account is validated against that country (the body's on a
 *      create). Still nothing written.
 *   4. Link: a confined laboratory gets company_labs(created_company=false)
 *      (service role); the record is read with the session; 409 when this lab
 *      already serves it. Then, with the session: this lab's settings row, the
 *      holders and accounts. Last, one service-role write (settleLinkedCompany):
 *      is_qc_client false -> true when enrolling (a QC client somewhere, spec
 *      Piece 1b), is_active false -> true (in use again), the requested role
 *      tags added, never removed; what is already set is success. Any failure
 *      takes back exactly what this request wrote (undoWrites), the link
 *      included, and never a row that existed before.
 *      Create: the session inserts the company with its documents; a confined
 *      laboratory gets company_labs(created_company=true) (the insert trigger
 *      does the same). A later failure leaves the company (a confined lab never
 *      deletes one; HQ still rolls back on a failed settings row) and answers
 *      the error with the company as the session reads it.
 *   5. Holders and accounts carry owner_lab_id = ownerLabFor(scope).
 *   6. The response is the company as the session reads it.
 * An email never identifies a company (it is a contact's). A session update
 * that matches no row is a failure, never a silent success.
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
    let match: CompanyMatch
    try {
      match = await findCompanyMatch(service, { name: String(companyFields.name ?? ''), taxId: register.value.taxId })
    } catch (err) {
      // The message only: never a candidate row.
      console.error('[clients] company match lookup failed:', err instanceof Error ? err.message : 'unknown error')
      return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
    }

    // Every bank account against its company's country, before any write. On a
    // link that is the matched record's country (service role, server-side only).
    const bodyCountry = typeof companyFields.country === 'string' ? companyFields.country : null
    const rows = parseRegisterAccounts(register.value, match.kind === 'link' ? match.country : bodyCountry)
    if (!rows.ok) {
      return NextResponse.json({ error: rows.error, fieldErrors: rows.fieldErrors }, { status: 400 })
    }

    if (match.kind === 'link') {
      const companyId = match.companyId
      const log = emptyWriteLog()
      const fail = async (status: number, body: Record<string, unknown>) => {
        await undoWrites(service, supabase, log)
        return NextResponse.json(body, { status })
      }

      if (confinedLab) {
        const link = await linkCompanyToLab(service, companyId, confinedLab, false, userId)
        if (link.error) {
          console.error('[clients] company_labs link failed:', link.error.code ?? link.error.message)
          return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
        }
        log.linkId = link.createdLinkId
      }

      // From here on the caller's session reads: the link is what lets a
      // confined laboratory read the record.
      //
      // The upgrade path NEVER splats incoming companyFields into the UPDATE
      // (2026-05-29 review). Identity fields (name, email, address, phone,
      // document_*, vat_number, logo_url, notes, fantasy_name) belong to whoever
      // first registered the company, usually the sys.wolthers.com trading
      // side. Only settleLinkedCompany writes the company, last: is_qc_client
      // and is_active false -> true, role tags added. Identity edits go
      // through PATCH /api/companies/[id] or sys.
      const { data: existing } = await (supabase as any)
        .from('companies')
        .select('id, name, fantasy_name, is_qc_client, company_types, trading_roles')
        .eq('id', companyId)
        .maybeSingle() as {
          data: {
            id: string
            name: string
            fantasy_name: string | null
            is_qc_client: boolean
            company_types: string[] | null
            trading_roles: string[] | null
          } | null
        }
      if (!existing) {
        console.error('[clients] linked company not readable with the session')
        return fail(500, { error: 'Failed to create client' })
      }

      if (wantsQc) {
        const { data: ownRow, error: ownRowError } = await (supabase as any)
          .from('qc_client_settings')
          .select('company_id')
          .eq('company_id', companyId)
          .eq('laboratory_id', labId)
          .maybeSingle()
        if (ownRowError) return fail(500, { error: 'Failed to create client', ...safeErrorDetails(ownRowError) })

        // Already a QC client of THIS laboratory: bounce the caller so the UI can
        // route to the edit page rather than silently mutating someone else's
        // data. A company another laboratory enrolled has no row here yet: this
        // lab adds its own settings row and the other lab's row stays untouched.
        if (ownRow && existing.is_qc_client) {
          return NextResponse.json({
            error: 'Duplicate client detected',
            message: 'This laboratory already has this company as a QC client',
            existing_client: existing,
          }, { status: 409 })
        }

        if (ownRow) {
          // This lab's row from before (the company was not flagged yet): updated, never deleted on undo.
          if (Object.keys(settingsFields).length > 0) {
            const { data: updated, error: settingsError } = await (supabase as any)
              .from('qc_client_settings')
              .update(settingsFields)
              .eq('company_id', companyId)
              .eq('laboratory_id', labId)
              .select('company_id')
            if (settingsError || !Array.isArray(updated) || updated.length !== 1) {
              console.error('Error updating qc_client_settings on upgrade:', settingsError ?? 'no row updated')
              return fail(500, { error: 'Failed to attach QC settings to existing company', ...safeErrorDetails(settingsError) })
            }
          }
        } else {
          const { error: settingsError } = await (supabase as any)
            .from('qc_client_settings')
            .insert({ company_id: companyId, laboratory_id: labId, ...settingsFields })
          if (settingsError) {
            console.error('Error creating qc_client_settings on upgrade:', settingsError)
            return fail(500, { error: 'Failed to attach QC settings to existing company', ...safeErrorDetails(settingsError) })
          }
          log.settings = { companyId, laboratoryId: labId }
        }
      }

      const saved = await saveRegisterRows(supabase, companyId, rows.value, userId, ownerLabId, log)
      if (saved.error) return fail(saved.error.status, { error: saved.error.message })

      // Last, so nothing after it can fail: one service-role write for
      // is_qc_client, is_active and the added role tags, for every caller.
      const settled = await settleLinkedCompany(service, companyId, {
        qcClient: wantsQc,
        companyTypes: Array.isArray(companyFields.company_types) ? companyFields.company_types as string[] : [],
        tradingRoles: Array.isArray(companyFields.trading_roles) ? companyFields.trading_roles as string[] : [],
      })
      if (settled.error) {
        console.error('[clients] linked company not settled:', settled.error)
        return fail(500, { error: 'Failed to upgrade existing company' })
      }

      const done = [
        ...(wantsQc ? ['enrolled as a QC client of this laboratory'] : []),
        ...(settled.reactivated ? ['reactivated'] : []),
        ...(settled.tagsAdded ? ['given the new role tags'] : []),
      ]
      const client = await fetchClientById(supabase, companyId, labId)
      return NextResponse.json({
        client,
        upgraded: true,
        message: done.length > 0
          ? `Existing company ${done.join(', ').replace(/, ([^,]*)$/, ' and $1')}`
          : 'Existing company found: nothing on it needed changing',
      }, { status: 200 })
    }

    // No match: insert a new company, as the caller.
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

    if (confinedLab) {
      // The companies insert trigger (qc_link_company_to_scope_lab) links it as
      // well; an existing row is left as it is.
      const { error: linkError } = await linkCompanyToLab(service, createdCompany.id, confinedLab, true, userId)
      if (linkError) console.error('[clients] company_labs link failed:', linkError.code ?? linkError.message)
    }

    // A failure after the insert: the company stays (a confined lab never
    // deletes one) and the caller gets the error with the company as the
    // session reads it, so the screen can say it was saved.
    const savedButFailed = async (status: number, error: string, extra: Record<string, unknown> = {}) =>
      NextResponse.json({
        error: `The company was saved, but ${error}. Finish it from the company panel.`,
        client: await fetchClientById(supabase, createdCompany.id, labId),
        ...extra,
      }, { status })

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
        if (!confinedLab) {
          // HQ: roll back the company so we don't leave a half-created client.
          const { data: removed } = await (supabase as any)
            .from('companies').delete().eq('id', createdCompany.id).select('id')
          if (Array.isArray(removed) && removed.length === 1) {
            return NextResponse.json({
              error: 'Failed to create QC settings',
              ...safeErrorDetails(settingsError),
            }, { status: 500 })
          }
          console.error('[clients] rollback of the new company removed no row')
        }
        return savedButFailed(500, 'its QC settings were not', safeErrorDetails(settingsError))
      }
    }

    const saved = await saveRegisterRows(supabase, createdCompany.id, rows.value, userId, ownerLabId, emptyWriteLog())
    if (saved.error) {
      return savedButFailed(saved.error.status, `not all of its holders and bank accounts were (${saved.error.message})`)
    }

    await activities.clientCreated(
      createdCompany.id,
      createdCompany.fantasy_name || createdCompany.name,
      scope.ownLabId || undefined,
    )

    const client = await fetchClientById(supabase, createdCompany.id, labId)
    return NextResponse.json({ client }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

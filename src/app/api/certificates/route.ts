import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/certificates
 * Fetch all certificates with related sample and client data
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const clientId = searchParams.get('client_id')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const sortBy = searchParams.get('sort_by') || 'created_at'
    const sortOrder = searchParams.get('sort_order') || 'desc'
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('certificates')
      .select(`
        id,
        certificate_number,
        issued_to,
        status,
        created_at,
        pdf_url,
        sample_id,
        is_rejected,
        sample:samples(
          id,
          tracking_number,
          origin,
          client_id,
          workflow_stage,
          exporter_id,
          importer_id,
          roaster_id,
          client:clients!samples_client_id_fkey(
            id,
            name,
            company,
            fantasy_name
          ),
          exporter:exporters!samples_exporter_id_fkey(
            id,
            name,
            contact_email
          ),
          importer:importers(
            id,
            name,
            contact_email
          ),
          roaster:roasters(
            id,
            name,
            contact_email
          )
        )
      `)

    // Apply filters
    if (status) {
      query = query.eq('status', status as 'draft' | 'issued' | 'revoked')
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo + 'T23:59:59')
    }

    // Sort
    const ascending = sortOrder === 'asc'
    query = query.order(sortBy, { ascending })

    // Pagination
    query = query.range(offset, offset + limit - 1)

    const { data: certificates, error } = await query

    if (error) {
      console.error('Error fetching certificates:', error)
      return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 })
    }

    // Filter by search (certificate number, sample tracking number, client name)
    let filtered = certificates || []
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter((cert) => {
        const sample = cert.sample as {
          tracking_number?: string
          client?: { name?: string; company?: string; fantasy_name?: string }
        } | null
        return (
          cert.certificate_number.toLowerCase().includes(searchLower) ||
          cert.issued_to?.toLowerCase().includes(searchLower) ||
          sample?.tracking_number?.toLowerCase().includes(searchLower) ||
          sample?.client?.name?.toLowerCase().includes(searchLower) ||
          sample?.client?.company?.toLowerCase().includes(searchLower) ||
          sample?.client?.fantasy_name?.toLowerCase().includes(searchLower)
        )
      })
    }

    // Filter by client ID
    if (clientId) {
      filtered = filtered.filter((cert) => {
        const sample = cert.sample as { client_id?: string } | null
        return sample?.client_id === clientId
      })
    }

    // Get unique clients for filter dropdown
    const clientsMap = new Map<string, { id: string; name: string }>()
    for (const cert of certificates || []) {
      const sample = cert.sample as {
        client?: { id: string; name: string; company?: string; fantasy_name?: string }
      } | null
      if (sample?.client) {
        clientsMap.set(sample.client.id, {
          id: sample.client.id,
          name: sample.client.fantasy_name || sample.client.company || sample.client.name
        })
      }
    }

    return NextResponse.json({
      certificates: filtered,
      clients: Array.from(clientsMap.values()),
      total: filtered.length
    })
  } catch (error) {
    console.error('Error in GET /api/certificates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

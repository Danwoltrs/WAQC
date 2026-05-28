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
    const sampleId = searchParams.get('sample_id')
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
          sample_type,
          exporter_sample_number,
          ico_number,
          container_nr,
          wolthers_contract_nr,
          exporter_id,
          importer_id,
          roaster_id,
          seller_id,
          quality_spec_id,
          client:companies!samples_client_id_fkey(
            id,
            name,
            company:name,
            fantasy_name
          ),
          exporter:companies!samples_exporter_id_fkey(
            id,
            name,
            contact_email:email
          ),
          importer:companies!samples_importer_id_fkey(
            id,
            name,
            contact_email:email
          ),
          roaster:companies!samples_roaster_id_fkey(
            id,
            name,
            contact_email:email
          ),
          seller:companies!samples_seller_id_fkey(
            id,
            name
          ),
          quality_spec:client_qualities!samples_quality_spec_id_fkey(
            id,
            custom_name,
            template:quality_templates!client_qualities_template_id_fkey(
              id,
              name
            )
          )
        )
      `)

    // Apply filters
    if (sampleId) {
      query = query.eq('sample_id', sampleId)
    }

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
    // Get unique quality specs for filter dropdown (with client association)
    const qualitiesMap = new Map<string, { id: string; name: string; client_id: string }>()
    for (const cert of certificates || []) {
      const sample = cert.sample as {
        client_id?: string
        client?: { id: string; name: string; company?: string; fantasy_name?: string }
        quality_spec?: { id: string; custom_name?: string; template?: { id: string; name: string } } | null
      } | null
      if (sample?.client) {
        clientsMap.set(sample.client.id, {
          id: sample.client.id,
          name: sample.client.fantasy_name || sample.client.company || sample.client.name
        })
      }
      if (sample?.quality_spec && sample.client_id) {
        const qName = sample.quality_spec.custom_name || sample.quality_spec.template?.name || 'Unknown'
        qualitiesMap.set(sample.quality_spec.id, {
          id: sample.quality_spec.id,
          name: qName,
          client_id: sample.client_id
        })
      }
    }

    return NextResponse.json({
      certificates: filtered,
      clients: Array.from(clientsMap.values()),
      qualities: Array.from(qualitiesMap.values()),
      total: filtered.length
    })
  } catch (error) {
    console.error('Error in GET /api/certificates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

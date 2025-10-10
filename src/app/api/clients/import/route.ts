import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Legacy database connection (trips.wolthers.com)
// You'll need to set these environment variables
const LEGACY_SUPABASE_URL = process.env.LEGACY_SUPABASE_URL || ''
const LEGACY_SUPABASE_ANON_KEY = process.env.LEGACY_SUPABASE_ANON_KEY || ''

/**
 * GET /api/clients/import
 * Search for clients in the legacy trips.wolthers.com database
 * Query params: search
 */
export async function GET(request: NextRequest) {
  try {
    // Check if legacy database is configured
    if (!LEGACY_SUPABASE_URL || !LEGACY_SUPABASE_ANON_KEY) {
      return NextResponse.json({
        error: 'Legacy database not configured. Please set LEGACY_SUPABASE_URL and LEGACY_SUPABASE_ANON_KEY environment variables.'
      }, { status: 500 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')

    if (!search) {
      return NextResponse.json({
        error: 'Missing required parameter: search'
      }, { status: 400 })
    }

    // Connect to legacy database
    const legacySupabase = createClient(LEGACY_SUPABASE_URL, LEGACY_SUPABASE_ANON_KEY)

    // Search for clients in legacy database
    // Adjust table name and columns according to your legacy database schema
    const { data: legacyClients, error } = await legacySupabase
      .from('clients') // Adjust table name if needed
      .select('*')
      .or(`name.ilike.%${search}%,company.ilike.%${search}%`)
      .limit(20)

    if (error) {
      console.error('Error searching legacy clients:', error)
      return NextResponse.json({
        error: 'Failed to search legacy database',
        details: error.message
      }, { status: 500 })
    }

    // Transform legacy client data to match our schema
    const transformedClients = legacyClients?.map((legacyClient: any) => ({
      legacy_id: legacyClient.id,
      name: legacyClient.name || '',
      company: legacyClient.company || legacyClient.name || '',
      fantasy_name: legacyClient.fantasy_name || legacyClient.company || legacyClient.name || '',
      vat: legacyClient.vat || legacyClient.tax_id || null,
      address: legacyClient.address || null,
      city: legacyClient.city || null,
      state: legacyClient.state || legacyClient.province || null,
      country: legacyClient.country || null,
      zip_code: legacyClient.zip_code || legacyClient.postal_code || null,
      email: legacyClient.email || null,
      phone: legacyClient.phone || legacyClient.telephone || null,
      contact_person: legacyClient.contact_person || legacyClient.contact_name || null,
      notes: `Imported from legacy database (ID: ${legacyClient.id})`,
    })) || []

    return NextResponse.json({
      clients: transformedClients,
      count: transformedClients.length
    })
  } catch (error) {
    console.error('Error in GET /api/clients/import:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/clients/import
 * Import a client from legacy database to current database
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.legacy_id) {
      return NextResponse.json({
        error: 'Missing required field: legacy_id'
      }, { status: 400 })
    }

    // Check if legacy database is configured
    if (!LEGACY_SUPABASE_URL || !LEGACY_SUPABASE_ANON_KEY) {
      return NextResponse.json({
        error: 'Legacy database not configured'
      }, { status: 500 })
    }

    // Connect to legacy database
    const legacySupabase = createClient(LEGACY_SUPABASE_URL, LEGACY_SUPABASE_ANON_KEY)

    // Fetch client from legacy database
    const { data: legacyClient, error: fetchError } = await legacySupabase
      .from('clients')
      .select('*')
      .eq('id', body.legacy_id)
      .single()

    if (fetchError || !legacyClient) {
      return NextResponse.json({
        error: 'Client not found in legacy database'
      }, { status: 404 })
    }

    // Import client to current database by calling the POST /api/clients endpoint
    const importData = {
      name: legacyClient.name || '',
      company: legacyClient.company || legacyClient.name || '',
      fantasy_name: body.fantasy_name || legacyClient.fantasy_name || legacyClient.company || legacyClient.name || '',
      vat: legacyClient.vat || legacyClient.tax_id || null,
      address: legacyClient.address || null,
      city: legacyClient.city || null,
      state: legacyClient.state || legacyClient.province || null,
      country: legacyClient.country || null,
      zip_code: legacyClient.zip_code || legacyClient.postal_code || null,
      email: legacyClient.email || null,
      phone: legacyClient.phone || legacyClient.telephone || null,
      contact_person: legacyClient.contact_person || legacyClient.contact_name || null,
      notes: `Imported from legacy database (ID: ${legacyClient.id})`,
      legacy_client_id: legacyClient.id,
      is_active: true
    }

    // Make internal API call to create client
    const createResponse = await fetch(`${request.nextUrl.origin}/api/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || ''
      },
      body: JSON.stringify(importData)
    })

    if (!createResponse.ok) {
      const errorData = await createResponse.json()
      return NextResponse.json({
        error: 'Failed to import client',
        details: errorData.error
      }, { status: createResponse.status })
    }

    const { client } = await createResponse.json()

    return NextResponse.json({
      client,
      message: 'Client imported successfully'
    }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients/import:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/importers
 * List all importers with optional search
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const country = searchParams.get('country')

    let query = (supabase as any)
      .from('importers')
      .select('*')
      .order('name')

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (country) {
      query = query.eq('country', country)
    }

    const { data: importers, error } = await query

    if (error) {
      console.error('Error fetching importers:', error)
      return NextResponse.json({ error: 'Failed to fetch importers' }, { status: 500 })
    }

    return NextResponse.json({ importers })
  } catch (error) {
    console.error('Error in GET /api/importers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/importers
 * Create a new importer
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body.name) {
      return NextResponse.json({ error: 'Importer name is required' }, { status: 400 })
    }

    const { data: importer, error } = await (supabase as any)
      .from('importers')
      .insert({
        name: body.name,
        country: body.country || null,
        contact_email: body.contact_email || null,
        contact_phone: body.contact_phone || null,
        notes: body.notes || null,
        client_id: body.client_id || null
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating importer:', error)
      return NextResponse.json({ error: 'Failed to create importer' }, { status: 500 })
    }

    return NextResponse.json({ importer }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/importers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

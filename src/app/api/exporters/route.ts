import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/exporters
 * List all exporters with optional search
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

    let query = supabase
      .from('exporters')
      .select('*')
      .order('name')

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (country) {
      query = query.eq('country', country)
    }

    const { data: exporters, error } = await query

    if (error) {
      console.error('Error fetching exporters:', error)
      return NextResponse.json({ error: 'Failed to fetch exporters' }, { status: 500 })
    }

    return NextResponse.json({ exporters })
  } catch (error) {
    console.error('Error in GET /api/exporters:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/exporters
 * Create a new exporter
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
      return NextResponse.json({ error: 'Exporter name is required' }, { status: 400 })
    }

    const { data: exporter, error } = await supabase
      .from('exporters')
      .insert({
        name: body.name,
        country: body.country || null,
        contact_email: body.contact_email || null,
        contact_phone: body.contact_phone || null,
        notes: body.notes || null
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating exporter:', error)
      return NextResponse.json({ error: 'Failed to create exporter' }, { status: 500 })
    }

    return NextResponse.json({ exporter }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/exporters:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

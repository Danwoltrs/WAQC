import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/suppliers
 * List all suppliers with optional search
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
      .from('suppliers')
      .select('*')
      .order('name')

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (country) {
      query = query.eq('country', country)
    }

    const { data: suppliers, error } = await query

    if (error) {
      console.error('Error fetching suppliers:', error)
      return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
    }

    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('Error in GET /api/suppliers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/suppliers
 * Create a new supplier
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
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
    }

    const { data: supplier, error } = await (supabase as any)
      .from('suppliers')
      .insert({
        name: body.name,
        country: body.country || null,
        region: body.region || null,
        contact_email: body.contact_email || null,
        contact_phone: body.contact_phone || null,
        notes: body.notes || null
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating supplier:', error)
      return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
    }

    return NextResponse.json({ supplier }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/suppliers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

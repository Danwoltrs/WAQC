import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/clients/[id]/lab-configs - Get all lab configurations for a client
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()

    const { data: configs, error } = await supabase
      .from('client_laboratory_config')
      .select(`
        id,
        client_id,
        laboratory_id,
        starting_sequence,
        notes,
        laboratories (
          id,
          name,
          location
        )
      `)
      .eq('client_id', params.id)
      .order('starting_sequence', { ascending: false })

    if (error) {
      console.error('Error fetching lab configs:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ configs })
  } catch (error: any) {
    console.error('Error in GET /api/clients/[id]/lab-configs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/clients/[id]/lab-configs - Create or update lab configuration
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { laboratory_id, starting_sequence, notes } = body

    if (!laboratory_id) {
      return NextResponse.json(
        { error: 'laboratory_id is required' },
        { status: 400 }
      )
    }

    if (starting_sequence === undefined || starting_sequence === null) {
      return NextResponse.json(
        { error: 'starting_sequence is required' },
        { status: 400 }
      )
    }

    // Upsert the configuration (insert or update if exists)
    const { data, error } = await supabase
      .from('client_laboratory_config')
      .upsert({
        client_id: params.id,
        laboratory_id,
        starting_sequence: parseInt(starting_sequence),
        notes: notes || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'client_id,laboratory_id'
      })
      .select()
      .single()

    if (error) {
      console.error('Error upserting lab config:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ config: data })
  } catch (error: any) {
    console.error('Error in POST /api/clients/[id]/lab-configs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/clients/[id]/lab-configs?config_id=xxx - Delete a lab configuration
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const configId = searchParams.get('config_id')

    if (!configId) {
      return NextResponse.json(
        { error: 'config_id query parameter is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('client_laboratory_config')
      .delete()
      .eq('id', configId)
      .eq('client_id', params.id) // Ensure we only delete for this client

    if (error) {
      console.error('Error deleting lab config:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in DELETE /api/clients/[id]/lab-configs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

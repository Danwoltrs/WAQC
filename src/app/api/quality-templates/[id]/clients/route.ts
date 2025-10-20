import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/quality-templates/[id]/clients
 * Get all clients using this quality template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const templateId = params.id

    // Get all client qualities using this template
    const { data: clientQualities, error: cqError } = await supabase
      .from('client_qualities')
      .select(`
        id,
        client_id,
        clients (
          id,
          name,
          company,
          fantasy_name
        )
      `)
      .eq('template_id', templateId)

    if (cqError) {
      console.error('Error fetching client qualities:', cqError)
      return NextResponse.json(
        { error: 'Failed to fetch clients using this template' },
        { status: 500 }
      )
    }

    // Extract unique clients (in case a client has multiple qualities using this template)
    const clientMap = new Map()
    clientQualities?.forEach((cq: any) => {
      if (cq.clients) {
        clientMap.set(cq.clients.id, cq.clients)
      }
    })

    const clients = Array.from(clientMap.values())

    return NextResponse.json({ clients })
  } catch (error) {
    console.error('Error in GET /api/quality-templates/[id]/clients:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

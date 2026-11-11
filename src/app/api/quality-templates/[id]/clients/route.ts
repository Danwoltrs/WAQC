import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/quality-templates/[id]/clients
 * Get all clients using this quality template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: templateId } = await params

    // Every client quality reads its own private copy of a template, so the
    // clients of a base template are mostly the clients of copies made from
    // it (template_parent_id). Those rows come after the direct ones, marked
    // copy: true.
    const CLIENT_EMBED = `
        id,
        client_id,
        clients (
          id,
          name,
          company,
          fantasy_name
        )
      `

    // Get all client qualities using this template
    const { data: clientQualities, error: cqError } = await supabase
      .from('client_qualities')
      .select(CLIENT_EMBED)
      .eq('template_id', templateId)

    if (cqError) {
      console.error('Error fetching client qualities:', cqError)
      return NextResponse.json(
        { error: 'Failed to fetch clients using this template' },
        { status: 500 }
      )
    }

    const { data: copies, error: copiesError } = await (supabase as any)
      .from('quality_templates')
      .select('id')
      .eq('template_parent_id', templateId)
    let copyQualities: any[] = []
    if (!copiesError && copies && copies.length > 0) {
      const { data, error } = await (supabase as any)
        .from('client_qualities')
        .select(CLIENT_EMBED)
        .in('template_id', copies.map((c: { id: string }) => c.id))
      if (error) console.error('Error fetching client qualities of template copies:', error)
      copyQualities = data ?? []
    } else if (copiesError) {
      console.error('Error fetching template copies:', copiesError)
    }

    // Unique clients per kind (a client may hold several qualities on it).
    const unique = (rows: any[] | null, copy: boolean) => {
      const map = new Map<string, any>()
      rows?.forEach((cq: any) => {
        if (cq.clients) map.set(cq.clients.id, { ...cq.clients, copy })
      })
      return Array.from(map.values())
    }

    const clients = [...unique(clientQualities, false), ...unique(copyQualities, true)]

    return NextResponse.json({ clients })
  } catch (error) {
    console.error('Error in GET /api/quality-templates/[id]/clients:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

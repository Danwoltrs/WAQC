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
    // copy: true. The clients table is gone: parties are companies.
    const CLIENT_EMBED = 'id, client_id, clients:companies!client_qualities_client_id_fkey(id, name, company:name, fantasy_name)'

    // Get all client qualities using this template
    const { data: clientQualities, error: cqError } = await (supabase as any)
      .from('client_qualities')
      .select(CLIENT_EMBED)
      .eq('template_id', templateId)

    // ...and those on a copy of it, in one query through the template FK.
    const { data: copyQualities, error: copiesError } = cqError
      ? { data: null, error: null }
      : await (supabase as any)
          .from('client_qualities')
          .select(`${CLIENT_EMBED}, quality_templates!client_qualities_template_id_fkey!inner(template_parent_id)`)
          .eq('quality_templates.template_parent_id', templateId)

    if (cqError || copiesError) {
      console.error('Error fetching client qualities:', cqError || copiesError)
      return NextResponse.json(
        { error: 'Failed to fetch clients using this template' },
        { status: 500 }
      )
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

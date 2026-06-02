import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // CVA quality templates → their client_qualities → samples assigned to them.
    const { data: templates } = await supabase
      .from('quality_templates')
      .select('id')
      .eq('methodology', 'cva')
    const templateIds = (templates ?? []).map((t: any) => t.id)
    if (templateIds.length === 0) return NextResponse.json({ samples: [] })

    const { data: qualities } = await supabase
      .from('client_qualities')
      .select('id')
      .in('template_id', templateIds)
    const qualityIds = (qualities ?? []).map((q: any) => q.id)
    if (qualityIds.length === 0) return NextResponse.json({ samples: [] })

    const { data: samples, error } = await supabase
      .from('samples')
      .select('id, tracking_number, status, workflow_stage, quality_spec_id, created_at')
      .in('quality_spec_id', qualityIds)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error

    return NextResponse.json({ samples: samples ?? [] }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('GET /api/cupping/cva/eligible', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

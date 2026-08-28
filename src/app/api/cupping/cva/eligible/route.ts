import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveSampleReference } from '@/lib/sample-reference'
import { trackingNumberToSlug } from '@/lib/utils'

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
      .select(
        'id, tracking_number, sample_type, exporter_sample_number, container_nr, ico_number, status, workflow_stage, quality_spec_id, created_at'
      )
      .in('quality_spec_id', qualityIds)
      // Soft-deleted lots are not cuppable. Without this the picker offered
      // them anyway (3 of the 4 rows it returned were deleted), and the
      // journey would open, autosave scores, and only fail at the very end —
      // the finalize route filters `deleted_at` and answers 404 "Sample not
      // found" after the whole cupping is already done.
      .is('deleted_at', null)
      // A contract sibling shares its lab unit's cupping; only the lab unit
      // is a cuppable lot.
      .is('lab_source_sample_id', null)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error

    // The picker lists what the exporter calls each lot, not the internal SAN-
    // lab number — same rule the journey itself follows.
    const rows = ((samples ?? []) as any[]).map((s) => {
      const ref = resolveSampleReference(s)
      return {
        id: s.id,
        reference: ref.primary || s.id,
        reference_secondary: ref.secondary,
        reference_slug: trackingNumberToSlug(ref.primary || ''),
        status: s.status ?? null,
      }
    })

    return NextResponse.json({ samples: rows }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('GET /api/cupping/cva/eligible', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

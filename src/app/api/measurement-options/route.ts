import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isInternalStaff } from '@/lib/auth/sample-access'
import {
  DEFAULT_MEASUREMENT_OPTIONS,
  cleanOptionName,
  isMeasurementKind,
} from '@/lib/measurement-options'

const COLUMNS = 'id, kind, name, is_iso, spec_key, is_active, sort_order'

/**
 * GET /api/measurement-options
 * The humidity methods and density types a grader picks from. Retired entries
 * are included: a lot measured with one still shows it. `editable` is false
 * when the lists could not be read (the built-in two are served instead).
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await (supabase as any)
      .from('qc_measurement_options')
      .select(COLUMNS)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) {
      console.error('[measurement-options] list failed, serving the built-in entries:', error)
      return NextResponse.json({ options: DEFAULT_MEASUREMENT_OPTIONS, editable: false })
    }
    return NextResponse.json({ options: data ?? [], editable: true })
  } catch (error) {
    console.error('Error in GET /api/measurement-options:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/measurement-options
 * Body: { kind: 'humidity_method' | 'density_type', name: string, is_iso?: boolean }
 * Lab staff add an entry. A name already on the list (retired or not) is
 * brought back rather than duplicated.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isInternalStaff(supabase as any, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const kind = body?.kind
    const name = cleanOptionName(body?.name)
    if (!isMeasurementKind(kind)) return NextResponse.json({ error: 'Unknown list' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'Give the entry a name (80 characters at most)' }, { status: 400 })
    const isIso = kind === 'humidity_method' && body?.is_iso === true

    const { data: existing } = await (supabase as any)
      .from('qc_measurement_options')
      .select(COLUMNS)
      .eq('kind', kind)
      .ilike('name', name.replace(/[\\%_]/g, (c) => `\\${c}`))
      .maybeSingle()
    if (existing) {
      if (existing.is_active) return NextResponse.json({ option: existing, existed: true })
      const { data: revived, error: reviveError } = await (supabase as any)
        .from('qc_measurement_options')
        .update({ is_active: true })
        .eq('id', existing.id)
        .select(COLUMNS)
        .single()
      if (reviveError) {
        console.error('[measurement-options] revive failed:', reviveError)
        return NextResponse.json({ error: 'Could not add the entry' }, { status: 500 })
      }
      return NextResponse.json({ option: revived, existed: true })
    }

    const { data: created, error } = await (supabase as any)
      .from('qc_measurement_options')
      .insert({ kind, name, is_iso: isIso, created_by: user.id })
      .select(COLUMNS)
      .single()
    if (error) {
      console.error('[measurement-options] insert failed:', error)
      return NextResponse.json({ error: 'Could not add the entry' }, { status: 500 })
    }
    return NextResponse.json({ option: created }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/measurement-options:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

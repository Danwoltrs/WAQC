import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const sampleId: string | undefined = body?.sample_id
    if (!sampleId) {
      return NextResponse.json({ error: 'sample_id required' }, { status: 400 })
    }

    // Reuse an existing active CVA session that contains this sample, if any.
    const { data: existing } = await admin
      .from('cupping_sessions')
      .select('id')
      .eq('session_type', 'cva')
      .eq('created_by', user.id)
      .contains('sample_ids', [sampleId])
      .in('status', ['setup', 'active', 'review'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ session_id: existing[0].id })
    }

    // Carry the sample's lab onto the session when available.
    const { data: sample } = await admin
      .from('samples')
      .select('laboratory_id')
      .eq('id', sampleId)
      .single()

    const { data: created, error } = await admin
      .from('cupping_sessions')
      .insert({
        session_type: 'cva',
        status: 'active',
        created_by: user.id,
        participants: [user.id],
        cupper_ids: [user.id],
        sample_ids: [sampleId],
        laboratory_id: (sample as any)?.laboratory_id ?? null,
      } as any)
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({ session_id: created.id })
  } catch (error) {
    console.error('POST /api/cupping/cva/session', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

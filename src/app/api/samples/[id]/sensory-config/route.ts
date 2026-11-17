import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { loadSampleSensoryConfig } from '@/lib/sensory/load-config'

/**
 * GET /api/samples/[id]/sensory-config
 * Whether the cupping card shows the sensory row for this lot, and its regional
 * profile. Fails soft: the cupping card must never break over this.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    return NextResponse.json(await loadSampleSensoryConfig(supabase, id))
  } catch (error) {
    console.error('Error loading sensory config:', error)
    return NextResponse.json({ notesEnabled: false, profile: null })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/quality-templates/[id]/versions
 * Get all versions of a quality template with change history
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

    // Get all versions with creator info
    const { data: versions, error: versionsError } = await supabase
      .from('template_versions')
      .select(`
        *,
        creator:profiles!template_versions_created_by_fkey(id, full_name, email)
      `)
      .eq('template_id', templateId)
      .order('version_number', { ascending: false })

    if (versionsError) {
      console.error('Error fetching template versions:', versionsError)
      return NextResponse.json(
        { error: 'Failed to fetch template versions' },
        { status: 500 }
      )
    }

    // Format versions with creator name
    const formattedVersions = versions?.map((version: any) => ({
      ...version,
      created_by_name: version.creator?.full_name || version.creator?.email || 'Unknown'
    })) || []

    return NextResponse.json({ versions: formattedVersions })
  } catch (error) {
    console.error('Error in GET /api/quality-templates/[id]/versions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

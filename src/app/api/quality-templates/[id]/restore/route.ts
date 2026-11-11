import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { serviceRoleClient } from '@/lib/supabase-service'
import {
  clientQualityIdsForTemplate,
  recordStaffVersion,
  SPEC_VERSION_NOT_RECORDED,
  cancelledChangesForResponse,
} from '@/lib/quality-spec/record-version'

/**
 * POST /api/quality-templates/[id]/restore
 * Restore a quality template to a previous version
 */
export async function POST(
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
    const body = await request.json()
    const { version_id } = body

    if (!version_id) {
      return NextResponse.json(
        { error: 'version_id is required' },
        { status: 400 }
      )
    }

    // Get the version to restore
    const { data: versionToRestore, error: versionError } = await supabase
      .from('template_versions')
      .select('*')
      .eq('id', version_id)
      .eq('template_id', templateId)
      .single()

    if (versionError || !versionToRestore) {
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      )
    }

    // Get current template
    const { data: currentTemplate, error: templateError } = await supabase
      .from('quality_templates')
      .select('version, parameters')
      .eq('id', templateId)
      .single()

    if (templateError || !currentTemplate) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    // Create a new version with current state (for rollback history)
    const newVersionNumber = ((currentTemplate as any).version || 0) + 1

    await supabase
      .from('template_versions')
      .insert({
        template_id: templateId,
        version_number: newVersionNumber,
        parameters: versionToRestore.parameters,
        changes_description: `Restored from version ${versionToRestore.version_number}`,
        created_by: user.id
      })

    // Update template with restored parameters
    const { data: updatedTemplate, error: updateError } = await supabase
      .from('quality_templates')
      .update({
        parameters: versionToRestore.parameters,
        version: newVersionNumber,
        updated_at: new Date().toISOString()
      })
      .eq('id', templateId)
      .select()
      .single()

    if (updateError) {
      console.error('Error restoring template:', updateError)
      return NextResponse.json(
        { error: 'Failed to restore template', details: updateError.message },
        { status: 500 }
      )
    }

    // Restoring a client's private copy changes that client's spec.
    let recorded: Awaited<ReturnType<typeof recordStaffVersion>> | undefined
    try {
      const ids = await clientQualityIdsForTemplate(serviceRoleClient(), templateId)
      recorded = await recordStaffVersion(ids, user.id, `Restored version ${versionToRestore.version_number}`)
    } catch (err) {
      console.error('[POST /api/quality-templates/[id]/restore] spec version not recorded:', err)
      return NextResponse.json({ error: SPEC_VERSION_NOT_RECORDED }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      template: updatedTemplate,
      restored_from_version: versionToRestore.version_number,
      new_version: newVersionNumber,
      message: `Successfully restored template to version ${versionToRestore.version_number}`,
      cancelledClientChanges: cancelledChangesForResponse(recorded),
    })
  } catch (error) {
    console.error('Error in POST /api/quality-templates/[id]/restore:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

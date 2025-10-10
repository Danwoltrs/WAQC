import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type QualityTemplateInsert = Database['public']['Tables']['quality_templates']['Insert']

/**
 * POST /api/quality-templates/[id]/clone
 * Clone an existing quality template
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

    const { id } = await params
    const body = await request.json()

    // Get the template to clone
    const { data: sourceTemplate, error: fetchError } = await supabase
      .from('quality_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !sourceTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Prepare cloned template data
    const clonedData: QualityTemplateInsert = {
      name: body.name || `${(sourceTemplate as any).name} (Copy)`,
      description: body.description || (sourceTemplate as any).description,
      version: 1,
      parameters: (sourceTemplate as any).parameters,
      created_by: user.id,
      is_active: body.is_active !== undefined ? body.is_active : true
    }

    // Insert cloned template
    const { data: clonedTemplate, error: insertError } = await supabase
      .from('quality_templates')
      // @ts-expect-error - Supabase type inference issue with insert
      .insert(clonedData)
      .select()
      .single()

    if (insertError) {
      console.error('Error cloning template:', insertError)
      return NextResponse.json({
        error: 'Failed to clone template',
        details: insertError.message
      }, { status: 500 })
    }

    // Create initial version record for cloned template
    await supabase
      .from('template_versions')
      // @ts-expect-error - Supabase type inference issue with insert
      .insert({
        template_id: (clonedTemplate as any).id,
        version_number: 1,
        parameters: (clonedTemplate as any).parameters,
        changes_description: `Cloned from template: ${(sourceTemplate as any).name}`,
        created_by: user.id
      })

    return NextResponse.json({ template: clonedTemplate }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/quality-templates/[id]/clone:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

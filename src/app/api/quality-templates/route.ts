import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'

type QualityTemplate = Database['public']['Tables']['quality_templates']['Row']
type QualityTemplateInsert = Database['public']['Tables']['quality_templates']['Insert']
type QualityTemplateUpdate = Database['public']['Tables']['quality_templates']['Update']

/**
 * GET /api/quality-templates
 * List all quality templates with optional filtering
 * Query params: is_active, search, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const is_active = searchParams.get('is_active')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query with creator name
    let query = supabase
      .from('quality_templates')
      .select(`
        *,
        creator:profiles!quality_templates_created_by_fkey(id, full_name, email)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (is_active === 'true') {
      query = query.eq('is_active', true)
    } else if (is_active === 'false') {
      query = query.eq('is_active', false)
    }

    if (search) {
      query = query.or(`name_en.ilike.%${search}%,name_pt.ilike.%${search}%,name_es.ilike.%${search}%,description_en.ilike.%${search}%,description_pt.ilike.%${search}%,description_es.ilike.%${search}%`)
    }

    const { data: templates, error } = await query

    if (error) {
      console.error('Error fetching quality templates:', error)
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
    }

    // Get usage counts for each template and format creator data
    const templatesWithUsage = await Promise.all(
      templates.map(async (template: any) => {
        const { count } = await supabase
          .from('client_qualities')
          .select('*', { count: 'exact', head: true })
          .eq('template_id', template.id)

        return {
          ...template,
          created_by_name: template.creator?.full_name || template.creator?.email || 'Unknown',
          usage_count: count || 0
        }
      })
    )

    return NextResponse.json({ templates: templatesWithUsage })
  } catch (error) {
    console.error('Error in GET /api/quality-templates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/quality-templates
 * Create a new quality template
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate required fields
    if (!body.name_en) {
      return NextResponse.json({
        error: 'Missing required field: name_en'
      }, { status: 400 })
    }

    // Validate cupping scale if provided
    if (body.cupping_scale_min !== undefined || body.cupping_scale_max !== undefined) {
      if (body.cupping_scale_min >= body.cupping_scale_max) {
        return NextResponse.json({
          error: 'cupping_scale_min must be less than cupping_scale_max'
        }, { status: 400 })
      }
    }

    // Validate sample size
    if (body.sample_size_grams !== undefined && (typeof body.sample_size_grams !== 'number' || body.sample_size_grams <= 0)) {
      return NextResponse.json({
        error: 'sample_size_grams must be a positive number'
      }, { status: 400 })
    }

    // Validate parameters structure if provided (for backward compatibility)
    if (body.parameters) {
      const validationError = validateTemplateParameters(body.parameters)
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 })
      }
    }

    // Prepare template data
    const templateData: QualityTemplateInsert = {
      // Multi-language fields
      name_en: body.name_en,
      name_pt: body.name_pt || body.name_en,
      name_es: body.name_es || body.name_en,
      description_en: body.description_en || null,
      description_pt: body.description_pt || body.description_en || null,
      description_es: body.description_es || body.description_en || null,
      // Sample size
      sample_size_grams: body.sample_size_grams || 300,
      // Template inheritance
      template_parent_id: body.template_parent_id || null,
      // Lab/global sharing
      laboratory_id: body.laboratory_id || null,
      is_global: body.is_global || false,
      // Quality thresholds
      defect_thresholds_primary: body.defect_thresholds_primary || null,
      defect_thresholds_secondary: body.defect_thresholds_secondary || null,
      moisture_standard: body.moisture_standard || 'coffee_industry',
      // Cupping scale configuration
      cupping_scale_type: body.cupping_scale_type || '1-10',
      cupping_scale_min: body.cupping_scale_min || 1.00,
      cupping_scale_max: body.cupping_scale_max || 10.00,
      cupping_scale_increment: body.cupping_scale_increment || 0.25,
      // Taint/fault thresholds
      max_taints_allowed: body.max_taints_allowed || null,
      max_faults_allowed: body.max_faults_allowed || null,
      taint_fault_rule_type: body.taint_fault_rule_type || 'AND',
      // Screen size requirements
      screen_size_requirements: body.screen_size_requirements || {},
      // Backward compatibility
      name: body.name_en,
      description: body.description_en || '',
      version: body.version || 1,
      parameters: body.parameters || {},
      created_by: user.id,
      is_active: body.is_active !== undefined ? body.is_active : true
    }

    // Insert template
    const { data: template, error: insertError } = await supabase
      .from('quality_templates')
      .insert(templateData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating quality template:', insertError)
      return NextResponse.json({
        error: 'Failed to create template',
        details: insertError.message
      }, { status: 500 })
    }

    // Create initial version record
    await supabase
      .from('template_versions')
      .insert({
        template_id: (template as any).id,
        version_number: 1,
        parameters: body.parameters,
        changes_description: 'Initial version',
        created_by: user.id
      })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/quality-templates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Validate template parameters structure
 */
function validateTemplateParameters(parameters: any): string | null {
  if (!parameters || typeof parameters !== 'object') {
    return 'Parameters must be an object'
  }

  // Screen sizes validation
  if (parameters.screen_sizes) {
    if (typeof parameters.screen_sizes !== 'object') {
      return 'screen_sizes must be an object'
    }

    // Check if it's a range (e.g., "Pan", "Peas 9-11", "12-20") or specific sizes
    if (parameters.screen_sizes.type === 'range') {
      if (!parameters.screen_sizes.min || !parameters.screen_sizes.max) {
        return 'Range screen sizes must have min and max values'
      }
    } else if (parameters.screen_sizes.type === 'specific') {
      if (!parameters.screen_sizes.sizes || !Array.isArray(parameters.screen_sizes.sizes)) {
        return 'Specific screen sizes must be an array'
      }
    }
  }

  // Defects validation
  if (parameters.defects) {
    if (typeof parameters.defects !== 'object') {
      return 'defects must be an object'
    }
    if (parameters.defects.primary_max !== undefined && typeof parameters.defects.primary_max !== 'number') {
      return 'defects.primary_max must be a number'
    }
    if (parameters.defects.secondary_max !== undefined && typeof parameters.defects.secondary_max !== 'number') {
      return 'defects.secondary_max must be a number'
    }
  }

  // Moisture validation
  if (parameters.moisture_max !== undefined) {
    if (typeof parameters.moisture_max !== 'number' || parameters.moisture_max < 0 || parameters.moisture_max > 100) {
      return 'moisture_max must be a number between 0 and 100'
    }
  }

  // Cupping validation
  if (parameters.cupping) {
    if (typeof parameters.cupping !== 'object') {
      return 'cupping must be an object'
    }
    if (parameters.cupping.scale_type && !['1-5', '1-7', '1-10'].includes(parameters.cupping.scale_type)) {
      return 'cupping.scale_type must be one of: 1-5, 1-7, 1-10'
    }
    if (parameters.cupping.min_score !== undefined && typeof parameters.cupping.min_score !== 'number') {
      return 'cupping.min_score must be a number'
    }
    if (parameters.cupping.attributes && !Array.isArray(parameters.cupping.attributes)) {
      return 'cupping.attributes must be an array'
    }
  }

  return null
}

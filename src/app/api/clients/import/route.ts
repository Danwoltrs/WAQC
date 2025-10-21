import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Legacy database connection (trips.wolthers.com)
// You'll need to set these environment variables
const LEGACY_SUPABASE_URL = process.env.LEGACY_SUPABASE_URL || ''
const LEGACY_SUPABASE_ANON_KEY = process.env.LEGACY_SUPABASE_ANON_KEY || ''

/**
 * GET /api/clients/import
 * Search for clients in the legacy trips.wolthers.com database
 * Query params: search
 */
export async function GET(request: NextRequest) {
  try {
    // Check if legacy database is configured
    if (!LEGACY_SUPABASE_URL || !LEGACY_SUPABASE_ANON_KEY) {
      return NextResponse.json({
        error: 'Legacy database not configured. Please set LEGACY_SUPABASE_URL and LEGACY_SUPABASE_ANON_KEY environment variables.'
      }, { status: 500 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')

    if (!search) {
      return NextResponse.json({
        error: 'Missing required parameter: search'
      }, { status: 400 })
    }

    // Connect to legacy database
    const legacySupabase = createClient(LEGACY_SUPABASE_URL, LEGACY_SUPABASE_ANON_KEY)

    // Search for clients in legacy database
    // Adjust table name and columns according to your legacy database schema
    const { data: legacyClients, error } = await legacySupabase
      .from('clients') // Adjust table name if needed
      .select('*')
      .or(`name.ilike.%${search}%,company.ilike.%${search}%`)
      .limit(20)

    if (error) {
      console.error('Error searching legacy clients:', error)
      return NextResponse.json({
        error: 'Failed to search legacy database',
        details: error.message
      }, { status: 500 })
    }

    // Transform legacy client data to match our schema
    const transformedClients = legacyClients?.map((legacyClient: any) => ({
      legacy_id: legacyClient.id,
      name: legacyClient.name || '',
      company: legacyClient.company || legacyClient.name || '',
      fantasy_name: legacyClient.fantasy_name || legacyClient.company || legacyClient.name || '',
      vat: legacyClient.vat || legacyClient.tax_id || null,
      address: legacyClient.address || null,
      city: legacyClient.city || null,
      state: legacyClient.state || legacyClient.province || null,
      country: legacyClient.country || null,
      zip_code: legacyClient.zip_code || legacyClient.postal_code || null,
      email: legacyClient.email || null,
      phone: legacyClient.phone || legacyClient.telephone || null,
      contact_person: legacyClient.contact_person || legacyClient.contact_name || null,
      notes: `Imported from legacy database (ID: ${legacyClient.id})`,
    })) || []

    return NextResponse.json({
      clients: transformedClients,
      count: transformedClients.length
    })
  } catch (error) {
    console.error('Error in GET /api/clients/import:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/clients/import
 * Import clients from CSV file (bulk import)
 * For legacy database import, use the legacy-import endpoint instead
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Check authentication
    const authHeader = request.headers.get('cookie')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Read and parse CSV
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV file is empty or invalid' }, { status: 400 })
    }

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

    // Validate required fields
    const requiredFields = ['name', 'company', 'email', 'address']
    const missingFields = requiredFields.filter(field => !headers.includes(field))

    if (missingFields.length > 0) {
      return NextResponse.json({
        error: `Missing required fields: ${missingFields.join(', ')}`
      }, { status: 400 })
    }

    const errors: Array<{ row: number; field: string; message: string }> = []
    let successCount = 0
    let failedCount = 0

    // Process each row
    for (let i = 1; i < lines.length; i++) {
      const rowNumber = i + 1
      const line = lines[i]

      try {
        // Parse CSV line (handling quoted values)
        const values = parseCSVLine(line)

        if (values.length !== headers.length) {
          errors.push({
            row: rowNumber,
            field: 'general',
            message: `Column count mismatch. Expected ${headers.length}, got ${values.length}`
          })
          failedCount++
          continue
        }

        // Build client object
        const clientData: any = {}

        headers.forEach((header, index) => {
          const value = values[index].trim()

          // Skip empty values
          if (!value) return

          // Map field values
          switch (header) {
            case 'name':
            case 'company':
            case 'email':
            case 'address':
            case 'fantasy_name':
            case 'phone':
            case 'city':
            case 'state':
            case 'country':
            case 'payment_terms':
            case 'certificate_delivery_timing':
            case 'billing_notes':
            case 'currency':
              clientData[header] = value || null
              break

            case 'is_qc_client':
            case 'is_active':
            case 'has_origin_pricing':
            case 'qc_enabled':
              clientData[header] = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true'
              break

            case 'client_types':
              if (value) {
                clientData.client_types = value.split(',').map(t => t.trim())
              }
              break

            case 'pricing_model':
            case 'billing_basis':
            case 'fee_payer':
              clientData[header] = value
              break

            case 'price_per_sample':
              const pricePerSample = parseFloat(value)
              if (!isNaN(pricePerSample)) {
                clientData.price_per_sample = pricePerSample
              }
              break

            case 'price_per_pound_cents':
              const pricePerPound = parseFloat(value)
              if (!isNaN(pricePerPound)) {
                clientData.price_per_pound_cents = Math.round(pricePerPound * 100)
              }
              break
          }
        })

        // Validate required fields
        if (!clientData.name || !clientData.company || !clientData.email || !clientData.address) {
          errors.push({
            row: rowNumber,
            field: 'general',
            message: 'Missing required fields (name, company, email, or address)'
          })
          failedCount++
          continue
        }

        // Check for duplicate email
        const { data: existingClient } = await supabase
          .from('clients')
          .select('id')
          .eq('email', clientData.email)
          .single()

        if (existingClient) {
          errors.push({
            row: rowNumber,
            field: 'email',
            message: `Email ${clientData.email} already exists`
          })
          failedCount++
          continue
        }

        // Set defaults
        if (clientData.is_active === undefined) {
          clientData.is_active = true
        }

        // Insert client
        const { error: insertError } = await supabase
          .from('clients')
          .insert(clientData)

        if (insertError) {
          console.error('Error inserting client:', insertError)
          errors.push({
            row: rowNumber,
            field: 'general',
            message: insertError.message || 'Failed to insert client'
          })
          failedCount++
        } else {
          successCount++
        }
      } catch (error: any) {
        console.error(`Error processing row ${rowNumber}:`, error)
        errors.push({
          row: rowNumber,
          field: 'general',
          message: error.message || 'Failed to process row'
        })
        failedCount++
      }
    }

    return NextResponse.json({
      success: successCount,
      failed: failedCount,
      errors: errors
    })
  } catch (error) {
    console.error('Error in POST /api/clients/import:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Parse a CSV line handling quoted values with commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      // Check for escaped quote
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++ // Skip next quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)

  return result.map(val => val.replace(/^"|"$/g, ''))
}

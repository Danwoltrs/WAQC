import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getCertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from '@/components/pdf/certificate/quality-certificate'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import { resolveSampleId } from '@/lib/sample-utils'
import React from 'react'
import fs from 'fs'
import path from 'path'

/**
 * GET /api/samples/[id]/certificate
 * Generate and return a PDF quality certificate for a sample
 * Supports both UUID and tracking number slug (e.g., SAK-048524_25)
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
      console.error('[Certificate GET] Auth error:', authError?.message || 'No user found')
      return NextResponse.json({ error: 'Unauthorized', details: authError?.message }, { status: 401 })
    }
    console.log('[Certificate GET] Authenticated user:', user.id)

    const { id: idOrSlug } = await params

    // Resolve to UUID if tracking number slug was provided
    const { id, error: resolveError } = await resolveSampleId(supabase, idOrSlug)
    if (!id) {
      return NextResponse.json({ error: resolveError || 'Sample not found' }, { status: 404 })
    }
    console.log('[Certificate] Generating PDF for sample:', id)

    // Get certificate data
    const certificateData = await getCertificateData(id)
    if (!certificateData) {
      console.error('[Certificate] No certificate data found for sample:', id)
      return NextResponse.json({ error: 'Sample not found or no data available' }, { status: 404 })
    }
    console.log('[Certificate] Got certificate data:', {
      sampleId: certificateData.sample?.id,
      hasCupping: !!certificateData.cuppingData,
      hasGreenBean: !!certificateData.greenBeanAnalysis,
      hasCertificate: !!certificateData.certificate,
    })

    // Load Wolthers logo from public directory
    let wolthersLogoBase64: string | undefined
    try {
      const logoPath = path.join(process.cwd(), 'public/images/logos/wolthers-logo-green.png')
      const logoBuffer = fs.readFileSync(logoPath)
      wolthersLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch (err) {
      console.error('Error loading Wolthers logo:', err)
    }

    // Load client logo from Supabase Storage if available
    let clientLogoBase64: string | undefined
    if (certificateData.client?.logo_url) {
      try {
        const logoUrl = certificateData.client.logo_url
        // If it's a full URL (already signed or public)
        const response = await fetch(logoUrl)
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          const contentType = response.headers.get('content-type') || 'image/png'
          clientLogoBase64 = `data:${contentType};base64,${base64}`
        }
      } catch (err) {
        console.error('Error loading client logo:', err)
      }
    }

    // Load country flag from public directory
    let flagBase64: string | undefined
    const countryCode = getCountryCodeFromOrigin(certificateData.sample.origin)
    if (countryCode) {
      try {
        const flagRelativePath = getFlagPath(countryCode)
        const flagPath = path.join(process.cwd(), 'public', flagRelativePath)
        const flagBuffer = fs.readFileSync(flagPath)
        flagBase64 = `data:image/png;base64,${flagBuffer.toString('base64')}`
      } catch (err) {
        console.error('Error loading flag:', err)
      }
    }

    // Render PDF to buffer
    // Type assertion needed because QualityCertificate returns a Document element
    // but renderToBuffer's types expect DocumentProps directly
    console.log('[Certificate] Rendering PDF...')
    const certificateElement = React.createElement(QualityCertificate, {
      data: certificateData,
      wolthersLogoBase64,
      clientLogoBase64,
      flagBase64,
    })
    const pdfBuffer = await renderToBuffer(certificateElement as any)
    console.log('[Certificate] PDF rendered, buffer size:', pdfBuffer.length)

    // Generate filename - just the certificate number
    const certificateNumber = certificateData.certificate?.certificate_number || certificateData.sample.tracking_number
    const filename = `${certificateNumber}.pdf`

    // Return PDF response - convert Buffer to Uint8Array for NextResponse
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/certificate:', error)
    return NextResponse.json({
      error: 'Failed to generate certificate',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * POST /api/samples/[id]/certificate
 * Generate a certificate and save it to the database (creates certificate record if not exists)
 * Supports both UUID and tracking number slug (e.g., SAK-048524_25)
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

    const { id: idOrSlug } = await params

    // Resolve to UUID if tracking number slug was provided
    const { id, error: resolveError } = await resolveSampleId(supabase, idOrSlug)
    if (!id) {
      return NextResponse.json({ error: resolveError || 'Sample not found' }, { status: 404 })
    }

    // Check if sample exists with workflow stage and client info
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select(`
        id,
        tracking_number,
        client_id,
        origin,
        workflow_stage,
        status,
        quality_spec_id,
        client:clients(id, name, company)
      `)
      .eq('id', id)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Validate tracking number before proceeding
    if (!sample.tracking_number || sample.tracking_number === 'null' || sample.tracking_number === '') {
      console.error('Cannot create certificate: invalid tracking_number for sample', id, sample.tracking_number)
      return NextResponse.json({
        error: 'Cannot generate certificate - sample has invalid tracking number',
        details: 'Please contact an administrator to fix the sample tracking number.'
      }, { status: 400 })
    }

    // For samples in 'review' stage, check if both cupping AND grading are complete
    // This handles the case where the finalize flow had a bug and didn't create the certificate
    let isRejected = sample.workflow_stage === 'rejected'

    if (sample.workflow_stage === 'review') {
      // Check for cupping scores
      const { data: cuppingScores } = await supabase
        .from('cupping_scores')
        .select('id')
        .eq('sample_id', id)
        .limit(1)

      // Check for grading data (quality_assessments with green_bean_data)
      const { data: gradingData } = await supabase
        .from('quality_assessments')
        .select('id, green_bean_data')
        .eq('sample_id', id)
        .not('green_bean_data', 'is', null)
        .limit(1)

      const hasCupping = cuppingScores && cuppingScores.length > 0
      const hasGrading = gradingData && gradingData.length > 0

      if (!hasCupping || !hasGrading) {
        return NextResponse.json({
          error: 'Cannot generate certificate',
          details: `Sample must have both cupping scores and grading data. ` +
            `Cupping: ${hasCupping ? 'complete' : 'missing'}, ` +
            `Grading: ${hasGrading ? 'complete' : 'missing'}.`
        }, { status: 400 })
      }

      // For samples in 'review' stage with complete data, default to approved
      // This is a recovery mechanism for samples that were stuck due to bugs
      // The proper compliance check happens through the cupping finalize flow
      isRejected = false

      // Update sample workflow_stage to certified
      await supabase
        .from('samples')
        .update({
          workflow_stage: 'certified',
          status: 'approved'
        })
        .eq('id', id)

    } else if (sample.workflow_stage !== 'certified' && sample.workflow_stage !== 'rejected') {
      return NextResponse.json({
        error: 'Cannot generate certificate',
        details: `Sample must be in 'review', 'certified' or 'rejected' workflow stage. Current stage: ${sample.workflow_stage || 'unknown'}.`
      }, { status: 400 })
    }

    // Check if certificate already exists
    const { data: existingCert } = await supabase
      .from('certificates')
      .select('id, certificate_number')
      .eq('sample_id', id)
      .single()

    if (existingCert) {
      return NextResponse.json({
        message: 'Certificate already exists',
        certificate: existingCert
      })
    }

    // Certificate number = tracking number (same identifier throughout the sample lifecycle)
    // Rejected samples get R- prefix
    let certificateNumber = sample.tracking_number
    if (isRejected) {
      certificateNumber = `R-${certificateNumber}`
    }

    // Get client name for issued_to (required field)
    const clientData = sample.client as { name?: string; company?: string } | null
    const issuedTo = clientData?.company || clientData?.name || 'Unknown Client'

    // Create certificate record
    // valid_from is today, valid_until is 1 year from now
    const validFrom = new Date()
    const validUntil = new Date(validFrom)
    validUntil.setFullYear(validUntil.getFullYear() + 1)

    const { data: newCert, error: createError } = await supabase
      .from('certificates')
      .insert({
        sample_id: id,
        certificate_number: certificateNumber,
        issued_to: issuedTo,
        issued_by: user.id,
        status: 'issued',
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
        is_rejected: isRejected,
      })
      .select('id, certificate_number, created_at')
      .single()

    if (createError) {
      console.error('Error creating certificate:', createError)
      return NextResponse.json({
        error: 'Failed to create certificate record',
        details: createError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Certificate created',
      certificate: newCert
    }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/samples/[id]/certificate:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


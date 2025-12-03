import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getCertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from '@/components/pdf/certificate/quality-certificate'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import React from 'react'
import fs from 'fs'
import path from 'path'

/**
 * GET /api/samples/[id]/certificate
 * Generate and return a PDF quality certificate for a sample
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

    const { id } = await params

    // Get certificate data
    const certificateData = await getCertificateData(id)
    if (!certificateData) {
      return NextResponse.json({ error: 'Sample not found or no data available' }, { status: 404 })
    }

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
    const certificateElement = React.createElement(QualityCertificate, {
      data: certificateData,
      wolthersLogoBase64,
      clientLogoBase64,
      flagBase64,
    })
    const pdfBuffer = await renderToBuffer(certificateElement as any)

    // Generate filename
    const certificateNumber = certificateData.certificate?.certificate_number || certificateData.sample.tracking_number
    const filename = `certificate-${certificateNumber}.pdf`

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

    // Check if sample exists with workflow stage and client info
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select(`
        id,
        tracking_number,
        client_id,
        workflow_stage,
        status,
        client:clients(id, name, company)
      `)
      .eq('id', id)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Check if sample is in a valid workflow stage for certificate generation
    // Certificates can only be generated after both cupping AND grading are complete
    // This happens when workflow_stage is 'certified' or 'rejected'
    if (sample.workflow_stage !== 'certified' && sample.workflow_stage !== 'rejected') {
      return NextResponse.json({
        error: 'Cannot generate certificate',
        details: `Sample must be in 'certified' or 'rejected' workflow stage. Current stage: ${sample.workflow_stage || 'unknown'}. Please complete both cupping and grading first.`
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

    // Generate certificate number from tracking_number
    // For rejected samples, prefix with 'R-'
    const isRejected = sample.workflow_stage === 'rejected'
    const certificateNumber = isRejected
      ? `R-${sample.tracking_number}`
      : sample.tracking_number

    // Get client name for issued_to (required field)
    const clientData = sample.client as { name?: string; company?: string } | null
    const issuedTo = clientData?.company || clientData?.name || 'Unknown Client'

    // Create certificate record
    const { data: newCert, error: createError } = await supabase
      .from('certificates')
      .insert({
        sample_id: id,
        certificate_number: certificateNumber,
        issued_to: issuedTo,
        issued_by: user.id,
        status: 'issued',
        valid_from: new Date().toISOString(),
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


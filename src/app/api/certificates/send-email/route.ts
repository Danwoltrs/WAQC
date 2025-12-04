import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { getCertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from '@/components/pdf/certificate/quality-certificate'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import React from 'react'
import fs from 'fs'
import path from 'path'

const resend = new Resend(process.env.RESEND_API_KEY)

interface RecipientInfo {
  email: string
  name: string
  type: 'exporter' | 'importer' | 'roaster'
}

/**
 * POST /api/certificates/send-email
 * Send certificate PDFs via email to selected recipients
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile for sender info
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    const body = await request.json()
    const { certificateIds, recipients } = body

    // Validate input
    if (!certificateIds || !Array.isArray(certificateIds) || certificateIds.length === 0) {
      return NextResponse.json({ error: 'No certificates specified' }, { status: 400 })
    }

    if (!recipients || typeof recipients !== 'object') {
      return NextResponse.json({ error: 'No recipients specified' }, { status: 400 })
    }

    const { exporter, importer, roaster } = recipients
    if (!exporter && !importer && !roaster) {
      return NextResponse.json({ error: 'At least one recipient type must be selected' }, { status: 400 })
    }

    // Limit certificates per email
    if (certificateIds.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 certificates per email' }, { status: 400 })
    }

    // Get certificate records with sample and supply chain data
    const { data: certificates, error: certError } = await supabase
      .from('certificates')
      .select(`
        id,
        certificate_number,
        sample_id,
        sample:samples(
          id,
          tracking_number,
          origin,
          exporter:exporters!samples_exporter_id_fkey(id, name, contact_email),
          importer:importers(id, name, contact_email),
          roaster:roasters(id, name, contact_email)
        )
      `)
      .in('id', certificateIds)

    if (certError || !certificates) {
      return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 })
    }

    // Collect all unique recipients and their certificates
    const recipientCertificates = new Map<string, {
      info: RecipientInfo
      certificates: typeof certificates
    }>()

    for (const cert of certificates) {
      const sample = cert.sample as {
        exporter?: { id: string; name: string; contact_email?: string }
        importer?: { id: string; name: string; contact_email?: string }
        roaster?: { id: string; name: string; contact_email?: string }
      } | null

      if (!sample) continue

      // Add exporter if selected and has email
      if (exporter && sample.exporter?.contact_email) {
        const key = sample.exporter.contact_email
        if (!recipientCertificates.has(key)) {
          recipientCertificates.set(key, {
            info: {
              email: sample.exporter.contact_email,
              name: sample.exporter.name,
              type: 'exporter'
            },
            certificates: []
          })
        }
        recipientCertificates.get(key)!.certificates.push(cert)
      }

      // Add importer if selected and has email
      if (importer && sample.importer?.contact_email) {
        const key = sample.importer.contact_email
        if (!recipientCertificates.has(key)) {
          recipientCertificates.set(key, {
            info: {
              email: sample.importer.contact_email,
              name: sample.importer.name,
              type: 'importer'
            },
            certificates: []
          })
        }
        recipientCertificates.get(key)!.certificates.push(cert)
      }

      // Add roaster if selected and has email
      if (roaster && sample.roaster?.contact_email) {
        const key = sample.roaster.contact_email
        if (!recipientCertificates.has(key)) {
          recipientCertificates.set(key, {
            info: {
              email: sample.roaster.contact_email,
              name: sample.roaster.name,
              type: 'roaster'
            },
            certificates: []
          })
        }
        recipientCertificates.get(key)!.certificates.push(cert)
      }
    }

    if (recipientCertificates.size === 0) {
      return NextResponse.json({
        error: 'No valid recipients found',
        details: 'Selected supply chain entities have no email addresses configured'
      }, { status: 400 })
    }

    // Load Wolthers logo once
    let wolthersLogoBase64: string | undefined
    try {
      const logoPath = path.join(process.cwd(), 'public/images/logos/wolthers-logo-green.png')
      const logoBuffer = fs.readFileSync(logoPath)
      wolthersLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch (err) {
      console.error('Error loading Wolthers logo:', err)
    }

    // Send emails to each recipient
    const results: Array<{
      email: string
      name: string
      type: string
      success: boolean
      error?: string
      certificateCount: number
    }> = []

    for (const [email, { info, certificates: recipientCerts }] of recipientCertificates) {
      try {
        // Generate PDF attachments for this recipient's certificates
        const attachments: Array<{ filename: string; content: Buffer }> = []

        for (const cert of recipientCerts) {
          if (!cert.sample_id) continue

          try {
            const certificateData = await getCertificateData(cert.sample_id)
            if (!certificateData) continue

            // Load client logo if available
            let clientLogoBase64: string | undefined
            if (certificateData.client?.logo_url) {
              try {
                const response = await fetch(certificateData.client.logo_url)
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

            // Load country flag
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

            // Render PDF
            const certificateElement = React.createElement(QualityCertificate, {
              data: certificateData,
              wolthersLogoBase64,
              clientLogoBase64,
              flagBase64,
            })
            const pdfBuffer = await renderToBuffer(certificateElement as any)

            attachments.push({
              filename: `${cert.certificate_number}.pdf`,
              content: Buffer.from(pdfBuffer)
            })
          } catch (pdfError) {
            console.error(`Error generating PDF for certificate ${cert.id}:`, pdfError)
          }
        }

        if (attachments.length === 0) {
          results.push({
            email,
            name: info.name,
            type: info.type,
            success: false,
            error: 'No PDFs could be generated',
            certificateCount: 0
          })
          continue
        }

        // Build email content
        const certNumbers = recipientCerts.map(c => c.certificate_number).join(', ')
        const senderName = profile?.full_name || 'Wolthers QC'

        // Send email with Resend
        const { error: emailError } = await resend.emails.send({
          from: 'Wolthers QC <qualitycontrol@wolthers.com>',
          to: email,
          subject: `Quality Certificates: ${certNumbers}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #556b2f;">Wolthers Quality Certificates</h2>
              <p>Dear ${info.name},</p>
              <p>Please find attached ${attachments.length === 1 ? 'the quality certificate' : `${attachments.length} quality certificates`} for your records:</p>
              <ul style="color: #555;">
                ${recipientCerts.map(c => `<li>${c.certificate_number}</li>`).join('')}
              </ul>
              <p>If you have any questions about these certificates, please don't hesitate to contact us.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="color: #888; font-size: 12px;">
                Sent by ${senderName}<br />
                Wolthers Quality Control<br />
                This is an automated message.
              </p>
            </div>
          `,
          attachments: attachments.map(a => ({
            filename: a.filename,
            content: a.content
          }))
        })

        if (emailError) {
          results.push({
            email,
            name: info.name,
            type: info.type,
            success: false,
            error: emailError.message,
            certificateCount: attachments.length
          })
        } else {
          results.push({
            email,
            name: info.name,
            type: info.type,
            success: true,
            certificateCount: attachments.length
          })

          // Log email in certificate_emails table if it exists
          try {
            for (const cert of recipientCerts) {
              await (supabase as any).from('certificate_emails').insert({
                certificate_id: cert.id,
                recipient_email: email,
                sent_at: new Date().toISOString()
              })
            }
          } catch (logError) {
            // Table might not exist, ignore
            console.error('Error logging email:', logError)
          }
        }
      } catch (error) {
        results.push({
          email,
          name: info.name,
          type: info.type,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          certificateCount: 0
        })
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      message: `Sent to ${successful} recipient${successful !== 1 ? 's' : ''}, ${failed} failed`,
      results,
      successful,
      failed
    })
  } catch (error) {
    console.error('Error in POST /api/certificates/send-email:', error)
    return NextResponse.json({
      error: 'Failed to send emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

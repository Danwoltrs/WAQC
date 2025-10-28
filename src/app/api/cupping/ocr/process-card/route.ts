import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import Tesseract from 'tesseract.js'
import jsQR from 'jsqr'
import sharp from 'sharp'

/**
 * POST /api/cupping/ocr/process-card
 * Process a scanned cupping card image with OCR
 * Body: FormData with 'image' file and optional 'session_id'
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse form data
    const formData = await request.formData()
    const imageFile = formData.get('image') as File
    const sessionId = formData.get('session_id') as string | null

    if (!imageFile) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      )
    }

    console.log(`Processing cupping card image: ${imageFile.name} (${imageFile.size} bytes)`)

    // Convert image file to buffer
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer())

    // Process image with sharp for better quality
    const processedImage = await sharp(imageBuffer)
      .greyscale()
      .normalize()
      .sharpen()
      .toBuffer()

    // Step 1: Detect and decode QR code
    console.log('Step 1: Detecting QR code...')
    const qrData = await detectQRCode(processedImage)

    if (!qrData) {
      return NextResponse.json(
        {
          error: 'QR code not detected',
          message: 'Could not find or read QR code on the cupping card. Please ensure the QR code is visible and not obscured.'
        },
        { status: 400 }
      )
    }

    console.log('QR code decoded:', qrData)

    // Step 2: Extract text from image using OCR
    console.log('Step 2: Running OCR...')
    const ocrResult = await Tesseract.recognize(
      processedImage,
      'eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR progress: ${Math.round(m.progress * 100)}%`)
          }
        },
      }
    )

    const extractedText = ocrResult.data.text
    console.log('OCR completed. Extracted text length:', extractedText.length)

    // Step 3: Parse cupping scores from OCR text
    console.log('Step 3: Parsing cupping scores...')
    const scores = parseGuppingScores(extractedText, ocrResult.data)

    // Step 4: Extract taints and faults
    console.log('Step 4: Extracting taints and faults...')
    const defects = extractDefects(extractedText)

    // Step 5: Fetch sample details to validate
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select(`
        id,
        tracking_number,
        sample_type,
        quality_spec:client_qualities!samples_quality_spec_id_fkey(
          id,
          template:quality_templates!client_qualities_template_id_fkey(
            id,
            name,
            parameters
          )
        )
      `)
      .eq('id', qrData.sample_id)
      .single()

    if (sampleError || !sample) {
      console.error('Sample not found:', qrData.sample_id)
      return NextResponse.json(
        {
          error: 'Sample not found',
          message: `The sample ${qrData.tracking_number} could not be found in the database.`
        },
        { status: 404 }
      )
    }

    // Return extracted data for validation
    return NextResponse.json({
      success: true,
      qr_data: qrData,
      sample: {
        id: sample.id,
        tracking_number: sample.tracking_number,
        sample_type: sample.sample_type,
        quality_template: sample.quality_spec?.template,
      },
      extracted_scores: scores,
      defects: defects,
      raw_text: extractedText, // For debugging
      confidence: ocrResult.data.confidence,
      session_id: sessionId,
    })
  } catch (error: any) {
    console.error('Error processing cupping card:', error)
    return NextResponse.json(
      {
        error: 'Failed to process cupping card',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * Detect and decode QR code from image buffer
 */
async function detectQRCode(imageBuffer: Buffer): Promise<{
  sample_id: string
  tracking_number: string
  type: string
} | null> {
  try {
    // Convert to raw pixel data for jsQR
    const { data, info } = await sharp(imageBuffer)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true })

    // Convert to Uint8ClampedArray format expected by jsQR
    const imageData = new Uint8ClampedArray(data)

    // Detect QR code
    const code = jsQR(imageData, info.width, info.height)

    if (!code) {
      return null
    }

    // Parse QR code data
    const qrData = JSON.parse(code.data)

    return {
      sample_id: qrData.sample_id,
      tracking_number: qrData.tracking_number,
      type: qrData.type,
    }
  } catch (error) {
    console.error('Error detecting QR code:', error)
    return null
  }
}

/**
 * Parse cupping scores from OCR text
 * This is a simplified parser - in production, you'd use more sophisticated pattern matching
 */
function parseGuppingScores(
  text: string,
  ocrData: Tesseract.Page
): Array<{ cupper_name: string; scores: Record<string, number> }> {
  const cuppers: Array<{ cupper_name: string; scores: Record<string, number> }> = []

  // Look for cupper names and their corresponding scores
  // This is a basic implementation - needs refinement based on actual card layout
  const lines = text.split('\n').filter((line) => line.trim())

  // Common cupping attributes to look for
  const attributes = ['Frag', 'Arom', 'Body', 'Acid', 'Swet', 'Bal', 'Fin']

  // Try to identify cupper rows (lines with person names followed by numbers)
  const cupperPattern = /([A-Za-z\s]+)\s+([\d\.\s]+)/g
  const matches = text.matchAll(cupperPattern)

  for (const match of matches) {
    const cupperName = match[1].trim()
    const scoreString = match[2].trim()

    // Parse scores from the score string
    const scoreValues = scoreString.split(/\s+/).filter(s => s.match(/^\d+(\.\d+)?$/))

    if (scoreValues.length > 0) {
      const scores: Record<string, number> = {}

      // Map scores to attributes
      attributes.forEach((attr, index) => {
        if (index < scoreValues.length) {
          scores[attr] = parseFloat(scoreValues[index])
        }
      })

      if (Object.keys(scores).length > 0) {
        cuppers.push({
          cupper_name: cupperName,
          scores,
        })
      }
    }
  }

  return cuppers
}

/**
 * Extract taints and faults from OCR text
 */
function extractDefects(text: string): {
  taints: string[]
  faults: string[]
} {
  const taints: string[] = []
  const faults: string[] = []

  // Look for TAINTS section
  const taintsMatch = text.match(/TAINTS:?\s*([^\n]*)/i)
  if (taintsMatch && taintsMatch[1].trim()) {
    taints.push(taintsMatch[1].trim())
  }

  // Look for FAULTS section
  const faultsMatch = text.match(/FAULTS:?\s*([^\n]*)/i)
  if (faultsMatch && faultsMatch[1].trim()) {
    faults.push(faultsMatch[1].trim())
  }

  return { taints, faults }
}

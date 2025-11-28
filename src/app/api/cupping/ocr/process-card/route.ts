import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import jsQR from 'jsqr'
import sharp from 'sharp'

// Allow up to 60 seconds for Gemini processing
export const maxDuration = 60

/**
 * POST /api/cupping/ocr/process-card
 * Process a scanned cupping card image
 *
 * OCR SYSTEM v3.0 - GEMINI VISION
 * - Uses Google Gemini Pro Vision for semantic understanding
 * - Table structure comprehension (not just text extraction)
 * - Direct JSON output with cupper scores
 * - Vision API only for QR code detection
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let imageUrl: string | null = null
    let imageBuffer: Buffer | null = null
    let sessionId: string | null = null

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await request.json()
      imageUrl = body.image_url
      sessionId = body.session_id || null

      if (!imageUrl) {
        return NextResponse.json({ error: 'No image_url provided' }, { status: 400 })
      }
      console.log(`[OCR] Processing URL: ${imageUrl}`)
    } else {
      const formData = await request.formData()
      const imageFile = formData.get('image') as File
      sessionId = formData.get('session_id') as string | null

      if (!imageFile) {
        return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
      }
      imageBuffer = Buffer.from(await imageFile.arrayBuffer())
    }

    // Step 1: Detect QR code using Vision API (still accurate for barcodes)
    console.log('[OCR] Detecting QR code...')
    const qrResult = await detectQRCode(imageUrl, imageBuffer)

    if (!qrResult) {
      return NextResponse.json({
        error: 'QR code not detected',
        message: 'Could not find QR code on the cupping card.'
      }, { status: 400 })
    }

    console.log('[OCR] QR:', qrResult)

    // Step 2: Fetch sample details
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select(`
        id, tracking_number, sample_type,
        quality_spec:client_qualities!samples_quality_spec_id_fkey(
          id,
          template:quality_templates!client_qualities_template_id_fkey(id, name, parameters)
        )
      `)
      .eq('id', qrResult.sample_id)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({
        error: 'Sample not found',
        message: `Sample ${qrResult.tracking_number} not found.`
      }, { status: 404 })
    }

    // Step 3: Fetch assigned cuppers
    const cuppers = await fetchAssignedCuppers(supabase, qrResult.sample_id)
    console.log(`[OCR] ${cuppers.length} assigned cuppers:`, cuppers.map(c => c.name))

    // Step 4: Get cupping attributes from template
    const attributes = sample.quality_spec?.template?.parameters?.cupping_attributes?.map(
      (a: any) => typeof a === 'string' ? a : a.attribute
    ) || DEFAULT_ATTRIBUTES

    // Step 5: Extract scores using Gemini Vision
    console.log('[OCR] Extracting scores with Gemini Vision...')

    // Ensure we have image data
    if (!imageBuffer && imageUrl) {
      const res = await fetch(imageUrl)
      if (res.ok) {
        imageBuffer = Buffer.from(await res.arrayBuffer())
      }
    }

    if (!imageBuffer) {
      return NextResponse.json({
        error: 'Failed to fetch image',
        message: 'Could not retrieve image data for processing.'
      }, { status: 400 })
    }

    const extraction = await extractScoresWithGemini(imageBuffer, cuppers, attributes)

    console.log(`[OCR] Gemini result: ${extraction.cupperScores.length} cuppers, ${extraction.confidence}% confidence`)

    return NextResponse.json({
      success: true,
      qr_data: qrResult,
      sample: {
        id: sample.id,
        tracking_number: sample.tracking_number,
        sample_type: sample.sample_type,
        quality_template: sample.quality_spec?.template,
      },
      extracted_scores: extraction.cupperScores,
      assigned_cuppers: cuppers,
      defects: extraction.defects,
      raw_text: extraction.rawResponse,
      confidence: extraction.confidence,
      session_id: sessionId,
      debug: {
        model: 'gemini-1.5-flash',
        attributesUsed: attributes,
        cuppersProvided: cuppers.length,
        cuppersExtracted: extraction.cupperScores.length,
      }
    })
  } catch (error: any) {
    console.error('[OCR] Error:', error)
    return NextResponse.json({
      error: 'Failed to process cupping card',
      details: error.message || String(error),
    }, { status: 500 })
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_ATTRIBUTES = ['Fragrance', 'Flavor', 'Aftertaste', 'Acidity', 'Body', 'Balance', 'Overall']

// ============================================================================
// GEMINI VISION SCORE EXTRACTION
// ============================================================================

interface ExtractionResult {
  cupperScores: Array<{
    cupper_id: string
    cupper_name: string
    ocr_name: string
    scores: Record<string, number>
    confidence: number
  }>
  defects: {
    taints: string[]
    faults: string[]
  }
  confidence: number
  rawResponse: string
}

async function extractScoresWithGemini(
  imageBuffer: Buffer,
  assignedCuppers: Array<{ id: string; name: string }>,
  attributes: string[]
): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.error('[GEMINI] GEMINI_API_KEY not configured')
    return createEmptyExtraction(assignedCuppers)
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    // Convert image to base64
    const base64Image = imageBuffer.toString('base64')
    const mimeType = 'image/jpeg'

    const cupperNames = assignedCuppers.map(c => c.name).join(', ')
    const attrNames = attributes.join(', ')

    const prompt = `Analyze this handwritten coffee cupping card image carefully.

The card has a table structure with:
- Column headers showing cupping attributes: ${attrNames}
- Rows for these cuppers: ${cupperNames}
- Each cell contains a handwritten score (values range from 0 to 10, can have decimals like 7.5 or 7.25)
- A TAINTS section at the bottom (defects that affect one cup)
- A FAULTS section at the bottom (defects that affect multiple cups)

IMPORTANT INSTRUCTIONS:
1. Read the handwritten numbers very carefully
2. Pay attention to which row each score belongs to (match with cupper name on the left)
3. Pay attention to which column each score belongs to (match with attribute header at top)
4. If a score is hard to read, make your best estimate based on the handwriting style
5. Include ALL ${attributes.length} attributes for each cupper (${attributes.join(', ')})
6. If a cell appears empty, use null

Return ONLY valid JSON (no markdown, no code blocks, just the JSON object):
{
  "cuppers": [
    {
      "name": "CupperName",
      "scores": {
        "${attributes[0]}": 7.5,
        "${attributes[1]}": 7.0
      }
    }
  ],
  "taints": [],
  "faults": [],
  "confidence": 85
}

Rules for the response:
- "name" should match one of the cupper names I provided: ${cupperNames}
- Scores should be numbers (not strings), or null if unreadable
- "confidence" is your overall confidence level 0-100 for the extraction
- "taints" and "faults" are arrays of strings (empty if none written)
- Order the cuppers in the same order as they appear on the card (top to bottom)`

    console.log('[GEMINI] Sending request...')

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: base64Image
        }
      }
    ])

    const responseText = result.response.text()
    console.log('[GEMINI] Raw response:', responseText.substring(0, 500))

    // Parse JSON from response (handle potential markdown code blocks)
    let jsonText = responseText

    // Remove markdown code blocks if present
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim()
    } else {
      // Try to find raw JSON
      const rawMatch = responseText.match(/\{[\s\S]*\}/)
      if (rawMatch) {
        jsonText = rawMatch[0]
      }
    }

    const parsed = JSON.parse(jsonText)

    // Map to our format with assigned cupper IDs
    const cupperScores: ExtractionResult['cupperScores'] = parsed.cuppers.map((c: any, idx: number) => {
      // Find matching assigned cupper
      const assigned = assignedCuppers.find(
        a => a.name.toLowerCase() === c.name?.toLowerCase()
      ) || assignedCuppers.find(
        a => a.name.toLowerCase().includes(c.name?.toLowerCase()) || c.name?.toLowerCase().includes(a.name.toLowerCase())
      ) || assignedCuppers[idx]

      // Ensure all attributes are present
      const scores: Record<string, number> = {}
      for (const attr of attributes) {
        const score = c.scores?.[attr]
        if (score !== null && score !== undefined && !isNaN(Number(score))) {
          scores[attr] = Number(score)
        }
      }

      return {
        cupper_id: assigned?.id || `gemini_${idx}`,
        cupper_name: assigned?.name || c.name || `Cupper ${idx + 1}`,
        ocr_name: c.name || '',
        scores,
        confidence: parsed.confidence || 85
      }
    })

    // If Gemini returned fewer cuppers than assigned, add empty entries for missing ones
    const foundNames = new Set(cupperScores.map(c => c.cupper_id))
    for (const cupper of assignedCuppers) {
      if (!foundNames.has(cupper.id)) {
        cupperScores.push({
          cupper_id: cupper.id,
          cupper_name: cupper.name,
          ocr_name: '',
          scores: {},
          confidence: 0
        })
      }
    }

    return {
      cupperScores,
      defects: {
        taints: parsed.taints || [],
        faults: parsed.faults || []
      },
      confidence: parsed.confidence || 85,
      rawResponse: responseText
    }
  } catch (error: any) {
    console.error('[GEMINI] Error:', error.message)
    return createEmptyExtraction(assignedCuppers)
  }
}

function createEmptyExtraction(assignedCuppers: Array<{ id: string; name: string }>): ExtractionResult {
  return {
    cupperScores: assignedCuppers.map(c => ({
      cupper_id: c.id,
      cupper_name: c.name,
      ocr_name: '',
      scores: {},
      confidence: 0
    })),
    defects: { taints: [], faults: [] },
    confidence: 0,
    rawResponse: ''
  }
}

// ============================================================================
// QR CODE DETECTION (still uses Vision API - it's excellent for barcodes)
// ============================================================================

interface QRData {
  sample_id: string
  tracking_number: string
  type: string
}

async function detectQRCode(imageUrl: string | null, imageBuffer: Buffer | null): Promise<QRData | null> {
  // Try Vision API first for URL-based detection
  if (imageUrl) {
    const visionResult = await detectQRWithVision(imageUrl)
    if (visionResult) return visionResult
  }

  // Try jsQR as fallback
  if (!imageBuffer && imageUrl) {
    try {
      const res = await fetch(imageUrl)
      if (res.ok) {
        imageBuffer = Buffer.from(await res.arrayBuffer())
      }
    } catch { /* ignore */ }
  }

  if (imageBuffer) {
    const jsQRResult = await detectQRWithJsQR(imageBuffer)
    if (jsQRResult) return jsQRResult
  }

  return null
}

async function detectQRWithVision(imageUrl: string): Promise<QRData | null> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) return null

  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { source: { imageUri: imageUrl } },
          features: [{ type: 'BARCODE_DETECTION', maxResults: 10 }],
        }],
      }),
    })

    if (!response.ok) return null

    const result = await response.json()
    const barcodes = result.responses?.[0]?.barcodeAnnotations || []

    for (const barcode of barcodes) {
      if (barcode.format === 'QR_CODE' && barcode.rawValue) {
        try {
          const parsed = JSON.parse(barcode.rawValue)
          if (parsed.sample_id && parsed.tracking_number) {
            return {
              sample_id: parsed.sample_id,
              tracking_number: parsed.tracking_number,
              type: parsed.type || 'cupping_card'
            }
          }
        } catch { /* not JSON */ }
      }
    }
  } catch { /* ignore */ }

  return null
}

async function detectQRWithJsQR(imageBuffer: Buffer): Promise<QRData | null> {
  const attempts = [
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    },
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .grayscale().normalize().raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    },
  ]

  for (const attempt of attempts) {
    try {
      const { data, width, height } = await attempt()
      const code = jsQR(new Uint8ClampedArray(data), width, height)
      if (code) {
        const qrData = JSON.parse(code.data)
        if (qrData.sample_id && qrData.tracking_number) {
          return {
            sample_id: qrData.sample_id,
            tracking_number: qrData.tracking_number,
            type: qrData.type || 'cupping_card'
          }
        }
      }
    } catch { continue }
  }
  return null
}

// ============================================================================
// CUPPER FETCHING
// ============================================================================

async function fetchAssignedCuppers(
  supabase: any,
  sampleId: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    const { data: sessions } = await supabase
      .from('cupping_sessions')
      .select('cupper_ids')
      .contains('sample_ids', [sampleId])
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    if (!sessions?.length || !sessions[0].cupper_ids?.length) {
      return []
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', sessions[0].cupper_ids)

    if (!profiles) return []

    return sessions[0].cupper_ids
      .map((id: string) => {
        const p = profiles.find((profile: any) => profile.id === id)
        return p ? { id: p.id, name: p.full_name.split(' ')[0] } : null
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

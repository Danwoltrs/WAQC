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
    let qrResult = await detectQRCode(imageUrl, imageBuffer)

    // FAILSAFE: If QR detection fails, use Gemini to read the tracking number from the card
    if (!qrResult) {
      console.log('[OCR] QR detection failed, trying Gemini failsafe...')

      // Ensure we have image data for Gemini
      let fallbackBuffer = imageBuffer
      if (!fallbackBuffer && imageUrl) {
        try {
          const res = await fetch(imageUrl)
          if (res.ok) {
            fallbackBuffer = Buffer.from(await res.arrayBuffer())
          }
        } catch { /* ignore */ }
      }

      if (fallbackBuffer) {
        qrResult = await extractTrackingNumberWithGemini(fallbackBuffer, supabase)
      }
    }

    if (!qrResult) {
      return NextResponse.json({
        error: 'QR code not detected',
        message: 'Could not find QR code or tracking number on the cupping card. Please ensure the card is clearly visible and try again.'
      }, { status: 400 })
    }

    console.log('[OCR] Sample identified:', qrResult)

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
    // Priority: 1. Template ID from QR code, 2. Sample's quality_spec template
    let templateParams: Record<string, any> | null = null
    let templateName = 'DEFAULT'

    // If QR code contains template_id, fetch that template directly
    if (qrResult.template_id) {
      console.log('[OCR] Using template_id from QR code:', qrResult.template_id)
      const { data: qrTemplate, error: qrTemplateError } = await supabase
        .from('quality_templates')
        .select('id, name, parameters')
        .eq('id', qrResult.template_id)
        .single()

      if (!qrTemplateError && qrTemplate) {
        templateParams = qrTemplate.parameters as Record<string, any>
        templateName = qrTemplate.name
        console.log('[OCR] Template from QR:', templateName)
      } else {
        console.log('[OCR] Failed to fetch template from QR:', qrTemplateError?.message)
      }
    }

    // Fallback to sample's quality_spec template if QR template not found
    if (!templateParams) {
      templateParams = sample.quality_spec?.template?.parameters as Record<string, any> | null
      templateName = sample.quality_spec?.template?.name || 'DEFAULT'
      console.log('[OCR] Using template from sample quality_spec:', templateName)
    }

    console.log('[OCR] Template params cupping_attributes:', templateParams?.cupping_attributes ? `${templateParams.cupping_attributes.length} attrs` : 'NULL')

    const attributes = templateParams?.cupping_attributes?.map(
      (a: any) => typeof a === 'string' ? a : a.attribute
    ) || DEFAULT_ATTRIBUTES

    console.log('[OCR] Using attributes:', attributes.join(', '))

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
        // Return the template we actually used (from QR or quality_spec)
        quality_template: {
          id: qrResult.template_id || sample.quality_spec?.template?.id,
          name: templateName,
          parameters: templateParams,
        },
      },
      extracted_scores: extraction.cupperScores,
      assigned_cuppers: cuppers,
      defects: extraction.defects,
      raw_text: extraction.rawResponse,
      confidence: extraction.confidence,
      session_id: sessionId,
      debug: {
        model: 'gemini-2.0-flash',
        attributesUsed: attributes,
        templateSource: qrResult.template_id ? 'qr_code' : 'quality_spec',
        templateName,
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
// GEMINI FAILSAFE - EXTRACT TRACKING NUMBER WHEN QR FAILS
// ============================================================================

async function extractTrackingNumberWithGemini(
  imageBuffer: Buffer,
  supabase: any
): Promise<QRData | null> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.error('[GEMINI FAILSAFE] GEMINI_API_KEY not configured')
    return null
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    // Convert image to base64
    const base64Image = imageBuffer.toString('base64')
    const mimeType = 'image/jpeg'

    const prompt = `Look at this coffee cupping card image.

I need you to find the SAMPLE TRACKING NUMBER printed on the card. It's located in the header area at the top of the card, after a prefix "PSS:", "SS:", or "Type:".

Examples:
- "PSS: AD-008900/25" → return "AD-008900/25"
- "SS: 002/2215/0095" → return "002/2215/0095"
- "Type: ABC-123" → return "ABC-123"

Return ONLY the tracking number value itself (the part AFTER the prefix), nothing else. No explanation, no quotes, no prefix, just the tracking number.

If you cannot find a tracking number on this card, respond with exactly: NOT_FOUND`

    console.log('[GEMINI FAILSAFE] Extracting tracking number...')

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: base64Image
        }
      }
    ])

    const responseText = result.response.text().trim()
    console.log('[GEMINI FAILSAFE] Response:', responseText)

    if (responseText === 'NOT_FOUND' || responseText.length > 50) {
      console.log('[GEMINI FAILSAFE] No valid tracking number found')
      return null
    }

    // Clean the tracking number (remove any quotes or extra whitespace)
    const trackingNumber = responseText.replace(/['"]/g, '').trim()

    // Look up the sample by tracking number
    const { data: sample, error } = await supabase
      .from('samples')
      .select('id, tracking_number')
      .eq('tracking_number', trackingNumber)
      .single()

    if (error || !sample) {
      console.log(`[GEMINI FAILSAFE] Sample not found for tracking: ${trackingNumber}`)

      // Try a partial match (in case of OCR minor errors)
      const { data: fuzzyMatch } = await supabase
        .from('samples')
        .select('id, tracking_number')
        .ilike('tracking_number', `%${trackingNumber}%`)
        .limit(1)
        .single()

      if (fuzzyMatch) {
        console.log(`[GEMINI FAILSAFE] Fuzzy match found: ${fuzzyMatch.tracking_number}`)
        return {
          sample_id: fuzzyMatch.id,
          tracking_number: fuzzyMatch.tracking_number,
          type: 'cupping_card'
        }
      }

      return null
    }

    console.log(`[GEMINI FAILSAFE] Found sample: ${sample.tracking_number}`)
    return {
      sample_id: sample.id,
      tracking_number: sample.tracking_number,
      type: 'cupping_card'
    }
  } catch (error: any) {
    console.error('[GEMINI FAILSAFE] Error:', error.message)
    return null
  }
}

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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    // Convert image to base64
    const base64Image = imageBuffer.toString('base64')
    const mimeType = 'image/jpeg'

    const cupperNames = assignedCuppers.map(c => c.name).join(', ')
    const attrNames = attributes.join(', ')

    // Build the JSON example with ALL attributes for better Gemini compliance
    const attrExample = attributes.map((a, i) => `        "${a}": ${7 + (i * 0.25).toFixed(2)}`).join(',\n')

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
5. Include ALL ${attributes.length} attributes for each cupper
6. If a cell appears empty, use null
7. CRITICAL: Use the EXACT attribute names I provided: ${attributes.join(', ')}

Return ONLY valid JSON (no markdown, no code blocks, just the JSON object):
{
  "cuppers": [
    {
      "name": "CupperName",
      "scores": {
${attrExample}
      }
    }
  ],
  "taints": [],
  "faults": [],
  "confidence": 85
}

Rules for the response:
- "name" should match one of the cupper names I provided: ${cupperNames}
- The "scores" object MUST use these EXACT attribute keys: ${attributes.map(a => `"${a}"`).join(', ')}
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

      // Ensure all attributes are present - use case-insensitive matching
      const scores: Record<string, number> = {}

      // Build a map of lowercase keys to original Gemini response keys
      const geminiScoresLower: Record<string, string> = {}
      if (c.scores) {
        for (const key of Object.keys(c.scores)) {
          geminiScoresLower[key.toLowerCase()] = key
        }
      }

      for (const attr of attributes) {
        // Try exact match first
        let score = c.scores?.[attr]
        let matchType = 'exact'

        // If no exact match, try case-insensitive match
        if (score === null || score === undefined) {
          const lowerAttr = attr.toLowerCase()
          const matchingKey = geminiScoresLower[lowerAttr]
          if (matchingKey) {
            score = c.scores[matchingKey]
            matchType = 'case-insensitive'
          }
        }

        // If still no match, try partial matching (e.g., "Fragrance" in "Fragrance/Aroma")
        if (score === null || score === undefined) {
          const lowerAttr = attr.toLowerCase()
          for (const [lowerKey, originalKey] of Object.entries(geminiScoresLower)) {
            if (lowerKey.includes(lowerAttr) || lowerAttr.includes(lowerKey)) {
              score = c.scores[originalKey]
              matchType = `partial(${originalKey})`
              break
            }
          }
        }

        if (score !== null && score !== undefined && !isNaN(Number(score))) {
          scores[attr] = Number(score)
          console.log(`[GEMINI] Cupper ${c.name}: ${attr} = ${score} (${matchType})`)
        } else {
          console.log(`[GEMINI] Cupper ${c.name}: ${attr} = NO MATCH (Gemini keys: ${Object.keys(c.scores || {}).join(', ')})`)
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
  template_id?: string  // Optional template ID from QR code
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

// Parse QR code content - supports multiple formats:
// 1. New with template: "WAQC:sample_id:tracking_number:template_id"
// 2. Old simplified: "WAQC:sample_id:tracking_number"
// 3. Legacy JSON: {"sample_id":"...","tracking_number":"..."}
function parseQRContent(rawValue: string): QRData | null {
  // Try WAQC format first
  if (rawValue.startsWith('WAQC:')) {
    const parts = rawValue.split(':')
    if (parts.length >= 3) {
      // Check if we have a UUID at position 3 (template_id)
      // UUIDs are 36 chars with format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

      // Format: WAQC:sample_id:tracking_number:template_id
      // sample_id is a UUID at parts[1]
      // tracking_number is at parts[2]
      // template_id (optional) is a UUID at parts[3] if present

      const sample_id = parts[1]
      let tracking_number = parts[2]
      let template_id: string | undefined

      // Check if last part is a UUID (template_id)
      if (parts.length >= 4 && isUUID(parts[parts.length - 1])) {
        template_id = parts[parts.length - 1]
        // Tracking number is everything between sample_id and template_id
        tracking_number = parts.slice(2, parts.length - 1).join(':')
      } else {
        // No template_id, tracking number is everything after sample_id
        tracking_number = parts.slice(2).join(':')
      }

      console.log(`[QR] Parsed: sample=${sample_id}, tracking=${tracking_number}, template=${template_id || 'none'}`)

      return {
        sample_id,
        tracking_number,
        template_id,
        type: 'cupping_card'
      }
    }
  }

  // Try legacy JSON format
  try {
    const parsed = JSON.parse(rawValue)
    if (parsed.sample_id && parsed.tracking_number) {
      return {
        sample_id: parsed.sample_id,
        tracking_number: parsed.tracking_number,
        template_id: parsed.template_id,
        type: parsed.type || 'cupping_card'
      }
    }
  } catch { /* not JSON */ }

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
        const qrData = parseQRContent(barcode.rawValue)
        if (qrData) {
          console.log('[QR] Vision API detected:', qrData.tracking_number)
          return qrData
        }
      }
    }
  } catch { /* ignore */ }

  return null
}

async function detectQRWithJsQR(imageBuffer: Buffer): Promise<QRData | null> {
  // Multiple preprocessing strategies for better QR detection
  const attempts = [
    // 1. Raw image (fastest, works for clean QR codes)
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    },
    // 2. Grayscale + normalize (improves contrast)
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .grayscale().normalize().raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    },
    // 3. Sharpen (helps with slightly blurry photos)
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .sharpen({ sigma: 2 }).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    },
    // 4. High contrast + sharpen (for washed out images)
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .modulate({ brightness: 1.1 })
        .linear(1.5, -0.2)  // Increase contrast
        .sharpen()
        .raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    },
    // 5. Resize to standard size (helps with very large/small images)
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .resize(1200, null, { fit: 'inside' })
        .grayscale().normalize()
        .raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    },
    // 6. Threshold to black/white (for poor lighting)
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .grayscale()
        .threshold(128)
        .raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    },
    // 7. Lower threshold (for darker images)
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .grayscale()
        .threshold(100)
        .raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    },
    // 8. Higher threshold (for lighter images)
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .grayscale()
        .threshold(160)
        .raw().ensureAlpha().toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height }
    },
  ]

  for (let i = 0; i < attempts.length; i++) {
    try {
      const { data, width, height } = await attempts[i]()
      const code = jsQR(new Uint8ClampedArray(data), width, height)
      if (code) {
        console.log(`[QR] jsQR detected with attempt ${i + 1}: ${code.data.substring(0, 50)}...`)
        const qrData = parseQRContent(code.data)
        if (qrData) {
          console.log(`[QR] Parsed successfully: ${qrData.tracking_number}`)
          return qrData
        }
      }
    } catch { continue }
  }
  console.log('[QR] jsQR failed all 8 preprocessing attempts')
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

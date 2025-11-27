import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import jsQR from 'jsqr'
import sharp from 'sharp'

// Allow up to 30 seconds for OCR processing
export const maxDuration = 30

/**
 * POST /api/cupping/ocr/process-card
 * Process a scanned cupping card image with Google Cloud Vision OCR
 *
 * Supports two modes:
 * 1. JSON body with 'image_url' - URL to image in Supabase Storage (recommended for large files)
 * 2. FormData with 'image' file - Direct file upload (limited by Vercel's 4.5MB body limit)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let imageUrl: string | null = null
    let imageBuffer: Buffer | null = null
    let sessionId: string | null = null
    let storagePath: string | null = null

    // Check content type to determine how to parse the request
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      // JSON body with image_url
      const body = await request.json()
      imageUrl = body.image_url
      sessionId = body.session_id || null
      storagePath = body.storage_path || null

      if (!imageUrl) {
        return NextResponse.json(
          { error: 'No image_url provided' },
          { status: 400 }
        )
      }

      console.log(`Processing cupping card from URL: ${imageUrl}`)
    } else {
      // FormData with image file (legacy support)
      const formData = await request.formData()
      const imageFile = formData.get('image') as File
      sessionId = formData.get('session_id') as string | null

      if (!imageFile) {
        return NextResponse.json(
          { error: 'No image file provided' },
          { status: 400 }
        )
      }

      console.log(`Processing cupping card image: ${imageFile.name} (${(imageFile.size / 1024).toFixed(1)} KB)`)
      imageBuffer = Buffer.from(await imageFile.arrayBuffer())
    }

    // Step 1: Run Google Cloud Vision for both QR detection and OCR
    console.log('Step 1: Running Google Cloud Vision...')
    const visionResult = imageUrl
      ? await runGoogleVisionWithUrl(imageUrl)
      : await runGoogleVisionFull(imageBuffer!)

    if (!visionResult.success) {
      return NextResponse.json(
        {
          error: 'Vision API failed',
          message: visionResult.error || 'Failed to process image'
        },
        { status: 500 }
      )
    }

    // Step 2: Extract QR code data (from Vision API or fallback to jsQR)
    console.log('Step 2: Extracting QR code data...')
    let qrData = visionResult.qrData

    // If Vision API didn't find QR, try jsQR as fallback
    if (!qrData) {
      console.log('Vision API did not detect QR, trying jsQR fallback...')
      // For URL mode, fetch the image first
      let bufferForQR = imageBuffer
      if (!bufferForQR && imageUrl) {
        try {
          console.log('Fetching image from URL for jsQR fallback...')
          const imageResponse = await fetch(imageUrl)
          if (imageResponse.ok) {
            bufferForQR = Buffer.from(await imageResponse.arrayBuffer())
          }
        } catch (fetchError) {
          console.error('Failed to fetch image for jsQR fallback:', fetchError)
        }
      }
      if (bufferForQR) {
        qrData = await detectQRCodeWithJsQR(bufferForQR)
      }
    }

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

    const ocrResult = visionResult

    if (!ocrResult.success) {
      return NextResponse.json(
        {
          error: 'OCR failed',
          message: ocrResult.error || 'Failed to extract text from image'
        },
        { status: 500 }
      )
    }

    console.log('OCR completed. Text blocks:', ocrResult.blocks?.length || 0)

    // Step 3: Fetch sample details to validate
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

    // Step 4: Fetch cupping session and assigned cuppers
    console.log('Step 3: Fetching assigned cuppers...')
    const cuppers = await fetchAssignedCuppers(supabase, qrData.sample_id)

    // Step 5: Parse scores from OCR result using position-based matching
    console.log('Step 4: Parsing scores with position-based matching...')
    const scoresWithCuppers = parseScoresFromVisionResult(ocrResult, cuppers)

    // Step 6: Extract taints and faults
    const defects = extractDefects(ocrResult.fullText || '')

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
      extracted_scores: scoresWithCuppers,
      assigned_cuppers: cuppers,
      defects: defects,
      raw_text: ocrResult.fullText,
      confidence: ocrResult.confidence,
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
 * Detect and decode QR code from image buffer using jsQR
 * Tries multiple image processing approaches for better detection
 * Used as fallback if Google Vision barcode detection fails
 */
async function detectQRCodeWithJsQR(imageBuffer: Buffer): Promise<{
  sample_id: string
  tracking_number: string
  type: string
} | null> {
  // Try different image processing approaches
  const attempts = [
    // Attempt 1: Original image
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height, name: 'original' }
    },
    // Attempt 2: Grayscale with enhanced contrast
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .grayscale()
        .normalize()
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height, name: 'grayscale' }
    },
    // Attempt 3: Sharpen and increase contrast
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .sharpen()
        .modulate({ brightness: 1.1 })
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height, name: 'sharpened' }
    },
    // Attempt 4: Resize to standard size (sometimes helps with detection)
    async () => {
      const { data, info } = await sharp(imageBuffer)
        .resize(1500, null, { withoutEnlargement: true })
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true })
      return { data, width: info.width, height: info.height, name: 'resized' }
    },
  ]

  for (const attempt of attempts) {
    try {
      const { data, width, height, name } = await attempt()
      const imageData = new Uint8ClampedArray(data)
      const code = jsQR(imageData, width, height)

      if (code) {
        console.log(`QR code detected using ${name} approach`)
        try {
          const qrData = JSON.parse(code.data)
          return {
            sample_id: qrData.sample_id,
            tracking_number: qrData.tracking_number,
            type: qrData.type,
          }
        } catch (parseError) {
          console.error('QR code found but data invalid:', code.data)
          continue
        }
      }
    } catch (error) {
      console.error(`QR detection attempt failed:`, error)
      continue
    }
  }

  console.error('QR code not detected after all attempts')
  return null
}

interface VisionOCRResult {
  success: boolean
  error?: string
  fullText?: string
  blocks?: Array<{
    text: string
    boundingBox: { x: number; y: number; width: number; height: number }
    confidence: number
  }>
  words?: Array<{
    text: string
    boundingBox: { x: number; y: number; width: number; height: number }
    confidence: number
  }>
  confidence?: number
  qrData?: {
    sample_id: string
    tracking_number: string
    type: string
  } | null
}

/**
 * Run Google Cloud Vision API using image URL (for large files)
 * Vision API fetches the image directly from the URL, bypassing Vercel's body limit
 */
async function runGoogleVisionWithUrl(imageUrl: string): Promise<VisionOCRResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY

  if (!apiKey) {
    console.error('GOOGLE_VISION_API_KEY not configured')
    return { success: false, error: 'OCR service not configured. Please set GOOGLE_VISION_API_KEY.' }
  }

  try {
    console.log(`Sending image URL to Vision API: ${imageUrl}`)

    // Call Google Cloud Vision API with URL source
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { source: { imageUri: imageUrl } },
              features: [
                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
                { type: 'BARCODE_DETECTION', maxResults: 10 }
              ],
            },
          ],
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Google Vision API error:', response.status, errorText)
      return { success: false, error: `Vision API error: ${response.status} - ${errorText}` }
    }

    const result = await response.json()
    const annotation = result.responses?.[0]

    if (annotation?.error) {
      console.error('Vision API annotation error:', annotation.error)
      return { success: false, error: annotation.error.message }
    }

    // Extract QR code data from barcode detection
    let qrData: VisionOCRResult['qrData'] = null
    const barcodes = annotation?.barcodeAnnotations || []
    console.log(`Found ${barcodes.length} barcodes`)

    for (const barcode of barcodes) {
      console.log(`Barcode type: ${barcode.format}, value: ${barcode.rawValue?.substring(0, 50)}...`)
      if (barcode.format === 'QR_CODE' && barcode.rawValue) {
        try {
          const parsed = JSON.parse(barcode.rawValue)
          if (parsed.sample_id && parsed.tracking_number) {
            qrData = {
              sample_id: parsed.sample_id,
              tracking_number: parsed.tracking_number,
              type: parsed.type || 'cupping_card',
            }
            console.log('QR code parsed successfully:', qrData)
            break
          }
        } catch (e) {
          console.log('QR code found but not valid JSON:', barcode.rawValue)
        }
      }
    }

    // Extract OCR text
    const fullTextAnnotation = annotation?.fullTextAnnotation
    if (!fullTextAnnotation) {
      console.warn('No text detected in image')
      return {
        success: true,
        fullText: '',
        words: [],
        blocks: [],
        qrData,
        error: qrData ? undefined : 'No text detected in image'
      }
    }

    // Extract words with bounding boxes
    const words: VisionOCRResult['words'] = []
    const blocks: VisionOCRResult['blocks'] = []

    fullTextAnnotation.pages?.forEach((page: any) => {
      page.blocks?.forEach((block: any) => {
        const blockBox = getBoundingBox(block.boundingBox)
        const blockText: string[] = []

        block.paragraphs?.forEach((paragraph: any) => {
          paragraph.words?.forEach((word: any) => {
            const wordText = word.symbols?.map((s: any) => s.text).join('') || ''
            const wordBox = getBoundingBox(word.boundingBox)
            const wordConfidence = word.confidence || 0

            blockText.push(wordText)
            words.push({
              text: wordText,
              boundingBox: wordBox,
              confidence: wordConfidence,
            })
          })
        })

        blocks.push({
          text: blockText.join(' '),
          boundingBox: blockBox,
          confidence: block.confidence || 0,
        })
      })
    })

    console.log(`OCR extracted ${words.length} words`)

    return {
      success: true,
      fullText: fullTextAnnotation.text,
      blocks,
      words,
      confidence: fullTextAnnotation.pages?.[0]?.confidence || 0,
      qrData,
    }
  } catch (error: any) {
    console.error('Error calling Google Vision API with URL:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Run Google Cloud Vision API for both OCR and QR/barcode detection
 */
async function runGoogleVisionFull(imageBuffer: Buffer): Promise<VisionOCRResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY

  if (!apiKey) {
    console.error('GOOGLE_VISION_API_KEY not configured')
    return { success: false, error: 'OCR service not configured. Please set GOOGLE_VISION_API_KEY.' }
  }

  try {
    // Convert image to base64
    const base64Image = imageBuffer.toString('base64')
    console.log(`Sending image to Vision API (${(imageBuffer.length / 1024).toFixed(1)} KB)`)

    // Call Google Cloud Vision API with both TEXT and BARCODE detection
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [
                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
                { type: 'BARCODE_DETECTION', maxResults: 10 }
              ],
            },
          ],
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Google Vision API error:', response.status, errorText)
      return { success: false, error: `Vision API error: ${response.status} - ${errorText}` }
    }

    const result = await response.json()
    const annotation = result.responses?.[0]

    if (annotation?.error) {
      console.error('Vision API annotation error:', annotation.error)
      return { success: false, error: annotation.error.message }
    }

    // Extract QR code data from barcode detection
    let qrData: VisionOCRResult['qrData'] = null
    const barcodes = annotation?.barcodeAnnotations || []
    console.log(`Found ${barcodes.length} barcodes`)

    for (const barcode of barcodes) {
      console.log(`Barcode type: ${barcode.format}, value: ${barcode.rawValue?.substring(0, 50)}...`)
      if (barcode.format === 'QR_CODE' && barcode.rawValue) {
        try {
          const parsed = JSON.parse(barcode.rawValue)
          if (parsed.sample_id && parsed.tracking_number) {
            qrData = {
              sample_id: parsed.sample_id,
              tracking_number: parsed.tracking_number,
              type: parsed.type || 'cupping_card',
            }
            console.log('QR code parsed successfully:', qrData)
            break
          }
        } catch (e) {
          console.log('QR code found but not valid JSON:', barcode.rawValue)
        }
      }
    }

    // Extract OCR text
    const fullTextAnnotation = annotation?.fullTextAnnotation
    if (!fullTextAnnotation) {
      console.warn('No text detected in image')
      return {
        success: true,
        fullText: '',
        words: [],
        blocks: [],
        qrData,
        error: qrData ? undefined : 'No text detected in image'
      }
    }

    // Extract words with bounding boxes
    const words: VisionOCRResult['words'] = []
    const blocks: VisionOCRResult['blocks'] = []

    fullTextAnnotation.pages?.forEach((page: any) => {
      page.blocks?.forEach((block: any) => {
        const blockBox = getBoundingBox(block.boundingBox)
        const blockText: string[] = []

        block.paragraphs?.forEach((paragraph: any) => {
          paragraph.words?.forEach((word: any) => {
            const wordText = word.symbols?.map((s: any) => s.text).join('') || ''
            const wordBox = getBoundingBox(word.boundingBox)
            const wordConfidence = word.confidence || 0

            blockText.push(wordText)
            words.push({
              text: wordText,
              boundingBox: wordBox,
              confidence: wordConfidence,
            })
          })
        })

        blocks.push({
          text: blockText.join(' '),
          boundingBox: blockBox,
          confidence: block.confidence || 0,
        })
      })
    })

    console.log(`OCR extracted ${words.length} words`)

    return {
      success: true,
      fullText: fullTextAnnotation.text,
      blocks,
      words,
      confidence: fullTextAnnotation.pages?.[0]?.confidence || 0,
      qrData,
    }
  } catch (error: any) {
    console.error('Error calling Google Vision API:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Convert Google Vision bounding box to simple format
 */
function getBoundingBox(boundingBox: any): { x: number; y: number; width: number; height: number } {
  if (!boundingBox?.vertices || boundingBox.vertices.length < 4) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const vertices = boundingBox.vertices
  const x = Math.min(...vertices.map((v: any) => v.x || 0))
  const y = Math.min(...vertices.map((v: any) => v.y || 0))
  const maxX = Math.max(...vertices.map((v: any) => v.x || 0))
  const maxY = Math.max(...vertices.map((v: any) => v.y || 0))

  return { x, y, width: maxX - x, height: maxY - y }
}

/**
 * Parse cupping scores from Google Vision OCR result
 * Extracts cupper names from the first column and maps scores to the correct columns
 */
function parseScoresFromVisionResult(
  ocrResult: VisionOCRResult,
  assignedCuppers: Array<{ id: string; name: string }>
): Array<{ cupper_id: string; cupper_name: string; ocr_name: string; scores: Record<string, number>; confidence: number }> {
  const results: Array<{ cupper_id: string; cupper_name: string; ocr_name: string; scores: Record<string, number>; confidence: number }> = []

  console.warn(`[OCR DEBUG] Words count: ${ocrResult.words?.length || 0}, Full text length: ${ocrResult.fullText?.length || 0}`)

  if (!ocrResult.words || ocrResult.words.length === 0) {
    console.warn('[OCR DEBUG] No words found in OCR result - check Vision API response')
    return []
  }

  // Cupping card column headers (in order on the printed card)
  const scoreColumns = ['Fragrance', 'Flavor', 'Aftertaste', 'Acidity', 'Body', 'Balance', 'Overall']

  // Separate words into numbers (scores) and text (names/labels)
  const allWords = ocrResult.words

  // Find all number patterns (scores) with their positions
  const scoreWords = allWords.filter((word) => {
    const text = word.text.trim().replace(',', '.')
    // Match numbers like 5, 5.5, 4,5, 2.75, etc.
    return /^\d+([.,]\d+)?$/.test(text)
  })

  // Find all text words (potential cupper names) - exclude common labels
  const excludedLabels = ['cupper', 'fra', 'fla', 'aft', 'acid', 'body', 'bal', 'ove', 'over', 'taints', 'faults', 'template', 'quality', 'buyer', 'ss', 'pss', 'type', 'fragrance', 'flavor', 'aftertaste', 'acidity', 'balance', 'overall', 'wolthers']
  const textWords = allWords.filter((word) => {
    const text = word.text.trim().toLowerCase()
    // Must be alphabetic and not a common label
    return /^[a-zA-Z]+$/.test(word.text.trim()) &&
           text.length >= 3 &&
           !excludedLabels.some(label => text.includes(label))
  })

  console.warn(`[OCR DEBUG] Found ${scoreWords.length} score values and ${textWords.length} potential name words`)

  // Group scores by approximate Y position (vertical rows)
  const rowTolerance = 25 // pixels - slightly more tolerant
  const rows: Array<{ y: number; scores: typeof scoreWords; nameWord?: typeof textWords[0] }> = []

  scoreWords.forEach((scoreWord) => {
    const y = scoreWord.boundingBox.y
    let foundRow = rows.find((row) => Math.abs(row.y - y) <= rowTolerance)

    if (!foundRow) {
      foundRow = { y, scores: [] }
      rows.push(foundRow)
    }

    foundRow.scores.push(scoreWord)
  })

  // Sort rows by Y position (top to bottom)
  rows.sort((a, b) => a.y - b.y)

  // Filter rows to only those with multiple scores (cupper data rows, not headers)
  // Lowered threshold to 4 to catch incomplete rows
  const dataRows = rows.filter((row) => row.scores.length >= 4)

  console.warn(`[OCR DEBUG] Found ${dataRows.length} data rows with 4+ scores (from ${rows.length} total rows)`)

  // For each data row, find the cupper name (leftmost text word on same row)
  dataRows.forEach((row) => {
    // Find text words that are on the same Y row
    const rowNameCandidates = textWords.filter((textWord) => {
      return Math.abs(textWord.boundingBox.y - row.y) <= rowTolerance
    })

    if (rowNameCandidates.length > 0) {
      // Get the leftmost name candidate
      rowNameCandidates.sort((a, b) => a.boundingBox.x - b.boundingBox.x)
      row.nameWord = rowNameCandidates[0]
      console.warn(`[OCR DEBUG] Found name "${row.nameWord.text}" for row at Y=${row.y}`)
    }
  })

  // Match extracted names to assigned cuppers
  dataRows.forEach((row, index) => {
    const ocrName = row.nameWord?.text || ''

    // Try to match OCR name to an assigned cupper (case-insensitive partial match)
    let matchedCupper = assignedCuppers.find((cupper) => {
      const cupperNameLower = cupper.name.toLowerCase()
      const ocrNameLower = ocrName.toLowerCase()
      // Match if OCR name starts with cupper name or vice versa
      return cupperNameLower.startsWith(ocrNameLower) ||
             ocrNameLower.startsWith(cupperNameLower) ||
             cupperNameLower.includes(ocrNameLower) ||
             ocrNameLower.includes(cupperNameLower)
    })

    // If no match found, use the OCR name directly or fallback to placeholder
    const cupper = matchedCupper || {
      id: `ocr_${index}`,
      name: ocrName || `Cupper ${index + 1}`
    }

    // Sort scores in row by X position (left to right)
    const sortedScores = row.scores.sort((a, b) => a.boundingBox.x - b.boundingBox.x)

    // Map scores to columns
    const scores: Record<string, number> = {}
    let totalConfidence = 0

    sortedScores.forEach((scoreWord, scoreIndex) => {
      if (scoreIndex < scoreColumns.length) {
        const value = parseFloat(scoreWord.text.replace(',', '.'))
        if (!isNaN(value) && value >= 0 && value <= 10) {
          scores[scoreColumns[scoreIndex]] = value
          totalConfidence += scoreWord.confidence
        }
      }
    })

    const avgConfidence = sortedScores.length > 0 ? totalConfidence / sortedScores.length : 0

    results.push({
      cupper_id: cupper.id,
      cupper_name: cupper.name,
      ocr_name: ocrName, // Include the raw OCR name for validation UI
      scores,
      confidence: avgConfidence * 100,
    })

    console.warn(`[OCR DEBUG] Row ${index}: OCR name="${ocrName}", matched to "${cupper.name}", scores:`, JSON.stringify(scores))
  })

  console.warn(`[OCR DEBUG] Total extracted scores: ${results.length} cuppers`)
  return results
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

/**
 * Fetch assigned cuppers for a sample from the cupping session
 */
async function fetchAssignedCuppers(
  supabase: any,
  sampleId: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    // Find active cupping session containing this sample
    const { data: sessions, error: sessionError } = await supabase
      .from('cupping_sessions')
      .select('id, cupper_ids, sample_ids')
      .contains('sample_ids', [sampleId])
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    if (sessionError || !sessions || sessions.length === 0) {
      console.warn('No active cupping session found for sample:', sampleId)
      return []
    }

    const session = sessions[0]
    const cupperIds = session.cupper_ids || []

    if (cupperIds.length === 0) {
      console.warn('No cuppers assigned to session:', session.id)
      return []
    }

    // Fetch cupper profile names
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', cupperIds)

    if (profileError || !profiles) {
      console.error('Error fetching cupper profiles:', profileError)
      return []
    }

    // Map to simple name array, preserve order from cupper_ids
    const cuppers = cupperIds
      .map((id: string) => {
        const profile = profiles.find((p: any) => p.id === id)
        if (!profile) return null
        return {
          id: profile.id,
          name: profile.full_name.split(' ')[0], // Use first name only
        }
      })
      .filter((c: any) => c !== null)

    console.log(`Found ${cuppers.length} assigned cuppers:`, cuppers.map((c: any) => c.name).join(', '))
    return cuppers
  } catch (error) {
    console.error('Error fetching assigned cuppers:', error)
    return []
  }
}

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
 * ROBUST OCR SYSTEM v2.0
 * - Uses table structure detection
 * - Relative column indexing (not absolute X positions)
 * - Aggressive number extraction
 * - Better confidence scoring
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

    // Step 1: Run Google Cloud Vision
    console.log('[OCR] Running Vision API...')
    const visionResult = imageUrl
      ? await runGoogleVisionWithUrl(imageUrl)
      : await runGoogleVisionFull(imageBuffer!)

    if (!visionResult.success) {
      return NextResponse.json({
        error: 'Vision API failed',
        message: visionResult.error || 'Failed to process image'
      }, { status: 500 })
    }

    console.log(`[OCR] Vision returned ${visionResult.words?.length || 0} words`)

    // Step 2: Extract QR code
    let qrData = visionResult.qrData
    if (!qrData) {
      console.log('[OCR] No QR from Vision, trying jsQR...')
      let bufferForQR = imageBuffer
      if (!bufferForQR && imageUrl) {
        try {
          const res = await fetch(imageUrl)
          if (res.ok) bufferForQR = Buffer.from(await res.arrayBuffer())
        } catch { /* ignore */ }
      }
      if (bufferForQR) {
        qrData = await detectQRCodeWithJsQR(bufferForQR)
      }
    }

    if (!qrData) {
      return NextResponse.json({
        error: 'QR code not detected',
        message: 'Could not find QR code on the cupping card.'
      }, { status: 400 })
    }

    console.log('[OCR] QR:', qrData)

    // Step 3: Fetch sample details
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select(`
        id, tracking_number, sample_type,
        quality_spec:client_qualities!samples_quality_spec_id_fkey(
          id,
          template:quality_templates!client_qualities_template_id_fkey(id, name, parameters)
        )
      `)
      .eq('id', qrData.sample_id)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({
        error: 'Sample not found',
        message: `Sample ${qrData.tracking_number} not found.`
      }, { status: 404 })
    }

    // Step 4: Fetch assigned cuppers
    const cuppers = await fetchAssignedCuppers(supabase, qrData.sample_id)
    console.log(`[OCR] ${cuppers.length} assigned cuppers:`, cuppers.map(c => c.name))

    // Step 5: Extract scores using robust table detection
    const extraction = extractScoresRobust(visionResult, cuppers)

    // Step 6: Extract defects (with proper filtering)
    const defects = extractDefectsClean(visionResult.fullText || '')

    // Step 7: Calculate confidence
    const confidence = calculateConfidence(extraction, visionResult)

    console.log(`[OCR] Result: ${extraction.cupperScores.length} cuppers, ${confidence}% confidence`)

    return NextResponse.json({
      success: true,
      qr_data: qrData,
      sample: {
        id: sample.id,
        tracking_number: sample.tracking_number,
        sample_type: sample.sample_type,
        quality_template: sample.quality_spec?.template,
      },
      extracted_scores: extraction.cupperScores,
      assigned_cuppers: cuppers,
      defects,
      raw_text: visionResult.fullText,
      confidence,
      session_id: sessionId,
      debug: {
        wordsFound: visionResult.words?.length || 0,
        numbersFound: extraction.numbersFound,
        rowsDetected: extraction.rowsDetected,
        cupperNamesFound: extraction.cupperNamesFound,
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
// QR CODE DETECTION
// ============================================================================

async function detectQRCodeWithJsQR(imageBuffer: Buffer): Promise<{
  sample_id: string
  tracking_number: string
  type: string
} | null> {
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
          return { sample_id: qrData.sample_id, tracking_number: qrData.tracking_number, type: qrData.type || 'cupping_card' }
        }
      }
    } catch { continue }
  }
  return null
}

// ============================================================================
// VISION API
// ============================================================================

interface VisionWord {
  text: string
  boundingBox: { x: number; y: number; width: number; height: number }
  confidence: number
}

interface VisionOCRResult {
  success: boolean
  error?: string
  fullText?: string
  words?: VisionWord[]
  confidence?: number
  qrData?: { sample_id: string; tracking_number: string; type: string } | null
}

async function runGoogleVisionWithUrl(imageUrl: string): Promise<VisionOCRResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) return { success: false, error: 'GOOGLE_VISION_API_KEY not configured' }

  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { source: { imageUri: imageUrl } },
          features: [
            { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
            { type: 'BARCODE_DETECTION', maxResults: 10 }
          ],
        }],
      }),
    })

    if (!response.ok) {
      return { success: false, error: `Vision API: ${response.status}` }
    }
    return parseVisionResponse(await response.json())
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function runGoogleVisionFull(imageBuffer: Buffer): Promise<VisionOCRResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) return { success: false, error: 'GOOGLE_VISION_API_KEY not configured' }

  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBuffer.toString('base64') },
          features: [
            { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
            { type: 'BARCODE_DETECTION', maxResults: 10 }
          ],
        }],
      }),
    })

    if (!response.ok) {
      return { success: false, error: `Vision API: ${response.status}` }
    }
    return parseVisionResponse(await response.json())
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function parseVisionResponse(result: any): VisionOCRResult {
  const annotation = result.responses?.[0]
  if (annotation?.error) {
    return { success: false, error: annotation.error.message }
  }

  // Extract QR
  let qrData: VisionOCRResult['qrData'] = null
  for (const barcode of (annotation?.barcodeAnnotations || [])) {
    if (barcode.format === 'QR_CODE' && barcode.rawValue) {
      try {
        const parsed = JSON.parse(barcode.rawValue)
        if (parsed.sample_id && parsed.tracking_number) {
          qrData = { sample_id: parsed.sample_id, tracking_number: parsed.tracking_number, type: parsed.type || 'cupping_card' }
          break
        }
      } catch { /* not JSON */ }
    }
  }

  const fullTextAnnotation = annotation?.fullTextAnnotation
  if (!fullTextAnnotation) {
    return { success: true, fullText: '', words: [], qrData }
  }

  // Extract words with bounding boxes
  const words: VisionWord[] = []
  let totalConfidence = 0
  let wordCount = 0

  fullTextAnnotation.pages?.forEach((page: any) => {
    page.blocks?.forEach((block: any) => {
      block.paragraphs?.forEach((paragraph: any) => {
        paragraph.words?.forEach((word: any) => {
          const wordText = word.symbols?.map((s: any) => s.text).join('') || ''
          const vertices = word.boundingBox?.vertices || []
          const conf = word.confidence || 0.9

          if (vertices.length >= 4 && wordText.trim()) {
            const x = Math.min(...vertices.map((v: any) => v.x || 0))
            const y = Math.min(...vertices.map((v: any) => v.y || 0))
            const maxX = Math.max(...vertices.map((v: any) => v.x || 0))
            const maxY = Math.max(...vertices.map((v: any) => v.y || 0))

            words.push({
              text: wordText,
              boundingBox: { x, y, width: maxX - x, height: maxY - y },
              confidence: conf,
            })
            totalConfidence += conf
            wordCount++
          }
        })
      })
    })
  })

  return {
    success: true,
    fullText: fullTextAnnotation.text,
    words,
    confidence: wordCount > 0 ? totalConfidence / wordCount : 0.8,
    qrData,
  }
}

// ============================================================================
// ROBUST SCORE EXTRACTION v2.0
// ============================================================================

const ATTRIBUTES = ['Fragrance', 'Flavor', 'Aftertaste', 'Acidity', 'Body', 'Balance', 'Overall']

interface ExtractionResult {
  cupperScores: Array<{
    cupper_id: string
    cupper_name: string
    ocr_name: string
    scores: Record<string, number>
    confidence: number
  }>
  numbersFound: number
  rowsDetected: number
  cupperNamesFound: string[]
}

function extractScoresRobust(
  ocrResult: VisionOCRResult,
  assignedCuppers: Array<{ id: string; name: string }>
): ExtractionResult {
  const words = ocrResult.words || []
  const fullText = ocrResult.fullText || ''

  console.log('[EXTRACT] Starting robust extraction...')

  // Step 1: Find ALL numbers that could be scores (0-10 range)
  const numberWords: Array<VisionWord & { value: number }> = []

  for (const word of words) {
    const value = parseScoreValue(word.text)
    if (value !== null) {
      numberWords.push({ ...word, value })
    }
  }

  console.log(`[EXTRACT] Found ${numberWords.length} score numbers`)

  // Step 2: Find cupper names (from assigned list or common patterns)
  const cupperNameWords = findCupperNameWords(words, assignedCuppers)
  console.log(`[EXTRACT] Found cupper names:`, cupperNameWords.map(w => w.text))

  // Step 3: Group numbers into rows by Y position
  const rows = groupNumbersIntoRows(numberWords, 40)
  console.log(`[EXTRACT] Grouped into ${rows.length} rows`)

  // Step 4: Associate each row with a cupper
  const cupperScores: ExtractionResult['cupperScores'] = []

  rows.forEach((row, rowIndex) => {
    // Find cupper name for this row
    const rowY = row.avgY
    const cupperWord = cupperNameWords.find(w => Math.abs(w.boundingBox.y - rowY) < 50)
    const ocrName = cupperWord?.text || ''

    // Match to assigned cupper
    const matched = matchToAssignedCupper(ocrName, assignedCuppers, rowIndex)

    // Map scores to attributes by column index (left to right = Fra, Fla, Aft, etc.)
    const scores: Record<string, number> = {}
    row.numbers.slice(0, ATTRIBUTES.length).forEach((num, idx) => {
      scores[ATTRIBUTES[idx]] = num.value
    })

    // Calculate row confidence
    const rowConf = Math.min(100, (row.numbers.length / 7) * 100)

    cupperScores.push({
      cupper_id: matched.id,
      cupper_name: matched.name,
      ocr_name: ocrName,
      scores,
      confidence: rowConf,
    })

    console.log(`[EXTRACT] Row ${rowIndex}: ${ocrName} -> ${matched.name}, ${row.numbers.length} scores`)
  })

  // If no rows found but we have cuppers, create empty rows
  if (cupperScores.length === 0 && assignedCuppers.length > 0) {
    for (const cupper of assignedCuppers) {
      cupperScores.push({
        cupper_id: cupper.id,
        cupper_name: cupper.name,
        ocr_name: '',
        scores: {},
        confidence: 0,
      })
    }
  }

  return {
    cupperScores,
    numbersFound: numberWords.length,
    rowsDetected: rows.length,
    cupperNamesFound: cupperNameWords.map(w => w.text),
  }
}

/**
 * Parse a score value from OCR text
 * Handles: "7", "7.5", "7,5", "7.25", "7,25", etc.
 */
function parseScoreValue(text: string): number | null {
  if (!text) return null

  let cleaned = text.trim()

  // Replace comma with period
  cleaned = cleaned.replace(',', '.')

  // Remove any trailing punctuation
  cleaned = cleaned.replace(/[.:;]$/, '')

  // Try to parse
  const value = parseFloat(cleaned)

  if (isNaN(value)) return null
  if (value < 0 || value > 10) return null

  // Round to nearest 0.25
  return Math.round(value * 4) / 4
}

/**
 * Find words that are likely cupper names
 */
function findCupperNameWords(
  words: VisionWord[],
  assignedCuppers: Array<{ id: string; name: string }>
): VisionWord[] {
  const assignedNames = assignedCuppers.map(c => c.name.toLowerCase())
  const commonNames = ['anderson', 'matheus', 'victor', 'daniel', 'lucas', 'pedro', 'maria', 'ana', 'carlos', 'joao', 'roberto', 'gabriel', 'rafael', 'felipe']

  const found: VisionWord[] = []

  for (const word of words) {
    const text = word.text.toLowerCase().trim()

    // Skip short words
    if (text.length < 3) continue

    // Skip numbers
    if (/^\d+([.,]\d+)?$/.test(text)) continue

    // Skip common labels
    const skipWords = ['cupper', 'fra', 'fla', 'aft', 'acid', 'body', 'bal', 'ove', 'over', 'overall', 'taints', 'faults', 'template', 'quality', 'buyer', 'type', 'pss', 'wolthers', 'associates', 'corretora', 'mercadorias', 'ltda', 'alfenas', 'dulce', 'eurodulce', 'blaser', 'trading']
    if (skipWords.some(s => text === s || text.startsWith(s))) continue

    // Check if it matches an assigned cupper
    const matchesAssigned = assignedNames.some(n => {
      return text === n || text.includes(n) || n.includes(text) ||
        (text.length >= 4 && n.startsWith(text.substring(0, 4))) ||
        levenshtein(text, n) <= 2
    })

    // Check if it's a common name
    const isCommonName = commonNames.some(n =>
      text === n || text.startsWith(n.substring(0, 4))
    )

    if (matchesAssigned || isCommonName) {
      found.push(word)
    }
  }

  // Sort by Y position (top to bottom)
  found.sort((a, b) => a.boundingBox.y - b.boundingBox.y)

  return found
}

/**
 * Group numbers into rows by Y position
 */
function groupNumbersIntoRows(
  numbers: Array<VisionWord & { value: number }>,
  tolerance: number
): Array<{ avgY: number; numbers: Array<VisionWord & { value: number }> }> {
  if (numbers.length === 0) return []

  // Sort by Y first
  const sorted = [...numbers].sort((a, b) => a.boundingBox.y - b.boundingBox.y)

  const rows: Array<{ ys: number[]; numbers: Array<VisionWord & { value: number }> }> = []

  for (const num of sorted) {
    const y = num.boundingBox.y

    // Find existing row within tolerance
    let matched = false
    for (const row of rows) {
      const avgY = row.ys.reduce((a, b) => a + b, 0) / row.ys.length
      if (Math.abs(avgY - y) <= tolerance) {
        row.ys.push(y)
        row.numbers.push(num)
        matched = true
        break
      }
    }

    if (!matched) {
      rows.push({ ys: [y], numbers: [num] })
    }
  }

  // Filter to rows with at least 3 scores and sort by X within each row
  return rows
    .filter(r => r.numbers.length >= 3)
    .map(r => ({
      avgY: r.ys.reduce((a, b) => a + b, 0) / r.ys.length,
      numbers: r.numbers.sort((a, b) => a.boundingBox.x - b.boundingBox.x)
    }))
    .sort((a, b) => a.avgY - b.avgY)
}

/**
 * Match OCR name to assigned cupper
 */
function matchToAssignedCupper(
  ocrName: string,
  assignedCuppers: Array<{ id: string; name: string }>,
  rowIndex: number
): { id: string; name: string } {
  if (assignedCuppers.length === 0) {
    return { id: `row_${rowIndex}`, name: ocrName || `Cupper ${rowIndex + 1}` }
  }

  if (ocrName) {
    const ocrLower = ocrName.toLowerCase()

    for (const cupper of assignedCuppers) {
      const cupperLower = cupper.name.toLowerCase()

      if (cupperLower === ocrLower) return cupper
      if (cupperLower.includes(ocrLower) || ocrLower.includes(cupperLower)) return cupper
      if (cupperLower.substring(0, 4) === ocrLower.substring(0, 4)) return cupper
      if (levenshtein(cupperLower, ocrLower) <= 2) return cupper
    }
  }

  // Fall back to position-based assignment
  if (rowIndex < assignedCuppers.length) {
    return assignedCuppers[rowIndex]
  }

  return { id: `row_${rowIndex}`, name: ocrName || `Cupper ${rowIndex + 1}` }
}

// ============================================================================
// DEFECT EXTRACTION (with proper filtering)
// ============================================================================

function extractDefectsClean(text: string): { taints: string[]; faults: string[] } {
  const taints: string[] = []
  const faults: string[] = []

  // Look for TAINTS section
  const taintsMatch = text.match(/TAINTS:?\s*([^\n]*)/i)
  if (taintsMatch) {
    const cleaned = cleanDefectLine(taintsMatch[1])
    taints.push(...cleaned)
  }

  // Look for FAULTS section
  const faultsMatch = text.match(/FAULTS:?\s*([^\n]*)/i)
  if (faultsMatch) {
    const cleaned = cleanDefectLine(faultsMatch[1])
    faults.push(...cleaned)
  }

  return { taints, faults }
}

function cleanDefectLine(raw: string): string[] {
  if (!raw) return []

  // Known valid defect terms
  const validDefects = [
    'ferment', 'fermented', 'rubber', 'rubbery', 'phenol', 'phenolic',
    'rio', 'rioy', 'potato', 'earthy', 'moldy', 'musty', 'baggy',
    'chemical', 'medicinal', 'sour', 'stinker', 'woody', 'papery',
    'past', 'aged', 'faded', 'harsh', 'astringent', 'green', 'grassy'
  ]

  const words = raw.toLowerCase().split(/[\s,;]+/).filter(Boolean)
  const result: string[] = []

  for (const word of words) {
    // Must be only letters (no numbers, special chars)
    if (!/^[a-z]+$/i.test(word)) continue

    // Must be at least 3 characters
    if (word.length < 3) continue

    // Must not be garbage patterns
    if (/^w+$/.test(word)) continue  // wwww
    if (/^(.)\1+$/.test(word)) continue  // aaaa, bbbb

    // Check if it's a known defect or similar
    const isValid = validDefects.some(d =>
      word === d || word.startsWith(d.substring(0, 4)) || levenshtein(word, d) <= 2
    )

    if (isValid) {
      result.push(word)
    }
  }

  return result
}

// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================

function calculateConfidence(extraction: ExtractionResult, vision: VisionOCRResult): number {
  let score = 0

  // Vision API confidence (0-1 scale) -> max 30 points
  const visionConf = vision.confidence || 0.8
  score += visionConf * 30

  // Numbers found -> max 25 points (21+ numbers = full score)
  score += Math.min(25, extraction.numbersFound * 1.2)

  // Rows detected -> max 25 points (3 rows = full score)
  score += Math.min(25, extraction.rowsDetected * 8)

  // Cupper names found -> max 20 points
  score += Math.min(20, extraction.cupperNamesFound.length * 7)

  // Ensure minimum 10%
  return Math.max(10, Math.min(100, Math.round(score)))
}

// ============================================================================
// UTILITIES
// ============================================================================

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

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

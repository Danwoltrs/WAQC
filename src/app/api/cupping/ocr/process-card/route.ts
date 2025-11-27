import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import Tesseract from 'tesseract.js'
import jsQR from 'jsqr'
import sharp from 'sharp'

// Allow up to 60 seconds for OCR processing
export const maxDuration = 60

/**
 * POST /api/cupping/ocr/process-card
 * Process a scanned cupping card image with OCR
 * Body: FormData with 'image' file and optional 'session_id'
 * Note: Images should be compressed client-side before upload (max ~4MB for Vercel)
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

    // Step 6: Fetch cupping session and assigned cuppers
    console.log('Step 5: Fetching cupping session and assigned cuppers...')
    const cuppers = await fetchAssignedCuppers(supabase, qrData.sample_id)

    // Step 7: Re-parse scores with position-based matching using assigned cupper names
    console.log('Step 6: Re-parsing scores with position-based cupper matching...')
    const scoresWithCuppers = await parseCuppingScoresWithPositions(
      processedImage,
      ocrResult.data,
      cuppers
    )

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
      assigned_cuppers: cuppers, // Return assigned cuppers for validation UI
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
          name: profile.full_name.split(' ')[0], // Use first name only (matching PDF card format)
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

/**
 * Parse cupping scores using position-based matching with assigned cupper names
 * Uses Tesseract OCR bounding boxes to identify vertical row positions
 */
async function parseCuppingScoresWithPositions(
  imageBuffer: Buffer,
  ocrData: Tesseract.Page,
  assignedCuppers: Array<{ id: string; name: string }>
): Promise<Array<{ cupper_id: string; cupper_name: string; scores: Record<string, number>; confidence: number }>> {
  const results: Array<{ cupper_id: string; cupper_name: string; scores: Record<string, number>; confidence: number }> = []

  // If no cuppers assigned, fall back to basic parsing
  if (assignedCuppers.length === 0) {
    console.warn('No assigned cuppers, using fallback parsing')
    return []
  }

  // Common cupping attributes to look for (in expected order on card)
  const attributes = ['Frag', 'Arom', 'Body', 'Acid', 'Swet', 'Bal', 'Fin']

  // Extract all words from OCR lines with their bounding boxes
  // Tesseract.Page has lines[], each line has words[]
  const allWords: Array<{ text: string; bbox: any; confidence: number; y: number; x: number }> = []

  // Cast to any to access lines property (not in TypeScript type definitions)
  ;(ocrData as any).lines?.forEach((line: any) => {
    line.words?.forEach((word: any) => {
      allWords.push({
        text: word.text,
        bbox: word.bbox,
        confidence: word.confidence,
        y: word.bbox.y0,
        x: word.bbox.x0
      })
    })
  })

  // Find all number patterns (scores) with their positions
  const scoreWords = allWords.filter((word) => {
    const text = word.text.trim()
    return /^\d+(\.\d+)?$/.test(text) && parseFloat(text) >= 0 && parseFloat(text) <= 10
  })

  // Group scores by approximate Y position (vertical rows)
  // Allow 10px tolerance for row alignment
  const rowTolerance = 10
  const rows: Array<{ y: number; scores: typeof scoreWords }> = []

  scoreWords.forEach((scoreWord) => {
    const y = scoreWord.bbox.y0
    let foundRow = rows.find((row) => Math.abs(row.y - y) <= rowTolerance)

    if (!foundRow) {
      foundRow = { y, scores: [] }
      rows.push(foundRow)
    }

    foundRow.scores.push(scoreWord)
  })

  // Sort rows by Y position (top to bottom)
  rows.sort((a, b) => a.y - b.y)

  // Filter rows to only those with multiple scores (likely cupper rows, not header)
  const cupperRows = rows.filter((row) => row.scores.length >= 3)

  console.log(`Found ${cupperRows.length} cupper rows with scores`)

  // Match rows to assigned cuppers by position
  // First cupper row = first assigned cupper, etc.
  cupperRows.forEach((row, index) => {
    if (index >= assignedCuppers.length) {
      console.warn(`Row ${index} has no corresponding assigned cupper`)
      return
    }

    const cupper = assignedCuppers[index]

    // Sort scores in row by X position (left to right)
    const sortedScores = row.scores.sort((a, b) => a.bbox.x0 - b.bbox.x0)

    // Map scores to attributes (first score = first attribute, etc.)
    const scores: Record<string, number> = {}
    let totalConfidence = 0

    sortedScores.forEach((scoreWord, scoreIndex) => {
      if (scoreIndex < attributes.length) {
        scores[attributes[scoreIndex]] = parseFloat(scoreWord.text)
        totalConfidence += scoreWord.confidence
      }
    })

    const avgConfidence = sortedScores.length > 0 ? totalConfidence / sortedScores.length : 0

    results.push({
      cupper_id: cupper.id,
      cupper_name: cupper.name,
      scores,
      confidence: avgConfidence,
    })

    console.log(`Mapped row ${index} to ${cupper.name}:`, scores, `(confidence: ${avgConfidence.toFixed(1)}%)`)
  })

  return results
}

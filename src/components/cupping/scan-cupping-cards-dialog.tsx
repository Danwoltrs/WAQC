'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Upload, X, FileImage, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OCRValidationDialog } from './ocr-validation-dialog'

// Maximum file size (4.5MB Vercel limit, but leave margin)
const MAX_FILE_SIZE = 4.2 * 1024 * 1024
// Keep original dimensions - don't resize (important for QR code detection)
const MAX_DIMENSION = 4000
// High quality to preserve QR code and handwriting
const MIN_QUALITY = 0.90

/**
 * Compress an image file using canvas
 * Optimized for OCR: maintains text clarity while reducing file size
 * - Resizes large images to max dimension
 * - Uses high quality JPEG to preserve text edges
 * - Never drops below MIN_QUALITY to ensure OCR works
 */
async function compressImage(file: File): Promise<File> {
  // If file is already small enough and not HEIC, return as-is
  if (file.size <= MAX_FILE_SIZE && !file.type.includes('heic')) {
    console.log(`Image already small enough: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
    return file
  }

  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    const objectUrl = URL.createObjectURL(file)

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl) // Clean up

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img
      const originalWidth = width
      const originalHeight = height

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height / width) * MAX_DIMENSION)
          width = MAX_DIMENSION
        } else {
          width = Math.round((width / height) * MAX_DIMENSION)
          height = MAX_DIMENSION
        }
      }

      canvas.width = width
      canvas.height = height

      // Use high-quality image smoothing for better text preservation
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      console.log(`Resized from ${originalWidth}x${originalHeight} to ${width}x${height}`)

      // Try quality levels from high to minimum (preserve QR code and handwriting)
      const qualities = [0.95, 0.92, MIN_QUALITY]

      const tryCompression = (qualityIndex: number) => {
        const quality = qualityIndex < qualities.length ? qualities[qualityIndex] : MIN_QUALITY
        const isLastAttempt = qualityIndex >= qualities.length - 1

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'))
              return
            }

            if (blob.size <= MAX_FILE_SIZE || isLastAttempt) {
              // Success or reached minimum quality
              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, '.jpg'),
                { type: 'image/jpeg' }
              )
              console.log(`Compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB (quality: ${quality})`)

              if (blob.size > MAX_FILE_SIZE) {
                console.warn(`Image still above limit at min quality. OCR may work but upload might fail.`)
              }

              resolve(compressedFile)
            } else {
              // Try lower quality
              tryCompression(qualityIndex + 1)
            }
          },
          'image/jpeg',
          quality
        )
      }

      tryCompression(0)
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image for compression'))
    }
    img.src = objectUrl
  })
}

interface ScannedCard {
  file: File
  preview: string
  status: 'pending' | 'processing' | 'success' | 'error'
  error?: string
  extractedData?: any
}

interface ScanCuppingCardsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId?: string
  onScoresSubmitted?: () => void
}

export function ScanCuppingCardsDialog({
  open,
  onOpenChange,
  sessionId,
  onScoresSubmitted,
}: ScanCuppingCardsDialogProps) {
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [showValidation, setShowValidation] = useState(false)

  // Handle file drops
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newCards: ScannedCard[] = acceptedFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
    }))
    setScannedCards((prev) => [...prev, ...newCards])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.heic', '.heif'],
    },
    multiple: true,
  })

  // Remove a scanned card
  const removeCard = (index: number) => {
    setScannedCards((prev) => {
      const newCards = [...prev]
      URL.revokeObjectURL(newCards[index].preview)
      newCards.splice(index, 1)
      return newCards
    })
  }

  // Process all scanned cards through OCR
  const processCards = async () => {
    setIsProcessing(true)

    for (let i = 0; i < scannedCards.length; i++) {
      const card = scannedCards[i]
      if (card.status !== 'pending') continue

      // Update status to processing
      setScannedCards((prev) => {
        const updated = [...prev]
        updated[i] = { ...updated[i], status: 'processing' }
        return updated
      })

      try {
        // Compress image before uploading (handles large iPhone photos)
        console.log(`Processing card ${i + 1}: Original size ${(card.file.size / 1024 / 1024).toFixed(2)}MB`)
        const compressedFile = await compressImage(card.file)
        console.log(`Compressed size: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`)

        // Create FormData with the compressed image
        const formData = new FormData()
        formData.append('image', compressedFile)
        if (sessionId) {
          formData.append('session_id', sessionId)
        }

        // Call OCR API
        const response = await fetch('/api/cupping/ocr/process-card', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to process card: ${response.statusText}`)
        }

        const data = await response.json()

        // Update status to success
        setScannedCards((prev) => {
          const updated = [...prev]
          updated[i] = {
            ...updated[i],
            status: 'success',
            extractedData: data,
          }
          return updated
        })
      } catch (error) {
        console.error('Error processing card:', error)
        // Update status to error
        setScannedCards((prev) => {
          const updated = [...prev]
          updated[i] = {
            ...updated[i],
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          }
          return updated
        })
      }
    }

    setIsProcessing(false)
  }

  // Clean up preview URLs when dialog closes
  const handleClose = () => {
    scannedCards.forEach((card) => URL.revokeObjectURL(card.preview))
    setScannedCards([])
    onOpenChange(false)
  }

  const hasCards = scannedCards.length > 0
  const allProcessed = scannedCards.every((card) => card.status !== 'pending')
  const hasErrors = scannedCards.some((card) => card.status === 'error')
  const allSuccess = scannedCards.every((card) => card.status === 'success')

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Scan Cupping Cards</DialogTitle>
          <DialogDescription>
            Upload images of filled cupping cards for OCR processing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Upload Area */}
          {!isProcessing && (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-10 w-10 text-muted-foreground" />
                {isDragActive ? (
                  <p className="text-sm text-muted-foreground">
                    Drop the images here...
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Drag and drop cupping card images, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supports PNG, JPG, HEIC (iPhone photos)
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Scanned Cards Preview */}
          {hasCards && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Scanned Cards: {scannedCards.length}
              </Label>
              <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto rounded-md border p-3">
                {scannedCards.map((card, index) => (
                  <div
                    key={index}
                    className="relative group rounded-lg border overflow-hidden"
                  >
                    {/* Image Preview */}
                    <div className="relative aspect-[3/2] bg-muted">
                      <Image
                        src={card.preview}
                        alt={`Scanned card ${index + 1}`}
                        fill
                        className="object-cover"
                      />
                    </div>

                    {/* Status Badge */}
                    <div className="absolute top-2 left-2">
                      {card.status === 'pending' && (
                        <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <FileImage className="h-3 w-3" />
                          Ready
                        </div>
                      )}
                      {card.status === 'processing' && (
                        <div className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processing
                        </div>
                      )}
                      {card.status === 'success' && (
                        <div className="bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Complete
                        </div>
                      )}
                      {card.status === 'error' && (
                        <div className="bg-red-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Error
                        </div>
                      )}
                    </div>

                    {/* Remove Button */}
                    {card.status === 'pending' && !isProcessing && (
                      <button
                        onClick={() => removeCard(index)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}

                    {/* Error Message */}
                    {card.status === 'error' && card.error && (
                      <div className="absolute bottom-0 left-0 right-0 bg-red-500/90 text-white text-xs p-2">
                        {card.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Processing Info */}
          {isProcessing && (
            <div className="rounded-md border p-4 bg-muted/50">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium">Processing cards...</p>
                  <p className="text-xs text-muted-foreground">
                    Detecting QR codes and extracting handwritten scores
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {allSuccess && allProcessed && (
            <div className="rounded-md border border-green-500/50 bg-green-500/10 p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    All cards processed successfully
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500">
                    Click &ldquo;Review & Submit&rdquo; to validate the extracted scores
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Summary */}
          {hasErrors && allProcessed && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Some cards failed to process
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-500">
                    Remove failed cards or try uploading them again
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          {!allProcessed && hasCards && (
            <Button onClick={processCards} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Process ${scannedCards.length} Card${scannedCards.length !== 1 ? 's' : ''}`
              )}
            </Button>
          )}
          {allSuccess && (
            <Button
              onClick={() => {
                setShowValidation(true)
              }}
            >
              Review & Submit Scores
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* OCR Validation Dialog */}
      <OCRValidationDialog
        open={showValidation}
        onOpenChange={setShowValidation}
        extractedCards={scannedCards
          .filter((card) => card.status === 'success' && card.extractedData)
          .map((card) => ({
            imagePreview: card.preview,
            ...card.extractedData,
          }))}
        onSubmit={async (validatedData) => {
          // TODO: Submit validated scores to database
          console.log('Submitting validated scores:', validatedData)

          // Call the submission API
          const response = await fetch('/api/cupping/scores/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scores: validatedData }),
          })

          if (response.ok) {
            // Success - close both dialogs and notify parent
            setShowValidation(false)
            handleClose()
            onScoresSubmitted?.()
          } else {
            throw new Error('Failed to submit scores')
          }
        }}
      />
    </Dialog>
  )
}

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
import { supabase } from '@/lib/supabase'

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

      let storagePath: string | null = null

      try {
        // Upload image to Supabase Storage for URL-based OCR processing
        // This bypasses Vercel's 4.5MB body limit and allows full resolution images
        const fileExt = card.file.name.split('.').pop() || 'jpg'
        storagePath = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

        console.log(`Uploading image to storage: ${storagePath} (${(card.file.size / 1024 / 1024).toFixed(2)}MB)`)

        const { error: uploadError } = await supabase.storage
          .from('ocr-temp')
          .upload(storagePath, card.file, {
            cacheControl: '300', // 5 minute cache
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Failed to upload image: ${uploadError.message}`)
        }

        // Get public URL for the uploaded image
        const { data: urlData } = supabase.storage
          .from('ocr-temp')
          .getPublicUrl(storagePath)

        const imageUrl = urlData.publicUrl
        console.log(`Image uploaded, calling OCR API with URL: ${imageUrl}`)

        // Call OCR API with image URL (JSON body instead of FormData)
        const response = await fetch('/api/cupping/ocr/process-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            storage_path: storagePath,
            session_id: sessionId,
          }),
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

        // Clean up temp image after successful processing
        if (storagePath) {
          supabase.storage.from('ocr-temp').remove([storagePath]).catch(console.error)
        }
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

        // Clean up temp image on error too
        if (storagePath) {
          supabase.storage.from('ocr-temp').remove([storagePath]).catch(console.error)
        }
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

                    {/* Remove Button - show for pending and error cards */}
                    {(card.status === 'pending' || card.status === 'error') && !isProcessing && (
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

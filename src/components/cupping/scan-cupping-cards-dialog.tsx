'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X, Loader2, CheckCircle2, AlertCircle, Camera } from 'lucide-react'
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
  const [isMobile, setIsMobile] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const thumbnailsRef = useRef<HTMLDivElement>(null)

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Auto-scroll thumbnails to show newest card
  useEffect(() => {
    if (thumbnailsRef.current && scannedCards.length > 0) {
      thumbnailsRef.current.scrollLeft = thumbnailsRef.current.scrollWidth
    }
  }, [scannedCards.length])

  // Handle file input
  const handleFiles = useCallback((files: File[]) => {
    const newCards: ScannedCard[] = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
    }))
    setScannedCards((prev) => [...prev, ...newCards])
  }, [])

  // Handle file drops (desktop)
  const onDrop = useCallback((acceptedFiles: File[]) => {
    handleFiles(acceptedFiles)
  }, [handleFiles])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.heic', '.heif'],
    },
    multiple: true,
    noClick: isMobile, // Disable click on mobile - we use our own button
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

      setScannedCards((prev) => {
        const updated = [...prev]
        updated[i] = { ...updated[i], status: 'processing' }
        return updated
      })

      let storagePath: string | null = null

      try {
        const fileExt = card.file.name.split('.').pop() || 'jpg'
        storagePath = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('ocr-temp')
          .upload(storagePath, card.file, {
            cacheControl: '300',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Failed to upload image: ${uploadError.message}`)
        }

        const { data: urlData } = supabase.storage
          .from('ocr-temp')
          .getPublicUrl(storagePath)

        const response = await fetch('/api/cupping/ocr/process-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: urlData.publicUrl,
            storage_path: storagePath,
            session_id: sessionId,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to process card: ${response.statusText}`)
        }

        const data = await response.json()

        setScannedCards((prev) => {
          const updated = [...prev]
          updated[i] = { ...updated[i], status: 'success', extractedData: data }
          return updated
        })

        if (storagePath) {
          supabase.storage.from('ocr-temp').remove([storagePath]).catch(console.error)
        }
      } catch (error) {
        console.error('Error processing card:', error)
        setScannedCards((prev) => {
          const updated = [...prev]
          updated[i] = {
            ...updated[i],
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          }
          return updated
        })

        if (storagePath) {
          supabase.storage.from('ocr-temp').remove([storagePath]).catch(console.error)
        }
      }
    }

    setIsProcessing(false)
  }

  const handleClose = () => {
    scannedCards.forEach((card) => URL.revokeObjectURL(card.preview))
    setScannedCards([])
    onOpenChange(false)
  }

  const hasCards = scannedCards.length > 0
  const pendingCount = scannedCards.filter((c) => c.status === 'pending').length
  const successCount = scannedCards.filter((c) => c.status === 'success').length
  const errorCount = scannedCards.filter((c) => c.status === 'error').length
  const allProcessed = pendingCount === 0 && hasCards
  const allSuccess = successCount === scannedCards.length && hasCards

  // Mobile-optimized full-screen layout
  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 p-0 rounded-none border-0 flex flex-col bg-black">
          {/* Hidden camera input */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files
              if (files && files.length > 0) {
                handleFiles(Array.from(files))
              }
              e.target.value = ''
            }}
          />

          {/* Header - minimal */}
          <div className="flex items-center justify-between p-3 bg-black/80 text-white">
            <button onClick={handleClose} className="p-2 -m-2">
              <X className="h-6 w-6" />
            </button>
            <span className="text-sm font-medium">
              {hasCards ? `${scannedCards.length} card${scannedCards.length !== 1 ? 's' : ''}` : 'Scan Cards'}
            </span>
            <div className="w-10" /> {/* Spacer for centering */}
          </div>

          {/* Main area - camera viewfinder style */}
          <div className="flex-1 flex flex-col justify-center items-center bg-black relative overflow-hidden">
            {/* Camera frame guide */}
            <div className="absolute inset-8 border-2 border-white/30 rounded-lg pointer-events-none" />
            <div className="absolute inset-8 flex items-center justify-center">
              <Camera className="h-20 w-20 text-white/20" />
            </div>

            {/* Status messages */}
            {isProcessing && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10">
                <Loader2 className="h-12 w-12 animate-spin text-white mb-4" />
                <p className="text-white text-lg">Processing cards...</p>
                <p className="text-white/60 text-sm mt-2">
                  {successCount} of {scannedCards.length} complete
                </p>
              </div>
            )}

            {allProcessed && !isProcessing && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10 px-6">
                {allSuccess ? (
                  <>
                    <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                    <p className="text-white text-lg text-center">All cards processed!</p>
                    <p className="text-white/60 text-sm mt-2 text-center">
                      Tap below to review and submit scores
                    </p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-16 w-16 text-yellow-500 mb-4" />
                    <p className="text-white text-lg text-center">
                      {successCount} success, {errorCount} failed
                    </p>
                    <p className="text-white/60 text-sm mt-2 text-center">
                      Tap a failed card to remove it
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Thumbnail strip - horizontal scroll */}
          {hasCards && (
            <div className="bg-black/90 px-2 py-2">
              <div
                ref={thumbnailsRef}
                className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
                style={{ scrollBehavior: 'smooth' }}
              >
                {scannedCards.map((card, index) => (
                  <div
                    key={index}
                    className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2"
                    style={{
                      borderColor:
                        card.status === 'success' ? '#22c55e' :
                        card.status === 'error' ? '#ef4444' :
                        card.status === 'processing' ? '#eab308' : '#ffffff50'
                    }}
                    onClick={() => {
                      if (card.status === 'error' || card.status === 'pending') {
                        removeCard(index)
                      }
                    }}
                  >
                    <Image
                      src={card.preview}
                      alt={`Card ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                    {card.status === 'processing' && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                      </div>
                    )}
                    {card.status === 'success' && (
                      <div className="absolute top-0.5 right-0.5">
                        <CheckCircle2 className="h-4 w-4 text-green-500 drop-shadow-lg" />
                      </div>
                    )}
                    {card.status === 'error' && (
                      <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center">
                        <X className="h-5 w-5 text-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom action area - thumb-friendly */}
          <div className="bg-black p-4 pb-8 safe-area-inset-bottom">
            {!allProcessed ? (
              <div className="flex gap-3">
                {/* Capture button - large and centered */}
                <Button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isProcessing}
                  className="flex-1 h-14 text-lg bg-white text-black hover:bg-white/90 rounded-full"
                >
                  <Camera className="h-6 w-6 mr-2" />
                  {hasCards ? 'Capture More' : 'Capture Photo'}
                </Button>

                {/* Process button - only show when cards exist */}
                {hasCards && pendingCount > 0 && (
                  <Button
                    onClick={processCards}
                    disabled={isProcessing}
                    className="flex-1 h-14 text-lg bg-green-600 hover:bg-green-700 rounded-full"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      `Process ${pendingCount}`
                    )}
                  </Button>
                )}
              </div>
            ) : (
              /* Review button - full width when all processed */
              <Button
                onClick={() => setShowValidation(true)}
                disabled={!allSuccess}
                className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 rounded-full"
              >
                <CheckCircle2 className="h-6 w-6 mr-2" />
                Review & Submit {successCount} Card{successCount !== 1 ? 's' : ''}
              </Button>
            )}
          </div>

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
              const response = await fetch('/api/cupping/scores/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scores: validatedData, entryMethod: 'ocr' }),
              })

              if (response.ok) {
                setShowValidation(false)
                handleClose()
                onScoresSubmitted?.()
              } else {
                throw new Error('Failed to submit scores')
              }
            }}
          />
        </DialogContent>
      </Dialog>
    )
  }

  // Desktop layout (unchanged from before)
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        {/* Hidden camera input */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files
            if (files && files.length > 0) {
              handleFiles(Array.from(files))
            }
            e.target.value = ''
          }}
        />

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Scan Cupping Cards</h2>
            <p className="text-sm text-muted-foreground">
              Take photos of completed cupping cards for automatic score extraction
            </p>
          </div>

          {/* Drag and drop area */}
          {!isProcessing && (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <input {...getInputProps()} />
              <Camera className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">
                {isDragActive ? 'Drop images here...' : 'Drag & drop cupping card images'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                or click to select files
              </p>
            </div>
          )}

          {/* Cards grid */}
          {hasCards && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {scannedCards.length} card{scannedCards.length !== 1 ? 's' : ''} captured
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto p-1">
                {scannedCards.map((card, index) => (
                  <div
                    key={index}
                    className="relative aspect-[3/2] rounded-lg overflow-hidden border group"
                  >
                    <Image
                      src={card.preview}
                      alt={`Card ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute top-2 left-2">
                      {card.status === 'pending' && (
                        <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                          Ready
                        </span>
                      )}
                      {card.status === 'processing' && (
                        <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processing
                        </span>
                      )}
                      {card.status === 'success' && (
                        <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Done
                        </span>
                      )}
                      {card.status === 'error' && (
                        <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Error
                        </span>
                      )}
                    </div>
                    {(card.status === 'pending' || card.status === 'error') && !isProcessing && (
                      <button
                        onClick={() => removeCard(index)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {card.status === 'error' && card.error && (
                      <div className="absolute bottom-0 left-0 right-0 bg-red-500/90 text-white text-xs p-2 truncate">
                        {card.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <Loader2 className="h-5 w-5 animate-spin" />
              <div>
                <p className="text-sm font-medium">Processing cards...</p>
                <p className="text-xs text-muted-foreground">
                  {successCount} of {scannedCards.length} complete
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          {hasCards && pendingCount > 0 && (
            <Button onClick={processCards} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Process ${pendingCount} Card${pendingCount !== 1 ? 's' : ''}`
              )}
            </Button>
          )}
          {allSuccess && (
            <Button onClick={() => setShowValidation(true)}>
              Review & Submit
            </Button>
          )}
        </div>

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
            const response = await fetch('/api/cupping/scores/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scores: validatedData, entryMethod: 'ocr' }),
            })

            if (response.ok) {
              setShowValidation(false)
              handleClose()
              onScoresSubmitted?.()
            } else {
              throw new Error('Failed to submit scores')
            }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

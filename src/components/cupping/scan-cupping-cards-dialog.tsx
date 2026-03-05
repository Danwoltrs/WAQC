'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogTitle,
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
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
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

  // Initialize camera when dialog opens on mobile
  useEffect(() => {
    if (!open) {
      // Clean up when closing
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      setCameraReady(false)
      setCameraError(null)
      return
    }

    if (!isMobile) return

    // Start camera on mobile
    const startCamera = async () => {
      try {
        setCameraError(null)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            setCameraReady(true)
          }
        }
      } catch (error) {
        console.error('Error accessing camera:', error)
        setCameraError('Could not access camera. Please allow camera permissions.')
      }
    }

    startCamera()

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }, [open, isMobile])

  // Process a single card in background
  const processCardInBackground = useCallback(async (cardIndex: number, card: ScannedCard) => {
    let storagePath: string | null = null

    try {
      // Update status to processing
      setScannedCards((prev) => {
        const updated = [...prev]
        if (updated[cardIndex]) {
          updated[cardIndex] = { ...updated[cardIndex], status: 'processing' }
        }
        return updated
      })

      // Upload image to Supabase Storage
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

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('ocr-temp')
        .getPublicUrl(storagePath)

      // Call OCR API
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
        throw new Error(errorData.error || `Failed to process card`)
      }

      const data = await response.json()

      // Update status to success
      setScannedCards((prev) => {
        const updated = [...prev]
        if (updated[cardIndex]) {
          updated[cardIndex] = {
            ...updated[cardIndex],
            status: 'success',
            extractedData: data,
          }
        }
        return updated
      })

      // Clean up temp image
      if (storagePath) {
        supabase.storage.from('ocr-temp').remove([storagePath]).catch(console.error)
      }
    } catch (error) {
      console.error('Error processing card:', error)
      setScannedCards((prev) => {
        const updated = [...prev]
        if (updated[cardIndex]) {
          updated[cardIndex] = {
            ...updated[cardIndex],
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
        return updated
      })

      if (storagePath) {
        supabase.storage.from('ocr-temp').remove([storagePath]).catch(console.error)
      }
    }
  }, [sessionId])

  // Capture photo from camera
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !cameraReady) return

    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(videoRef.current, 0, 0)

    canvas.toBlob((blob) => {
      if (!blob) return

      const file = new File([blob], `cupping-card-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const preview = URL.createObjectURL(blob)

      const newCard: ScannedCard = {
        file,
        preview,
        status: 'pending',
      }

      setScannedCards((prev) => {
        const newCards = [...prev, newCard]
        // Start processing immediately in background
        const newIndex = newCards.length - 1
        setTimeout(() => processCardInBackground(newIndex, newCard), 100)
        return newCards
      })
    }, 'image/jpeg', 0.95)
  }, [cameraReady, processCardInBackground])

  // Handle file input (desktop)
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

  // Process all pending cards (for desktop)
  const processAllCards = async () => {
    setIsProcessing(true)

    for (let i = 0; i < scannedCards.length; i++) {
      const card = scannedCards[i]
      if (card.status !== 'pending') continue
      await processCardInBackground(i, card)
    }

    setIsProcessing(false)
  }

  const handleClose = () => {
    scannedCards.forEach((card) => URL.revokeObjectURL(card.preview))
    setScannedCards([])
    setCameraReady(false)
    setCameraError(null)
    onOpenChange(false)
  }

  const hasCards = scannedCards.length > 0
  const pendingCards = scannedCards.filter(c => c.status === 'pending').length
  const processingCards = scannedCards.filter(c => c.status === 'processing').length
  const successCards = scannedCards.filter(c => c.status === 'success')
  const allProcessed = scannedCards.length > 0 && pendingCards === 0 && processingCards === 0
  const hasErrors = scannedCards.some((card) => card.status === 'error')
  const allSuccess = scannedCards.length > 0 && scannedCards.every((card) => card.status === 'success')

  // Mobile layout with live camera
  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="fixed inset-0 w-full h-full max-w-none max-h-none m-0 p-0 rounded-none border-0 translate-x-0 translate-y-0 left-0 top-0 flex flex-col bg-black [&>button]:hidden"
          style={{ transform: 'none' }}
        >
          <DialogTitle className="sr-only">Scan Cupping Cards</DialogTitle>
          {/* Header with safe area */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-black text-white z-10"
            style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
          >
            <button onClick={handleClose} className="p-2 -ml-2">
              <X className="h-6 w-6" />
            </button>
            <span className="text-base font-medium">
              {hasCards ? `${scannedCards.length} card${scannedCards.length !== 1 ? 's' : ''}` : 'Scan Cards'}
            </span>
            <div className="w-10" />
          </div>

          {/* Camera area - landscape rectangle for cupping cards */}
          <div className="flex-1 flex flex-col bg-black relative">
            {/* Video feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Dark vignette overlay - creates focus on the viewfinder */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Top darkened area */}
              <div
                className="absolute top-0 left-0 right-0 bg-black/70"
                style={{ height: 'calc(50% - min(30vw, 133px))' }}
              />
              {/* Bottom darkened area */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-black/70"
                style={{ height: 'calc(50% - min(30vw, 133px))' }}
              />
              {/* Left darkened area */}
              <div
                className="absolute left-0 bg-black/70"
                style={{
                  top: 'calc(50% - min(30vw, 133px))',
                  bottom: 'calc(50% - min(30vw, 133px))',
                  width: 'calc(50% - min(45vw, 200px))'
                }}
              />
              {/* Right darkened area */}
              <div
                className="absolute right-0 bg-black/70"
                style={{
                  top: 'calc(50% - min(30vw, 133px))',
                  bottom: 'calc(50% - min(30vw, 133px))',
                  width: 'calc(50% - min(45vw, 200px))'
                }}
              />
            </div>

            {/* Landscape viewfinder overlay for cupping card shape */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="relative border-2 border-white/80"
                style={{
                  width: 'min(90vw, 400px)',
                  height: 'min(60vw, 267px)',
                  aspectRatio: '3/2'
                }}
              >
                {/* Corner guides */}
                <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-white" />
                <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-white" />
                <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-white" />
                <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-white" />
              </div>
            </div>

            {/* Camera status overlay */}
            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="text-center text-white">
                  <Loader2 className="h-10 w-10 animate-spin mx-auto mb-3" />
                  <p>Starting camera...</p>
                </div>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="text-center text-white px-6">
                  <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400" />
                  <p className="text-sm">{cameraError}</p>
                </div>
              </div>
            )}

            {/* Processing indicator overlay */}
            {processingCards > 0 && (
              <div className="absolute top-4 left-4 bg-yellow-500 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Processing {processingCards}...
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {hasCards && (
            <div className="bg-black/95 px-3 py-2 border-t border-white/10">
              <div
                ref={thumbnailsRef}
                className="flex gap-2 overflow-x-auto scrollbar-hide"
              >
                {scannedCards.map((card, index) => (
                  <div
                    key={index}
                    className={cn(
                      "relative flex-shrink-0 w-14 h-14 rounded-md overflow-hidden",
                      card.status === 'success' && "ring-2 ring-green-500",
                      card.status === 'error' && "ring-2 ring-red-500 cursor-pointer",
                      card.status === 'processing' && "ring-2 ring-yellow-500"
                    )}
                    onClick={() => {
                      // Allow removing failed cards by tapping
                      if (card.status === 'error') {
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
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="h-4 w-4 text-white animate-spin" />
                      </div>
                    )}
                    {card.status === 'success' && (
                      <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      </div>
                    )}
                    {card.status === 'error' && (
                      <div className="absolute inset-0 bg-red-500/40 flex items-center justify-center">
                        <X className="h-5 w-5 text-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom action area with safe area */}
          <div
            className="bg-black px-4 py-3"
            style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
          >
            <div className="flex gap-3">
              {/* Always show Capture button */}
              <Button
                onClick={capturePhoto}
                disabled={!cameraReady}
                className={cn(
                  "h-12 text-base rounded-full font-medium",
                  successCards.length > 0
                    ? "flex-1 bg-white/20 text-white hover:bg-white/30 border border-white/40"
                    : "flex-1 bg-white text-black hover:bg-white/90"
                )}
              >
                <Camera className="mr-2 h-5 w-5" />
                {successCards.length > 0 ? 'Scan More' : 'Capture'}
              </Button>

              {/* Show Review button when there are successful cards */}
              {successCards.length > 0 && (
                <Button
                  onClick={() => setShowValidation(true)}
                  className="flex-1 h-12 text-base bg-green-600 hover:bg-green-700 rounded-full font-medium"
                >
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Review ({successCards.length})
                </Button>
              )}
            </div>

            {/* Hint text for failed cards */}
            {hasErrors && (
              <p className="text-center text-xs text-white/60 mt-2">
                Tap failed cards to remove them
              </p>
            )}
          </div>
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
      </Dialog>
    )
  }

  // Desktop layout
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <div className="space-y-4">
          <div>
            <DialogTitle className="text-lg font-semibold">Scan Cupping Cards</DialogTitle>
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
                  {successCards.length} of {scannedCards.length} complete
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
          {hasCards && pendingCards > 0 && (
            <Button onClick={processAllCards} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Process ${pendingCards} Card${pendingCards !== 1 ? 's' : ''}`
              )}
            </Button>
          )}
          {allSuccess && successCards.length > 0 && (
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

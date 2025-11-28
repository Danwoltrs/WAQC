'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
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
import { Upload, X, FileImage, Loader2, CheckCircle2, AlertCircle, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OCRValidationDialog } from '@/components/cupping/ocr-validation-dialog'
import { supabase } from '@/lib/supabase'

interface ScannedCard {
  file: File
  preview: string
  status: 'pending' | 'processing' | 'success' | 'error'
  error?: string
  extractedData?: any
}

interface DashboardScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScoresSubmitted?: () => void
}

export function DashboardScanDialog({
  open,
  onOpenChange,
  onScoresSubmitted,
}: DashboardScanDialogProps) {
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const thumbnailsRef = useRef<HTMLDivElement>(null)

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Auto-scroll thumbnails when new card added
  useEffect(() => {
    if (thumbnailsRef.current && scannedCards.length > 0) {
      thumbnailsRef.current.scrollLeft = thumbnailsRef.current.scrollWidth
    }
  }, [scannedCards.length])

  // Initialize camera stream
  useEffect(() => {
    if (showCamera && videoRef.current) {
      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        })
        .then((stream) => {
          streamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch((error) => {
          console.error('Error accessing camera:', error)
          setShowCamera(false)
        })
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }, [showCamera])

  // Auto-open camera on mobile when dialog opens
  useEffect(() => {
    if (open && isMobile) {
      setShowCamera(true)
    }
  }, [open, isMobile])

  // Capture photo from camera
  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return

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

      setScannedCards((prev) => [...prev, {
        file,
        preview,
        status: 'pending',
      }])

      // On mobile, keep camera active for continuous scanning
      // On desktop, close camera after capture
      if (!isMobile) {
        setShowCamera(false)
      }
    }, 'image/jpeg', 0.95)
  }, [isMobile])

  // Handle files from input or dropzone
  const handleFiles = useCallback((files: File[]) => {
    const newCards: ScannedCard[] = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
    }))
    setScannedCards((prev) => [...prev, ...newCards])
  }, [])

  // Handle file drops
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
        const fileExt = card.file.name.split('.').pop() || 'jpg'
        storagePath = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

        console.log(`Uploading image to storage: ${storagePath} (${(card.file.size / 1024 / 1024).toFixed(2)}MB)`)

        const { error: uploadError } = await supabase.storage
          .from('ocr-temp')
          .upload(storagePath, card.file, {
            cacheControl: '300',
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

        // Call OCR API with image URL
        const response = await fetch('/api/cupping/ocr/process-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            storage_path: storagePath,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to process card: ${response.statusText}`)
        }

        const data = await response.json()

        // Check if sample already scanned
        if (data.sampleId) {
          const checkResponse = await fetch(`/api/cupping/check-edit-permission?sampleId=${data.sampleId}`)
          if (checkResponse.ok) {
            const permission = await checkResponse.json()
            if (permission.reason === 'locked_after_scan') {
              throw new Error('This sample has already been scanned and cannot be scanned again')
            }
          }
        }

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
    setShowCamera(false)
    onOpenChange(false)
  }

  const hasCards = scannedCards.length > 0
  const pendingCards = scannedCards.filter(c => c.status === 'pending').length
  const allProcessed = scannedCards.length > 0 && scannedCards.every((card) => card.status !== 'pending')
  const hasErrors = scannedCards.some((card) => card.status === 'error')
  const successCards = scannedCards.filter((card) => card.status === 'success')
  const allSuccess = scannedCards.length > 0 && scannedCards.every((card) => card.status === 'success')

  // Mobile-optimized full-screen layout
  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 p-0 rounded-none border-0 flex flex-col bg-black [&>button]:hidden">
          {/* Header - minimal */}
          <div className="flex items-center justify-between p-3 bg-black/80 text-white">
            <button onClick={handleClose} className="p-2">
              <X className="h-6 w-6" />
            </button>
            <span className="text-base font-medium">
              {hasCards ? `${scannedCards.length} card${scannedCards.length !== 1 ? 's' : ''}` : 'Scan Cards'}
            </span>
            <div className="w-10" /> {/* Spacer for centering */}
          </div>

          {/* Main area - camera viewfinder style */}
          <div className="flex-1 flex flex-col justify-center items-center bg-black relative overflow-hidden">
            {showCamera ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Viewfinder corners */}
                <div className="absolute inset-8 pointer-events-none">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/70 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/70 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/70 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/70 rounded-br-lg" />
                </div>
              </>
            ) : (
              <>
                {/* Viewfinder placeholder */}
                <div className="absolute inset-8 border-2 border-white/30 rounded-lg pointer-events-none" />
                <Camera className="h-20 w-20 text-white/20" />
                <p className="text-white/40 mt-4 text-sm">Camera paused</p>
              </>
            )}

            {/* Processing overlay */}
            {isProcessing && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 text-white animate-spin mb-4" />
                <p className="text-white text-lg">Processing cards...</p>
                <p className="text-white/60 text-sm mt-1">Extracting scores with AI</p>
              </div>
            )}

            {/* Success overlay */}
            {allSuccess && allProcessed && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center">
                <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                <p className="text-white text-lg">All cards processed</p>
                <p className="text-white/60 text-sm mt-1">Ready to review and submit</p>
              </div>
            )}
          </div>

          {/* Thumbnail strip - horizontal scroll */}
          {hasCards && (
            <div className="bg-black/90 px-2 py-2">
              <div
                ref={thumbnailsRef}
                className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
              >
                {scannedCards.map((card, index) => (
                  <div
                    key={index}
                    className={cn(
                      "relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden",
                      card.status === 'success' && "ring-2 ring-green-500",
                      card.status === 'error' && "ring-2 ring-red-500",
                      card.status === 'processing' && "ring-2 ring-yellow-500"
                    )}
                  >
                    <Image
                      src={card.preview}
                      alt={`Card ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                    {card.status === 'processing' && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="h-4 w-4 text-white animate-spin" />
                      </div>
                    )}
                    {card.status === 'success' && (
                      <div className="absolute top-1 right-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </div>
                    )}
                    {card.status === 'error' && (
                      <div className="absolute top-1 right-1">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      </div>
                    )}
                    {card.status === 'pending' && !isProcessing && (
                      <button
                        onClick={() => removeCard(index)}
                        className="absolute top-1 right-1 bg-red-500 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
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
                {showCamera ? (
                  <Button
                    onClick={capturePhoto}
                    className="flex-1 h-14 text-lg bg-white text-black hover:bg-white/90 rounded-full"
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    Capture Photo
                  </Button>
                ) : (
                  <Button
                    onClick={() => setShowCamera(true)}
                    className="flex-1 h-14 text-lg bg-white text-black hover:bg-white/90 rounded-full"
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    Open Camera
                  </Button>
                )}
                {hasCards && pendingCards > 0 && (
                  <Button
                    onClick={processCards}
                    disabled={isProcessing}
                    className="flex-1 h-14 text-lg bg-green-600 hover:bg-green-700 rounded-full"
                  >
                    {isProcessing ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                    )}
                    Process {pendingCards}
                  </Button>
                )}
              </div>
            ) : (
              <Button
                onClick={() => setShowValidation(true)}
                className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 rounded-full"
              >
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Review & Submit ({successCards.length})
              </Button>
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
            console.log('Submitting validated scores:', validatedData)

            const response = await fetch('/api/cupping/scores/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scores: validatedData,
                entryMethod: 'ocr'
              }),
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
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Scan Cupping Cards</DialogTitle>
          <DialogDescription>
            Upload images or use your camera to scan filled cupping cards
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Camera View */}
          {showCamera && (
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={capturePhoto} className="flex-1">
                  <Camera className="mr-2 h-4 w-4" />
                  Capture Photo
                </Button>
                <Button variant="outline" onClick={() => setShowCamera(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Upload Area - Desktop or when camera not active */}
          {!showCamera && !isProcessing && (
            <>
              <div className="flex gap-2 mb-4">
                <Button
                  variant="outline"
                  onClick={() => setShowCamera(true)}
                  className="flex-1"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Use Camera
                </Button>
              </div>

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
            </>
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
          console.log('Submitting validated scores:', validatedData)

          const response = await fetch('/api/cupping/scores/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scores: validatedData,
              entryMethod: 'ocr'
            }),
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

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

// Maximum file size after compression (4MB to stay under Vercel's 4.5MB limit)
const MAX_FILE_SIZE = 4 * 1024 * 1024
// Maximum image dimension - keep high for OCR quality
const MAX_DIMENSION = 2400
// Minimum quality to maintain OCR readability
const MIN_QUALITY = 0.70

/**
 * Compress an image file for OCR processing
 */
async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_FILE_SIZE && !file.type.includes('heic')) {
    return file
  }

  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      let { width, height } = img
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
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      const qualities = [0.92, 0.88, 0.82, 0.76, MIN_QUALITY]
      const tryCompression = (i: number) => {
        const quality = i < qualities.length ? qualities[i] : MIN_QUALITY
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Compression failed'))
              return
            }
            if (blob.size <= MAX_FILE_SIZE || i >= qualities.length - 1) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
            } else {
              tryCompression(i + 1)
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
      reject(new Error('Failed to load image'))
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

interface DashboardScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScoresSubmitted?: () => void
}

// Device detection utilities
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

const hasCamera = async () => {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) return false
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.some(device => device.kind === 'videoinput')
  } catch {
    return false
  }
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
  const [cameraAvailable, setCameraAvailable] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Detect device type and camera availability on mount
  useEffect(() => {
    const detectDevice = async () => {
      const mobile = isMobileDevice()
      setIsMobile(mobile)

      const camera = await hasCamera()
      setCameraAvailable(camera)

      // Auto-open camera on mobile/iPad
      if (mobile && camera && open) {
        setShowCamera(true)
      }
    }

    if (open) {
      detectDevice()
    }
  }, [open])

  // Initialize camera stream
  useEffect(() => {
    if (showCamera && videoRef.current) {
      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: 'environment' // Use back camera on mobile
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

    // Clean up stream when camera is closed
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }, [showCamera])

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

      // Close camera after capture
      setShowCamera(false)
    }, 'image/jpeg', 0.95)
  }, [])

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
        const compressedFile = await compressImage(card.file)

        // Create FormData with the compressed image
        const formData = new FormData()
        formData.append('image', compressedFile)

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
    setShowCamera(false)
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
            {isMobile
              ? 'Use your camera to scan filled cupping cards'
              : 'Upload images or use your camera to scan filled cupping cards'}
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
              {/* Desktop: Show both upload and camera options */}
              {!isMobile && cameraAvailable && (
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
              )}

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
          // Submit validated scores with entry_method='ocr' and lock the sample
          console.log('Submitting validated scores:', validatedData)

          // Call the submission API with entry_method
          const response = await fetch('/api/cupping/scores/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scores: validatedData,
              entryMethod: 'ocr' // Mark as OCR entry
            }),
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

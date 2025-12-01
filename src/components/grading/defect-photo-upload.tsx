'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Camera, X, Upload, Loader2, Trash2, ZoomIn } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Photo {
  path: string
  url: string | null
  filename: string
}

interface DefectPhotoUploadProps {
  sampleId: string
  photos: Photo[]
  onPhotosChange: (photos: Photo[]) => void
  disabled?: boolean
}

export function DefectPhotoUpload({
  sampleId,
  photos,
  onPhotosChange,
  disabled = false
}: DefectPhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setUploading(true)

    try {
      for (const file of Array.from(files)) {
        // Validate file type
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          toast({
            title: 'Invalid file type',
            description: `${file.name} is not a valid image. Only JPEG, PNG, and WebP are allowed.`,
            variant: 'destructive'
          })
          continue
        }

        // Create form data - upload full resolution
        const formData = new FormData()
        formData.append('file', file, file.name)

        // Upload to API
        const response = await fetch(`/api/samples/${sampleId}/photos`, {
          method: 'POST',
          body: formData
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Upload failed')
        }

        const data = await response.json()

        // Add to photos list
        onPhotosChange([...photos, data.photo])

        toast({
          title: 'Photo uploaded',
          description: 'Defect photo has been saved successfully.'
        })
      }
    } catch (error: any) {
      console.error('Upload error:', error)
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload photo. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [sampleId, photos, onPhotosChange, toast])

  const handleDelete = useCallback(async (photo: Photo) => {
    if (!confirm('Are you sure you want to delete this photo?')) return

    setDeleting(photo.path)

    try {
      const response = await fetch(
        `/api/samples/${sampleId}/photos?path=${encodeURIComponent(photo.path)}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Delete failed')
      }

      // Remove from photos list
      onPhotosChange(photos.filter(p => p.path !== photo.path))

      toast({
        title: 'Photo deleted',
        description: 'The photo has been removed.'
      })
    } catch (error: any) {
      console.error('Delete error:', error)
      toast({
        title: 'Delete failed',
        description: error.message || 'Failed to delete photo. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setDeleting(null)
    }
  }, [sampleId, photos, onPhotosChange, toast])

  const handleCameraCapture = useCallback(() => {
    // Trigger file input with camera capture on mobile
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('capture', 'environment')
      fileInputRef.current.click()
    }
  }, [])

  const handleGallerySelect = useCallback(() => {
    // Trigger file input for gallery selection
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute('capture')
      fileInputRef.current.click()
    }
  }, [])

  return (
    <div className="space-y-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Upload buttons */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCameraCapture}
          disabled={disabled || uploading}
          className="flex-1"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Camera className="h-4 w-4 mr-2" />
          )}
          Camera
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGallerySelect}
          disabled={disabled || uploading}
          className="flex-1"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Gallery
        </Button>
      </div>

      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.path}
              className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
            >
              {photo.url ? (
                <img
                  src={photo.url}
                  alt="Defect photo"
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setSelectedPhoto(photo)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                  Loading...
                </div>
              )}

              {/* Overlay with actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSelectedPhoto(photo)}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleDelete(photo)}
                  disabled={deleting === photo.path}
                >
                  {deleting === photo.path ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {photos.length === 0 && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          No defect photos uploaded yet.
        </div>
      )}

      {/* Full-size photo dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Defect Photo</DialogTitle>
          </DialogHeader>
          {selectedPhoto?.url && (
            <div className="relative">
              <img
                src={selectedPhoto.url}
                alt="Defect photo full size"
                className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => {
                  handleDelete(selectedPhoto)
                  setSelectedPhoto(null)
                }}
                disabled={deleting === selectedPhoto.path}
              >
                {deleting === selectedPhoto.path ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { Camera, ImageIcon, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

/**
 * The sample photo: drop it on the box or pick a file on a desktop; on a
 * phone or tablet "Take photo" opens the camera. A picked photo shows as a
 * preview with Replace and Remove. The size limit is the form's, which
 * receives every file through `onFile`.
 */
export function PhotoDropZone({ file, onFile }: { file: File | null; onFile: (file: File | null) => void }) {
  const id = useId()
  const pickRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [touch, setTouch] = useState(false)

  // A coarse pointer (phone, tablet) gets the camera button.
  useEffect(() => {
    setTouch(typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    setPreviewFailed(false)
    if (!file || typeof URL.createObjectURL !== 'function') {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const take = (picked: File | undefined | null) => {
    if (!picked) return
    if (!picked.type.startsWith('image/')) {
      setNotice('That is not an image. Use a PNG, JPG or HEIC photo.')
      return
    }
    setNotice(null)
    onFile(picked)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setOver(false)
    take(e.dataTransfer.files?.[0])
  }

  const inputs = (
    <>
      <input
        ref={pickRef}
        id={`${id}-pick`}
        data-testid="photo-input"
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => { take(e.target.files?.[0]); e.target.value = '' }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => { take(e.target.files?.[0]); e.target.value = '' }}
      />
    </>
  )

  if (file) {
    return (
      <div className="overflow-hidden rounded-lg border">
        {inputs}
        <div className="flex items-center justify-center bg-muted/40">
          {preview && !previewFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Sample photo preview"
              className="max-h-56 w-full object-contain"
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <div className="flex h-32 flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
              <ImageIcon className="h-6 w-6" aria-hidden />
              No preview for this format
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <div className="min-w-0 text-xs">
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-muted-foreground">{formatSize(file.size)}</p>
          </div>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" onClick={() => (touch ? cameraRef : pickRef).current?.click()} className="h-7 px-2.5 text-xs">
              Replace
            </Button>
            <Button type="button" variant="ghost" onClick={() => onFile(null)} className="h-7 px-2.5 text-xs text-destructive hover:text-destructive">
              Remove
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {inputs}
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
          over ? 'border-primary bg-primary/5' : 'border-input',
        )}
      >
        <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
        <p className="text-sm">
          {touch ? 'Take a photo of the sample, or pick one' : 'Drop the sample photo here'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {touch && (
            <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()}>
              <Camera className="h-4 w-4" aria-hidden />
              Take photo
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => pickRef.current?.click()}>
            Choose file
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG or HEIC, up to 10 MB</p>
      </div>
      {notice && <p className="mt-1.5 text-xs text-destructive" role="alert">{notice}</p>}
    </div>
  )
}

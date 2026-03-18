'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'

interface SamplePhotoData {
  trackingNumber: string
  certificateNumber: string | null
  shipper: string | null
  origin: string | null
  photoUrls: string[]
  slug: string
}

export function SamplePhotoViewer({ data }: { data: SamplePhotoData }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const response = await fetch(data.photoUrls[currentIndex])
      const blob = await response.blob()

      // Create canvas to add metadata overlay
      const img = document.createElement('img')
      const objectUrl = URL.createObjectURL(blob)

      await new Promise<void>((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0)

          // Add metadata overlay at bottom
          const padding = 16
          const lineHeight = 24
          const lines: string[] = []
          if (data.certificateNumber) lines.push(`Certificate: ${data.certificateNumber}`)
          lines.push(`Sample: ${data.trackingNumber}`)
          if (data.shipper) lines.push(`Shipper: ${data.shipper}`)
          if (data.origin) lines.push(`Origin: ${data.origin}`)

          const overlayHeight = lines.length * lineHeight + padding * 2
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
          ctx.fillRect(0, img.height - overlayHeight, img.width, overlayHeight)

          ctx.fillStyle = '#FFFFFF'
          ctx.font = '16px Inter, sans-serif'
          lines.forEach((line, i) => {
            ctx.fillText(line, padding, img.height - overlayHeight + padding + (i + 1) * lineHeight - 6)
          })

          canvas.toBlob((downloadBlob) => {
            if (downloadBlob) {
              const url = URL.createObjectURL(downloadBlob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${data.certificateNumber || data.trackingNumber}_photo_${currentIndex + 1}.jpg`
              a.click()
              URL.revokeObjectURL(url)
            }
            resolve()
          }, 'image/jpeg', 0.95)

          URL.revokeObjectURL(objectUrl)
        }
        img.src = objectUrl
      })
    } catch (err) {
      console.error('Download failed:', err)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{data.trackingNumber}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
              {data.certificateNumber && <span>{data.certificateNumber}</span>}
              {data.shipper && <span>{data.shipper}</span>}
              {data.origin && <span>{data.origin}</span>}
            </div>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm"
          >
            <Download className="h-4 w-4" />
            {downloading ? 'Downloading...' : 'Download'}
          </button>
        </div>
      </header>

      {/* Photo */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="relative max-w-4xl w-full">
          <div className="relative aspect-[4/3] w-full bg-gray-100 rounded-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.photoUrls[currentIndex]}
              alt={`Sample photo ${currentIndex + 1} of ${data.trackingNumber}`}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Navigation arrows for multiple photos */}
          {data.photoUrls.length > 1 && (
            <>
              <button
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/90 rounded-full shadow disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setCurrentIndex(Math.min(data.photoUrls.length - 1, currentIndex + 1))}
                disabled={currentIndex === data.photoUrls.length - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/90 rounded-full shadow disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="text-center mt-3 text-sm text-gray-500">
                {currentIndex + 1} of {data.photoUrls.length}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-3 text-center text-xs text-gray-400">
        Wolthers &amp; Associates
      </footer>
    </div>
  )
}

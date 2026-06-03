'use client'

interface Props {
  sampleId: string
  available?: boolean
}

export function CertificatePreview({ sampleId, available = true }: Props) {
  if (!available) {
    return (
      <div className="flex h-full items-center justify-center rounded-[12px] border border-black/10 text-sm opacity-60 dark:border-white/15">
        No certificate available for this sample.
      </div>
    )
  }
  return (
    <iframe
      title="Certificate preview"
      src={`/api/samples/${sampleId}/certificate`}
      className="h-full min-h-[480px] w-full rounded-[12px] border border-black/10 bg-white dark:border-white/15"
    />
  )
}

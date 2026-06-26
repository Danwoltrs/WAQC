import { useEffect, useState } from 'react'

/** Fetch distinct processing methods once the overlay opens. Non-fatal on failure. */
export function useSampleVocabularies(open: boolean): { processingMethods: string[] } {
  const [processingMethods, setProcessingMethods] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    let active = true
    fetch('/api/samples/vocabularies')
      .then((r) => (r.ok ? r.json() : { processing_methods: [] }))
      .then((d) => {
        if (active) setProcessingMethods(Array.isArray(d.processing_methods) ? d.processing_methods : [])
      })
      .catch(() => {
        if (active) setProcessingMethods([])
      })
    return () => {
      active = false
    }
  }, [open])
  return { processingMethods }
}

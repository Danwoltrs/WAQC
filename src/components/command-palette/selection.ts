// Centralized URL contract shared by the palette and the list pages.
// `open` carries a SAMPLE id (both the samples detail modal and the cert editor
// are keyed by sample id). `q` carries free text to prefill a list page's search.
export const sampleOpenHref = (sampleId: string) => `/samples/qc?open=${encodeURIComponent(sampleId)}`
export const certOpenHref = (sampleId: string) => `/certificates?open=${encodeURIComponent(sampleId)}`
export const samplesFilterHref = (q: string) => `/samples/qc?q=${encodeURIComponent(q)}`
export const certsFilterHref = (q: string) => `/certificates?q=${encodeURIComponent(q)}`

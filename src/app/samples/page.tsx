import { redirect } from 'next/navigation'

// Samples now splits into QC Samples and Other Samples.
// Existing bookmarks to /samples land on the QC list.
export default function SamplesIndexRedirect() {
  redirect('/samples/qc')
}

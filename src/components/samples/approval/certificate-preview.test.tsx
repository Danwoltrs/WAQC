import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CertificatePreview } from './certificate-preview'

describe('CertificatePreview', () => {
  it('renders an iframe to the sample certificate endpoint', () => {
    render(<CertificatePreview sampleId="abc" />)
    const frame = screen.getByTitle('Certificate preview') as HTMLIFrameElement
    expect(frame.src).toContain('/api/samples/abc/certificate')
  })

  it('shows a placeholder when no certificate is available', () => {
    render(<CertificatePreview sampleId="abc" available={false} />)
    expect(screen.getByText(/no certificate/i)).toBeInTheDocument()
  })
})

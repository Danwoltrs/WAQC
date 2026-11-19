import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PrintCertificatesDialog } from './print-certificates-dialog'

beforeEach(() => {
  vi.restoreAllMocks()
  ;(URL as any).createObjectURL = vi.fn(() => 'blob:certificates')
  ;(URL as any).revokeObjectURL = vi.fn()
})

const pdfResponse = (printed: number, skipped: number) =>
  ({
    ok: true,
    headers: new Headers({ 'X-Printed-Certificates': String(printed), 'X-Skipped-Samples': String(skipped) }),
    blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
  }) as unknown as Response

describe('PrintCertificatesDialog', () => {
  it('asks for one PDF of the selected samples and says how many were left out', async () => {
    const fetchMock = vi.fn(async () => pdfResponse(2, 1))
    vi.stubGlobal('fetch', fetchMock)
    render(<PrintCertificatesDialog open onOpenChange={() => {}} sampleIds={['a', 'b', 'c']} />)

    expect(await screen.findByText(/2 certificates, one page each\. 1 selected sample left out: no certificate yet\./)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/samples/bulk/print-certificates')
    expect(JSON.parse(init.body as string)).toEqual({ sample_ids: ['a', 'b', 'c'] })
  })

  it('shows the reason when none of the samples has a certificate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'None of the selected samples has a certificate yet' }),
    }) as unknown as Response))
    render(<PrintCertificatesDialog open onOpenChange={() => {}} sampleIds={['a']} />)
    expect(await screen.findByText(/None of the selected samples has a certificate yet/)).toBeInTheDocument()
  })

  it('does nothing while closed', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<PrintCertificatesDialog open={false} onOpenChange={() => {}} sampleIds={['a']} />)
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
  })
})

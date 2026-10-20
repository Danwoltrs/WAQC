// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import { StrictMode } from 'react'
import { TinLabelSizeDialog } from './tin-label-size-dialog'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/print/print-preview-dialog', () => ({
  PrintPreviewDialog: ({ open, subtitle }: { open: boolean; subtitle: string }) =>
    open ? <div data-testid="preview">{subtitle}</div> : null,
}))

const fetchMock = vi.fn()

function okResponse() {
  return {
    ok: true,
    headers: { get: () => null },
    blob: async () => new Blob(['pdf']),
    json: async () => ({}),
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(okResponse())
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TinLabelSizeDialog', () => {
  it('with a preset size it generates straight away at that size', async () => {
    render(<TinLabelSizeDialog open sampleIds={['s1', 's2']} size="2.5cm" onOpenChange={() => {}} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sample_ids: ['s1', 's2'], size: '2.5cm' })
    expect(screen.queryByText('Select tin label size')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveTextContent('2 lots at 2.5cm'))
  })

  it('shows the generating copy with the real plural while waiting', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<TinLabelSizeDialog open sampleIds={['s1']} size="4cm" onOpenChange={() => {}} />)
    expect(await screen.findByText('Generating 1 tin label at 4cm…')).toBeInTheDocument()
  })

  it('posts once under StrictMode', async () => {
    render(
      <StrictMode>
        <TinLabelSizeDialog open sampleIds={['s1']} size="4cm" onOpenChange={() => {}} />
      </StrictMode>
    )
    await waitFor(() => expect(screen.getByTestId('preview')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('closes the dialog when generation fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, headers: { get: () => null }, json: async () => ({ error: 'boom' }) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onOpenChange = vi.fn()
    render(<TinLabelSizeDialog open sampleIds={['s1']} size="4cm" onOpenChange={onOpenChange} />)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('ignores a generation that finishes after the dialog was closed', async () => {
    let resolveFirst: (v: unknown) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise(res => { resolveFirst = res }))
    const { rerender } = render(<TinLabelSizeDialog open sampleIds={['s1']} size="4cm" onOpenChange={() => {}} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender(<TinLabelSizeDialog open={false} sampleIds={['s1']} size="4cm" onOpenChange={() => {}} />)
    await act(async () => { resolveFirst(okResponse()) })
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    rerender(<TinLabelSizeDialog open sampleIds={['s1']} size="2.5cm" onOpenChange={() => {}} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ sample_ids: ['s1'], size: '2.5cm' })
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveTextContent('1 lot at 2.5cm'))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('without a size it still asks first', () => {
    render(<TinLabelSizeDialog open sampleIds={['s1']} onOpenChange={() => {}} />)
    expect(screen.getByText('Select tin label size')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

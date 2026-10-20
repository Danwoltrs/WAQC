// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import { StrictMode } from 'react'
import { toast } from 'sonner'
import { PrintBagSleevesDialog } from './print-bag-sleeves-dialog'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/print/print-preview-dialog', () => ({
  PrintPreviewDialog: ({ open, subtitle }: { open: boolean; subtitle: string }) =>
    open ? <div data-testid="preview">{subtitle}</div> : null,
}))

const fetchMock = vi.fn()

function okResponse() {
  return { ok: true, headers: { get: () => null }, blob: async () => new Blob(['pdf']), json: async () => ({}) }
}

const entries = [
  { id: 's1', includeQrCode: true },
  { id: 's2', includeQrCode: false },
]

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(okResponse())
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  vi.mocked(toast.error).mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PrintBagSleevesDialog', () => {
  it('the QR checkbox looks like the list checkboxes and sits on the first line of its label', () => {
    render(<PrintBagSleevesDialog open onOpenChange={() => {}} entries={[]} qrMode="toggle" />)
    const box = screen.getByRole('checkbox')
    expect(box).toHaveClass('h-3.5', 'w-3.5', 'rounded-[3px]')
    // Box is 14px; the label line is 14px (text-sm, leading-none): a 0 offset centres it on that line.
    expect(box.parentElement).toHaveClass('items-start')
  })

  it('autoStart generates on open with each entry\'s own QR choice, no step to confirm', async () => {
    render(<PrintBagSleevesDialog open autoStart onOpenChange={() => {}} entries={entries} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/samples/bulk/print-bag-sleeves')
    expect(JSON.parse(init.body)).toEqual({ samples: entries })
    expect(screen.queryByText('Include QR code')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveTextContent('2 sleeves, 6 per A4 sheet'))
  })

  it('says what it is generating while it waits, with the real plural', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const { rerender } = render(
      <PrintBagSleevesDialog open autoStart onOpenChange={() => {}} entries={[entries[0]]} />,
    )
    expect(await screen.findByText('Generating 1 bag sleeve…')).toBeInTheDocument()
    rerender(<PrintBagSleevesDialog open={false} autoStart onOpenChange={() => {}} entries={[entries[0]]} />)
    rerender(<PrintBagSleevesDialog open autoStart onOpenChange={() => {}} entries={entries} />)
    expect(await screen.findByText('Generating 2 bag sleeves…')).toBeInTheDocument()
  })

  it('posts once under StrictMode', async () => {
    render(
      <StrictMode>
        <PrintBagSleevesDialog open autoStart onOpenChange={() => {}} entries={entries} />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByTestId('preview')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('toasts and closes when generation fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, headers: { get: () => null }, json: async () => ({ error: 'boom' }) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onOpenChange = vi.fn()
    render(<PrintBagSleevesDialog open autoStart onOpenChange={onOpenChange} entries={entries} />)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(toast.error).toHaveBeenCalledWith('boom')
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
  })

  it('ignores a generation that finishes after the dialog was closed', async () => {
    let resolveFirst: (v: unknown) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise(res => { resolveFirst = res }))
    const { rerender } = render(
      <PrintBagSleevesDialog open autoStart onOpenChange={() => {}} entries={entries} />,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender(<PrintBagSleevesDialog open={false} autoStart onOpenChange={() => {}} entries={entries} />)
    await act(async () => { resolveFirst(okResponse()) })
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()

    // The next open runs its own generation and shows only that one.
    rerender(<PrintBagSleevesDialog open autoStart onOpenChange={() => {}} entries={[entries[1]]} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ samples: [entries[1]] })
    await waitFor(() => expect(screen.getByTestId('preview')).toHaveTextContent('1 sleeve, 6 per A4 sheet'))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('without autoStart it still asks first and posts nothing on open', () => {
    render(<PrintBagSleevesDialog open onOpenChange={() => {}} entries={entries} />)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getByText(/QR codes: 1 of 2 sleeves/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

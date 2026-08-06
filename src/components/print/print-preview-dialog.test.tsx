import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PrintPreviewDialog } from './print-preview-dialog'

// jsdom has no real printing or navigation. Stub both so the component's
// fallback path is exercised without console noise or unhandled errors.
beforeEach(() => {
  vi.spyOn(window, 'open').mockReturnValue(null)
})
afterEach(() => {
  vi.restoreAllMocks()
})

const renderShell = (overrides: Record<string, unknown> = {}) => {
  const onPrinted = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <PrintPreviewDialog
      open
      onOpenChange={onOpenChange}
      title="Print tin labels"
      subtitle="7 lots at 4cm"
      pdfUrl="about:blank"
      saveFileName="tin-sleeves.pdf"
      onPrinted={onPrinted}
      {...overrides}
    />
  )
  return { onPrinted, onOpenChange }
}

describe('PrintPreviewDialog', () => {
  it('fires onPrinted when Print is pressed', () => {
    const { onPrinted } = renderShell()
    fireEvent.click(screen.getByRole('button', { name: /print/i }))
    expect(onPrinted).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire onPrinted when Save PDF is pressed', () => {
    // The safety property: saving a copy must never stamp a batch as printed
    // or advance a cupping stage.
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { onPrinted } = renderShell()
    fireEvent.click(screen.getByRole('button', { name: /save pdf/i }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(onPrinted).not.toHaveBeenCalled()
  })

  it('uses onSave when supplied, and still does not fire onPrinted', () => {
    const onSave = vi.fn()
    const { onPrinted } = renderShell({ onSave })
    fireEvent.click(screen.getByRole('button', { name: /save pdf/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onPrinted).not.toHaveBeenCalled()
  })

  it('disables both actions while the preview is still rendering', () => {
    renderShell({ pdfUrl: null, loading: true })
    expect(screen.getByRole('button', { name: /print/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /save pdf/i })).toBeDisabled()
    expect(screen.getByText(/preparing preview/i)).toBeInTheDocument()
  })

  it('shows the failure reason instead of an empty frame', () => {
    renderShell({ pdfUrl: null, error: 'boom' })
    expect(screen.getByText(/could not build the preview: boom/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /print/i })).toBeDisabled()
  })

  it('renders the title, subtitle and both extra slots', () => {
    renderShell({
      headerExtra: <span>doc switcher</span>,
      footerExtra: <button type="button">Send Email</button>,
    })
    expect(screen.getByText('Print tin labels')).toBeInTheDocument()
    expect(screen.getByText('7 lots at 4cm')).toBeInTheDocument()
    expect(screen.getByText('doc switcher')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send Email' })).toBeInTheDocument()
  })
})

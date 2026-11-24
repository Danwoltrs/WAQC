import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SampleRowActions, NO_CERTIFICATE_REASON, type SampleRowActionsProps } from './row-actions'

function renderRow(over: Partial<SampleRowActionsProps> = {}) {
  const handlers = {
    onViewCertificate: vi.fn(),
    onViewSample: vi.fn(),
    onDownloadCertificate: vi.fn(),
    onPrintSleeve: vi.fn(),
    onPrintCertificate: vi.fn(),
    onDelete: vi.fn(),
  }
  render(
    <table>
      <tbody>
        <tr>
          <SampleRowActions
            variant="labUnit"
            hasCertificate={false}
            canDelete={false}
            downloading={false}
            deleting={false}
            {...handlers}
            {...over}
          />
        </tr>
      </tbody>
    </table>,
  )
  return handlers
}

describe('SampleRowActions: printing from the Samples list', () => {
  it('a sample without a certificate can print its sleeve but not a certificate, and says why', async () => {
    const user = userEvent.setup()
    const h = renderRow({ hasCertificate: false })

    const certificate = screen.getByRole('button', { name: /print certificate/i })
    expect(certificate).toBeDisabled()
    expect(certificate.closest('span')).toHaveAttribute('title', NO_CERTIFICATE_REASON)

    await user.click(screen.getByRole('button', { name: 'Print sleeve' }))
    expect(h.onPrintSleeve).toHaveBeenCalledTimes(1)
    expect(h.onPrintCertificate).not.toHaveBeenCalled()
  })

  it('a sample with a certificate can print both', async () => {
    const user = userEvent.setup()
    const h = renderRow({ hasCertificate: true })

    await user.click(screen.getByRole('button', { name: 'Print certificate' }))
    await user.click(screen.getByRole('button', { name: 'Print sleeve' }))
    expect(h.onPrintCertificate).toHaveBeenCalledTimes(1)
    expect(h.onPrintSleeve).toHaveBeenCalledTimes(1)
  })

  it('a contract row gets the same two print buttons', () => {
    renderRow({ variant: 'sibling', hasCertificate: true })
    expect(screen.getByRole('button', { name: 'Print sleeve' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Print certificate' })).toBeEnabled()
  })
})

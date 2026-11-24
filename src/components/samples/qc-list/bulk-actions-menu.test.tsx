import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BulkActionsMenu, type BulkActionsMenuProps } from './bulk-actions-menu'

function renderMenu(over: Partial<BulkActionsMenuProps> = {}) {
  const onPrintCertificates = vi.fn()
  const onPrintBagSleeves = vi.fn()
  render(
    <BulkActionsMenu
      selectedCount={3}
      hasCertifiedSelected={false}
      cuppersAssigned={false}
      selectedHaveCuppers={false}
      selectedCanReprint={false}
      assignedCuppers={[]}
      canDelete={false}
      onAssignCuppers={() => {}}
      onReprintCuppingCards={() => {}}
      onPrintQrTable={() => {}}
      onExport={() => {}}
      onTinLabel={() => {}}
      onPrintBagSleeves={onPrintBagSleeves}
      certificateCount={0}
      certificatePrintReason={null}
      onPrintCertificates={onPrintCertificates}
      onDelete={() => {}}
      {...over}
    />,
  )
  return { onPrintCertificates, onPrintBagSleeves }
}

describe('BulkActionsMenu: printing a selection', () => {
  it('prints the certificates of the selection, naming how many', async () => {
    const user = userEvent.setup()
    const h = renderMenu({ certificateCount: 2 })
    await user.click(screen.getByRole('button', { name: /actions \(3\)/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Print Certificates (2)' }))
    expect(h.onPrintCertificates).toHaveBeenCalledTimes(1)
  })

  it('disables Print Certificates with the reason when no selected sample has one; sleeves stay printable', async () => {
    const user = userEvent.setup()
    const reason = 'None of the selected samples has a certificate yet'
    const h = renderMenu({ certificatePrintReason: reason })
    await user.click(screen.getByRole('button', { name: /actions \(3\)/i }))

    const item = await screen.findByRole('menuitem', { name: 'Print Certificates' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(reason)).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: /print bag sleeves/i }))
    expect(h.onPrintBagSleeves).toHaveBeenCalledTimes(1)
    expect(h.onPrintCertificates).not.toHaveBeenCalled()
  })
})

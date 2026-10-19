// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PrintBagSleevesDialog } from './print-bag-sleeves-dialog'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/print/print-preview-dialog', () => ({ PrintPreviewDialog: () => null }))

afterEach(cleanup)

describe('PrintBagSleevesDialog', () => {
  it('the QR checkbox looks like the list checkboxes and sits on the first line of its label', () => {
    render(<PrintBagSleevesDialog open onOpenChange={() => {}} entries={[]} qrMode="toggle" />)
    const box = screen.getByRole('checkbox')
    expect(box).toHaveClass('h-3.5', 'w-3.5', 'rounded-[3px]')
    // Box is 14px; the label line is 14px (text-sm, leading-none): a 0 offset centres it on that line.
    expect(box.parentElement).toHaveClass('items-start')
  })
})

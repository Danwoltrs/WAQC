import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditPanel } from './ui-parts'

describe('EditPanel', () => {
  it('stages with "Apply" by default, not "Save"', () => {
    render(
      <EditPanel open title="Defects" onCancel={() => {}} onSave={() => {}}>
        <p>body</p>
      </EditPanel>
    )
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })

  it('pins its footer with the commit bar, Cancel before Apply', () => {
    render(
      <EditPanel open title="Defects" onCancel={() => {}} onSave={vi.fn()}>
        <p>body</p>
      </EditPanel>
    )
    const apply = screen.getByRole('button', { name: 'Apply' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const footer = apply.closest('.sticky') as HTMLElement
    expect(footer).not.toBeNull()
    expect(footer.className).toContain('bottom-0')
    expect(footer.contains(cancel)).toBe(true)
    expect(cancel.compareDocumentPosition(apply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cancel.className).toContain('hover:bg-accent')
  })
})

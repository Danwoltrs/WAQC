import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToleranceConfirmDialog } from './tolerance-confirm-dialog'
import { prefillComments } from '@/lib/tolerance/comments'
import type { ToleranceAssessment, ToleranceItem } from '@/lib/tolerance/types'
import type { IssuedValues } from '@/lib/tolerance/issued-values'

const distributionItem: ToleranceItem = {
  key: 'screen_18_max',
  label: 'Screen 18',
  quadrant: 'distribution',
  direction: 'max',
  actual: 12.5,
  limit: 10,
  gap: 2.5,
  tolerance: 3,
}

const defectsItem: ToleranceItem = {
  key: 'defects_total',
  label: 'Total defects',
  quadrant: 'defects',
  direction: 'max',
  actual: 22,
  limit: 20,
  gap: 2,
  tolerance: 5,
}

const assessment = (items: ToleranceItem[]): ToleranceAssessment => ({
  offered: true,
  items,
  blockedBy: [],
})

const issued: IssuedValues = {
  screen_percentages: { '18': 10 },
  defects: { counts: {}, primary: 0, secondary: 20, total: 20 },
}

describe('ToleranceConfirmDialog', () => {
  it('renders nothing in the DOM when closed', () => {
    render(
      <ToleranceConfirmDialog
        open={false}
        assessment={assessment([distributionItem])}
        issued={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.queryByText('Approve with comments')).not.toBeInTheDocument()
  })

  it('seeds the Portuguese comment lines from prefillComments and lets them be edited', async () => {
    const user = userEvent.setup()
    const items = [distributionItem, defectsItem]
    render(
      <ToleranceConfirmDialog
        open
        assessment={assessment(items)}
        issued={issued}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    const expected = prefillComments(items)
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
    expect(inputs.map((i) => i.value)).toEqual(expected)

    await user.clear(inputs[0])
    await user.type(inputs[0], 'Comentário editado')
    expect(inputs[0]).toHaveValue('Comentário editado')
  })

  it('defaults the "Request additional sample" checkbox to ticked', () => {
    render(
      <ToleranceConfirmDialog
        open
        assessment={assessment([distributionItem])}
        issued={issued}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByRole('checkbox', { name: 'Request additional sample' })).toBeChecked()
  })

  it('renders one table section per affected quadrant', () => {
    render(
      <ToleranceConfirmDialog
        open
        assessment={assessment([distributionItem, defectsItem])}
        issued={issued}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByText('Screen distribution')).toBeInTheDocument()
    expect(screen.getByText('Defects')).toBeInTheDocument()
  })

  it('omits the quadrant section that has no items', () => {
    render(
      <ToleranceConfirmDialog
        open
        assessment={assessment([distributionItem])}
        issued={issued}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByText('Screen distribution')).toBeInTheDocument()
    expect(screen.queryByText('Defects')).not.toBeInTheDocument()
  })

  it('calls onConfirm with the (possibly edited) comments and the checkbox state', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ToleranceConfirmDialog
        open
        assessment={assessment([distributionItem])}
        issued={issued}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    await user.click(screen.getByRole('checkbox', { name: 'Request additional sample' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [comments, requestAdditionalSample] = onConfirm.mock.calls[0]
    expect(comments).toEqual(prefillComments([distributionItem]))
    expect(requestAdditionalSample).toBe(false)
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ToleranceConfirmDialog
        open
        assessment={assessment([distributionItem])}
        issued={issued}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables the footer buttons while saving', () => {
    render(
      <ToleranceConfirmDialog
        open
        assessment={assessment([distributionItem])}
        issued={issued}
        saving
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})

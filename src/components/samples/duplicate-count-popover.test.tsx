import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DuplicateCountPopover } from './duplicate-count-popover'

const base = { trackingNumber: 'SAN-000123/26', x: 10, y: 10, onCancel: () => {} }

// A copy never takes its source's quantity (Daniel, 2026-09-25): the fields
// start blank and only what is typed is sent.
describe('DuplicateCountPopover — bulk', () => {
  it('shows blank Containers + Total MT and says the references start blank', () => {
    render(<DuplicateCountPopover {...base} bagType="bulk" onSubmit={() => {}} />)
    expect(screen.getByLabelText('Containers')).toHaveValue(null)
    expect(screen.getByLabelText('Total MT')).toHaveValue(null)
    expect(screen.queryByLabelText('Bags')).toBeNull()
    expect(screen.getByText('Copies the parties and quality. References start blank.')).toBeInTheDocument()
  })

  it('sends no quantity when none is typed', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="bulk" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onSubmit).toHaveBeenCalledWith(1, {})
  })

  it('posts containers + MT as typed and derives the equivalent', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="bulk" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Containers'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Total MT'), { target: { value: '43.2' } })
    expect(screen.getByText('eq. 720 × 60 kg bags')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('How many copies?'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onSubmit).toHaveBeenCalledWith(3, { container_count: 2, bags_quantity_mt: 43.2 })
  })

  it('posts an MT typed alone without a container count', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="bulk" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Total MT'), { target: { value: '43.2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onSubmit).toHaveBeenCalledWith(1, { bags_quantity_mt: 43.2 })
  })
})

describe('DuplicateCountPopover — bags', () => {
  it('starts with a blank bag count and sends the typed one', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="jute_bag" onSubmit={onSubmit} />)
    expect(screen.getByLabelText('Bags')).toHaveValue(null)
    fireEvent.change(screen.getByLabelText('Bags'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onSubmit).toHaveBeenCalledWith(1, { bag_count: 100 })
  })

  it('sends no quantity when the bag count is left blank', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="jute_bag" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onSubmit).toHaveBeenCalledWith(1, {})
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DuplicateCountPopover } from './duplicate-count-popover'

const base = { trackingNumber: 'SAN-000123/26', x: 10, y: 10, onCancel: () => {} }

describe('DuplicateCountPopover — bulk', () => {
  it('shows Containers + Total MT prefilled from the source and derives the equivalent', () => {
    render(<DuplicateCountPopover {...base} bagType="bulk" containerCount={2} bagsQuantityMt={43.2} onSubmit={() => {}} />)
    expect(screen.getByLabelText('Containers')).toHaveValue(2)
    expect(screen.getByLabelText('Total MT')).toHaveValue(43.2)
    expect(screen.getByText('eq. 720 × 60 kg bags')).toBeInTheDocument()
    expect(screen.queryByLabelText('Bags')).toBeNull()
  })

  it('estimates the containers of a legacy bulk row from its MT', () => {
    render(<DuplicateCountPopover {...base} bagType="bulk" bagsQuantityMt={43.2} onSubmit={() => {}} />)
    expect(screen.getByLabelText('Containers')).toHaveValue(2)
  })

  it('sends no override when the quantity is untouched', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="bulk" containerCount={1} bagsQuantityMt={21.6} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onSubmit).toHaveBeenCalledWith(1, {})
  })

  it('posts containers + MT together when either changes', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="bulk" containerCount={1} bagsQuantityMt={21.6} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Containers'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Total MT'), { target: { value: '43.2' } })
    fireEvent.change(screen.getByLabelText('How many copies?'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onSubmit).toHaveBeenCalledWith(3, { container_count: 2, bags_quantity_mt: 43.2 })
  })

  it('keeps bags count-driven', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="jute_bag" bagCount={320} onSubmit={onSubmit} />)
    expect(screen.getByLabelText('Bags')).toHaveValue(320)
    fireEvent.change(screen.getByLabelText('Bags'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onSubmit).toHaveBeenCalledWith(1, { bag_count: 100 })
  })
})

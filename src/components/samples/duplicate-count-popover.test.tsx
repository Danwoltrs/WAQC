import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DuplicateCountPopover } from './duplicate-count-popover'

const base = { sampleLabel: 'SMP 143/26', x: 10, y: 10, onCancel: () => {} }

// A copy is the same contract in its next container (review 2026-09-28): it
// keeps everything but the container number, including the quantity, unless
// another quantity is typed here for every copy.
describe('DuplicateCountPopover — bulk', () => {
  it('asks for 60 kg equivalents, says what is copied and which quantity the copies keep', () => {
    render(<DuplicateCountPopover {...base} bagType="bulk" sourceQuantity="1 container in bulk (21.6 MT)" onSubmit={() => {}} />)
    expect(screen.getByLabelText('60 kg bag equivalents')).toHaveValue(null)
    expect(screen.getByText('Copies everything except the container number, which starts blank.')).toBeInTheDocument()
    expect(screen.getByText('1 container in bulk (21.6 MT)')).toBeInTheDocument()
  })

  it('sends no quantity when none is typed, so the copies keep the source\'s', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="bulk" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onSubmit).toHaveBeenCalledWith(1, {})
  })

  it('posts typed equivalents for every copy', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="bulk" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('60 kg bag equivalents'), { target: { value: '340' } })
    fireEvent.change(screen.getByLabelText('How many copies?'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onSubmit).toHaveBeenCalledWith(5, { bag_count: 340 })
  })

  it('refuses more than one container', () => {
    const onSubmit = vi.fn()
    render(<DuplicateCountPopover {...base} bagType="bulk" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('60 kg bag equivalents'), { target: { value: '400' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Bulk is at most 360 × 60 kg bag equivalents (21.6 MT) per sample.')
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeDisabled()
    fireEvent.keyDown(screen.getByLabelText('60 kg bag equivalents'), { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
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

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BulkQuantityFields } from './bulk-quantity-fields'

describe('BulkQuantityFields', () => {
  it('shows containers + total MT and derives the 60 kg equivalent from the MT', () => {
    render(<BulkQuantityFields containers="2" mt="43.2" onChange={() => {}} />)
    expect(screen.getByLabelText('Containers')).toHaveValue(2)
    expect(screen.getByLabelText('Total MT')).toHaveValue(43.2)
    expect(screen.getByText('eq. 720 × 60 kg bags')).toBeInTheDocument()
  })

  it('suggests containers × 21.6 as the MT placeholder and equivalent when MT is blank', () => {
    render(<BulkQuantityFields containers="3" mt="" onChange={() => {}} />)
    expect(screen.getByLabelText('Total MT')).toHaveAttribute('placeholder', '64.8')
    expect(screen.getByText('eq. 1080 × 60 kg bags')).toBeInTheDocument()
  })

  it('treats a blank container count as one container', () => {
    render(<BulkQuantityFields containers="" mt="" onChange={() => {}} />)
    expect(screen.getByLabelText('Containers')).toHaveAttribute('placeholder', '1')
    expect(screen.getByLabelText('Total MT')).toHaveAttribute('placeholder', '21.6')
    expect(screen.getByText('eq. 360 × 60 kg bags')).toBeInTheDocument()
  })

  it('keeps a lighter-than-default MT: the equivalent follows the entered MT, not the containers', () => {
    render(<BulkQuantityFields containers="1" mt="19.2" onChange={() => {}} />)
    expect(screen.getByText('eq. 320 × 60 kg bags')).toBeInTheDocument()
  })

  it('emits both fields as strings on every change', () => {
    const onChange = vi.fn()
    render(<BulkQuantityFields containers="2" mt="43.2" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Containers'), { target: { value: '3' } })
    expect(onChange).toHaveBeenLastCalledWith({ container_count: '3', bags_quantity_mt: '43.2' })
    fireEvent.change(screen.getByLabelText('Total MT'), { target: { value: '60' } })
    expect(onChange).toHaveBeenLastCalledWith({ container_count: '2', bags_quantity_mt: '60' })
  })

  it('disables both inputs', () => {
    render(<BulkQuantityFields containers="2" mt="43.2" onChange={() => {}} disabled />)
    expect(screen.getByLabelText('Containers')).toBeDisabled()
    expect(screen.getByLabelText('Total MT')).toBeDisabled()
  })
})

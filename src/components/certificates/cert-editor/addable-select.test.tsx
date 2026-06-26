import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddableSelect } from './addable-select'

describe('AddableSelect', () => {
  it('renders options and selecting one calls onChange', () => {
    const onChange = vi.fn()
    render(<AddableSelect value="Washed" options={['Natural', 'Washed']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Natural' }))
    expect(onChange).toHaveBeenCalledWith('Natural')
  })

  it('always includes the current value even if not in options', () => {
    render(<AddableSelect value="Funky" options={['Natural']} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Funky' })).toBeInTheDocument()
  })

  it('with allowAdd, adding a custom value calls onChange', () => {
    const onChange = vi.fn()
    render(<AddableSelect value="" options={['Natural']} onChange={onChange} allowAdd addLabel="Add processing method" />)
    fireEvent.click(screen.getByRole('button', { name: /Add processing method/ }))
    const input = screen.getByPlaceholderText('Add processing method')
    fireEvent.change(input, { target: { value: 'Yeast Inoculated' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('Yeast Inoculated')
  })

  it('without allowAdd, shows no add row', () => {
    render(<AddableSelect value="25/26" options={['26/27', '25/26']} onChange={() => {}} />)
    expect(screen.queryByText(/Add /)).not.toBeInTheDocument()
  })
})

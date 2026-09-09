import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CupsStep } from './CupsStep'

const cup = (n: number) => screen.getByRole('button', { name: new RegExp(`^cup ${n} `, 'i') })
const lastChange = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[fn.mock.calls.length - 1][0]

describe('CupsStep — SCA-104 §5.4', () => {
  it('renders five cups, all clean, with no penalty and no defect-type chips', () => {
    render(<CupsStep cups={{ non_uniform: [], defective: [] }} onChange={() => {}} />)
    expect(screen.getAllByRole('button', { name: /^cup [1-5] /i })).toHaveLength(5)
    for (let n = 1; n <= 5; n++) expect(cup(n)).toHaveAccessibleName(/clean/i)
    expect(screen.queryByText(/defect type/i)).toBeNull()
    expect(screen.getByTestId('cups-penalty')).toHaveTextContent('0')
  })

  it('one tap marks a cup non-uniform and writes it', () => {
    const onChange = vi.fn()
    render(<CupsStep cups={{ non_uniform: [], defective: [] }} onChange={onChange} />)
    fireEvent.click(cup(4))
    expect(cup(4)).toHaveAccessibleName(/non-uniform/i)
    expect(lastChange(onChange)).toEqual({ non_uniform: [4], defective: [] })
    expect(screen.getByTestId('cups-penalty')).toHaveTextContent('−2')
  })

  it('a second tap marks it defective, asks for the type, and does NOT count it yet (§5.4.1)', () => {
    const onChange = vi.fn()
    render(<CupsStep cups={{ non_uniform: [], defective: [] }} onChange={onChange} />)
    fireEvent.click(cup(4)); fireEvent.click(cup(4))
    expect(cup(4)).toHaveAccessibleName(/defective/i)
    expect(screen.getByText(/defect type/i)).toBeTruthy()
    expect(screen.getByText(/not counted yet/i)).toBeTruthy()
    // written as non-uniform only: a defect without its type is not a defect
    expect(lastChange(onChange)).toEqual({ non_uniform: [4], defective: [] })
    expect(screen.getByTestId('cups-penalty')).toHaveTextContent('−2')
  })

  it('picking the type counts the defect: −4 on top of the cup\'s −2 (§5.4.2)', () => {
    const onChange = vi.fn()
    render(<CupsStep cups={{ non_uniform: [], defective: [] }} onChange={onChange} />)
    fireEvent.click(cup(4)); fireEvent.click(cup(4))
    fireEvent.click(screen.getByRole('button', { name: /^potato$/i }))
    expect(screen.queryByText(/not counted yet/i)).toBeNull()
    expect(lastChange(onChange)).toEqual({ non_uniform: [4], defective: [{ cup: 4, type: 'potato' }] })
    expect(screen.getByTestId('cups-penalty')).toHaveTextContent('−6')
    expect(screen.getByTestId('cups-line')).toHaveTextContent('1 non-uniform · 1 defective')
  })

  it('a third tap clears the cup', () => {
    const onChange = vi.fn()
    render(<CupsStep cups={{ non_uniform: [], defective: [] }} onChange={onChange} />)
    fireEvent.click(cup(1)); fireEvent.click(cup(1)); fireEvent.click(cup(1))
    expect(cup(1)).toHaveAccessibleName(/clean/i)
    expect(lastChange(onChange)).toEqual({ non_uniform: [], defective: [] })
  })

  it('reads a saved assessment back: marks, type and penalty', () => {
    render(<CupsStep cups={{ non_uniform: [2, 4], defective: [{ cup: 4, type: 'phenolic' }] }} onChange={() => {}} />)
    expect(cup(2)).toHaveAccessibleName(/non-uniform/i)
    expect(cup(4)).toHaveAccessibleName(/defective/i)
    expect(screen.getByRole('button', { name: /^phenolic$/i }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('cups-penalty')).toHaveTextContent('−8')
    expect(screen.getByTestId('cups-line')).toHaveTextContent('2 non-uniform · 1 defective')
  })

  it('says a defect is not counted while it waits for its type, in the line too', () => {
    render(<CupsStep cups={{ non_uniform: [2], defective: [] }} onChange={() => {}} />)
    fireEvent.click(cup(4)); fireEvent.click(cup(4))
    expect(screen.getByTestId('cups-line')).toHaveTextContent('2 non-uniform · 0 defective (1 not counted)')
  })
})

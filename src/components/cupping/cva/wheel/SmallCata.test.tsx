import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MainTastes } from './MainTastes'
import { MouthfeelCata } from './MouthfeelCata'

describe('MainTastes', () => {
  it('renders the five official tastes', () => {
    render(<MainTastes value={[]} onChange={() => {}} />)
    for (const t of ['Salty', 'Sour', 'Sweet', 'Bitter', 'Umami'])
      expect(screen.getByRole('button', { name: t })).toBeTruthy()
  })

  it('caps at two with replace-oldest', () => {
    const onChange = vi.fn()
    render(<MainTastes value={['Sweet', 'Bitter']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Umami' }))
    expect(onChange).toHaveBeenCalledWith(['Bitter', 'Umami'])
  })
})

describe('MouthfeelCata', () => {
  it('renders the five options with their sub-qualifiers', () => {
    render(<MouthfeelCata value={[]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /rough/i })).toBeTruthy()
    expect(screen.getByText('Gritty, Chalky, Sandy')).toBeTruthy()
    expect(screen.getByText('Velvety, Silky, Syrupy')).toBeTruthy()
    expect(screen.getByRole('button', { name: /mouth-drying/i })).toBeTruthy()
  })

  it('toggles off and caps at two', () => {
    const onChange = vi.fn()
    const { rerender } = render(<MouthfeelCata value={['Oily']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /oily/i }))
    expect(onChange).toHaveBeenCalledWith([])
    rerender(<MouthfeelCata value={['Oily', 'Metallic']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /smooth/i }))
    expect(onChange).toHaveBeenCalledWith(['Metallic', 'Smooth'])
  })
})

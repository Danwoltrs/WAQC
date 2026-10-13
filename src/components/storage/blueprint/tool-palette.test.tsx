import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToolPalette } from './tool-palette'

describe('ToolPalette', () => {
  it('offers Wall right after Room', () => {
    const onTool = vi.fn()
    render(<ToolPalette tool="select" onTool={onTool} />)
    const names = screen.getAllByRole('button').map((b) => b.textContent)
    expect(names.slice(0, 4)).toEqual(['Select', 'Room', 'Wall', 'Shelf'])
    fireEvent.click(screen.getByRole('button', { name: 'Wall' }))
    expect(onTool).toHaveBeenCalledWith('wall')
  })
})

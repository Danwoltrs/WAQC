import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QcClientStep } from './qc-client-step'

const clients = [
  { id: 'ahold', name: 'Ahold', certificates: 3 },
  { id: 'dunkin', name: 'Dunkin', certificates: 11 },
]

const box = (name: RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement
const continueButton = () => screen.getByRole('button', { name: /continue/i }) as HTMLButtonElement

describe('QcClientStep', () => {
  it('starts with every QC client ticked and continues with all of them', () => {
    const onContinue = vi.fn()
    render(<QcClientStep clients={clients} onContinue={onContinue} />)
    expect(box(/ahold/i).checked).toBe(true)
    expect(box(/dunkin/i).checked).toBe(true)
    fireEvent.click(continueButton())
    expect(onContinue).toHaveBeenCalledWith(['ahold', 'dunkin'])
  })

  it('leaves out a client that was unticked', () => {
    const onContinue = vi.fn()
    render(<QcClientStep clients={clients} onContinue={onContinue} />)
    fireEvent.click(box(/dunkin/i))
    fireEvent.click(continueButton())
    expect(onContinue).toHaveBeenCalledWith(['ahold'])
  })

  it('cannot continue with no client chosen', () => {
    render(<QcClientStep clients={clients} onContinue={() => {}} />)
    fireEvent.click(box(/ahold/i))
    fireEvent.click(box(/dunkin/i))
    expect(continueButton().disabled).toBe(true)
  })
})

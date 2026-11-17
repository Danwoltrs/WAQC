import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpecEditorBody, useSpecEditorState } from './spec-editor-body'

function Harness({ methodology }: { methodology: 'commodity' | 'cva' }) {
  const state = useSpecEditorState({ methodology, parameters: {} }, { initialSection: 'sensory' })
  return <SpecEditorBody state={state} />
}

describe('SpecEditorBody sensory page', () => {
  it('renders the Sensory page for a commodity quality', () => {
    render(<Harness methodology="commodity" />)
    expect(screen.getByRole('switch', { name: /sensory notes/i })).toBeInTheDocument()
  })

  it('a specialty (CVA) quality never renders it: the active section falls back to Basic information', () => {
    render(<Harness methodology="cva" />)
    expect(screen.queryByRole('switch', { name: /sensory notes/i })).toBeNull()
    expect(screen.getByLabelText('Template name')).toBeInTheDocument()
  })
})

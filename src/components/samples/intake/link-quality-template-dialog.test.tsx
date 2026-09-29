import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LinkQualityTemplateDialog } from './link-quality-template-dialog'

// 2026-09-29: the intake's "Create “15/16 FC” specification" opens this
// dialog already named as the contract words it.
describe('LinkQualityTemplateDialog started from a contract', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('opens as a new specification named as the contract words it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ templates: [] }), { status: 200 })))
    render(
      <LinkQualityTemplateDialog open onOpenChange={vi.fn()} clientId="co-cape" clientName="Cape Horn"
        onSuccess={vi.fn()} initialName="15/16 FC" initialOrigin="Brazil" />,
    )
    expect(screen.getByRole('heading', { name: 'New quality specification' })).toBeInTheDocument()
    expect(screen.getByText(/No specification for Cape Horn matches “15\/16 FC”/)).toBeInTheDocument()
    expect(await screen.findByDisplayValue('15/16 FC')).toBeInTheDocument()
  })

  it('keeps its plain title when opened without contract words', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ templates: [] }), { status: 200 })))
    render(<LinkQualityTemplateDialog open onOpenChange={vi.fn()} clientId="co-cape" clientName="Cape Horn" onSuccess={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Link Quality Template' })).toBeInTheDocument()
  })
})

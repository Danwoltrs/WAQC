// src/components/clients/portal-access-card.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/components/portal/qc-invite-dialog', () => ({ QcInviteDialog: () => null }))
vi.mock('@/components/portal/qc-access-editor-dialog', () => ({ QcAccessEditorDialog: () => null }))

import { PortalAccessCard } from './portal-access-card'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('PortalAccessCard', () => {
  it('a 403 shows a neutral notice without Retry, not the load error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })))
    render(<PortalAccessCard companyId="c1" companyName="Roastery One" />)
    await waitFor(() => expect(screen.getByText('Only global admins and quality managers manage portal access.')).toBeInTheDocument())
    expect(screen.queryByText('Retry')).toBeNull()
    expect(screen.queryByText('Portal access could not be loaded.')).toBeNull()
  })

  it('another failure still offers Retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    render(<PortalAccessCard companyId="c1" companyName="Roastery One" />)
    await waitFor(() => expect(screen.getByText('Retry')).toBeInTheDocument())
  })
})

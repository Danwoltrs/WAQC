// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const nav = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/portal',
  useSearchParams: () => new URLSearchParams('company=11111111-1111-4111-8111-111111111111'),
}))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }))
vi.mock('@/lib/portal/use-portal-filters', () => ({ usePortalFilters: () => ({ linkQuery: '' }) }))

import { PortalShell } from './portal-shell'
import { PORTAL_ACCESS_HQ_ONLY } from '@/lib/auth/lab-scope'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); nav.replace.mockClear() })

const me403 = (error: string) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error }), { status: 403 })))

describe('PortalShell: a 403 from /api/portal/me', () => {
  it("a confined lab's staff see the Santos message in place, not the no-access page", async () => {
    me403(PORTAL_ACCESS_HQ_ONLY)
    render(<PortalShell><div>content</div></PortalShell>)
    expect(await screen.findByText(PORTAL_ACCESS_HQ_ONLY)).toBeTruthy()
    expect(nav.replace).not.toHaveBeenCalled()
    expect(screen.queryByText('content')).toBeNull()
  })

  it('any other 403 still goes to the no-access page', async () => {
    me403('No QC portal access')
    render(<PortalShell><div>content</div></PortalShell>)
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/auth/no-access'))
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('./left-sidebar', () => ({ LeftSidebar: () => <div /> }))
vi.mock('./right-sidebar', () => ({ RightSidebar: () => <div /> }))
vi.mock('@/components/command-palette/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/hooks/use-notifications', () => ({ useNotifications: () => ({ unreadCount: 0 }) }))
vi.mock('@/components/providers/auth-provider', () => ({ useAuth: () => ({ user: { id: 'u-1' }, loading: false }) }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
}))

import { MainLayout, PageBody } from './main-layout'

afterEach(cleanup)

describe('MainLayout content width', () => {
  it('caps the content at 1400px by default', () => {
    render(<MainLayout><p>content</p></MainLayout>)
    expect(screen.getByText('content').parentElement!.className).toContain('max-w-[1400px]')
  })

  it('drops the cap with fullWidth', () => {
    render(<MainLayout fullWidth><p>content</p></MainLayout>)
    expect(screen.getByText('content').parentElement!.className).not.toContain('max-w-[1400px]')
  })
})

describe('MainLayout replaceSidebar', () => {
  it('keeps the app menu column on desktop by default', () => {
    const { container } = render(<MainLayout><p>content</p></MainLayout>)
    expect(container.querySelector('.lg\\:block')).not.toBeNull()
  })

  it('hides the desktop app menu and lets the page fill the height', () => {
    const { container } = render(<MainLayout replaceSidebar><p>content</p></MainLayout>)
    expect(container.querySelector('.lg\\:block')).toBeNull()
    const wrap = screen.getByText('content').parentElement!
    expect(wrap.className).toContain('lg:overflow-hidden')
    expect(wrap.className).not.toContain('max-w-[1400px]')
  })
})

describe('PageBody', () => {
  it('caps width and pads', () => {
    render(<PageBody><p>body</p></PageBody>)
    const c = screen.getByText('body').parentElement!.className
    expect(c).toContain('max-w-[1400px]'); expect(c).toContain('p-6')
  })
  it('flush drops the padding', () => {
    render(<PageBody flush><p>body</p></PageBody>)
    expect(screen.getByText('body').parentElement!.className).not.toContain('p-6')
  })
})

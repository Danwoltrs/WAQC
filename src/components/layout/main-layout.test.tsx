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

import { MainLayout } from './main-layout'

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

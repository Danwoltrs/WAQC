import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const setTheme = vi.fn()
const signOut = vi.fn()

vi.mock('@/components/providers/theme-provider', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme }),
}))
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: { email: 'daniel@wolthers.com', user_metadata: {} },
    profile: { full_name: 'Daniel Wolthers', qc_role: 'admin' },
    signOut,
  }),
}))

import { SidebarFooter } from './sidebar-footer'

describe('SidebarFooter', () => {
  beforeEach(() => { setTheme.mockClear() })

  it('renders the language label, the unread badge, and the user initials when expanded', () => {
    render(<SidebarFooter isExpanded={true} unreadNotifications={3} onNotificationsToggle={() => {}} />)
    expect(screen.getByText('EN')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('DW')).toBeInTheDocument()
  })

  it('toggles the theme when the theme button is clicked', () => {
    render(<SidebarFooter isExpanded={true} unreadNotifications={0} onNotificationsToggle={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /toggle theme/i }))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('calls onNotificationsToggle when the bell is clicked', () => {
    const onToggle = vi.fn()
    render(<SidebarFooter isExpanded={true} unreadNotifications={0} onNotificationsToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(onToggle).toHaveBeenCalled()
  })
})

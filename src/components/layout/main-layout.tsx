'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from './header'
import { LeftSidebar, type SidebarMode } from './left-sidebar'
import { RightSidebar } from './right-sidebar'
import { useNotifications } from '@/hooks/use-notifications'
import { useAuth } from '@/components/providers/auth-provider'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { isClientRole } from '@/lib/portal/portal-auth'

const SIDEBAR_MODE_KEY = 'waqc-sidebar-mode'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('expanded')
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notificationsSidebarOpen, setNotificationsSidebarOpen] = useState(false)
  const { unreadCount } = useNotifications({ unreadOnly: true, limit: 100 })

  // Load sidebar mode from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_MODE_KEY) as SidebarMode | null
    if (stored && ['expanded', 'collapsed', 'hover'].includes(stored)) {
      setSidebarMode(stored)
    }
  }, [])

  // Redirect client-role users to the partner portal
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!active) return
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('qc_role').eq('id', user.id).single()
      if (active && isClientRole((profile as any)?.qc_role)) router.replace('/portal')
    })()
    return () => { active = false }
  }, [router])

  const handleSidebarModeChange = (mode: SidebarMode) => {
    setSidebarMode(mode)
    setHoverExpanded(false)
    localStorage.setItem(SIDEBAR_MODE_KEY, mode)
  }

  // Determine if sidebar content should be expanded (show labels)
  const isExpanded = sidebarMode === 'expanded' || (sidebarMode === 'hover' && hoverExpanded)

  // Redirect to login if not authenticated
  if (!loading && !user) {
    router.replace('/')
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <Header
        onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
        isMenuOpen={mobileMenuOpen}
        onNotificationsToggle={() => setNotificationsSidebarOpen(!notificationsSidebarOpen)}
        isNotificationsOpen={notificationsSidebarOpen}
        unreadNotifications={unreadCount}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - reserve space based on mode */}
        <div className={cn(
          'hidden lg:block h-full flex-shrink-0 transition-all duration-300',
          isExpanded ? 'w-64' : 'w-14'
        )}>
          <LeftSidebar
            isExpanded={isExpanded}
            sidebarMode={sidebarMode}
            onModeChange={handleSidebarModeChange}
            onHoverEnter={() => { if (sidebarMode === 'hover') setHoverExpanded(true) }}
            onHoverLeave={() => { if (sidebarMode === 'hover') setHoverExpanded(false) }}
          />
        </div>

        {/* Mobile Sidebar Overlay */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="fixed left-0 top-16 bottom-0 w-64 z-50 lg:hidden">
              <LeftSidebar isExpanded={true} sidebarMode="expanded" onModeChange={handleSidebarModeChange} />
            </div>
          </>
        )}

        {/* Main Content — left-aligned to the sidebar with a wide cap so content
            doesn't sprawl on ultra-wide monitors. Pages still set their own max
            width on top of this. */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            <div className="max-w-[1400px]">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Notifications Sidebar Overlay */}
      {notificationsSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={() => setNotificationsSidebarOpen(false)}
          />
          <div className="fixed right-0 top-0 w-80 z-50 animate-in slide-in-from-right duration-300 max-h-screen">
            <RightSidebar onClose={() => setNotificationsSidebarOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}
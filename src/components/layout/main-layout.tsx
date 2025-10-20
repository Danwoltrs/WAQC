'use client'

import { useState } from 'react'
import { Header } from './header'
import { LeftSidebar } from './left-sidebar'
import { RightSidebar } from './right-sidebar'
import { useNotifications } from '@/hooks/use-notifications'
import { cn } from '@/lib/utils'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notificationsSidebarOpen, setNotificationsSidebarOpen] = useState(false)
  const { unreadCount } = useNotifications({ unreadOnly: true, limit: 100 })

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
        {/* Left Sidebar */}
        <div className={cn(
          'hidden lg:block h-full transition-all duration-300',
          leftSidebarOpen ? 'w-64' : 'w-16'
        )}>
          <LeftSidebar 
            isOpen={leftSidebarOpen}
            onToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
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
              <LeftSidebar isOpen={true} />
            </div>
          </>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            {children}
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
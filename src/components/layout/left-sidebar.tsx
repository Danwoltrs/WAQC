'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Package,
  FlaskConical,
  Coffee,
  FileText,
  Users,
  Settings,
  BarChart3,
  MapPin,
  Crown,
  DollarSign,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/components/providers/auth-provider'
import { hasPermission } from '@/lib/auth'
import { cn } from '@/lib/utils'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string
  badge?: string
}

const navigation: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/',
    icon: Home,
  },
  {
    title: 'Samples',
    href: '/samples',
    icon: Package,
    permission: 'view_samples',
  },
  {
    title: 'Quality Assessment',
    href: '/assessment',
    icon: FlaskConical,
    permission: 'conduct_assessments',
  },
  {
    title: 'Cupping Sessions',
    href: '/cupping',
    icon: Coffee,
    permission: 'conduct_assessments',
  },
  {
    title: 'Certificates',
    href: '/certificates',
    icon: FileText,
    permission: 'view_samples',
  },
  {
    title: 'Storage',
    href: '/storage',
    icon: MapPin,
    permission: 'view_samples',
  },
]

const managementNav: NavItem[] = [
  {
    title: 'Finance',
    href: '/finance',
    icon: DollarSign,
    permission: 'view_lab_finance',
  },
  {
    title: 'Quality Specs',
    href: '/quality-specs',
    icon: Crown,
    permission: 'manage_quality_specs',
  },
  {
    title: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    permission: 'view_lab_dashboard',
  },
  {
    title: 'Users',
    href: '/users',
    icon: Users,
    permission: 'manage_users',
  },
]

interface LeftSidebarProps {
  isOpen?: boolean
  onToggle?: () => void
}

export function LeftSidebar({ isOpen = true, onToggle }: LeftSidebarProps) {
  const pathname = usePathname()
  const { permissions } = useAuth()

  const filterNavByPermissions = (nav: NavItem[]) => {
    return nav.filter(item => !item.permission || hasPermission(permissions, item.permission))
  }

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname.startsWith(href)
  }

  return (
    <aside className={cn(
      'h-full border-r border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300',
      isOpen ? 'w-64' : 'w-16'
    )}>
      <div className="flex flex-col h-full">
        {/* Toggle button */}
        <div className="flex justify-end p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-8 w-8"
          >
            {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {/* Main Navigation */}
          <div className="space-y-1">
            {filterNavByPermissions(navigation).map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all',
                    active 
                      ? 'bg-accent text-accent-foreground' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    !isOpen && 'justify-center'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {isOpen && (
                    <>
                      <span className="truncate">{item.title}</span>
                      {item.badge && (
                        <span className="ml-auto text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              )
            })}
          </div>

          {/* Management Section */}
          {filterNavByPermissions(managementNav).length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-1">
                {isOpen && (
                  <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Management
                  </h3>
                )}
                {filterNavByPermissions(managementNav).map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all',
                        active 
                          ? 'bg-accent text-accent-foreground' 
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                        !isOpen && 'justify-center'
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {isOpen && (
                        <>
                          <span className="truncate">{item.title}</span>
                          {item.badge && (
                            <span className="ml-auto text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            </>
          )}
        </nav>

        {/* Settings */}
        <div className="p-2 border-t border-border">
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all',
              isActive('/settings')
                ? 'bg-accent text-accent-foreground' 
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              !isOpen && 'justify-center'
            )}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            {isOpen && <span>Settings</span>}
          </Link>
        </div>
      </div>
    </aside>
  )
}
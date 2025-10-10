'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
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
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Award,
  Plus,
  List,
  Search,
  Microscope,
  ClipboardList,
  Calendar,
  UserCheck,
  UserPlus,
  Building2,
  Building
} from 'lucide-react'
import { SampleTin } from '@/components/icons/sample-tin'
import { CuppingBowl } from '@/components/icons/cupping-bowl'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/components/providers/auth-provider'
import { hasPermission } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string
  badge?: string
  submenu?: NavItem[]
}

const navigation: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/',
    icon: Home,
    submenu: [
      {
        title: 'Overview',
        href: '/dashboard/metrics/overview',
        icon: BarChart3,
        permission: 'view_lab_dashboard',
      },
      {
        title: 'Supplier Review',
        href: '/dashboard/metrics/supplier-review',
        icon: Award,
        permission: 'view_lab_dashboard',
      },
    ],
  },
  {
    title: 'Samples',
    href: '/samples',
    icon: SampleTin,
    permission: 'view_samples',
    submenu: [
      {
        title: 'New Sample',
        href: '/samples/intake',
        icon: Plus,
        permission: 'create_samples',
      },
      {
        title: 'View All Samples',
        href: '/samples',
        icon: List,
        permission: 'view_samples',
      },
      {
        title: 'Storage Management',
        href: '/samples/storage',
        icon: MapPin,
        permission: 'view_samples',
      },
      {
        title: 'Find Sample',
        href: '/samples/search',
        icon: Search,
        permission: 'view_samples',
      },
    ],
  },
  {
    title: 'Quality Assessment',
    href: '/assessment',
    icon: CuppingBowl,
    permission: 'conduct_assessments',
    submenu: [
      {
        title: 'Green Bean Analysis',
        href: '/assessment/green-bean',
        icon: Microscope,
        permission: 'conduct_assessments',
      },
      {
        title: 'Cupping Preparation',
        href: '/assessment/preparation',
        icon: ClipboardList,
        permission: 'conduct_assessments',
      },
      {
        title: 'Pending Samples',
        href: '/assessment/pending',
        icon: List,
        permission: 'conduct_assessments',
      },
    ],
  },
  {
    title: 'Cupping Sessions',
    href: '/cupping',
    icon: Coffee,
    permission: 'conduct_assessments',
    submenu: [
      {
        title: 'Active Sessions',
        href: '/cupping/active',
        icon: Coffee,
        permission: 'conduct_assessments',
      },
      {
        title: 'Schedule Session',
        href: '/cupping/schedule',
        icon: Calendar,
        permission: 'conduct_assessments',
      },
      {
        title: 'Session History',
        href: '/cupping/history',
        icon: List,
        permission: 'conduct_assessments',
      },
      {
        title: 'Cupper Management',
        href: '/cupping/cuppers',
        icon: UserCheck,
        permission: 'manage_cuppers',
      },
    ],
  },
  {
    title: 'Certificates',
    href: '/certificates',
    icon: FileText,
    permission: 'view_samples',
  },
]

const managementNav: NavItem[] = [
  {
    title: 'Clients',
    href: '/clients',
    icon: Building2,
    permission: 'manage_clients',
    submenu: [
      {
        title: 'All Clients',
        href: '/clients',
        icon: List,
        permission: 'manage_clients',
      },
      {
        title: 'Add Client',
        href: '/clients/new',
        icon: UserPlus,
        permission: 'manage_clients',
      },
      {
        title: 'Quality Specs',
        href: '/quality/templates',
        icon: Crown,
        permission: 'manage_quality_specs',
      },
    ],
  },
  {
    title: 'Laboratories',
    href: '/laboratories',
    icon: Building,
    permission: 'manage_laboratories',
  },
  {
    title: 'Finance',
    href: '/finance',
    icon: DollarSign,
    permission: 'view_lab_finance',
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
  const { permissions, profile } = useAuth()
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0)
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['/']))

  // Auto-expand Dashboard submenu when on a submenu page
  useEffect(() => {
    const dashboardItem = navigation.find(item => item.href === '/')
    if (dashboardItem?.submenu) {
      const isOnSubmenuPage = dashboardItem.submenu.some(subItem =>
        pathname.startsWith(subItem.href)
      )
      if (isOnSubmenuPage) {
        setExpandedMenus(prev => new Set(prev).add('/'))
      }
    }
  }, [pathname])

  // Fetch pending access requests count
  useEffect(() => {
    const fetchPendingRequests = async () => {
      if (!profile?.is_global_admin && !hasPermission(permissions, 'manage_users')) {
        return
      }

      try {
        const { count, error } = await supabase
          .from('access_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')

        if (!error && count !== null) {
          setPendingRequestsCount(count)
        }
      } catch (error) {
        console.error('Error fetching pending requests count:', error)
      }
    }

    fetchPendingRequests()

    // Set up real-time subscription for access requests
    const channel = supabase
      .channel('access_requests_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'access_requests' },
        () => {
          fetchPendingRequests()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile, permissions])

  const filterNavByPermissions = (nav: NavItem[]) => {
    return nav.filter(item => !item.permission || hasPermission(permissions, item.permission))
  }

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname.startsWith(href)
  }

  const toggleSubmenu = (href: string) => {
    setExpandedMenus(prev => {
      const newSet = new Set(prev)
      if (newSet.has(href)) {
        newSet.delete(href)
      } else {
        newSet.add(href)
      }
      return newSet
    })
  }

  const isSubmenuActive = (submenu?: NavItem[]) => {
    if (!submenu) return false
    return submenu.some(item => isActive(item.href))
  }

  // Add badge to Users nav item
  const getNavItemWithBadge = (item: NavItem): NavItem => {
    if (item.href === '/users' && pendingRequestsCount > 0) {
      return { ...item, badge: String(pendingRequestsCount) }
    }
    return item
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
              const hasSubmenu = item.submenu && item.submenu.length > 0
              const submenuExpanded = expandedMenus.has(item.href)
              const submenuActive = isSubmenuActive(item.submenu)
              const filteredSubmenu = hasSubmenu
                ? item.submenu!.filter(subItem => !subItem.permission || hasPermission(permissions, subItem.permission))
                : []

              return (
                <div key={item.href}>
                  {/* Main nav item */}
                  {hasSubmenu && filteredSubmenu.length > 0 ? (
                    <div
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all',
                        active || submenuActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      )}
                    >
                      <Link href={item.href} className="flex items-center gap-3 flex-1 min-w-0">
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {isOpen && <span className="truncate">{item.title}</span>}
                      </Link>
                      {isOpen && (
                        <button
                          onClick={() => toggleSubmenu(item.href)}
                          className="p-1 hover:bg-accent/50 rounded transition-colors"
                        >
                          {submenuExpanded ? (
                            <ChevronUp className="h-4 w-4 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 flex-shrink-0" />
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    <Link
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
                  )}

                  {/* Submenu items */}
                  {hasSubmenu && submenuExpanded && isOpen && filteredSubmenu.length > 0 && (
                    <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-2">
                      {filteredSubmenu.map((subItem) => {
                        const SubIcon = subItem.icon
                        const subActive = isActive(subItem.href)

                        return (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all',
                              subActive
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                            )}
                          >
                            <SubIcon className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{subItem.title}</span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
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
                  const itemWithBadge = getNavItemWithBadge(item)
                  const Icon = itemWithBadge.icon
                  const active = isActive(itemWithBadge.href)
                  const hasSubmenu = itemWithBadge.submenu && itemWithBadge.submenu.length > 0
                  const submenuExpanded = expandedMenus.has(itemWithBadge.href)
                  const submenuActive = isSubmenuActive(itemWithBadge.submenu)
                  const filteredSubmenu = hasSubmenu
                    ? itemWithBadge.submenu!.filter(subItem => !subItem.permission || hasPermission(permissions, subItem.permission))
                    : []

                  return (
                    <div key={itemWithBadge.href}>
                      {/* Main nav item */}
                      {hasSubmenu && filteredSubmenu.length > 0 ? (
                        <div
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all',
                            active || submenuActive
                              ? 'bg-accent text-accent-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                          )}
                        >
                          <Link href={itemWithBadge.href} className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="relative">
                              <Icon className="h-4 w-4 flex-shrink-0" />
                              {!isOpen && itemWithBadge.badge && (
                                <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                              )}
                            </div>
                            {isOpen && <span className="truncate">{itemWithBadge.title}</span>}
                          </Link>
                          {isOpen && (
                            <button
                              onClick={() => toggleSubmenu(itemWithBadge.href)}
                              className="p-1 hover:bg-accent/50 rounded transition-colors"
                            >
                              {submenuExpanded ? (
                                <ChevronUp className="h-4 w-4 flex-shrink-0" />
                              ) : (
                                <ChevronDown className="h-4 w-4 flex-shrink-0" />
                              )}
                            </button>
                          )}
                        </div>
                      ) : (
                        <Link
                          href={itemWithBadge.href}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all',
                            active
                              ? 'bg-accent text-accent-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                            !isOpen && 'justify-center'
                          )}
                        >
                          <div className="relative">
                            <Icon className="h-4 w-4 flex-shrink-0" />
                            {!isOpen && itemWithBadge.badge && (
                              <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                            )}
                          </div>
                          {isOpen && (
                            <>
                              <span className="truncate">{itemWithBadge.title}</span>
                              {itemWithBadge.badge && (
                                <span className="ml-auto text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                                  {itemWithBadge.badge}
                                </span>
                              )}
                            </>
                          )}
                        </Link>
                      )}

                      {/* Submenu items */}
                      {hasSubmenu && submenuExpanded && isOpen && filteredSubmenu.length > 0 && (
                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-2">
                          {filteredSubmenu.map((subItem) => {
                            const SubIcon = subItem.icon
                            const subActive = isActive(subItem.href)

                            return (
                              <Link
                                key={subItem.href}
                                href={subItem.href}
                                className={cn(
                                  'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all',
                                  subActive
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                                )}
                              >
                                <SubIcon className="h-4 w-4 flex-shrink-0" />
                                <span className="truncate">{subItem.title}</span>
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
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
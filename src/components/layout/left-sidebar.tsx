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
  Building,
  Globe,
  Check
} from 'lucide-react'
import { SampleTin } from '@/components/icons/sample-tin'
import { CuppingBowl } from '@/components/icons/cupping-bowl'
import { Grading } from '@/components/icons/grading'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/components/providers/auth-provider'
import { useSampleIntake } from '@/components/samples/sample-intake-provider'
import { hasPermission } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getPendingSamplesForCupper, getPendingSamplesForGrading } from '@/lib/queries/cupping-assignments'

interface NavItem {
  title: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string
  badge?: string
  submenu?: NavItem[]
  onClick?: () => void
}

const getNavigation = (openIntakeDialog: () => void): NavItem[] => [
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
        icon: Plus,
        permission: 'create_samples',
        onClick: openIntakeDialog,
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
    ],
  },
  {
    title: 'Grading',
    href: '/grading',
    icon: Grading,
    permission: 'conduct_assessments',
  },
  {
    title: 'Cupping',
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
    ],
  },
  {
    title: 'Quality Specs',
    href: '/quality/templates',
    icon: Crown,
    permission: 'manage_quality_specs',
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
  const { openIntakeDialog } = useSampleIntake()
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0)
  const [pendingSamplesCount, setPendingSamplesCount] = useState<number>(0)
  const [pendingGradingSamplesCount, setPendingGradingSamplesCount] = useState<number>(0)
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['/']))
  const [hoverTimeoutId, setHoverTimeoutId] = useState<NodeJS.Timeout | null>(null)
  const [currentLanguage, setCurrentLanguage] = useState('EN')
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)

  const navigation = getNavigation(openIntakeDialog)

  // Auto-expand Dashboard submenu when on a submenu page
  useEffect(() => {
    const dashboardItem = navigation.find(item => item.href === '/')
    if (dashboardItem?.submenu) {
      const isOnSubmenuPage = dashboardItem.submenu.some(subItem =>
        subItem.href && pathname.startsWith(subItem.href)
      )
      if (isOnSubmenuPage) {
        setExpandedMenus(prev => new Set(prev).add('/'))
      }
    }
  }, [pathname, navigation])

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

  // Fetch pending cupping samples count for logged-in cupper
  useEffect(() => {
    const fetchPendingSamples = async () => {
      if (!profile?.id || !hasPermission(permissions, 'conduct_assessments')) {
        return
      }

      try {
        const result = await getPendingSamplesForCupper(supabase, profile.id)
        setPendingSamplesCount(result.pending_count)
      } catch (error) {
        console.error('Error fetching pending samples count:', error)
      }
    }

    fetchPendingSamples()

    // Set up real-time subscription for cupping sessions and scores
    const sessionsChannel = supabase
      .channel('cupping_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cupping_sessions' },
        () => {
          fetchPendingSamples()
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cupping_scores' },
        () => {
          fetchPendingSamples()
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'samples' },
        () => {
          fetchPendingSamples()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(sessionsChannel)
    }
  }, [profile, permissions])

  // Fetch pending grading samples count
  useEffect(() => {
    const fetchPendingGradingSamples = async () => {
      if (!profile?.laboratory_id || !hasPermission(permissions, 'conduct_assessments')) {
        return
      }

      try {
        const count = await getPendingSamplesForGrading(supabase, profile.laboratory_id)
        setPendingGradingSamplesCount(count)
      } catch (error) {
        console.error('Error fetching pending grading samples count:', error)
      }
    }

    fetchPendingGradingSamples()

    // Set up real-time subscription for quality_assessments and samples
    const gradingChannel = supabase
      .channel('grading_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'quality_assessments' },
        () => {
          fetchPendingGradingSamples()
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'samples' },
        () => {
          fetchPendingGradingSamples()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(gradingChannel)
    }
  }, [profile, permissions])

  const filterNavByPermissions = (nav: NavItem[]) => {
    return nav.filter(item => !item.permission || hasPermission(permissions, item.permission))
  }

  const isActive = (href?: string) => {
    if (!href) return false
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
    return submenu.some(item => item.href && isActive(item.href))
  }

  // Add badge to nav items
  const getNavItemWithBadge = (item: NavItem): NavItem => {
    if (item.href === '/users' && pendingRequestsCount > 0) {
      return { ...item, badge: String(pendingRequestsCount) }
    }
    if (item.href === '/cupping' && pendingSamplesCount > 0) {
      return { ...item, badge: String(pendingSamplesCount) }
    }
    if (item.href === '/grading' && pendingGradingSamplesCount > 0) {
      return { ...item, badge: String(pendingGradingSamplesCount) }
    }
    return item
  }

  // Auto-collapse sidebar when clicking on any link
  const handleLinkClick = () => {
    if (isOpen && onToggle) {
      onToggle()
    }
  }

  // Auto-expand on mouse enter
  const handleMouseEnter = () => {
    // Clear any pending collapse timeout
    if (hoverTimeoutId) {
      clearTimeout(hoverTimeoutId)
      setHoverTimeoutId(null)
    }

    // Expand sidebar if it's collapsed
    if (!isOpen && onToggle) {
      onToggle()
    }
  }

  // Auto-collapse on mouse leave with delay
  const handleMouseLeave = () => {
    // Add a small delay before collapsing to prevent flickering
    const timeoutId = setTimeout(() => {
      if (isOpen && onToggle) {
        onToggle()
      }
    }, 300) // 300ms delay

    setHoverTimeoutId(timeoutId)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutId) {
        clearTimeout(hoverTimeoutId)
      }
    }
  }, [hoverTimeoutId])

  return (
    <aside
      className={cn(
        'h-full border-r border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300',
        isOpen ? 'w-64' : 'w-16'
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex flex-col h-full">
        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2 pt-4">
          {/* Main Navigation */}
          <div className="space-y-1">
            {filterNavByPermissions(navigation).map((item) => {
              const itemWithBadge = getNavItemWithBadge(item)
              const Icon = itemWithBadge.icon
              const active = isActive(itemWithBadge.href)
              const hasSubmenu = itemWithBadge.submenu && itemWithBadge.submenu.length > 0
              const submenuExpanded = itemWithBadge.href ? expandedMenus.has(itemWithBadge.href) : false
              const submenuActive = isSubmenuActive(itemWithBadge.submenu)
              const filteredSubmenu = hasSubmenu
                ? itemWithBadge.submenu!.filter(subItem => !subItem.permission || hasPermission(permissions, subItem.permission))
                : []

              return (
                <div key={itemWithBadge.href || itemWithBadge.title}>
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
                      {itemWithBadge.href ? (
                        <Link href={itemWithBadge.href} className="flex items-center gap-3 flex-1 min-w-0" onClick={handleLinkClick}>
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          {isOpen && <span className="truncate">{itemWithBadge.title}</span>}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          {isOpen && <span className="truncate">{itemWithBadge.title}</span>}
                        </div>
                      )}
                      {isOpen && itemWithBadge.href && (
                        <button
                          onClick={() => toggleSubmenu(itemWithBadge.href!)}
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
                  ) : itemWithBadge.href ? (
                    <Link
                      href={itemWithBadge.href}
                      onClick={handleLinkClick}
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
                  ) : null}

                  {/* Submenu items */}
                  {hasSubmenu && submenuExpanded && isOpen && filteredSubmenu.length > 0 && (
                    <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-2">
                      {filteredSubmenu.map((subItem) => {
                        const SubIcon = subItem.icon
                        const subActive = subItem.href ? isActive(subItem.href) : false
                        const key = subItem.href || subItem.title

                        // If onClick is provided, render as button
                        if (subItem.onClick) {
                          return (
                            <button
                              key={key}
                              onClick={subItem.onClick}
                              className={cn(
                                'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all w-full text-left',
                                subActive
                                  ? 'bg-accent text-accent-foreground'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                              )}
                            >
                              <SubIcon className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{subItem.title}</span>
                            </button>
                          )
                        }

                        // Otherwise render as link
                        return (
                          <Link
                            key={key}
                            href={subItem.href!}
                            onClick={handleLinkClick}
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
                  const submenuExpanded = itemWithBadge.href ? expandedMenus.has(itemWithBadge.href) : false
                  const submenuActive = isSubmenuActive(itemWithBadge.submenu)
                  const filteredSubmenu = hasSubmenu
                    ? itemWithBadge.submenu!.filter(subItem => !subItem.permission || hasPermission(permissions, subItem.permission))
                    : []

                  return (
                    <div key={itemWithBadge.href || itemWithBadge.title}>
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
                          {itemWithBadge.href ? (
                            <Link href={itemWithBadge.href} className="flex items-center gap-3 flex-1 min-w-0" onClick={handleLinkClick}>
                              <div className="relative">
                                <Icon className="h-4 w-4 flex-shrink-0" />
                                {!isOpen && itemWithBadge.badge && (
                                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                                )}
                              </div>
                              {isOpen && <span className="truncate">{itemWithBadge.title}</span>}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="relative">
                                <Icon className="h-4 w-4 flex-shrink-0" />
                                {!isOpen && itemWithBadge.badge && (
                                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                                )}
                              </div>
                              {isOpen && <span className="truncate">{itemWithBadge.title}</span>}
                            </div>
                          )}
                          {isOpen && itemWithBadge.href && (
                            <button
                              onClick={() => toggleSubmenu(itemWithBadge.href!)}
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
                      ) : itemWithBadge.href ? (
                        <Link
                          href={itemWithBadge.href}
                          onClick={handleLinkClick}
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
                      ) : null}

                      {/* Submenu items */}
                      {hasSubmenu && submenuExpanded && isOpen && filteredSubmenu.length > 0 && (
                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-2">
                          {filteredSubmenu.map((subItem) => {
                            const SubIcon = subItem.icon
                            const subActive = subItem.href ? isActive(subItem.href) : false
                            const key = subItem.href || subItem.title

                            // If onClick is provided, render as button
                            if (subItem.onClick) {
                              return (
                                <button
                                  key={key}
                                  onClick={subItem.onClick}
                                  className={cn(
                                    'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all w-full text-left',
                                    subActive
                                      ? 'bg-accent text-accent-foreground'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                                  )}
                                >
                                  <SubIcon className="h-4 w-4 flex-shrink-0" />
                                  <span className="truncate">{subItem.title}</span>
                                </button>
                              )
                            }

                            // Otherwise render as link
                            return (
                              <Link
                                key={key}
                                href={subItem.href!}
                                onClick={handleLinkClick}
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

        {/* Language Selector - Only visible on mobile (when sidebar is overlay) */}
        <div className="p-2 border-t border-border lg:hidden">
          <div className="relative">
            <button
              onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all w-full',
                'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              <Globe className="h-4 w-4 flex-shrink-0" />
              {isOpen && (
                <>
                  <span className="truncate">Language</span>
                  <span className="ml-auto text-xs bg-accent px-2 py-0.5 rounded">{currentLanguage}</span>
                </>
              )}
            </button>

            {/* Language options dropdown */}
            {languageMenuOpen && isOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
                {[
                  { code: 'EN', label: 'English' },
                  { code: 'PT', label: 'Português' },
                  { code: 'ES', label: 'Español' },
                ].map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setCurrentLanguage(lang.code)
                      setLanguageMenuOpen(false)
                      console.log(`Language changed to: ${lang.code}`)
                    }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 text-sm w-full text-left transition-colors',
                      currentLanguage === lang.code
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    )}
                  >
                    <span className="flex-1">{lang.label} ({lang.code})</span>
                    {currentLanguage === lang.code && (
                      <Check className="h-4 w-4 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Settings - Temporarily disabled until page is created */}
        {/* <div className="p-2 border-t border-border">
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
        </div> */}
      </div>
    </aside>
  )
}
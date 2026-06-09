'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  FlaskConical,
  Coffee,
  FileText,
  Mail,
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
  Check,
  PanelLeftClose,
  PanelLeft,
  ChevronsLeftRight
} from 'lucide-react'
import { SampleTin } from '@/components/icons/sample-tin'
import { CuppingBowl } from '@/components/icons/cupping-bowl'
import { Grading } from '@/components/icons/grading'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/components/providers/auth-provider'
import { useSampleIntake } from '@/components/samples/sample-intake-provider'
import { hasPermission } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getPendingSamplesForCupper, getPendingGradingSamplesForCupper } from '@/lib/queries/cupping-assignments'

export type SidebarMode = 'expanded' | 'collapsed' | 'hover'

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
      {
        title: 'Reports',
        href: '/dashboard/reports',
        icon: FileText,
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
        title: 'QC Samples',
        href: '/samples/qc',
        icon: List,
        permission: 'view_samples',
      },
      {
        title: 'Other Samples',
        href: '/samples/other',
        icon: ClipboardList,
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
    title: 'Specialty (CVA)',
    href: '/cupping/cva',
    icon: CuppingBowl,
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
    title: 'Users',
    href: '/users',
    icon: Users,
    permission: 'manage_users',
  },
  {
    title: 'Settings',
    icon: Settings,
    submenu: [
      {
        title: 'Email Signature',
        href: '/dashboard/settings/signature',
        icon: Mail,
      },
    ],
  },
]

interface LeftSidebarProps {
  isExpanded: boolean
  sidebarMode: SidebarMode
  onModeChange: (mode: SidebarMode) => void
  onHoverEnter?: () => void
  onHoverLeave?: () => void
}

export function LeftSidebar({ isExpanded, sidebarMode, onModeChange, onHoverEnter, onHoverLeave }: LeftSidebarProps) {
  const pathname = usePathname()
  const { permissions, profile } = useAuth()
  const { openIntakeDialog } = useSampleIntake()
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0)
  const [pendingSamplesCount, setPendingSamplesCount] = useState<number>(0)
  const [pendingGradingSamplesCount, setPendingGradingSamplesCount] = useState<number>(0)
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['/']))
  const [mounted, setMounted] = useState(false)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const navigation = getNavigation(openIntakeDialog)

  // Auto-expand Dashboard submenu when on a submenu page.
  // `navigation` is rebuilt every render, so it can't go in the dep array —
  // pairing it with a `new Set(prev)` setter previously caused an infinite
  // render loop on /dashboard/* pages (each commit produced a new Set
  // reference even though contents were identical, retriggering the effect).
  useEffect(() => {
    if (!pathname.startsWith('/dashboard/')) return
    setExpandedMenus(prev => {
      if (prev.has('/')) return prev
      const next = new Set(prev)
      next.add('/')
      return next
    })
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

    const channel = supabase
      .channel('access_requests_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'access_requests' },
        () => { fetchPendingRequests() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
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

    const sessionsChannel = supabase
      .channel('cupping_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cupping_sessions' },
        () => { fetchPendingSamples() }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cupping_scores' },
        () => { fetchPendingSamples() }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'samples' },
        () => { fetchPendingSamples() }
      )
      .subscribe()

    return () => { supabase.removeChannel(sessionsChannel) }
  }, [profile, permissions])

  // Fetch pending grading samples count for logged-in cupper
  useEffect(() => {
    const fetchPendingGradingSamples = async () => {
      if (!profile?.id || !hasPermission(permissions, 'conduct_assessments')) {
        return
      }

      try {
        const count = await getPendingGradingSamplesForCupper(supabase, profile.id)
        setPendingGradingSamplesCount(count)
      } catch (error) {
        console.error('Error fetching pending grading samples count:', error)
      }
    }

    fetchPendingGradingSamples()

    const gradingChannel = supabase
      .channel('grading_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'quality_assessments' },
        () => { fetchPendingGradingSamples() }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'samples' },
        () => { fetchPendingGradingSamples() }
      )
      .subscribe()

    return () => { supabase.removeChannel(gradingChannel) }
  }, [profile, permissions])

  const filterNavByPermissions = (nav: NavItem[]) => {
    if (!mounted) return nav
    return nav.filter(item => !item.permission || hasPermission(permissions, item.permission))
  }

  const isActive = (href?: string) => {
    if (!href) return false
    if (href === '/') return pathname === '/'
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

  // Cycle through modes: expanded -> collapsed -> hover -> expanded
  const cycleSidebarMode = () => {
    const modes: SidebarMode[] = ['expanded', 'collapsed', 'hover']
    const currentIndex = modes.indexOf(sidebarMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    onModeChange(nextMode)
  }

  const getModeIcon = () => {
    switch (sidebarMode) {
      case 'expanded': return PanelLeftClose
      case 'collapsed': return PanelLeft
      case 'hover': return ChevronsLeftRight
    }
  }

  const getModeTooltip = () => {
    switch (sidebarMode) {
      case 'expanded': return 'Collapse sidebar'
      case 'collapsed': return 'Expand on hover'
      case 'hover': return 'Expand sidebar'
    }
  }

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    onHoverEnter?.()
  }

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      onHoverLeave?.()
    }, 300)
  }

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  // Collapsed icon width for centering (w-14 = 56px)
  const COLLAPSED_WIDTH = 'w-14'

  const renderNavItem = (item: NavItem) => {
    const itemWithBadge = getNavItemWithBadge(item)
    const Icon = itemWithBadge.icon
    const active = isActive(itemWithBadge.href)
    const hasSubmenu = itemWithBadge.submenu && itemWithBadge.submenu.length > 0
    const submenuExpanded = itemWithBadge.href ? expandedMenus.has(itemWithBadge.href) : false
    const submenuActive = isSubmenuActive(itemWithBadge.submenu)
    const filteredSubmenu = hasSubmenu
      ? (mounted
          ? itemWithBadge.submenu!.filter(subItem => !subItem.permission || hasPermission(permissions, subItem.permission))
          : itemWithBadge.submenu!)
      : []

    return (
      <div key={itemWithBadge.href || itemWithBadge.title}>
        {hasSubmenu && filteredSubmenu.length > 0 ? (
          <div
            className={cn(
              'flex items-center text-sm font-medium rounded-xl transition-all',
              active || submenuActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              !isExpanded ? 'justify-center' : 'px-3 py-2 gap-3'
            )}
          >
            {itemWithBadge.href ? (
              <Link
                href={itemWithBadge.href}
                className={cn(
                  'flex items-center flex-1 min-w-0',
                  isExpanded ? 'gap-3' : 'justify-center py-2'
                )}
                title={!isExpanded ? itemWithBadge.title : undefined}
              >
                <div className={cn(
                  'flex items-center justify-center flex-shrink-0',
                  !isExpanded && 'w-14 h-8'
                )}>
                  <div className="relative">
                    <Icon className="h-4 w-4" />
                    {!isExpanded && itemWithBadge.badge && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                    )}
                  </div>
                </div>
                {isExpanded && <span className="truncate">{itemWithBadge.title}</span>}
              </Link>
            ) : (
              <div className={cn(
                'flex items-center flex-1 min-w-0',
                isExpanded ? 'gap-3' : 'justify-center py-2'
              )}>
                <div className={cn(
                  'flex items-center justify-center flex-shrink-0',
                  !isExpanded && 'w-14 h-8'
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                {isExpanded && <span className="truncate">{itemWithBadge.title}</span>}
              </div>
            )}
            {isExpanded && itemWithBadge.href && (
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
            title={!isExpanded ? itemWithBadge.title : undefined}
            className={cn(
              'flex items-center text-sm font-medium rounded-xl transition-all',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              isExpanded ? 'gap-3 px-3 py-2' : 'justify-center py-2'
            )}
          >
            <div className={cn(
              'flex items-center justify-center flex-shrink-0',
              !isExpanded && 'w-14 h-8'
            )}>
              <div className="relative">
                <Icon className="h-4 w-4" />
                {!isExpanded && itemWithBadge.badge && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                )}
              </div>
            </div>
            {isExpanded && (
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
        {hasSubmenu && submenuExpanded && isExpanded && filteredSubmenu.length > 0 && (
          <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-2">
            {filteredSubmenu.map((subItem) => {
              const SubIcon = subItem.icon
              const subActive = subItem.href ? isActive(subItem.href) : false
              const key = subItem.href || subItem.title

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

              return (
                <Link
                  key={key}
                  href={subItem.href!}
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
  }

  const ModeIcon = getModeIcon()

  return (
    <aside
      className={cn(
        'h-full border-r border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300 overflow-hidden',
        isExpanded ? 'w-64' : 'w-14'
      )}
      onMouseEnter={sidebarMode === 'hover' ? handleMouseEnter : undefined}
      onMouseLeave={sidebarMode === 'hover' ? handleMouseLeave : undefined}
    >
      <div className="flex flex-col h-full">
        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-1 pt-4 overflow-y-auto overflow-x-hidden">
          {/* Main Navigation */}
          <div className="space-y-1">
            {filterNavByPermissions(navigation).map(renderNavItem)}
          </div>

          {/* Management Section */}
          {filterNavByPermissions(managementNav).length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-1">
                {isExpanded && (
                  <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Management
                  </h3>
                )}
                {filterNavByPermissions(managementNav).map(renderNavItem)}
              </div>
            </>
          )}
        </nav>

        {/* Sidebar Mode Toggle */}
        <div className="border-t border-border p-1">
          <button
            onClick={cycleSidebarMode}
            title={getModeTooltip()}
            className={cn(
              'flex items-center text-sm font-medium rounded-xl transition-all w-full text-muted-foreground hover:text-foreground hover:bg-accent/50',
              isExpanded ? 'gap-3 px-3 py-2' : 'justify-center py-2'
            )}
          >
            <div className={cn(
              'flex items-center justify-center flex-shrink-0',
              !isExpanded && 'w-14 h-8'
            )}>
              <ModeIcon className="h-4 w-4" />
            </div>
            {isExpanded && (
              <span className="truncate text-xs">
                {sidebarMode === 'expanded' ? 'Collapse' : sidebarMode === 'collapsed' ? 'Expand on hover' : 'Expand'}
              </span>
            )}
          </button>
        </div>

        {/* Language Selector - Only visible on mobile */}
        <div className="p-1 border-t border-border lg:hidden">
          <div className="relative">
            <button
              className={cn(
                'flex items-center text-sm font-medium rounded-xl transition-all w-full',
                'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                isExpanded ? 'gap-3 px-3 py-2' : 'justify-center py-2'
              )}
            >
              <div className={cn(
                'flex items-center justify-center flex-shrink-0',
                !isExpanded && 'w-14 h-8'
              )}>
                <Globe className="h-4 w-4" />
              </div>
              {isExpanded && (
                <>
                  <span className="truncate">Language</span>
                  <span className="ml-auto text-xs bg-accent px-2 py-0.5 rounded">EN</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

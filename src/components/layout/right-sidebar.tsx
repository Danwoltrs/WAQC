'use client'

import { useRouter } from 'next/navigation'
import { Bell, Calendar, Clock, AlertCircle, CheckCircle, XCircle, X, AlertTriangle, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useNotifications, useActivityFeed } from '@/hooks/use-notifications'

interface RightSidebarProps {
  onClose?: () => void
}

const getNotificationIcon = (type: 'info' | 'warning' | 'success' | 'error', priority?: string) => {
  // Priority badge takes precedence
  if (priority === 'urgent') {
    return <AlertCircle className="h-4 w-4 text-red-500" />
  }
  if (priority === 'normal') {
    return <AlertTriangle className="h-4 w-4 text-amber-500" />
  }
  if (priority === 'info') {
    return <Info className="h-4 w-4 text-blue-500" />
  }

  // Fallback to type-based icons
  switch (type) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-emerald-500" />
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-amber-500" />
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <Bell className="h-4 w-4 lab-icon" />
  }
}

const formatTimeAgo = (date: Date) => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function RightSidebar({ onClose }: RightSidebarProps) {
  const router = useRouter()
  const { notifications, unreadCount, markAsRead, loading: notificationsLoading } = useNotifications({ limit: 10 })
  const { activities, loading: activitiesLoading } = useActivityFeed({ limit: 10 })

  const handleNotificationClick = async (notificationId: string, link?: string | null) => {
    try {
      // Mark as read
      await markAsRead([notificationId])

      // Navigate to link if provided
      if (link) {
        // Close the sidebar first
        if (onClose) {
          onClose()
        }
        // Navigate to the link
        router.push(link)
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  return (
    <aside className="w-80 border-l border-border bg-background shadow-2xl flex flex-col overflow-y-auto max-h-screen">
      {/* Header with close button */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-sm font-semibold">Notifications & Activity</h2>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Notifications */}
      <Card className="m-4 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-semibold">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </div>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {unreadCount}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notificationsLoading ? (
            <div className="text-center text-sm text-muted-foreground py-4">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-4">
              No notifications
            </div>
          ) : (
            notifications.slice(0, 10).map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification.id, notification.link)}
                className={cn(
                  'flex gap-3 p-2 rounded-lg transition-colors hover:bg-accent/50 cursor-pointer',
                  !notification.read && 'bg-accent/20'
                )}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getNotificationIcon(notification.type, notification.metadata?.priority)}
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="text-sm font-medium leading-none">
                    {notification.title}
                  </h4>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {notification.message}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span suppressHydrationWarning>{formatTimeAgo(new Date(notification.created_at))}</span>
                  </div>
                </div>
              </div>
            ))
          )}
          <Separator />
          <Button variant="ghost" size="sm" className="w-full text-xs">
            View All Notifications
          </Button>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="mx-4 mb-4 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activitiesLoading ? (
            <div className="text-center text-sm text-muted-foreground py-4">
              Loading activity...
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-4">
              No recent activity
            </div>
          ) : (
            activities.slice(0, 10).map((activity) => (
              <div key={activity.id} className="flex gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {activity.actor?.full_name ? activity.actor.full_name.split(' ').map(n => n[0]).join('') : '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <p className="text-xs leading-relaxed">
                    <span className="font-medium">{activity.actor?.full_name || 'Unknown'}</span>{' '}
                    <span className="text-muted-foreground">{activity.action}</span>{' '}
                    <span className="font-medium">{activity.entity_name || activity.entity_type}</span>
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span suppressHydrationWarning>{formatTimeAgo(new Date(activity.created_at))}</span>
                  </div>
                </div>
              </div>
            ))
          )}
          <Separator />
          <Button variant="ghost" size="sm" className="w-full text-xs">
            View All Activity
          </Button>
        </CardContent>
      </Card>
    </aside>
  )
}
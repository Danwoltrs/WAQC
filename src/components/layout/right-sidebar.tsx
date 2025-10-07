'use client'

import { Bell, Calendar, Clock, User, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  type: 'info' | 'warning' | 'success' | 'error'
  title: string
  message: string
  timestamp: Date
  read: boolean
}

interface Activity {
  id: string
  user: string
  userAvatar?: string
  action: string
  target: string
  timestamp: Date
  type: 'sample' | 'assessment' | 'certificate' | 'user'
}

// Mock data - replace with actual data fetching
const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'warning',
    title: 'Storage Almost Full',
    message: 'Santos HQ storage is at 85% capacity',
    timestamp: new Date(Date.now() - 10 * 60000), // 10 minutes ago
    read: false
  },
  {
    id: '2',
    type: 'success',
    title: 'Certificate Generated',
    message: 'Certificate #QC-2025-001 has been issued',
    timestamp: new Date(Date.now() - 30 * 60000), // 30 minutes ago
    read: false
  },
  {
    id: '3',
    type: 'info',
    title: 'New Sample Received',
    message: 'Colombian Huila from Exporter ABC',
    timestamp: new Date(Date.now() - 60 * 60000), // 1 hour ago
    read: true
  }
]

const mockActivities: Activity[] = [
  {
    id: '1',
    user: 'Maria Santos',
    action: 'completed cupping session for',
    target: 'Brazilian Cerrado samples',
    timestamp: new Date(Date.now() - 15 * 60000),
    type: 'assessment'
  },
  {
    id: '2',
    user: 'João Silva',
    action: 'updated quality specification for',
    target: 'Colombian Supremo',
    timestamp: new Date(Date.now() - 45 * 60000),
    type: 'sample'
  },
  {
    id: '3',
    user: 'Ana Rodriguez',
    action: 'generated certificate for',
    target: 'Sample #QC-2025-001',
    timestamp: new Date(Date.now() - 90 * 60000),
    type: 'certificate'
  }
]

const getNotificationIcon = (type: Notification['type']) => {
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

export function RightSidebar() {
  const unreadCount = mockNotifications.filter(n => !n.read).length

  return (
    <aside className="w-80 h-full border-l border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex flex-col">
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
          {mockNotifications.slice(0, 3).map((notification) => (
            <div
              key={notification.id}
              className={cn(
                'flex gap-3 p-2 rounded-lg transition-colors hover:bg-accent/50',
                !notification.read && 'bg-accent/20'
              )}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getNotificationIcon(notification.type)}
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
                  <span suppressHydrationWarning>{formatTimeAgo(notification.timestamp)}</span>
                </div>
              </div>
            </div>
          ))}
          <Separator />
          <Button variant="ghost" size="sm" className="w-full text-xs">
            View All Notifications
          </Button>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="mx-4 mb-4 border-border flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mockActivities.map((activity) => (
            <div key={activity.id} className="flex gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarImage src={activity.userAvatar} />
                <AvatarFallback className="text-xs">
                  {activity.user.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <p className="text-xs leading-relaxed">
                  <span className="font-medium">{activity.user}</span>{' '}
                  <span className="text-muted-foreground">{activity.action}</span>{' '}
                  <span className="font-medium">{activity.target}</span>
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatTimeAgo(activity.timestamp)}
                </div>
              </div>
            </div>
          ))}
          <Separator />
          <Button variant="ghost" size="sm" className="w-full text-xs">
            View All Activity
          </Button>
        </CardContent>
      </Card>

      {/* Quick Contacts */}
      <Card className="mx-4 mb-4 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4" />
            Quick Contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { name: 'Lab Manager', status: 'online' },
            { name: 'Quality Director', status: 'away' },
            { name: 'Finance Team', status: 'offline' }
          ].map((contact) => (
            <div key={contact.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
              <div className="relative">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {contact.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background',
                  contact.status === 'online' && 'bg-green-500',
                  contact.status === 'away' && 'bg-yellow-500',
                  contact.status === 'offline' && 'bg-gray-400'
                )} />
              </div>
              <span className="text-xs font-medium">{contact.name}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </aside>
  )
}
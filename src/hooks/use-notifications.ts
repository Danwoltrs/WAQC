import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'

export interface Notification {
  id: string
  user_id: string | null
  laboratory_id: string | null
  type: 'info' | 'warning' | 'success' | 'error'
  title: string
  message: string
  read: boolean
  link: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface ActivityFeedItem {
  id: string
  user_id: string | null
  laboratory_id: string | null
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  entity_name: string | null
  metadata: Record<string, any>
  created_at: string
  actor?: {
    id: string
    full_name: string
  }
}

export function useNotifications(options?: { unreadOnly?: boolean; limit?: number }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { profile, loading: authLoading } = useAuth()

  const fetchNotifications = useCallback(async () => {
    // Don't fetch if profile isn't loaded yet or doesn't exist
    if (authLoading || !profile) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (options?.limit) params.append('limit', options.limit.toString())
      if (options?.unreadOnly) params.append('unread', 'true')

      const response = await fetch(`/api/notifications?${params.toString()}`)

      if (!response.ok) {
        // Silently fail for 401/403 errors (user might not have access yet)
        if (response.status === 401 || response.status === 403) {
          setNotifications([])
          setError(null)
          return
        }
        throw new Error('Failed to fetch notifications')
      }

      const data = await response.json()
      setNotifications(data.notifications || [])
      setError(null)
    } catch (err) {
      console.error('Error fetching notifications:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications')
      setNotifications([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }, [options?.limit, options?.unreadOnly, profile, authLoading])

  const markAsRead = useCallback(async (notificationIds: string[]) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: notificationIds, read: true })
      })

      if (!response.ok) {
        throw new Error('Failed to mark notifications as read')
      }

      // Update local state
      setNotifications(prev =>
        prev.map(notif =>
          notificationIds.includes(notif.id)
            ? { ...notif, read: true }
            : notif
        )
      )
    } catch (err) {
      console.error('Error marking notifications as read:', err)
      throw err
    }
  }, [])

  const createNotification = useCallback(async (notification: {
    type: Notification['type']
    title: string
    message: string
    link?: string
    metadata?: Record<string, any>
    user_id?: string
    laboratory_id?: string
  }) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification)
      })

      if (!response.ok) {
        throw new Error('Failed to create notification')
      }

      const data = await response.json()

      // Add to local state
      setNotifications(prev => [data.notification, ...prev])

      return data.notification
    } catch (err) {
      console.error('Error creating notification:', err)
      throw err
    }
  }, [])

  useEffect(() => {
    // Only fetch if we have a profile
    if (!profile || authLoading) return

    fetchNotifications()

    // Set up real-time subscription
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications'
        },
        (payload) => {
          console.log('Notification change:', payload)
          fetchNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, authLoading]) // Only re-run when profile ID or auth loading state changes

  // Only count unread notifications from the last 30 days for the badge
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const unreadCount = notifications.filter(
    n => !n.read && new Date(n.created_at) > thirtyDaysAgo
  ).length

  const markAllAsSeen = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return
    try {
      await markAsRead(unreadIds)
    } catch (err) {
      console.error('Error marking all as seen:', err)
    }
  }, [notifications, markAsRead])

  return {
    notifications,
    loading,
    error,
    unreadCount,
    markAsRead,
    markAllAsSeen,
    createNotification,
    refetch: fetchNotifications
  }
}

export function useActivityFeed(options?: { limit?: number; entityType?: string }) {
  const [activities, setActivities] = useState<ActivityFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { profile, loading: authLoading } = useAuth()

  const fetchActivities = useCallback(async () => {
    // Don't fetch if profile isn't loaded yet or doesn't exist
    if (authLoading || !profile) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (options?.limit) params.append('limit', options.limit.toString())
      if (options?.entityType) params.append('entity_type', options.entityType)

      // Add a 5-second timeout so the UI doesn't hang forever
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`/api/activity-feed?${params.toString()}`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        // Silently fail for 401/403 errors (user might not have access yet)
        if (response.status === 401 || response.status === 403) {
          setActivities([])
          setError(null)
          return
        }
        throw new Error('Failed to fetch activity feed')
      }

      const data = await response.json()
      setActivities(data.activities || [])
      setError(null)
    } catch (err) {
      // On abort (timeout) or any error, show empty state instead of loading forever
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.warn('Activity feed fetch timed out after 5s')
      } else {
        console.error('Error fetching activity feed:', err)
      }
      setError(null) // Don't show error, just show empty state
      setActivities([])
    } finally {
      setLoading(false)
    }
  }, [options?.limit, options?.entityType, profile, authLoading])

  const logActivity = useCallback(async (activity: {
    action: string
    entity_type: string
    entity_id?: string
    entity_name?: string
    metadata?: Record<string, any>
  }) => {
    try {
      const response = await fetch('/api/activity-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activity)
      })

      if (!response.ok) {
        throw new Error('Failed to log activity')
      }

      const data = await response.json()

      // Add to local state
      setActivities(prev => [data.activity, ...prev])

      return data.activity
    } catch (err) {
      console.error('Error logging activity:', err)
      throw err
    }
  }, [])

  useEffect(() => {
    // Only fetch if we have a profile
    if (!profile || authLoading) return

    fetchActivities()

    // Set up real-time subscription
    const channel = supabase
      .channel('activity_feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_feed'
        },
        (payload) => {
          console.log('Activity feed change:', payload)
          fetchActivities()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, authLoading]) // Only re-run when profile ID or auth loading state changes

  return {
    activities,
    loading,
    error,
    logActivity,
    refetch: fetchActivities
  }
}

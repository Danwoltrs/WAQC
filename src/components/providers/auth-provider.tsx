'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, type Database, type UserRole } from '@/lib/supabase'
import { getUserPermissions } from '@/lib/auth'
import { NetworkError } from '@/components/errors/network-error'

type Profile = Database['public']['Tables']['profiles']['Row']

// Timeout wrapper with better error handling
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 8000,
  errorMessage: string = 'Request timeout'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  )

  return Promise.race([fn(), timeoutPromise])
}

// Server-side profile creation via API (bypasses RLS)
async function ensureProfileViaAPI(): Promise<{ success: boolean; profile?: any; error?: string }> {
  try {
    const response = await fetch('/api/profiles/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return { success: false, error: data.error || 'Failed to create profile' }
    }

    const data = await response.json()
    return { success: true, profile: data.profile }
  } catch (error: any) {
    console.error('[Auth] API profile creation failed:', error)
    return { success: false, error: error.message }
  }
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  permissions: string[]
  loading: boolean
  networkError: boolean
  signOut: () => Promise<void>
  getLastActivity: () => number | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Profile cache keys for localStorage
const PROFILE_CACHE_KEY = 'waqc_profile_cache'
const PROFILE_CACHE_TIMESTAMP_KEY = 'waqc_profile_cache_timestamp'
const PROFILE_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours - profile changes rarely, keep cached longer

// Session activity tracking
const LAST_ACTIVITY_KEY = 'waqc_last_activity'
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart']

// Global utility function for manual session cleanup (accessible from browser console)
// Users can call: window.clearWAQCSession() if they encounter auth issues
if (typeof window !== 'undefined') {
  (window as any).clearWAQCSession = () => {
    // Clear all Supabase auth keys
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('sb-')) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })

    // Clear WAQC cache
    localStorage.removeItem(PROFILE_CACHE_KEY)
    localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY)
    localStorage.removeItem(LAST_ACTIVITY_KEY)

    // Clear session storage
    sessionStorage.clear()

    console.log('[WAQC] Session cleared. Refresh the page to log in again.')
  }
}

// Helper to get cached profile from localStorage
function getCachedProfile(): Profile | null {
  try {
    if (typeof window === 'undefined') return null

    const cached = localStorage.getItem(PROFILE_CACHE_KEY)
    const timestamp = localStorage.getItem(PROFILE_CACHE_TIMESTAMP_KEY)

    if (!cached || !timestamp) return null

    const age = Date.now() - parseInt(timestamp)
    if (age > PROFILE_CACHE_TTL) {
      // Cache expired
      localStorage.removeItem(PROFILE_CACHE_KEY)
      localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY)
      return null
    }

    return JSON.parse(cached)
  } catch (error) {
    console.error('Error reading profile cache:', error)
    return null
  }
}

// Helper to save profile to localStorage cache
function setCachedProfile(profile: Profile | null) {
  try {
    if (typeof window === 'undefined') return

    if (profile) {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
      localStorage.setItem(PROFILE_CACHE_TIMESTAMP_KEY, Date.now().toString())
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY)
      localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY)
    }
  } catch (error) {
    console.error('Error saving profile cache:', error)
  }
}

// Helper to update last activity timestamp
function updateLastActivity() {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
  } catch (error) {
    console.error('Error updating last activity:', error)
  }
}

// Helper to get last activity timestamp
function getLastActivity(): number | null {
  try {
    if (typeof window === 'undefined') return null
    const timestamp = localStorage.getItem(LAST_ACTIVITY_KEY)
    return timestamp ? parseInt(timestamp) : null
  } catch (error) {
    console.error('Error getting last activity:', error)
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // ALWAYS start with loading=true - no SSR tricks, prevents React error #418
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [networkError, setNetworkError] = useState(false)

  useEffect(() => {
    let fallbackTimeout: NodeJS.Timeout | null = null
    let refreshInterval: NodeJS.Timeout | null = null
    let hourlyRefreshInterval: NodeJS.Timeout | null = null
    let isFetchingProfile = false

    // Proactive token refresh - keeps session alive for 30 days
    const setupTokenRefresh = (session: any) => {
      if (!session?.expires_at) return

      // Clear existing intervals
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
      if (hourlyRefreshInterval) {
        clearInterval(hourlyRefreshInterval)
      }

      const expiresAt = session.expires_at * 1000
      const now = Date.now()
      const timeUntilExpiry = expiresAt - now

      // Refresh 5 minutes before expiry
      const refreshTime = Math.max(0, timeUntilExpiry - (5 * 60 * 1000))

      // Primary refresh: just before token expiry
      setTimeout(async () => {
        const { data, error } = await supabase.auth.refreshSession()
        if (!error && data.session) {
          setupTokenRefresh(data.session)
        }
      }, refreshTime)

      // Backup refresh: every hour for long sessions
      hourlyRefreshInterval = setInterval(async () => {
        await supabase.auth.refreshSession()
      }, 60 * 60 * 1000)
    }

    const createUserProfile = async (userId: string) => {
      try {
        const result = await ensureProfileViaAPI()

        if (!result.success) {
          console.error('[Auth] Profile creation failed:', result.error)
          setLoading(false)
          return
        }

        if (result.profile) {
          const profileData = result.profile as Profile
          setProfile(profileData)
          setCachedProfile(profileData)

          const userPermissions = getUserPermissions(
            (profileData.qc_role as UserRole) || 'lab_personnel',
            undefined
          )
          setPermissions(userPermissions)
        }
      } catch (error) {
        console.error('[Auth] Error in createUserProfile:', error)
      } finally {
        setLoading(false)
      }
    }

    const fetchProfile = async (userId: string) => {
      if (!userId) {
        console.error('[Auth] No userId provided to fetchProfile')
        setLoading(false)
        return
      }

      if (isFetchingProfile) {
        return
      }

      isFetchingProfile = true

      try {
        // Single attempt with 8s timeout
        let profileData: Profile | null = null
        let fetchError: any = null

        try {
          const result = await withTimeout(
            async () => await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single(),
            8000,
            'Profile fetch timeout'
          )
          profileData = result.data
          fetchError = result.error
        } catch (err: any) {
          // Timeout or network error
          fetchError = { code: 'TIMEOUT', message: err.message }
        }

        // If direct fetch failed, try server API once (no retries)
        if (fetchError || !profileData) {
          // Only use API fallback for timeout/network errors, not for "profile not found"
          const isNotFound = fetchError?.code === 'PGRST116' ||
            fetchError?.message?.includes('No rows returned') ||
            fetchError?.message?.includes('JSON object requested, multiple (or no) rows returned')

          if (!isNotFound) {
            const apiResult = await ensureProfileViaAPI()
            if (apiResult.success && apiResult.profile) {
              profileData = apiResult.profile as Profile
              fetchError = null
            }
          }
        }

        // Handle profile not found - create one
        if (fetchError?.code === 'PGRST116' ||
            fetchError?.message?.includes('No rows returned') ||
            fetchError?.message?.includes('JSON object requested, multiple (or no) rows returned')) {
          await createUserProfile(userId)
          return
        }

        // Handle other errors
        if (fetchError && !profileData) {
          console.error('[Auth] Profile fetch failed:', fetchError.message)
          if (fetchError?.message?.includes('fetch') ||
              fetchError?.message?.includes('network') ||
              fetchError?.message?.includes('connection') ||
              fetchError?.name === 'TypeError') {
            setNetworkError(true)
          }
          setLoading(false)
          return
        }

        if (!profileData) {
          await createUserProfile(userId)
          return
        }

        // Check if QC is enabled
        if (!profileData.qc_enabled) {
          setProfile(profileData as Profile)
          setLoading(false)
          return
        }

        // Ensure user has a QC role
        let finalProfile = profileData
        if (!profileData.qc_role) {
          const { data: updatedProfile, error: updateError } = await supabase
            .from('profiles')
            .update({ qc_role: 'lab_personnel' })
            .eq('id', userId)
            .select()
            .single()

          if (updateError) {
            console.error('[Auth] Error setting default QC role:', updateError)
            setProfile(profileData as Profile)
            setPermissions(getUserPermissions('lab_personnel', undefined))
            setLoading(false)
            return
          } else if (updatedProfile) {
            finalProfile = updatedProfile
          }
        }

        const finalProfileData = finalProfile as Profile
        setProfile(finalProfileData)
        setCachedProfile(finalProfileData)

        // Get laboratory type for permissions
        let laboratoryType: string | undefined
        if (finalProfile.laboratory_id) {
          const { data: labData } = await supabase
            .from('laboratories')
            .select('type')
            .eq('id', finalProfile.laboratory_id)
            .single()
          laboratoryType = labData?.type ?? undefined
        }

        const userPermissions = getUserPermissions(finalProfile.qc_role as UserRole, laboratoryType)
        setPermissions(userPermissions)
        setLoading(false)
      } catch (error: any) {
        console.error('[Auth] Error in fetchProfile:', error)
        if (error?.message?.includes('fetch') ||
            error?.message?.includes('network') ||
            error?.message?.includes('connection') ||
            error?.name === 'TypeError') {
          setNetworkError(true)
        }
        setLoading(false)
      } finally {
        isFetchingProfile = false
      }
    }

    // Subscribe to auth state changes - INITIAL_SESSION fires immediately
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout)
        fallbackTimeout = null
      }

      if (session?.user) {
        setUser(session.user)
        setupTokenRefresh(session)

        // Try to use cached profile for instant render
        const cachedProfile = getCachedProfile()
        if (cachedProfile && cachedProfile.id === session.user.id) {
          setProfile(cachedProfile)
          setPermissions(getUserPermissions(cachedProfile.qc_role as UserRole, undefined))
          setLoading(false)

          // Refresh profile in background
          fetchProfile(session.user.id)
        } else {
          // No cache, fetch now
          await fetchProfile(session.user.id)
        }
      } else {
        setUser(null)
        setProfile(null)
        setCachedProfile(null)
        setPermissions([])
        setLoading(false)
      }
    })

    // Fallback: if nothing happens after 5s, show login
    fallbackTimeout = setTimeout(() => {
      console.warn('[Auth] Auth initialization timeout after 5s - showing login')
      setLoading(false)
    }, 5000)

    return () => {
      subscription.unsubscribe()
      if (fallbackTimeout) clearTimeout(fallbackTimeout)
      if (refreshInterval) clearInterval(refreshInterval)
      if (hourlyRefreshInterval) clearInterval(hourlyRefreshInterval)
    }
  }, [])

  // Separate effect for activity tracking
  useEffect(() => {
    if (!user) return

    const handleActivity = () => {
      updateLastActivity()
    }

    // Refresh session when user returns to tab (for long-term persistence)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const lastActivity = getLastActivity()
        if (lastActivity) {
          const timeSinceActivity = Date.now() - lastActivity
          // If user was away for more than 5 minutes, refresh session
          if (timeSinceActivity > 5 * 60 * 1000) {
            await supabase.auth.refreshSession()
          }
        }
      }
    }

    // Add activity event listeners
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true })
    })
    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange)
    // Record initial activity
    updateLastActivity()

    return () => {
      // Clean up activity listeners
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
      // Clean up visibility listener
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user])

  const signOut = async () => {
    try {
      // Sign out from Supabase
      await supabase.auth.signOut()

      // Clear all cached data
      setCachedProfile(null)

      // Clear all localStorage items related to auth
      if (typeof window !== 'undefined') {
        localStorage.removeItem(PROFILE_CACHE_KEY)
        localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY)
        localStorage.removeItem(LAST_ACTIVITY_KEY)

        // Clear Azure AD/MSAL cache
        sessionStorage.clear()
      }

      // Reset state
      setUser(null)
      setProfile(null)
      setPermissions([])

      // Hard redirect to login page (clears all React state)
      window.location.href = '/'
    } catch (error) {
      console.error('Error during sign out:', error)
      // Even if there's an error, redirect to login
      window.location.href = '/'
    }
  }

  const value: AuthContextType = {
    user,
    profile,
    permissions,
    loading,
    networkError,
    signOut,
    getLastActivity,
  }

  // Show network error screen if Supabase is unreachable
  if (networkError) {
    return (
      <NetworkError
        title="Network Connection Error"
        message="Unable to connect to the Wolthers QC system. This may be due to network restrictions or firewall settings blocking access to our servers."
        onRetry={() => {
          setNetworkError(false)
          setLoading(true)
          window.location.reload()
        }}
      />
    )
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
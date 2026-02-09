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

// Track pending profile fetches to prevent duplicate requests
const pendingProfileFetches = new Map<string, Promise<void>>()

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
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(() => {
    // Try to load cached profile immediately for instant render
    return getCachedProfile()
  })
  const [permissions, setPermissions] = useState<string[]>(() => {
    // If we have a cached profile, load permissions too
    const cached = getCachedProfile()
    if (cached?.qc_role) {
      return getUserPermissions(cached.qc_role as UserRole, undefined)
    }
    return []
  })
  const [loading, setLoading] = useState(() => {
    // If we have a cached profile AND auth tokens, start with loading=false
    // This prevents the loading screen flash on page refresh
    const cachedProfile = getCachedProfile()
    if (!cachedProfile) return true

    // Check if auth tokens exist
    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('sb-') && key.includes('auth-token')) {
          console.log('[Auth] Found cached profile + auth tokens, skipping initial loading screen')
          return false // Have both profile and tokens, skip loading
        }
      }
    }
    return true // No tokens, need to load
  })
  const [networkError, setNetworkError] = useState(false)

  useEffect(() => {
    // This effect runs ONCE on mount to get initial session and set up auth listener
    let isInitialLoad = true
    let refreshInterval: NodeJS.Timeout | null = null
    let hourlyRefreshInterval: NodeJS.Timeout | null = null

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

    // Absolute timeout - if still loading after 20s, force show login
    const absoluteMaxTimeout = setTimeout(() => {
      console.error('[Auth] Auth initialization timeout - showing login')
      setLoading(false)
      setNetworkError(false)
    }, 20000)

    // Get initial session with retry logic
    const getSession = async (retries = 2) => {
      // Quick check: if there's NO Supabase auth data at all in localStorage, skip directly to login
      if (typeof window !== 'undefined') {
        let hasAnySupabaseAuth = false
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('sb-') && key.includes('auth-token')) {
            hasAnySupabaseAuth = true
            break
          }
        }

        if (!hasAnySupabaseAuth) {
          setLoading(false)
          clearTimeout(absoluteMaxTimeout)
          isInitialLoad = false
          return
        }
      }

      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          if (attempt > 0) {
            // Short delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000))
          }

          // 10s timeout for session fetch
          const result = await withTimeout(
            async () => await supabase.auth.getSession(),
            10000,
            'Session fetch timeout'
          )

          if (result.error) {
            // Don't retry on explicit auth errors
            if (result.error.message?.includes('refresh_token') ||
                result.error.message?.includes('invalid') ||
                result.error.status === 401) {
              setLoading(false)
              clearTimeout(absoluteMaxTimeout)
              return
            }
            continue
          }

          const session = result.data.session

          if (session?.user) {
            setUser(session.user)
            setupTokenRefresh(session)

            // Refresh session in background (non-blocking)
            supabase.auth.refreshSession().catch(() => {})

            try {
              await fetchProfile(session.user.id)
              clearTimeout(absoluteMaxTimeout)
            } catch (error) {
              console.error('[Auth] Failed to fetch profile:', error)
              setLoading(false)
            }
          } else {
            setLoading(false)
            clearTimeout(absoluteMaxTimeout)
          }

          break
        } catch (err: any) {
          if (attempt === retries - 1) {
            console.error('[Auth] Session fetch failed after retries:', err.message)
            setLoading(false)
            clearTimeout(absoluteMaxTimeout)
          }
        }
      }

      isInitialLoad = false
    }

    // Call getSession only once on mount
    getSession()

    // Listen for auth state changes (this subscription persists)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Skip the initial SIGNED_IN event that fires immediately after subscription
      // since we already handled it in getSession()
      if (isInitialLoad && event === 'INITIAL_SESSION') {
        return
      }

      if (session?.user) {
        setUser(session.user)
        // Setup proactive token refresh for new session
        setupTokenRefresh(session)
        try {
          await fetchProfile(session.user.id)
        } catch (error) {
          console.error('Failed to fetch profile during auth state change:', error)
          setLoading(false)
        }
      } else {
        setUser(null)
        setProfile(null)
        setCachedProfile(null) // Clear cache on logout
        setPermissions([])
        setLoading(false)
      }
    })

    return () => {
      subscription.unsubscribe()
      // Clean up refresh intervals on unmount
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
      if (hourlyRefreshInterval) {
        clearInterval(hourlyRefreshInterval)
      }
      // Clean up absolute timeout
      clearTimeout(absoluteMaxTimeout)
    }
  }, []) // Empty dependency array - runs once on mount

  // Separate effect for activity tracking that responds to user changes
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
  }, [user]) // Runs when user changes

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

    // Check if there's already a pending fetch for this user
    const existingFetch = pendingProfileFetches.get(userId)
    if (existingFetch) {
      return existingFetch
    }

    console.log('[Auth] Profile fetch started')
    const fetchStartTime = Date.now()

    // Create a new fetch promise
    const fetchPromise = (async () => {
      try {
        // Single attempt with 10s timeout - no retries, immediate API fallback on failure
        const PROFILE_FETCH_TIMEOUT = 10000
        let profileData: Profile | null = null
        let fetchError: any = null

        try {
          const result = await withTimeout(
            async () => await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single(),
            PROFILE_FETCH_TIMEOUT,
            'Profile fetch timeout'
          )
          profileData = result.data
          fetchError = result.error
        } catch (err: any) {
          // Timeout or network error - go straight to API fallback
          fetchError = { code: 'TIMEOUT', message: err.message }
        }

        // If direct fetch failed, try server API immediately (no retries)
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

        // Handle other errors with temporary profile fallback
        if (fetchError && !profileData) {
          console.error('[Auth] Profile fetch failed, using temporary profile:', fetchError.message)

          // Get user info for temporary profile (with quick timeout)
          let authUser: any = null
          try {
            const getUserResult = await withTimeout(
              async () => await supabase.auth.getUser(),
              2000,
              'getUser timeout'
            )
            authUser = getUserResult.data?.user
          } catch {
            // Use minimal info if getUser also fails
          }

          const isGlobalAdmin = ['daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com'].includes(authUser?.email || '')

          const tempProfile = {
            id: userId,
            email: authUser?.email || '',
            full_name: authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'User',
            first_name: null,
            qc_enabled: true,
            qc_role: isGlobalAdmin ? 'global_admin' as UserRole : 'lab_personnel' as UserRole,
            is_global_admin: isGlobalAdmin,
            is_cupper: null,
            is_master_cupper: null,
            is_q_grader: null,
            laboratory_id: null,
            client_id: null,
            qc_permissions: [],
            last_login_at: null,
            last_name: null,
            phone: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          } as Profile

          setProfile(tempProfile)
          setCachedProfile(tempProfile)
          setPermissions(getUserPermissions(isGlobalAdmin ? 'global_admin' : 'lab_personnel', undefined))
          setLoading(false)

          // Try to get real profile in background
          setTimeout(async () => {
            try {
              const result = await ensureProfileViaAPI()
              if (result.success && result.profile) {
                setProfile(result.profile as Profile)
                setCachedProfile(result.profile as Profile)
              }
            } catch {
              // Silent fail - we already have temporary profile
            }
          }, 100)

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
      } catch (error: any) {
        console.error('[Auth] Error in fetchProfile:', error)
        if (error?.message?.includes('fetch') ||
            error?.message?.includes('network') ||
            error?.message?.includes('connection') ||
            error?.name === 'TypeError') {
          setNetworkError(true)
        }
      } finally {
        const elapsed = Date.now() - fetchStartTime
        console.log(`[Auth] Profile fetch ended (${elapsed}ms)`)
        setLoading(false)
      }
    })()

    pendingProfileFetches.set(userId, fetchPromise)
    fetchPromise.finally(() => {
      pendingProfileFetches.delete(userId)
    })

    return fetchPromise
  }

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
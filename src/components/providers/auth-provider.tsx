'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, type Database, type UserRole } from '@/lib/supabase'
import { getUserPermissions } from '@/lib/auth'
import { NetworkError } from '@/components/errors/network-error'

type Profile = Database['public']['Tables']['profiles']['Row']

// Simple timeout wrapper - let Supabase handle retries internally
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 5000,
  errorMessage: string = 'Request timeout'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  )

  return Promise.race([fn(), timeoutPromise])
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
    console.log('[WAQC] Manually clearing all session data...')

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

    console.log('[WAQC] ✓ Session cleared successfully. Please refresh the page and try logging in again.')
    console.log('[WAQC] Removed keys:', keysToRemove)
  }

  console.log('[WAQC] Authentication utilities loaded. Type "window.clearWAQCSession()" in console to manually clear session data.')
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
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
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

      const expiresAt = session.expires_at * 1000 // Convert to milliseconds
      const now = Date.now()
      const timeUntilExpiry = expiresAt - now

      // Refresh 5 minutes before expiry, or immediately if less than 5 minutes left
      const refreshTime = Math.max(0, timeUntilExpiry - (5 * 60 * 1000))

      console.log(`[Auth] Token expires in ${Math.floor(timeUntilExpiry / 60000)} minutes, will refresh in ${Math.floor(refreshTime / 60000)} minutes`)

      // Primary refresh: just before token expiry
      setTimeout(async () => {
        console.log('[Auth] Proactively refreshing session token (expiry-based)')
        const { data, error } = await supabase.auth.refreshSession()

        if (error) {
          console.error('[Auth] Failed to refresh session:', error)
        } else if (data.session) {
          console.log('[Auth] Session refreshed successfully')
          // Setup next refresh
          setupTokenRefresh(data.session)
        }
      }, refreshTime)

      // Backup refresh: every hour to ensure 30-day session persistence
      // This keeps the refresh token active even if user leaves tab open for days
      hourlyRefreshInterval = setInterval(async () => {
        console.log('[Auth] Hourly session refresh to maintain 30-day persistence')
        const { data, error } = await supabase.auth.refreshSession()

        if (error) {
          console.error('[Auth] Hourly refresh failed:', error)
        } else if (data.session) {
          console.log('[Auth] Hourly refresh successful')
        }
      }, 60 * 60 * 1000) // Every hour
    }

    // Clear potentially corrupted session data
    const clearCorruptedSession = () => {
      console.log('[Auth] Clearing potentially corrupted session data')
      try {
        if (typeof window === 'undefined') return

        // Get all Supabase-related keys from localStorage
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('sb-')) {
            keysToRemove.push(key)
          }
        }

        // Remove all Supabase auth keys
        keysToRemove.forEach(key => {
          console.log('[Auth] Removing stale auth key:', key)
          localStorage.removeItem(key)
        })

        // Also clear our own cache
        localStorage.removeItem(PROFILE_CACHE_KEY)
        localStorage.removeItem(PROFILE_CACHE_TIMESTAMP_KEY)
        localStorage.removeItem(LAST_ACTIVITY_KEY)

        // Clear session storage
        sessionStorage.clear()

        console.log('[Auth] Cleared all session data, ready for fresh login')
      } catch (error) {
        console.error('[Auth] Error clearing session data:', error)
      }
    }

    // Safety timeout - if we're still loading after 15s total, force show login
    // Reduced from 90s since we know auth works, just slow profile fetch
    const safetyTimeout = setTimeout(() => {
      console.error('[Auth] ⚠️ SAFETY TIMEOUT: Auth initialization took too long, forcing login screen')
      setLoading(false)
    }, 15000) // 15 seconds total - enough for quick auth + profile attempt

    // Get initial session with retry logic and recovery
    const getSession = async (retries = 3) => {
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
          console.log('[Auth] No auth tokens found in localStorage, skipping to login screen')
          setLoading(false)
          clearTimeout(safetyTimeout)
          isInitialLoad = false
          return
        }
      }

      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[Auth] Retry attempt ${attempt + 1}/${retries} for getSession`)
            // Exponential backoff: 1s, 2s, 4s
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
          }

          // On the first attempt, try to get existing session
          // On subsequent attempts, clear potentially corrupted data first
          if (attempt > 0) {
            console.log('[Auth] Clearing potentially corrupted session data before retry')
            clearCorruptedSession()
          }

          console.log(`[Auth] Attempting to get session (attempt ${attempt + 1}/${retries})...`)
          console.log(`[Auth] Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
          console.log(`[Auth] Timestamp: ${new Date().toISOString()}`)

          // 10s timeout per attempt - reduced since we know auth works, just slow
          const startTime = Date.now()
          const result = await withTimeout(
            async () => {
              console.log('[Auth] Calling supabase.auth.getSession()...')
              const sessionResult = await supabase.auth.getSession()
              console.log(`[Auth] getSession() returned after ${Date.now() - startTime}ms`)
              return sessionResult
            },
            10000,
            'Session fetch timeout'
          )

          if (result.error) {
            console.error('[Auth] Error getting session:', result.error)
            // Don't retry on explicit errors, only on timeouts
            setLoading(false)
            return
          }

          const session = result.data.session

          if (session?.user) {
            console.log('[Auth] ✓ Session retrieved successfully for user:', session.user.id)
            setUser(session.user)
            // Setup proactive token refresh
            setupTokenRefresh(session)
            try {
              await fetchProfile(session.user.id)
            } catch (error) {
              console.error('[Auth] Failed to fetch profile during session setup:', error)
              setLoading(false)
            }
          } else {
            console.log('[Auth] No active session found (user needs to log in)')
            setLoading(false)
          }

          // Success - break out of retry loop
          break
        } catch (err: any) {
          console.error(`[Auth] ✗ Error getting session (attempt ${attempt + 1}/${retries}):`, err)

          // If this was the last attempt, force cleanup and show login
          if (attempt === retries - 1) {
            console.error('[Auth] All retry attempts failed - forcing clean state')
            // Nuclear option: clear everything and force user to re-login
            clearCorruptedSession()
            setLoading(false)
            clearTimeout(safetyTimeout) // Clear safety timeout
          }
          // Otherwise, loop continues to next retry
        }
      }

      isInitialLoad = false
      clearTimeout(safetyTimeout) // Clear safety timeout on completion
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
            console.log('[Auth] User returned after being away, refreshing session')
            const { data, error } = await supabase.auth.refreshSession()
            if (error) {
              console.error('[Auth] Failed to refresh on return:', error)
            } else if (data.session) {
              console.log('[Auth] Session refreshed on user return')
            }
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
      // Get user data from auth
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Check if this is a global admin email
      const isGlobalAdmin = ['daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com'].includes(user.email || '')
      const isWolthersUser = user.email?.endsWith('@wolthers.com') || false
      
      // Create profile with basic information
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          qc_enabled: isGlobalAdmin || isWolthersUser, // Enable for admins and Wolthers users
          qc_role: isGlobalAdmin ? 'global_admin' : 'lab_personnel',
          is_global_admin: isGlobalAdmin,
          laboratory_id: null,
          qc_permissions: []
        })
        .select()
        .single()

      if (createError) {
        // Check if profile already exists (duplicate key error)
        if (createError.code === '23505') {
          console.log('Profile already exists, fetching existing profile')
          await fetchProfile(userId)
          return
        }
        console.error('Error creating profile:', {
          error: createError,
          code: createError?.code,
          message: createError?.message,
          details: createError?.details
        })
        setLoading(false)
        return
      }

      console.log('Profile created successfully:', newProfile)
      
      // Log access request creation for non-admin Wolthers users
      if (isWolthersUser && !isGlobalAdmin) {
        console.log('Access request will be created automatically for @wolthers.com user:', user.email)
      }
      
      // Now fetch the created profile
      await fetchProfile(userId)
    } catch (error) {
      console.error('Error in createUserProfile:', error)
      setLoading(false)
    }
  }

  const fetchProfile = async (userId: string) => {
    if (!userId) {
      console.error('No userId provided to fetchProfile')
      setLoading(false)
      return
    }

    // Check if there's already a pending fetch for this user
    const existingFetch = pendingProfileFetches.get(userId)
    if (existingFetch) {
      console.log('[Auth] Reusing existing profile fetch for user:', userId)
      return existingFetch
    }

    // Create a new fetch promise
    const fetchPromise = (async () => {
      try {
        console.log('[Auth] Fetching profile for user:', userId)

        // Single attempt with 20s timeout - increased for slow networks
        let profileData: Profile | null = null
        let error: any = null

        try {
          console.log('[Auth] Fetching profile data...')
          const result = await withTimeout(
            async () => await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single(),
            5000,  // Reduced to 5s - use fallback faster
            'Profile fetch timeout'
          )
          profileData = result.data
          error = result.error

          if (!error && profileData) {
            console.log('[Auth] ✓ Profile data fetched successfully')
          }
        } catch (err: any) {
          // If timeout, use fallback immediately
          if (err.message === 'Profile fetch timeout' || err.message?.includes('timeout')) {
            console.warn('[Auth] ⚠ Profile fetch timed out, using fallback (faster now!)')
            error = { code: 'TIMEOUT', message: 'Profile fetch timeout' }
          } else {
            throw err
          }
        }

        if (error) {
          // Handle timeout with fallback for authenticated users
          if (error.code === 'TIMEOUT' || error.message === 'Profile fetch timeout') {
            console.warn('Profile fetch timed out, creating temporary profile')
            const { data: { user: authUser } } = await supabase.auth.getUser()

            // Check if user is a global admin
            const isGlobalAdmin = ['daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com'].includes(authUser?.email || '')
            const isWolthersUser = authUser?.email?.endsWith('@wolthers.com') || false

            // Create temporary profile to let user in
            const tempProfile = {
              id: userId,
              email: authUser?.email || '',
              full_name: authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'User',
              qc_enabled: true,
              qc_role: isGlobalAdmin ? 'global_admin' as UserRole : 'lab_personnel' as UserRole,
              is_global_admin: isGlobalAdmin,
              laboratory_id: null,
              client_id: null,
              qc_permissions: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            } as Profile

            console.log('[Auth] Setting temporary profile and clearing loading state')
            setProfile(tempProfile)
            setCachedProfile(tempProfile) // Cache temporary profile
            setPermissions(getUserPermissions(isGlobalAdmin ? 'global_admin' : 'lab_personnel', undefined))

            // CRITICAL: Clear loading immediately so user can see dashboard
            setLoading(false)

            console.log('[Auth] ✓ User can now access dashboard with temporary profile')

            // Try to create real profile in background (non-blocking)
            setTimeout(() => {
              createUserProfile(userId).catch(err =>
                console.error('Background profile creation failed:', err)
              )
            }, 0)

            return
          }

          // If profile doesn't exist, try to create one
          if (error.code === 'PGRST116' || error.message?.includes('No rows returned') || error.message?.includes('JSON object requested, multiple (or no) rows returned')) {
            console.log('Profile not found, creating new profile for user')
            await createUserProfile(userId)
            return
          }

          console.error('Error fetching profile:', {
            fullError: error,
            code: error?.code,
            message: error?.message,
            hint: error?.hint,
            details: error?.details,
            userId: userId
          })
          setLoading(false)
          return
        }

        if (profileData) {
          // Check if QC is enabled for this user
          if (!profileData.qc_enabled) {
            console.log('QC not enabled for this user')
            // For existing users, we'll show them a message instead of blocking completely
            setProfile(profileData as Profile)
            setLoading(false)
            return
          }
        } else {
          console.log('No profile data returned, creating new profile')
          await createUserProfile(userId)
          return
        }

        // Ensure user has a QC role, default to lab_personnel if missing
        let finalProfile = profileData
        if (!profileData.qc_role) {
          console.log('User missing QC role, setting default')
          const { data: updatedProfile, error: updateError } = await supabase
            .from('profiles')
            .update({ qc_role: 'lab_personnel' })
            .eq('id', userId)
            .select()
            .single()

          if (updateError) {
            console.error('Error setting default QC role:', updateError)
            // Continue with the profile as-is rather than infinite loop
            setProfile(profileData as Profile)
            setPermissions(getUserPermissions('lab_personnel', undefined))
            setLoading(false)
            return
          } else if (updatedProfile) {
            // Use the updated profile directly instead of recursive call
            finalProfile = updatedProfile
          }
        }

        const finalProfileData = finalProfile as Profile
        setProfile(finalProfileData)
        setCachedProfile(finalProfileData) // Cache the profile

        // Get laboratory info to determine permissions
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
        console.error('Error in fetchProfile:', error)
        // Check if this is a network error
        if (error?.message?.includes('fetch') ||
            error?.message?.includes('network') ||
            error?.message?.includes('connection') ||
            error?.name === 'TypeError') {
          console.error('⚠️ Fatal network error in fetchProfile')
          setNetworkError(true)
        }
      } finally {
        setLoading(false)
      }
    })()

    // Store the promise in the pending fetches map
    pendingProfileFetches.set(userId, fetchPromise)

    // Clean up after completion
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
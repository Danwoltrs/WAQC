'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, type Database, type UserRole } from '@/lib/supabase'
import { getUserPermissions } from '@/lib/auth'
import { NetworkError } from '@/components/errors/network-error'

type Profile = Database['public']['Tables']['profiles']['Row']

// Retry utility with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  timeoutMs: number = 10000
): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add timeout to each attempt
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
      )

      const result = await Promise.race([fn(), timeoutPromise])
      return result
    } catch (error: any) {
      lastError = error
      const isLastAttempt = attempt === maxRetries - 1

      // Don't retry if it's a definitive error (not timeout/network)
      if (
        error?.code &&
        error.code !== 'TIMEOUT' &&
        !error.message?.includes('timeout') &&
        !error.message?.includes('fetch') &&
        !error.message?.includes('network') &&
        !error.message?.includes('connection')
      ) {
        throw error
      }

      if (!isLastAttempt) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = initialDelay * Math.pow(2, attempt)
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
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
const PROFILE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Session activity tracking
const LAST_ACTIVITY_KEY = 'waqc_last_activity'
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart']

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
    let isInitialLoad = true
    let refreshInterval: NodeJS.Timeout | null = null

    // Proactive token refresh - refresh 5 minutes before expiry
    const setupTokenRefresh = (session: any) => {
      if (!session?.expires_at) return

      // Clear existing interval
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }

      const expiresAt = session.expires_at * 1000 // Convert to milliseconds
      const now = Date.now()
      const timeUntilExpiry = expiresAt - now

      // Refresh 5 minutes before expiry, or immediately if less than 5 minutes left
      const refreshTime = Math.max(0, timeUntilExpiry - (5 * 60 * 1000))

      console.log(`[Auth] Token expires in ${Math.floor(timeUntilExpiry / 60000)} minutes, will refresh in ${Math.floor(refreshTime / 60000)} minutes`)

      setTimeout(async () => {
        console.log('[Auth] Proactively refreshing session token')
        const { data, error } = await supabase.auth.refreshSession()

        if (error) {
          console.error('[Auth] Failed to refresh session:', error)
        } else if (data.session) {
          console.log('[Auth] Session refreshed successfully')
          // Setup next refresh
          setupTokenRefresh(data.session)
        }
      }, refreshTime)
    }

    // Get initial session with retry logic
    const getSession = async () => {
      let session = null

      // Check if there's an Azure AD session that needs to be converted to Supabase session
      const azureAuthenticated = sessionStorage.getItem('azure_ad_authenticated')
      const azureEmail = sessionStorage.getItem('azure_ad_email')

      if (azureAuthenticated === 'true' && azureEmail) {
        console.log('Found Azure AD session, creating Supabase session...')

        try {
          // Call backend to create/get user and generate session
          const response = await fetch('/api/auth/azure-signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: azureEmail,
              name: sessionStorage.getItem('azure_ad_name') || azureEmail.split('@')[0],
            }),
          })

          if (response.ok) {
            const data = await response.json()
            console.log('Backend session created:', data)

            // Parse session URL and verify OTP to create session
            if (data.sessionUrl) {
              const sessionUrl = new URL(data.sessionUrl)
              const token = sessionUrl.searchParams.get('token')
              const type = sessionUrl.searchParams.get('type') || 'magiclink'

              if (token) {
                const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
                  token_hash: token,
                  type: type as any,
                })

                if (!verifyError && sessionData.session) {
                  console.log('Supabase session created from Azure AD')
                  session = sessionData.session

                  // Clear Azure AD flags after successful conversion
                  sessionStorage.removeItem('azure_ad_authenticated')
                }
              }
            }
          }
        } catch (error) {
          console.error('Error converting Azure AD session:', error)
          // Clear flags on error
          sessionStorage.removeItem('azure_ad_authenticated')
        }
      }

      // If no session from Azure AD, try normal session check
      if (!session) {
        try {
          // Use retry logic with 10s timeout per attempt (3 attempts = max 30s total)
          const result = await retryWithBackoff(
            async () => await supabase.auth.getSession(),
            3,
            1000,
            10000
          )

          if (result.error) {
            console.error('Error getting session:', result.error)
            setLoading(false)
            return
          }

          session = result.data.session
        } catch (err: any) {
          console.error('Error getting session after retries:', err)
          // On timeout/error, just continue - no session means show login
          setLoading(false)
          return
        }
      }

      if (session?.user) {
        setUser(session.user)
        // Setup proactive token refresh
        setupTokenRefresh(session)
        try {
          await fetchProfile(session.user.id)
        } catch (error) {
          console.error('Failed to fetch profile during session setup:', error)
          setLoading(false)
        }
      } else {
        setLoading(false)
      }

      isInitialLoad = false
    }

    getSession()

    // Listen for auth state changes
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

    // Set up activity tracking
    const handleActivity = () => {
      updateLastActivity()
    }

    // Add activity event listeners when user is logged in
    if (user) {
      ACTIVITY_EVENTS.forEach(event => {
        window.addEventListener(event, handleActivity, { passive: true })
      })
      // Record initial activity
      updateLastActivity()
    }

    return () => {
      subscription.unsubscribe()
      // Clean up refresh interval on unmount
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
      // Clean up activity listeners
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
    }
  }, [user])

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

        // Use retry logic with 10s timeout per attempt (3 attempts = max 30s total)
        let profileData: Profile | null = null
        let error: any = null

        try {
          const result = await retryWithBackoff(
            async () => {
              return await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single()
            },
            3,
            1000,
            10000
          )
          profileData = result.data
          error = result.error
        } catch (err: any) {
          // If all retries fail, treat as timeout
          if (err.message === 'Request timeout' || err.message?.includes('timeout')) {
            console.warn('Profile fetch timed out after retries, will use fallback')
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

            // Create temporary profile to let user in
            const tempProfile = {
              id: userId,
              email: authUser?.email || '',
              full_name: authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'User',
              qc_enabled: true,
              qc_role: 'lab_personnel' as UserRole,
              is_global_admin: false,
              laboratory_id: null,
              client_id: null,
              qc_permissions: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            } as Profile

            setProfile(tempProfile)
            setCachedProfile(tempProfile) // Cache temporary profile
            setPermissions(getUserPermissions('lab_personnel', undefined))
            setLoading(false)

            // Try to create real profile in background
            createUserProfile(userId).catch(err =>
              console.error('Background profile creation failed:', err)
            )
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
    await supabase.auth.signOut()
    // Clear Azure AD session
    sessionStorage.removeItem('azure_ad_authenticated')
    sessionStorage.removeItem('azure_ad_email')
    sessionStorage.removeItem('azure_ad_name')
    // Clear profile cache
    setCachedProfile(null)
    // Redirect to login page
    window.location.href = '/'
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
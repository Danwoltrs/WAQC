'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, type Database, type UserRole } from '@/lib/supabase'
import { getUserPermissions } from '@/lib/auth'

type Profile = Database['public']['Tables']['profiles']['Row']

interface AuthContextType {
  user: User | null
  profile: Profile | null
  permissions: string[]
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Error getting session:', error)
        setLoading(false)
        return
      }

      if (session?.user) {
        setUser(session.user)
        try {
          await fetchProfile(session.user.id)
        } catch (error) {
          console.error('Failed to fetch profile during session setup:', error)
          setLoading(false)
        }
      } else {
        setLoading(false)
      }
    }

    getSession()

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user)
        try {
          await fetchProfile(session.user.id)
        } catch (error) {
          console.error('Failed to fetch profile during auth state change:', error)
          setLoading(false)
        }
      } else {
        setUser(null)
        setProfile(null)
        setPermissions([])
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

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

    try {
      console.log('Fetching profile for user:', userId)

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<{ data: null, error: any }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'Profile fetch timeout' } }), 10000)
      )

      const fetchPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      const { data: profileData, error } = await Promise.race([
        fetchPromise,
        timeoutPromise
      ]) as any

      if (error) {
        // Check if this is a timeout and user is a known admin
        if (error.message === 'Profile fetch timeout') {
          const { data: { user: authUser } } = await supabase.auth.getUser()
          const isGlobalAdmin = ['daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com'].includes(authUser?.email || '')

          if (isGlobalAdmin) {
            console.warn('Profile fetch timed out, using fallback for global admin:', authUser?.email)
            // Create temporary profile for global admin
            const tempProfile = {
              id: userId,
              email: authUser?.email || '',
              full_name: authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'Admin',
              qc_enabled: true,
              qc_role: 'global_admin' as UserRole,
              is_global_admin: true,
              laboratory_id: undefined,
              qc_permissions: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            } as Profile

            setProfile(tempProfile)
            setPermissions(getUserPermissions('global_admin', undefined))
            setLoading(false)

            // Try to create the profile in background
            createUserProfile(userId).catch(err => console.error('Background profile creation failed:', err))
            return
          }
        }

        // If profile doesn't exist, try to create one
        if (error.code === 'PGRST116' || error.message?.includes('No rows returned') || error.message?.includes('JSON object requested, multiple (or no) rows returned')) {
          console.log('Profile not found, creating new profile for user')
          await createUserProfile(userId)
          return
        }

        console.error('Error fetching profile:', {
          code: error?.code,
          message: error?.message,
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

      setProfile(finalProfile as Profile)

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
    } catch (error) {
      console.error('Error in fetchProfile:', error)
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const value: AuthContextType = {
    user,
    profile,
    permissions,
    loading,
    signOut,
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
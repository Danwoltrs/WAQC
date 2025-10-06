import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabase } from './supabase'
import type { UserRole, Database } from './supabase'

export const createServerSupabaseClient = () => {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}

export const getCurrentUser = async () => {
  const supabase = createServerSupabaseClient()
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return null
    }

    // Get user profile with role information
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return { user, profile: null }
    }

    return { user, profile }
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

export const getUserPermissions = (qcRole: UserRole, laboratoryType?: string): string[] => {
  const basePermissions: Record<UserRole, string[]> = {
    lab_personnel: ['view_samples', 'create_samples', 'conduct_assessments', 'view_lab_dashboard'],
    lab_finance_manager: ['view_samples', 'view_lab_finance', 'generate_invoices', 'view_lab_dashboard'],
    lab_quality_manager: ['view_samples', 'create_samples', 'conduct_assessments', 'view_lab_dashboard', 'manage_quality_specs', 'view_lab_quality_metrics'],
    santos_hq_finance: ['view_samples', 'view_global_finance', 'view_all_labs', 'generate_global_reports', 'view_admin_dashboard'],
    global_finance_admin: ['view_samples', 'view_global_finance', 'view_all_labs', 'generate_global_reports', 'view_admin_dashboard', 'manage_global_finance'],
    global_quality_admin: ['view_samples', 'create_samples', 'conduct_assessments', 'view_global_quality', 'view_all_labs', 'manage_global_quality_specs', 'create_laboratories'],
    global_admin: ['*'], // All permissions including create_laboratories
    client: ['view_own_samples', 'download_certificates', 'view_client_dashboard'],
    supplier: ['view_performance_metrics', 'view_supplier_dashboard'],
    buyer: ['view_supply_chain', 'view_buyer_dashboard', 'view_sankey_charts']
  }

  let permissions = basePermissions[qcRole] || []

  // Special case for Santos HQ - automatic global finance access
  if (laboratoryType === 'hq' && qcRole === 'lab_finance_manager') {
    permissions = [...permissions, 'view_global_finance', 'view_all_labs']
  }

  return permissions
}

export const hasPermission = (userPermissions: string[], requiredPermission: string): boolean => {
  return userPermissions.includes('*') || userPermissions.includes(requiredPermission)
}

export const canAccessLab = (userQcRole: UserRole, userLabId: string | undefined, targetLabId: string): boolean => {
  // Global roles can access all labs
  if (['santos_hq_finance', 'global_finance_admin', 'global_quality_admin', 'global_admin'].includes(userQcRole)) {
    return true
  }

  // Lab-specific roles can only access their own lab
  return userLabId === targetLabId
}

export const canAccessFinanceData = (userQcRole: UserRole, userLabId: string | undefined, targetLabId: string): boolean => {
  // Santos HQ finance can access all labs
  if (userQcRole === 'santos_hq_finance' || userQcRole === 'global_finance_admin' || userQcRole === 'global_admin') {
    return true
  }

  // Lab finance managers can only access their own lab's data
  if (userQcRole === 'lab_finance_manager' && userLabId === targetLabId) {
    return true
  }

  return false
}

export const canCreateLaboratories = (userQcRole: UserRole): boolean => {
  return ['global_admin', 'global_quality_admin'].includes(userQcRole)
}
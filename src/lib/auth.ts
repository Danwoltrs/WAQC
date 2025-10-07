import type { UserRole, Database } from './supabase'

export const getUserPermissions = (qcRole: UserRole, laboratoryType?: string): string[] => {
  const basePermissions: Record<UserRole, string[]> = {
    lab_personnel: ['view_samples', 'create_samples', 'conduct_assessments', 'view_lab_dashboard'],
    lab_finance_manager: ['view_samples', 'view_lab_finance', 'generate_invoices', 'view_lab_dashboard'],
    lab_quality_manager: ['view_samples', 'create_samples', 'conduct_assessments', 'view_lab_dashboard', 'manage_quality_specs', 'view_lab_quality_metrics'],
    santos_hq_finance: ['view_samples', 'view_global_finance', 'view_all_labs', 'generate_global_reports', 'view_admin_dashboard'],
    global_finance_admin: ['view_samples', 'view_global_finance', 'view_all_labs', 'generate_global_reports', 'view_admin_dashboard', 'manage_global_finance'],
    global_quality_admin: ['view_samples', 'create_samples', 'conduct_assessments', 'view_global_quality', 'view_all_labs', 'manage_global_quality_specs', 'create_laboratories', 'manage_users'],
    global_admin: ['*'], // All permissions including manage_users
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
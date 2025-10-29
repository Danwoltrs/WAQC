'use client'

import React, { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import {
  User,
  Mail,
  Calendar,
  Shield,
  Building2,
  UserPlus,
  Edit,
  Coffee,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { supabase, type Database } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'

type Profile = Database['public']['Tables']['profiles']['Row'] & {
  first_name?: string | null
  last_name?: string | null
  is_cupper?: boolean | null
  is_q_grader?: boolean | null
  last_login_at?: string | null
}

type Laboratory = Database['public']['Tables']['laboratories']['Row']

type UserRole =
  | 'lab_personnel'
  | 'lab_finance_manager'
  | 'lab_quality_manager'
  | 'santos_hq_finance'
  | 'global_finance_admin'
  | 'global_quality_admin'
  | 'global_admin'
  | 'client'
  | 'supplier'
  | 'buyer'

const ROLE_HIERARCHY: Record<UserRole, number> = {
  lab_personnel: 1,
  lab_finance_manager: 2,
  lab_quality_manager: 3, // Lab Admin level
  santos_hq_finance: 4,
  global_finance_admin: 5,
  global_quality_admin: 6,
  global_admin: 7, // Highest level
  client: 0,
  supplier: 0,
  buyer: 0,
}

const ROLE_LABELS: Record<UserRole, string> = {
  lab_personnel: 'Lab Personnel',
  lab_finance_manager: 'Lab Finance Manager',
  lab_quality_manager: 'Lab Admin',
  santos_hq_finance: 'Santos HQ Finance',
  global_finance_admin: 'Global Finance Admin',
  global_quality_admin: 'Global Quality Admin',
  global_admin: 'Global Admin',
  client: 'Client',
  supplier: 'Supplier',
  buyer: 'Buyer',
}

export function UserManagementPanel() {
  const { profile } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [laboratories, setLaboratories] = useState<Laboratory[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Form states for editing
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    qc_role: '' as UserRole | '',
    laboratory_id: '',
  })

  // Form states for invitation
  const [inviteForm, setInviteForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    qc_role: '' as UserRole | '',
    laboratory_id: '',
    is_cupper: false,
    is_q_grader: false,
    qc_enabled: false,
  })

  useEffect(() => {
    if (canManageUsers()) {
      fetchUsers()
      fetchLaboratories()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const canManageUsers = (): boolean => {
    if (!profile) return false
    const role = profile.qc_role as UserRole
    // Global admins and lab admins can manage users
    return role === 'global_admin' || role === 'lab_quality_manager'
  }

  const canPromoteToRole = (targetRole: UserRole): boolean => {
    if (!profile?.qc_role) return false
    const currentRole = profile.qc_role as UserRole
    const currentLevel = ROLE_HIERARCHY[currentRole]
    const targetLevel = ROLE_HIERARCHY[targetRole]

    // Global admins can promote anyone to any role
    if (currentRole === 'global_admin') return true

    // Lab admins cannot promote to their own level or higher
    if (currentRole === 'lab_quality_manager') {
      return targetLevel < ROLE_HIERARCHY.lab_quality_manager
    }

    return false
  }

  const fetchUsers = async () => {
    try {
      let query = supabase.from('profiles').select('*').eq('qc_enabled', true)

      // Lab admins only see their lab's users
      if (profile?.qc_role === 'lab_quality_manager' && profile?.laboratory_id) {
        query = query.eq('laboratory_id', profile.laboratory_id)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching users:', error)
        return
      }

      setUsers(data as Profile[])
    } catch (error) {
      console.error('Error in fetchUsers:', error)
    }
  }

  const fetchLaboratories = async () => {
    try {
      const { data, error } = await supabase.from('laboratories').select('*').order('name')

      if (error) {
        console.error('Error fetching laboratories:', error)
        return
      }

      setLaboratories(data as Laboratory[])
    } catch (error) {
      console.error('Error in fetchLaboratories:', error)
    }
  }

  const openEditDialog = (user: Profile) => {
    setSelectedUser(user)
    setEditForm({
      first_name: user.first_name || user.full_name?.split(' ')[0] || '',
      last_name: user.last_name || user.full_name?.split(' ').slice(1).join(' ') || '',
      email: user.email,
      qc_role: (user.qc_role as UserRole) || '',
      laboratory_id: user.laboratory_id || '',
    })
    setEditDialogOpen(true)
  }

  const handleUpdateUser = async () => {
    if (!selectedUser) return

    // Validate role permissions
    if (editForm.qc_role && !canPromoteToRole(editForm.qc_role as UserRole)) {
      alert('You do not have permission to assign this role.')
      return
    }

    // Validate lab requirement
    const labRequiredRoles: UserRole[] = [
      'lab_personnel',
      'lab_finance_manager',
      'lab_quality_manager',
    ]
    if (
      editForm.qc_role &&
      labRequiredRoles.includes(editForm.qc_role as UserRole) &&
      !editForm.laboratory_id
    ) {
      alert('Please select a laboratory for this role.')
      return
    }

    setActionLoading(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          full_name: `${editForm.first_name} ${editForm.last_name}`, // Keep full_name in sync
          qc_role: editForm.qc_role,
          laboratory_id: editForm.laboratory_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedUser.id)

      if (error) {
        console.error('Error updating user:', error)
        alert('Failed to update user. Please try again.')
        return
      }

      setEditDialogOpen(false)
      // Refresh the user list to show updated data
      await fetchUsers()
      alert('User updated successfully!')
    } catch (error) {
      console.error('Error in handleUpdateUser:', error)
      alert('An error occurred. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleField = async (
    userId: string,
    field: 'is_cupper' | 'qc_enabled' | 'is_q_grader',
    currentValue: boolean
  ) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [field]: !currentValue, updated_at: new Date().toISOString() })
        .eq('id', userId)

      if (error) {
        console.error(`Error toggling ${field}:`, error)
        alert(`Failed to update. Please try again.`)
        return
      }

      // Refresh user list
      await fetchUsers()
    } catch (error) {
      console.error(`Error in handleToggleField:`, error)
      alert('An error occurred. Please try again.')
    }
  }

  const handleInviteUser = async () => {
    // Validate role permissions
    if (inviteForm.qc_role && !canPromoteToRole(inviteForm.qc_role as UserRole)) {
      alert('You do not have permission to assign this role.')
      return
    }

    // Validate lab requirement
    const labRequiredRoles: UserRole[] = [
      'lab_personnel',
      'lab_finance_manager',
      'lab_quality_manager',
    ]
    if (
      inviteForm.qc_role &&
      labRequiredRoles.includes(inviteForm.qc_role as UserRole) &&
      !inviteForm.laboratory_id
    ) {
      alert('Please select a laboratory for this role.')
      return
    }

    setActionLoading(true)
    try {
      // Call API endpoint to send invitation email
      const response = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation')
      }

      // Show success message with invitation URL
      if (data.invitationUrl) {
        // Copy URL to clipboard
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(data.invitationUrl)
          alert(
            `Invitation created for ${inviteForm.email}!\n\n` +
              `The invitation link has been copied to your clipboard.\n\n` +
              `Share it with the user to complete their account setup.\n\n` +
              `Link expires: ${new Date(data.expiresAt).toLocaleDateString()}`
          )
        } else {
          alert(
            `Invitation created for ${inviteForm.email}!\n\n` +
              `Share this link:\n${data.invitationUrl}\n\n` +
              `Link expires: ${new Date(data.expiresAt).toLocaleDateString()}`
          )
        }
      }

      setInviteDialogOpen(false)
      setInviteForm({
        email: '',
        first_name: '',
        last_name: '',
        qc_role: '',
        laboratory_id: '',
        is_cupper: false,
        is_q_grader: false,
        qc_enabled: false,
      })
    } catch (error) {
      console.error('Error inviting user:', error)
      alert('Failed to send invitation. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to asc
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    )
  }

  const filteredUsers = users
    .filter((user) => {
      const searchLower = searchQuery.toLowerCase()
      const firstName = user.first_name || user.full_name?.split(' ')[0] || ''
      const lastName = user.last_name || user.full_name?.split(' ').slice(1).join(' ') || ''
      return (
        firstName.toLowerCase().includes(searchLower) ||
        lastName.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower) ||
        user.qc_role?.toLowerCase().includes(searchLower)
      )
    })
    .sort((a, b) => {
      if (!sortColumn) return 0

      let aValue: any
      let bValue: any

      switch (sortColumn) {
        case 'role':
          aValue = a.qc_role || ''
          bValue = b.qc_role || ''
          break
        case 'laboratory':
          const aLab = laboratories.find((l) => l.id === a.laboratory_id)
          const bLab = laboratories.find((l) => l.id === b.laboratory_id)
          aValue = aLab?.code || ''
          bValue = bLab?.code || ''
          break
        case 'cupper':
          aValue = a.is_cupper ? 1 : 0
          bValue = b.is_cupper ? 1 : 0
          break
        case 'qc_access':
          aValue = a.qc_enabled ? 1 : 0
          bValue = b.qc_enabled ? 1 : 0
          break
        case 'q_grader':
          aValue = a.is_q_grader ? 1 : 0
          bValue = b.is_q_grader ? 1 : 0
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

  if (!canManageUsers()) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">You do not have permission to manage users.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription>
                Manage users, roles, permissions, and cupper designations
              </CardDescription>
            </div>
            <Button onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort('role')}
                    >
                      <div className="flex items-center">
                        Role
                        {getSortIcon('role')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort('laboratory')}
                    >
                      <div className="flex items-center">
                        Laboratory
                        {getSortIcon('laboratory')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort('cupper')}
                    >
                      <div className="flex items-center">
                        Cupper
                        {getSortIcon('cupper')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort('qc_access')}
                    >
                      <div className="flex items-center">
                        QC Access
                        {getSortIcon('qc_access')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort('q_grader')}
                    >
                      <div className="flex items-center">
                        Q Grader
                        {getSortIcon('q_grader')}
                      </div>
                    </TableHead>
                    <TableHead>Created</TableHead>
                    {profile?.qc_role === 'global_admin' && <TableHead>Last Login</TableHead>}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => {
                      const firstName = user.first_name || user.full_name?.split(' ')[0] || ''
                      const lastName =
                        user.last_name || user.full_name?.split(' ').slice(1).join(' ') || ''
                      const lab = laboratories.find((l) => l.id === user.laboratory_id)

                      return (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {firstName} {lastName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">{user.email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {ROLE_LABELS[(user.qc_role as UserRole) || 'lab_personnel']}
                            </span>
                          </TableCell>
                          <TableCell>
                            {lab ? (
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm">{lab.code}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={user.is_cupper || false}
                              onCheckedChange={() =>
                                handleToggleField(user.id, 'is_cupper', user.is_cupper || false)
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={user.qc_enabled || false}
                              onCheckedChange={() =>
                                handleToggleField(user.id, 'qc_enabled', user.qc_enabled || false)
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={user.is_q_grader || false}
                              onCheckedChange={() =>
                                handleToggleField(user.id, 'is_q_grader', user.is_q_grader || false)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {user.created_at
                                ? new Date(user.created_at).toLocaleDateString()
                                : '—'}
                            </div>
                          </TableCell>
                          {profile?.qc_role === 'global_admin' && (
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {user.last_login_at
                                  ? formatDistanceToNow(new Date(user.last_login_at), {
                                      addSuffix: true,
                                    })
                                  : 'Never'}
                              </span>
                            </TableCell>
                          )}
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(user)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information, role, and permissions</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-first-name">First Name</Label>
                <Input
                  id="edit-first-name"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-last-name">Last Name</Label>
                <Input
                  id="edit-last-name"
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" value={editForm.email} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editForm.qc_role}
                onValueChange={(value) => setEditForm({ ...editForm, qc_role: value as UserRole })}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as UserRole[])
                    .filter((role) => canPromoteToRole(role))
                    .map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-laboratory">Laboratory</Label>
              <Select
                value={editForm.laboratory_id}
                onValueChange={(value) => setEditForm({ ...editForm, laboratory_id: value })}
              >
                <SelectTrigger id="edit-laboratory">
                  <SelectValue placeholder="Select laboratory" />
                </SelectTrigger>
                <SelectContent>
                  {laboratories.map((lab) => (
                    <SelectItem key={lab.id} value={lab.id}>
                      {lab.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} disabled={actionLoading}>
              {actionLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
            <DialogDescription>
              Send a professional invitation email with account creation link
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="user@example.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invite-first-name">First Name</Label>
                <Input
                  id="invite-first-name"
                  value={inviteForm.first_name}
                  onChange={(e) => setInviteForm({ ...inviteForm, first_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-last-name">Last Name</Label>
                <Input
                  id="invite-last-name"
                  value={inviteForm.last_name}
                  onChange={(e) => setInviteForm({ ...inviteForm, last_name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteForm.qc_role}
                onValueChange={(value) =>
                  setInviteForm({ ...inviteForm, qc_role: value as UserRole })
                }
              >
                <SelectTrigger id="invite-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as UserRole[])
                    .filter((role) => canPromoteToRole(role))
                    .map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-laboratory">Laboratory</Label>
              <Select
                value={inviteForm.laboratory_id}
                onValueChange={(value) => setInviteForm({ ...inviteForm, laboratory_id: value })}
              >
                <SelectTrigger id="invite-laboratory">
                  <SelectValue placeholder="Select laboratory" />
                </SelectTrigger>
                <SelectContent>
                  {laboratories.map((lab) => (
                    <SelectItem key={lab.id} value={lab.id}>
                      {lab.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="invite-cupper"
                  checked={inviteForm.is_cupper}
                  onCheckedChange={(checked) =>
                    setInviteForm({ ...inviteForm, is_cupper: checked as boolean })
                  }
                />
                <Label htmlFor="invite-cupper">Cupper</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="invite-q-grader"
                  checked={inviteForm.is_q_grader}
                  onCheckedChange={(checked) =>
                    setInviteForm({ ...inviteForm, is_q_grader: checked as boolean })
                  }
                />
                <Label htmlFor="invite-q-grader">Q Grader</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="invite-qc-access"
                  checked={inviteForm.qc_enabled}
                  onCheckedChange={(checked) =>
                    setInviteForm({ ...inviteForm, qc_enabled: checked as boolean })
                  }
                />
                <Label htmlFor="invite-qc-access">QC Access</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteUser} disabled={actionLoading}>
              {actionLoading ? 'Sending...' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

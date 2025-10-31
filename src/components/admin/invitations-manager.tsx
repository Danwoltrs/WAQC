'use client'

import React, { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Mail,
  Calendar,
  User,
  XCircle,
  RefreshCw,
  Search,
  Clock,
  CheckCircle2,
  Copy,
} from 'lucide-react'
import { supabase, type Database } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type Invitation = Database['public']['Tables']['user_invitations']['Row']

type InvitationWithInviter = Invitation & {
  first_name: string
  last_name: string
  qc_role: string
  inviter_name?: string | null
}

const STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

const STATUS_COLORS = {
  pending: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  accepted: 'bg-green-500/10 text-green-700 dark:text-green-400',
  expired: 'bg-gray-500/10 text-gray-700 dark:text-gray-400',
  cancelled: 'bg-red-500/10 text-red-700 dark:text-red-400',
}

export function InvitationsManager() {
  const { profile } = useAuth()
  const [invitations, setInvitations] = useState<InvitationWithInviter[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null)

  useEffect(() => {
    if (canManageInvitations()) {
      fetchInvitations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.qc_role]) // Only re-run when user ID or role changes

  const canManageInvitations = (): boolean => {
    if (!profile) return false
    return profile.qc_role === 'global_admin' || profile.qc_role === 'lab_quality_manager'
  }

  const fetchInvitations = async () => {
    // Prevent multiple concurrent requests
    if (loading) return

    try {
      setLoading(true)

      // Fetch invitations with inviter information
      // Filter to only show QC invitations (those with a laboratory_id)
      let query = supabase
        .from('user_invitations')
        .select(`
          *,
          inviter:invited_by(first_name, last_name)
        `)
        .not('laboratory_id', 'is', null) // Only QC invitations have laboratory_id
        .order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) {
        console.error('Error fetching invitations:', error)
        toast.error('Failed to load invitations')
        return
      }

      // Transform data to include inviter name
      const invitationsWithInviter = data.map((inv: any) => ({
        ...inv,
        inviter_name: inv.inviter
          ? `${inv.inviter.first_name} ${inv.inviter.last_name}`
          : null,
      }))

      setInvitations(invitationsWithInviter)
    } catch (error) {
      console.error('Error in fetchInvitations:', error)
      toast.error('An error occurred while loading invitations')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelInvitation = async () => {
    if (!selectedInvitation) return

    try {
      const { error } = await supabase
        .from('user_invitations')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedInvitation.id)

      if (error) {
        console.error('Error cancelling invitation:', error)
        toast.error('Failed to cancel invitation')
        return
      }

      toast.success('Invitation cancelled successfully')
      setCancelDialogOpen(false)
      setSelectedInvitation(null)
      await fetchInvitations()
    } catch (error) {
      console.error('Error in handleCancelInvitation:', error)
      toast.error('An error occurred while cancelling invitation')
    }
  }

  const handleResendInvitation = async (invitation: Invitation) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      // Call API endpoint to resend invitation
      const response = await fetch('/api/users/invite/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          invitation_id: invitation.id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend invitation')
      }

      // Copy new URL to clipboard
      if (data.invitationUrl && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(data.invitationUrl)
        toast.success('Invitation Resent!', {
          description: (
            <div className="space-y-2">
              <p className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>New invitation link for <strong>{invitation.email}</strong></span>
              </p>
              <p className="flex items-center gap-2">
                <Copy className="h-4 w-4" />
                <span>Link copied to clipboard</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Expires: {new Date(data.expiresAt).toLocaleDateString()}
              </p>
            </div>
          ),
          duration: 6000,
        })
      } else {
        toast.success('Invitation Resent!', {
          description: `New invitation link for ${invitation.email}. Expires: ${new Date(data.expiresAt).toLocaleDateString()}`,
          duration: 6000,
        })
      }

      await fetchInvitations()
    } catch (error) {
      console.error('Error resending invitation:', error)
      toast.error('Failed to resend invitation')
    }
  }

  const filteredInvitations = invitations.filter((invitation) => {
    const searchLower = searchQuery.toLowerCase()
    return (
      invitation.email.toLowerCase().includes(searchLower) ||
      invitation.first_name.toLowerCase().includes(searchLower) ||
      invitation.last_name.toLowerCase().includes(searchLower) ||
      invitation.inviter_name?.toLowerCase().includes(searchLower)
    )
  })

  if (!canManageInvitations()) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            You do not have permission to manage invitations.
          </p>
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
                <Mail className="h-5 w-5" />
                Invitations
              </CardTitle>
              <CardDescription>
                View and manage user invitations, resend or cancel pending invites
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by email, name, or inviter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={fetchInvitations} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Invitations Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invitee</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invited By</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Loading invitations...
                    </TableCell>
                  </TableRow>
                ) : filteredInvitations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No invitations found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvitations.map((invitation) => {
                    const isExpired =
                      invitation.expires_at && new Date(invitation.expires_at) < new Date()
                    const isPending = invitation.status === 'pending' && !isExpired

                    return (
                      <TableRow key={invitation.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {invitation.first_name} {invitation.last_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {invitation.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{invitation.qc_role}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              STATUS_COLORS[
                                (isExpired ? 'expired' : invitation.status) as keyof typeof STATUS_COLORS
                              ]
                            }
                          >
                            {isExpired
                              ? 'Expired'
                              : STATUS_LABELS[invitation.status as keyof typeof STATUS_LABELS]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {invitation.inviter_name || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {invitation.created_at
                              ? formatDistanceToNow(new Date(invitation.created_at), {
                                  addSuffix: true,
                                })
                              : '—'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {invitation.expires_at
                              ? new Date(invitation.expires_at).toLocaleDateString()
                              : '—'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isPending && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleResendInvitation(invitation)}
                                  title="Resend invitation"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedInvitation(invitation)
                                    setCancelDialogOpen(true)
                                  }}
                                  title="Cancel invitation"
                                >
                                  <XCircle className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                            {!isPending && invitation.status !== 'accepted' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResendInvitation(invitation)}
                                title="Send new invitation"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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

      {/* Cancel Invitation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the invitation for{' '}
              <strong>{selectedInvitation?.email}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedInvitation(null)}>
              No, Keep It
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelInvitation} className="bg-destructive">
              Yes, Cancel Invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

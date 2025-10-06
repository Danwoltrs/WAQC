'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, XCircle, Clock, User, Mail, Calendar } from 'lucide-react'
import { supabase, type Database } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'

type AccessRequest = Database['public']['Tables']['access_requests']['Row']
type Laboratory = Database['public']['Tables']['laboratories']['Row']

export function AccessRequestsManager() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [laboratories, setLaboratories] = useState<Laboratory[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Only show if user is anderson@wolthers.com or global admin
  if (!profile?.is_global_admin && profile?.email !== 'anderson@wolthers.com') {
    return null
  }

  useEffect(() => {
    fetchRequests()
    fetchLaboratories()
  }, [])

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('access_requests')
        .select(`
          *,
          profiles:user_id (
            email,
            full_name
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching access requests:', error)
        return
      }

      setRequests(data || [])
    } catch (error) {
      console.error('Error in fetchRequests:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchLaboratories = async () => {
    try {
      const { data, error } = await supabase
        .from('laboratories')
        .select('*')
        .order('name')

      if (error) {
        console.error('Error fetching laboratories:', error)
        return
      }

      setLaboratories(data || [])
    } catch (error) {
      console.error('Error in fetchLaboratories:', error)
    }
  }

  const handleApprove = async (request: AccessRequest, selectedRole: string, selectedLabId?: string) => {
    setActionLoading(request.id)
    try {
      // Update the user's profile with the approved role and lab
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          qc_enabled: true,
          qc_role: selectedRole,
          laboratory_id: selectedLabId || null
        })
        .eq('id', request.user_id)

      if (profileError) {
        console.error('Error updating profile:', profileError)
        return
      }

      // Update the request status
      const { error: requestError } = await supabase
        .from('access_requests')
        .update({
          status: 'approved',
          approved_role: selectedRole,
          approved_laboratory_id: selectedLabId || null,
          processed_at: new Date().toISOString(),
          processed_by: profile?.id
        })
        .eq('id', request.id)

      if (requestError) {
        console.error('Error updating request:', requestError)
        return
      }

      // Refresh the requests list
      await fetchRequests()
    } catch (error) {
      console.error('Error approving request:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (request: AccessRequest, reason?: string) => {
    setActionLoading(request.id)
    try {
      const { error } = await supabase
        .from('access_requests')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          processed_at: new Date().toISOString(),
          processed_by: profile?.id
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error rejecting request:', error)
        return
      }

      // Refresh the requests list
      await fetchRequests()
    } catch (error) {
      console.error('Error rejecting request:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getRoleDisplayName = (role: string) => {
    return role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Requests</CardTitle>
          <CardDescription>Loading requests...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const processedRequests = requests.filter(r => r.status !== 'pending')

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Access Requests Management
          </CardTitle>
          <CardDescription>
            Manage user access requests for the QC system
          </CardDescription>
        </CardHeader>
      </Card>

      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Requests ({pendingRequests.length})</CardTitle>
            <CardDescription>Review and approve or reject user access requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                laboratories={laboratories}
                onApprove={handleApprove}
                onReject={handleReject}
                actionLoading={actionLoading}
                getRoleDisplayName={getRoleDisplayName}
                getStatusBadge={getStatusBadge}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {processedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Processed Requests ({processedRequests.length})</CardTitle>
            <CardDescription>Previously approved or rejected requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {processedRequests.map((request) => (
              <div key={request.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span className="font-medium">{(request as any).profiles?.full_name || 'Unknown User'}</span>
                      {getStatusBadge(request.status)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="w-3 h-3" />
                      {(request as any).profiles?.email}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      Processed: {new Date(request.processed_at!).toLocaleDateString()}
                    </div>
                    {request.status === 'approved' && (
                      <div className="text-sm">
                        <span className="font-medium">Approved Role:</span> {getRoleDisplayName(request.approved_role!)}
                        {request.approved_laboratory_id && (
                          <span className="ml-2">
                            <span className="font-medium">Lab:</span> {laboratories.find(lab => lab.id === request.approved_laboratory_id)?.name}
                          </span>
                        )}
                      </div>
                    )}
                    {request.status === 'rejected' && request.rejection_reason && (
                      <div className="text-sm">
                        <span className="font-medium">Reason:</span> {request.rejection_reason}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {requests.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No access requests found</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RequestCard({ 
  request, 
  laboratories, 
  onApprove, 
  onReject, 
  actionLoading, 
  getRoleDisplayName, 
  getStatusBadge 
}: {
  request: AccessRequest
  laboratories: Laboratory[]
  onApprove: (request: AccessRequest, role: string, labId?: string) => void
  onReject: (request: AccessRequest, reason?: string) => void
  actionLoading: string | null
  getRoleDisplayName: (role: string) => string
  getStatusBadge: (status: string) => JSX.Element
}) {
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [selectedLab, setSelectedLab] = useState<string>('')
  const [rejectionReason, setRejectionReason] = useState<string>('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  const roleOptions = [
    { value: 'lab_personnel', label: 'Lab Personnel' },
    { value: 'lab_finance_manager', label: 'Lab Finance Manager' },
    { value: 'lab_quality_manager', label: 'Lab Quality Manager' },
    { value: 'santos_hq_finance', label: 'Santos HQ Finance' },
    { value: 'global_finance_admin', label: 'Global Finance Admin' },
    { value: 'global_quality_admin', label: 'Global Quality Admin' },
    { value: 'global_admin', label: 'Global Admin' }
  ]

  const requiresLab = ['lab_personnel', 'lab_finance_manager', 'lab_quality_manager'].includes(selectedRole)

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span className="font-medium">{(request as any).profiles?.full_name || 'Unknown User'}</span>
            {getStatusBadge(request.status)}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="w-3 h-3" />
            {(request as any).profiles?.email}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-3 h-3" />
            Requested: {new Date(request.created_at).toLocaleDateString()}
          </div>
          {request.requested_role && (
            <div className="text-sm">
              <span className="font-medium">Requested Role:</span> {getRoleDisplayName(request.requested_role)}
            </div>
          )}
          {request.justification && (
            <div className="text-sm">
              <span className="font-medium">Justification:</span> {request.justification}
            </div>
          )}
        </div>
      </div>

      {request.status === 'pending' && (
        <div className="space-y-4 pt-4 border-t">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor={`role-${request.id}`}>Assign Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger id={`role-${request.id}`}>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {requiresLab && (
              <div>
                <Label htmlFor={`lab-${request.id}`}>Assign Laboratory</Label>
                <Select value={selectedLab} onValueChange={setSelectedLab}>
                  <SelectTrigger id={`lab-${request.id}`}>
                    <SelectValue placeholder="Select a laboratory" />
                  </SelectTrigger>
                  <SelectContent>
                    {laboratories.map((lab) => (
                      <SelectItem key={lab.id} value={lab.id}>
                        {lab.name} - {lab.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {showRejectForm && (
            <div>
              <Label htmlFor={`reason-${request.id}`}>Rejection Reason (Optional)</Label>
              <Input
                id={`reason-${request.id}`}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Provide a reason for rejection..."
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => onApprove(request, selectedRole, selectedLab)}
              disabled={!selectedRole || (requiresLab && !selectedLab) || actionLoading === request.id}
              className="bg-green-600 hover:bg-green-700"
            >
              {actionLoading === request.id ? (
                <>Processing...</>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </>
              )}
            </Button>
            
            {!showRejectForm ? (
              <Button
                variant="outline"
                onClick={() => setShowRejectForm(true)}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => onReject(request, rejectionReason)}
                  disabled={actionLoading === request.id}
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  {actionLoading === request.id ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 mr-2" />
                      Confirm Reject
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowRejectForm(false)
                    setRejectionReason('')
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
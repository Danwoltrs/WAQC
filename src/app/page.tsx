'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { supabase } from '@/lib/supabase'
import { LoginForm } from '@/components/auth/login-form'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, FlaskConical, FileText, Users, DollarSign, TrendingUp, Filter, Calendar } from 'lucide-react'
import { AccessRequestsManager } from '@/components/admin/access-requests-manager'

function DashboardContent() {
  const { profile } = useAuth()

  // Mock dashboard data - replace with real data
  const stats = [
    { title: 'Active Samples', value: '24', change: '+12%', icon: Package, color: 'lab-icon' },
    { title: 'Pending Assessments', value: '8', change: '-3%', icon: FlaskConical, color: 'lab-icon' },
    { title: 'Certificates Generated', value: '156', change: '+8%', icon: FileText, color: 'lab-icon' },
    { title: 'Total Users', value: '12', change: '+2', icon: Users, color: 'lab-icon' },
  ]

  // Sample data organized by status
  const samplesByStatus = {
    inProgress: [
      { id: 'QC-2025-001', origin: 'Colombian Huila', client: 'Roaster ABC', status: 'In Progress', cuppingTable: 'Table A' },
      { id: 'QC-2025-004', origin: 'Guatemalan Antigua', client: 'Premium Coffee', status: 'In Progress', cuppingTable: 'Table B' },
      { id: 'QC-2025-007', origin: 'Costa Rican Tarrazú', client: 'Artisan Roasters', status: 'In Progress', cuppingTable: 'Table A' },
    ],
    underReview: [
      { id: 'QC-2025-003', origin: 'Ethiopian Yirgacheffe', client: 'Specialty Ltd', status: 'Under Review', completedAt: new Date() },
      { id: 'QC-2025-005', origin: 'Kenyan AA', client: 'Coffee Masters', status: 'Under Review', completedAt: new Date() },
    ],
    approved: [
      { id: 'QC-2025-002', origin: 'Brazilian Cerrado', client: 'Coffee Co.', status: 'Approved', approvedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      { id: 'QC-2025-006', origin: 'Honduran SHG', client: 'Local Roastery', status: 'Approved', approvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    ],
    rejected: [
      { id: 'QC-2025-008', origin: 'Nicaraguan Matagalpa', client: 'Budget Coffee', status: 'Rejected', rejectedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    ]
  }

  const [approvedFilter, setApprovedFilter] = useState('week')
  const [rejectedFilter, setRejectedFilter] = useState('week')

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved': return 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-medium px-3 py-1.5'
      case 'in progress': return 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-medium px-3 py-1.5'
      case 'under review': return 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-medium px-3 py-1.5'
      default: return 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 font-medium px-3 py-1.5'
    }
  }

  // Check if user is anderson@wolthers.com or global admin for access requests management
  const showAccessManager = profile?.is_global_admin || profile?.email === 'anderson@wolthers.com'

  return (
    <div className="p-6 space-y-6">
      {/* Access Requests Manager - Only for anderson@wolthers.com or global admins */}
      {showAccessManager && (
        <AccessRequestsManager />
      )}

      {/* Welcome header */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {profile?.full_name || 'User'}
        </h1>
        <p className="text-lg text-muted-foreground">
          Here's what's happening in your laboratory today.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title} className="hover:shadow-md transition-all duration-200 border-border/50">
              <CardContent className="p-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {stat.title}
                    </p>
                    <p className="text-4xl font-bold">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className={`font-medium ${stat.change.startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {stat.change}
                      </span>
                      {' '}from last month
                    </p>
                  </div>
                  <Icon className={`h-10 w-10 ${stat.color} opacity-80`} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quick actions */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Quick Actions</h2>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
            New Sample
          </button>
          <button className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-sm font-medium">
            Start Assessment
          </button>
          <button className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-sm font-medium">
            Generate Certificate
          </button>
        </div>
      </div>

      {/* Sample Lanes */}
      <div className="space-y-8">
        {/* In Progress Lane - Cupping Table */}
        {samplesByStatus.inProgress.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <FlaskConical className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-bold">Cupping Table - In Progress</h2>
              <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm font-medium">
                {samplesByStatus.inProgress.length} samples
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {samplesByStatus.inProgress.map((sample) => (
                <Card key={sample.id} className="hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <p className="font-bold text-lg text-blue-600">{sample.id}</p>
                        <Badge className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs">
                          {sample.cuppingTable}
                        </Badge>
                      </div>
                      <p className="font-medium">{sample.origin}</p>
                      <p className="text-sm text-muted-foreground">{sample.client}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <hr className="border-border" />
          </div>
        )}

        {/* Under Review Lane */}
        {samplesByStatus.underReview.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-6 w-6 text-amber-600" />
              <h2 className="text-xl font-bold">Under Review</h2>
              <span className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-3 py-1 rounded-full text-sm font-medium">
                {samplesByStatus.underReview.length} samples
              </span>
            </div>
            <div className="space-y-2">
              {samplesByStatus.underReview.map((sample, index) => (
                <div key={sample.id}>
                  <Card className="hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-amber-500">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <p className="font-bold text-lg text-amber-600">{sample.id}</p>
                          <p className="font-medium">{sample.origin}</p>
                          <p className="text-sm text-muted-foreground">{sample.client}</p>
                        </div>
                        <div className="text-right">
                          <Badge className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                            Awaiting Review
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  {index < samplesByStatus.underReview.length - 1 && (
                    <hr className="border-border/30 my-2" />
                  )}
                </div>
              ))}
            </div>
            <hr className="border-border" />
          </div>
        )}

        {/* Approved Lane */}
        {samplesByStatus.approved.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-emerald-600" />
              <h2 className="text-xl font-bold">Approved Samples</h2>
              <div className="flex items-center gap-2 ml-auto">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select 
                  value={approvedFilter} 
                  onChange={(e) => setApprovedFilter(e.target.value)}
                  className="bg-background border border-border rounded px-2 py-1 text-sm"
                >
                  <option value="day">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {samplesByStatus.approved.map((sample) => (
                <Card key={sample.id} className="hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-emerald-500">
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <p className="font-bold text-emerald-600">{sample.id}</p>
                      <p className="text-sm font-medium">{sample.origin}</p>
                      <p className="text-xs text-muted-foreground">{sample.client}</p>
                      <Badge className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs">
                        Approved
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <hr className="border-border" />
          </div>
        )}

        {/* Rejected Lane */}
        {samplesByStatus.rejected.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-red-600" />
              <h2 className="text-xl font-bold">Rejected Samples</h2>
              <div className="flex items-center gap-2 ml-auto">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select 
                  value={rejectedFilter} 
                  onChange={(e) => setRejectedFilter(e.target.value)}
                  className="bg-background border border-border rounded px-2 py-1 text-sm"
                >
                  <option value="day">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {samplesByStatus.rejected.map((sample) => (
                <Card key={sample.id} className="hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-red-500">
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <p className="font-bold text-red-600">{sample.id}</p>
                      <p className="text-sm font-medium">{sample.origin}</p>
                      <p className="text-xs text-muted-foreground">{sample.client}</p>
                      <Badge className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs">
                        Rejected
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lab Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Activity Chart */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-xl font-bold">
              <TrendingUp className="h-6 w-6 lab-icon" />
              Weekly Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">MON</span>
                <div className="flex-1 mx-3 bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{width: '75%'}}></div>
                </div>
                <span className="text-sm font-bold">15</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">TUE</span>
                <div className="flex-1 mx-3 bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{width: '90%'}}></div>
                </div>
                <span className="text-sm font-bold">18</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">WED</span>
                <div className="flex-1 mx-3 bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{width: '60%'}}></div>
                </div>
                <span className="text-sm font-bold">12</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">THU</span>
                <div className="flex-1 mx-3 bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{width: '100%'}}></div>
                </div>
                <span className="text-sm font-bold">20</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">FRI</span>
                <div className="flex-1 mx-3 bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{width: '45%'}}></div>
                </div>
                <span className="text-sm font-bold">9</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quality Metrics */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-xl font-bold">
              <FlaskConical className="h-6 w-6 lab-icon" />
              Quality Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Average Cupping Score</span>
                  <span className="text-lg font-bold">84.2</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{width: '84%'}}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Approval Rate</span>
                  <span className="text-lg font-bold">92%</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{width: '92%'}}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Processing Time</span>
                  <span className="text-lg font-bold">2.4d</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full" style={{width: '68%'}}></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}

function QCAccessMessage() {
  const { user, profile } = useAuth()
  const [accessRequest, setAccessRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const isWolthersUser = user?.email?.endsWith('@wolthers.com')
  
  // Check for existing access request for Wolthers users
  useEffect(() => {
    if (isWolthersUser && user?.id) {
      checkAccessRequest()
    } else {
      setLoading(false)
    }
  }, [user?.id, isWolthersUser])
  
  const checkAccessRequest = async () => {
    try {
      const { data } = await supabase
        .from('access_requests')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      setAccessRequest(data)
    } catch (error) {
      console.log('No access request found or error:', error)
    } finally {
      setLoading(false)
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="flex items-center justify-center gap-2">
            <FlaskConical className="h-6 w-6 lab-icon" />
            {isWolthersUser ? 'Access Request Submitted' : 'QC Access Required'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Welcome, {profile?.full_name || user?.email}
            </p>
            {isWolthersUser ? (
              <div className="space-y-3">
                <p className="text-sm">
                  Your access request has been automatically submitted.
                </p>
                {accessRequest && (
                  <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Status: {accessRequest.status.charAt(0).toUpperCase() + accessRequest.status.slice(1)}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      Submitted: {new Date(accessRequest.created_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm">
                Your account exists in our system, but QC access hasn't been enabled yet.
              </p>
            )}
          </div>
          
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            {isWolthersUser ? (
              <div>
                <h4 className="font-medium text-sm">What happens next:</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Anderson will review your request</li>
                  <li>• You'll receive an email when approved</li>
                  <li>• Your role and lab assignment will be configured</li>
                </ul>
              </div>
            ) : (
              <div>
                <h4 className="font-medium text-sm">To get QC access:</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Contact your system administrator</li>
                  <li>• Request QC role assignment</li>
                  <li>• Specify which laboratory you'll be working with</li>
                </ul>
              </div>
            )}
          </div>
          
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Contact: {isWolthersUser ? 'anderson@wolthers.com' : 'admin@wolthers.com'} for assistance
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function Home() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user) {
    return <LoginForm />
  }

  // Show QC access message for users who don't have QC enabled
  if (profile && !profile.qc_enabled) {
    return <QCAccessMessage />
  }

  return (
    <MainLayout>
      <DashboardContent />
    </MainLayout>
  )
}
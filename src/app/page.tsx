'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { supabase, type Database } from '@/lib/supabase'
import { LoginForm } from '@/components/auth/login-form'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FlaskConical, FileText, Users, DollarSign, TrendingUp, Filter, Calendar, CheckCircle2, XCircle } from 'lucide-react'
import { SampleTin } from '@/components/icons/sample-tin'

interface Sample {
  id: string
  tracking_number: string
  origin: string
  buyer: string | null
  quality_name: string | null
  status: string
  created_at: string
}

function DashboardContent() {
  const { profile } = useAuth()
  const [samples, setSamples] = useState<Sample[]>([])
  const [loading, setLoading] = useState(true)
  const [approvedFilter, setApprovedFilter] = useState('week')
  const [rejectedFilter, setRejectedFilter] = useState('week')

  useEffect(() => {
    fetchSamples()
  }, [profile])

  const fetchSamples = async () => {
    try {
      const { data, error } = await supabase
        .from('samples')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setSamples(data || [])
    } catch (error) {
      console.error('Error fetching samples:', error)
    } finally {
      setLoading(false)
    }
  }

  // Organize samples by status
  const samplesByStatus = {
    inProgress: samples.filter(s => s.status === 'in_progress').map(s => ({
      id: s.tracking_number,
      origin: s.origin,
      client: s.buyer,
      quality: s.quality_name || 'Standard',
    })),
    underReview: samples.filter(s => s.status === 'under_review').map(s => ({
      id: s.tracking_number,
      origin: s.origin,
      client: s.buyer,
      quality: s.quality_name || 'Standard',
    })),
    approved: samples.filter(s => s.status === 'approved').map(s => ({
      id: s.tracking_number,
      origin: s.origin,
      client: s.buyer,
      quality: s.quality_name || 'Standard',
    })),
    rejected: samples.filter(s => s.status === 'rejected').map(s => ({
      id: s.tracking_number,
      origin: s.origin,
      client: s.buyer,
      quality: s.quality_name || 'Standard',
    })),
  }

  // Calculate stats from real data
  const totalSamples = samples.length
  const approvedSamples = samples.filter(s => s.status === 'approved').length
  const rejectedSamples = samples.filter(s => s.status === 'rejected').length
  const completedSamples = approvedSamples + rejectedSamples
  const approvalRate = completedSamples > 0 ? Math.round((approvedSamples / completedSamples) * 100) : 0

  // Calculate weekly activity (samples created per day)
  const weeklyActivity = (() => {
    const today = new Date()
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
    const counts = [0, 0, 0, 0, 0, 0, 0]

    samples.forEach(sample => {
      const sampleDate = new Date(sample.created_at)
      const dayOfWeek = sampleDate.getDay()
      counts[dayOfWeek]++
    })

    // Get current day of week (0 = Sunday, 6 = Saturday)
    const currentDay = today.getDay()

    // Arrange days starting from Monday of current week
    const monday = (currentDay + 6) % 7 // Convert to Monday-based (0 = Monday)
    const weekDays = []
    for (let i = 1; i <= 5; i++) { // Mon to Fri
      const dayIndex = i
      weekDays.push({
        name: dayNames[dayIndex],
        count: counts[dayIndex]
      })
    }

    return weekDays
  })()

  const maxWeeklyCount = Math.max(...weeklyActivity.map(d => d.count), 1)

  // Calculate average processing time
  const processingTimes = samples
    .filter(s => s.status === 'approved' || s.status === 'rejected')
    .map(s => {
      const created = new Date(s.created_at)
      const now = new Date()
      return (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24) // days
    })
  const avgProcessingTime = processingTimes.length > 0
    ? (processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length).toFixed(1)
    : '0.0'

  const stats = [
    { title: 'Active Samples', value: samples.filter(s => s.status === 'in_progress' || s.status === 'under_review').length.toString(), change: '+12%', icon: SampleTin, color: 'lab-icon' },
    { title: 'Pending Assessments', value: samples.filter(s => s.status === 'under_review').length.toString(), change: '-3%', icon: FlaskConical, color: 'lab-icon' },
    { title: 'Certificates Generated', value: approvedSamples.toString(), change: '+8%', icon: FileText, color: 'lab-icon' },
    { title: 'Total Users', value: '12', change: '+2', icon: Users, color: 'lab-icon' },
  ]

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome header */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {profile?.full_name || 'User'}
        </h1>
        <p className="text-lg text-muted-foreground">
          Here&apos;s what&apos;s happening in your laboratory today.
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
              <FlaskConical className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-xl font-bold">Cupping Table - In Progress</h2>
              <span className="text-sm text-muted-foreground">
                {samplesByStatus.inProgress.length} {samplesByStatus.inProgress.length === 1 ? 'sample' : 'samples'}
              </span>
            </div>
            <Card className="p-6">
              <div className="flex flex-wrap gap-4">
                {samplesByStatus.inProgress.map((sample, index) => (
                  <div key={sample.id} className="flex items-center">
                    <div className="cursor-pointer hover:bg-muted/50 p-3 rounded-lg transition-colors">
                      <p className="font-bold text-blue-600 dark:text-blue-400 mb-1">{sample.id}</p>
                      <p className="text-sm text-foreground">{sample.origin}</p>
                      {sample.client && <p className="text-xs text-muted-foreground">{sample.client}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{sample.quality}</p>
                    </div>
                    {index < samplesByStatus.inProgress.length - 1 && (
                      <div className="h-16 w-px bg-border mx-2" />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Under Review Lane */}
        {samplesByStatus.underReview.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-xl font-bold">Under Review</h2>
              <span className="text-sm text-muted-foreground">
                {samplesByStatus.underReview.length} {samplesByStatus.underReview.length === 1 ? 'sample' : 'samples'}
              </span>
            </div>
            <Card className="p-6">
              <div className="flex flex-wrap gap-4">
                {samplesByStatus.underReview.map((sample, index) => (
                  <div key={sample.id} className="flex items-center">
                    <div className="cursor-pointer hover:bg-muted/50 p-3 rounded-lg transition-colors">
                      <p className="font-bold text-amber-600 dark:text-amber-400 mb-1">{sample.id}</p>
                      <p className="text-sm text-foreground">{sample.origin}</p>
                      {sample.client && <p className="text-xs text-muted-foreground">{sample.client}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{sample.quality}</p>
                    </div>
                    {index < samplesByStatus.underReview.length - 1 && (
                      <div className="h-16 w-px bg-border mx-2" />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Approved Lane */}
        {samplesByStatus.approved.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
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
            <Card className="p-6">
              <div className="flex flex-wrap gap-4">
                {samplesByStatus.approved.map((sample, index) => (
                  <div key={sample.id} className="flex items-center">
                    <div className="cursor-pointer hover:bg-muted/50 p-3 rounded-lg transition-colors">
                      <p className="font-bold text-emerald-600 dark:text-emerald-400 mb-1">{sample.id}</p>
                      <p className="text-sm text-foreground">{sample.origin}</p>
                      {sample.client && <p className="text-xs text-muted-foreground">{sample.client}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{sample.quality}</p>
                    </div>
                    {index < samplesByStatus.approved.length - 1 && (
                      <div className="h-16 w-px bg-border mx-2" />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Rejected Lane */}
        {samplesByStatus.rejected.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-muted-foreground" />
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
            <Card className="p-6">
              <div className="flex flex-wrap gap-4">
                {samplesByStatus.rejected.map((sample, index) => (
                  <div key={sample.id} className="flex items-center">
                    <div className="cursor-pointer hover:bg-muted/50 p-3 rounded-lg transition-colors">
                      <p className="font-bold text-red-600 dark:text-red-400 mb-1">{sample.id}</p>
                      <p className="text-sm text-foreground">{sample.origin}</p>
                      {sample.client && <p className="text-xs text-muted-foreground">{sample.client}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{sample.quality}</p>
                    </div>
                    {index < samplesByStatus.rejected.length - 1 && (
                      <div className="h-16 w-px bg-border mx-2" />
                    )}
                  </div>
                ))}
              </div>
            </Card>
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
              {weeklyActivity.map((day) => (
                <div key={day.name} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-muted-foreground">{day.name}</span>
                  <div className="flex-1 mx-3 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{width: `${(day.count / maxWeeklyCount) * 100}%`}}
                    ></div>
                  </div>
                  <span className="text-sm font-bold">{day.count}</span>
                </div>
              ))}
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
                  <span className="text-lg font-bold">{approvalRate}%</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{width: `${approvalRate}%`}}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Processing Time</span>
                  <span className="text-lg font-bold">{avgProcessingTime}d</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full" style={{width: `${Math.min((parseFloat(avgProcessingTime) / 5) * 100, 100)}%`}}></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}

type AccessRequest = Database['public']['Tables']['access_requests']['Row']

function QCAccessMessage() {
  const { user, profile } = useAuth()
  const [accessRequest, setAccessRequest] = useState<AccessRequest | null>(null)
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
                Your account exists in our system, but QC access hasn&apos;t been enabled yet.
              </p>
            )}
          </div>
          
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            {isWolthersUser ? (
              <div>
                <h4 className="font-medium text-sm">What happens next:</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Anderson will review your request</li>
                  <li>• You&apos;ll receive an email when approved</li>
                  <li>• Your role and lab assignment will be configured</li>
                </ul>
              </div>
            ) : (
              <div>
                <h4 className="font-medium text-sm">To get QC access:</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Contact your system administrator</li>
                  <li>• Request QC role assignment</li>
                  <li>• Specify which laboratory you&apos;ll be working with</li>
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
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { supabase, type Database } from '@/lib/supabase'
import { LoginForm } from '@/components/auth/login-form'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SampleIntakeForm } from '@/components/samples/sample-intake-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FlaskConical, FileText, Users, TrendingUp, Filter, Calendar, CheckCircle2, XCircle, Camera, ExternalLink, MapPin } from 'lucide-react'
import { SampleTin } from '@/components/icons/sample-tin'
import { CuppingBowl } from '@/components/icons/cupping-bowl'
import { ActivityHeatmap } from '@/components/dashboard/activity-heatmap'
import { DashboardScanDialog } from '@/components/dashboard/dashboard-scan-dialog'

interface Sample {
  id: string
  tracking_number: string
  origin: string
  buyer_name: string | null
  quality_name: string | null
  status: string | null
  created_at: string | null
  seller_name: string | null
  exporter_name: string | null
  importer_name: string | null
  roaster_name: string | null
  end_client_name: string | null
  micro_origin: string | null
  sample_type: string | null
  certificate_status: string | null
  container_nr: string | null
  ico_number: string | null
  exporter_sample_number: string | null
}

function DashboardContent() {
  const router = useRouter()
  const { profile } = useAuth()
  const [samples, setSamples] = useState<Sample[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Log when content loading state changes
  useEffect(() => {
    if (!loading) {
      console.log('[UI] Dashboard content ready')
    }
  }, [loading])
  const [approvedFilter, setApprovedFilter] = useState('week')
  const [rejectedFilter, setRejectedFilter] = useState('week')
  const [totalUsers, setTotalUsers] = useState(0)
  const [lastMonthUsers, setLastMonthUsers] = useState(0)
  const [sampleDialogOpen, setSampleDialogOpen] = useState(false)
  const [scanDialogOpen, setScanDialogOpen] = useState(false)
  const [hasCardsPrinted, setHasCardsPrinted] = useState(false)
  const [previewSample, setPreviewSample] = useState<any>(null)

  useEffect(() => {
    console.log('[UI] Dashboard content fetch started')
    fetchSamples()
    fetchUserCount()
    checkCardsPrinted()
  }, [profile])

  const checkCardsPrinted = async () => {
    try {
      const response = await fetch('/api/samples/check-cards-printed')
      if (response.ok) {
        const data = await response.json()
        setHasCardsPrinted(data.hasCardsPrinted)
      }
    } catch (error) {
      console.error('Error checking cards printed status:', error)
    }
  }

  const handleScanComplete = () => {
    // Refresh samples after scan
    fetchSamples()
    // Recheck cards printed status
    checkCardsPrinted()
  }

  const handleSampleCreated = (trackingNumber: string) => {
    setSampleDialogOpen(false)
    fetchSamples() // Refresh the samples list
  }

  const handleNewClient = () => {
    router.push('/clients/new')
  }

  const fetchUserCount = async () => {
    try {
      // Get total users with qc_enabled
      const { count: totalCount, error: totalError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('qc_enabled', true)

      if (totalError) throw totalError

      // Get users created last month
      const now = new Date()
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

      const { count: lastMonthCount, error: lastMonthError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('qc_enabled', true)
        .gte('created_at', lastMonthStart.toISOString())
        .lte('created_at', lastMonthEnd.toISOString())

      if (lastMonthError) throw lastMonthError

      setTotalUsers(totalCount || 0)
      setLastMonthUsers(lastMonthCount || 0)
    } catch (error) {
      console.error('Error fetching user count:', error)
    }
  }

  const fetchSamples = async () => {
    // Timeout to prevent infinite loading - max 15 seconds for content fetch
    const timeoutId = setTimeout(() => {
      console.error('[UI] Dashboard content fetch timeout - forcing ready state')
      setLoadError('Content load timed out. Please refresh.')
      setLoading(false)
    }, 15000)

    try {
      // Use the API route which already handles FK disambiguation
      const response = await fetch('/api/samples?limit=200')
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${response.status}`)
      }
      const result = await response.json()

      // Transform to dashboard format
      const transformedSamples = (result.samples || []).map((sample: any) => ({
        id: sample.id,
        tracking_number: sample.tracking_number,
        origin: sample.origin,
        quality_name: sample.quality_name,
        status: sample.status,
        created_at: sample.created_at,
        buyer_name: sample.qc_client_name || null,
        seller_name: sample.seller_name || null,
        exporter_name: sample.exporter_name || null,
        importer_name: sample.importer_name || null,
        roaster_name: sample.roaster_name || null,
        end_client_name: sample.end_client_name || null,
        micro_origin: sample.micro_origin || null,
        sample_type: sample.sample_type || null,
        certificate_status: sample.certificate_status || null,
        container_nr: sample.container_nr || null,
        ico_number: sample.ico_number || null,
        exporter_sample_number: sample.exporter_sample_number || null,
      }))

      setSamples(transformedSamples)
      setLoadError(null) // Clear any previous error
    } catch (error: any) {
      console.error('Error fetching samples:', error)
      setLoadError(error?.message || 'Failed to load samples')
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  // Organize samples by status
  const mapSample = (s: Sample) => ({
    sampleId: s.id,
    trackingNumber: s.tracking_number,
    client: s.buyer_name,
    quality: s.quality_name || 'Standard',
    origin: s.origin,
    microOrigin: s.micro_origin,
    sellerName: s.seller_name,
    importerName: s.importer_name,
    roasterName: s.roaster_name,
    endClientName: s.end_client_name,
    sampleType: s.sample_type,
    certificateStatus: s.certificate_status,
    createdAt: s.created_at,
    containerNr: s.container_nr,
    icoNumber: s.ico_number,
    exporterSampleNumber: s.exporter_sample_number,
  })
  const getFilterDate = (filter: string) => {
    const now = new Date()
    if (filter === 'day') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    }
    if (filter === 'week') {
      const dayOfWeek = now.getDay()
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday)
      return monday
    }
    // month
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }

  const filterByDate = (s: Sample, filter: string) => {
    if (!s.created_at) return false
    return new Date(s.created_at) >= getFilterDate(filter)
  }

  const samplesByStatus = {
    inProgress: samples.filter(s => s.status === 'in_progress').map(mapSample),
    underReview: samples.filter(s => s.status === 'under_review').map(mapSample),
    approved: samples.filter(s => s.status === 'approved' && filterByDate(s, approvedFilter)).map(mapSample),
    rejected: samples.filter(s => s.status === 'rejected' && filterByDate(s, rejectedFilter)).map(mapSample),
  }

  type DashboardSample = ReturnType<typeof mapSample>

  const getSampleSecondaryId = (sample: DashboardSample) =>
    sample.exporterSampleNumber || sample.containerNr || sample.icoNumber || null

  const formatCardDate = (dateStr: string | null) => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
      if (!sample.created_at) return
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

  // Calculate samples per week data
  const samplesPerWeekData = (() => {
    if (samples.length === 0) {
      return {
        currentWeek: 0,
        allTimeHigh: 0,
        currentWeekLabel: 'This Week',
        percentage: 0
      }
    }

    // Get current week start (Monday)
    const now = new Date()
    const currentDayOfWeek = now.getDay()
    const daysToMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1
    const currentWeekStart = new Date(now)
    currentWeekStart.setDate(now.getDate() - daysToMonday)
    currentWeekStart.setHours(0, 0, 0, 0)

    const currentWeekEnd = new Date(currentWeekStart)
    currentWeekEnd.setDate(currentWeekStart.getDate() + 7)

    // Count samples in current week
    const currentWeekSamples = samples.filter(s => {
      if (!s.created_at) return false
      const sampleDate = new Date(s.created_at)
      return sampleDate >= currentWeekStart && sampleDate < currentWeekEnd
    }).length

    // Group all samples by week
    const weekMap = new Map<string, number>()
    samples.forEach(sample => {
      if (!sample.created_at) return
      const sampleDate = new Date(sample.created_at)
      const dayOfWeek = sampleDate.getDay()
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const weekStart = new Date(sampleDate)
      weekStart.setDate(sampleDate.getDate() - daysToMonday)
      weekStart.setHours(0, 0, 0, 0)
      const weekKey = weekStart.toISOString().split('T')[0]
      weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + 1)
    })

    // Find all-time high week
    let allTimeHigh = 0
    weekMap.forEach((count) => {
      if (count > allTimeHigh) {
        allTimeHigh = count
      }
    })

    const currentWeekLabel = `Week of ${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    const percentage = allTimeHigh > 0 ? Math.min((currentWeekSamples / allTimeHigh) * 100, 100) : 0

    return {
      currentWeek: currentWeekSamples,
      allTimeHigh,
      currentWeekLabel,
      percentage
    }
  })()

  // Calculate average processing time
  const processingTimes = samples
    .filter(s => (s.status === 'approved' || s.status === 'rejected') && s.created_at)
    .map(s => {
      const created = new Date(s.created_at!)
      const now = new Date()
      return (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24) // days
    })
  const avgProcessingTime = processingTimes.length > 0
    ? (processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length).toFixed(1)
    : '0.0'

  const userChange = lastMonthUsers > 0 ? `+${lastMonthUsers}` : '0'

  // Calculate month-over-month changes for stats
  const calculateMonthlyChange = (filterFn: (s: Sample) => boolean) => {
    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

    const currentMonthCount = samples.filter(s => {
      if (!s.created_at) return false
      const date = new Date(s.created_at)
      return date >= currentMonthStart && filterFn(s)
    }).length

    const lastMonthCount = samples.filter(s => {
      if (!s.created_at) return false
      const date = new Date(s.created_at)
      return date >= lastMonthStart && date <= lastMonthEnd && filterFn(s)
    }).length

    if (lastMonthCount === 0) return currentMonthCount > 0 ? '+100%' : '0%'
    const percentChange = Math.round(((currentMonthCount - lastMonthCount) / lastMonthCount) * 100)
    return percentChange > 0 ? `+${percentChange}%` : `${percentChange}%`
  }

  const activeSamplesChange = calculateMonthlyChange(s => s.status === 'in_progress' || s.status === 'under_review')
  const pendingAssessmentsChange = calculateMonthlyChange(s => s.status === 'under_review')
  const certificatesChange = calculateMonthlyChange(s => s.status === 'approved')

  const stats = [
    { title: 'Active Samples', value: samples.filter(s => s.status === 'in_progress' || s.status === 'under_review').length.toString(), change: activeSamplesChange, icon: SampleTin, color: 'lab-icon' },
    { title: 'Pending Assessments', value: samples.filter(s => s.status === 'under_review').length.toString(), change: pendingAssessmentsChange, icon: CuppingBowl, color: 'lab-icon' },
    { title: 'Certificates Generated', value: approvedSamples.toString(), change: certificatesChange, icon: FileText, color: 'lab-icon' },
    { title: 'Total Users', value: totalUsers.toString(), change: userChange, icon: Users, color: 'lab-icon' },
  ]

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-destructive">Failed to load dashboard</p>
          <p className="text-sm text-muted-foreground">{loadError}</p>
        </div>
        <button
          onClick={() => {
            setLoadError(null)
            setLoading(true)
            fetchSamples()
          }}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
      {/* Mobile: Quick Actions FIRST */}
      <div className="sm:hidden space-y-3">
        <h2 className="text-lg font-bold">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSampleDialogOpen(true)}
            className="px-3 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            New Sample
          </button>
          <button
            onClick={handleNewClient}
            className="px-3 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            New Client
          </button>
          <button
            onClick={() => setScanDialogOpen(true)}
            disabled={!hasCardsPrinted}
            className="px-3 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!hasCardsPrinted ? 'Print cupping cards first' : 'Scan cupping cards'}
          >
            <Camera className="h-4 w-4" />
            Scan Cards
          </button>
          <button
            onClick={() => router.push('/cupping')}
            className="px-3 py-3 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-sm font-medium"
          >
            Cupping
          </button>
        </div>
      </div>

      {/* Welcome header - smaller on mobile */}
      <div className="space-y-1 sm:space-y-3">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'User'}
        </h1>
        <p className="text-sm sm:text-lg text-muted-foreground hidden sm:block">
          Here&apos;s what&apos;s happening in your laboratory today.
        </p>
      </div>

      {/* Stats grid - HIDDEN on mobile */}
      <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      {/* Desktop Quick actions - HIDDEN on mobile (shown above) */}
      <div className="hidden sm:block space-y-4">
        <h2 className="text-xl font-bold">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:flex gap-3">
          <button
            onClick={() => setSampleDialogOpen(true)}
            className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium whitespace-nowrap"
          >
            New Sample
          </button>
          <button
            onClick={handleNewClient}
            className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium whitespace-nowrap"
          >
            New Client
          </button>
          <button
            onClick={() => setScanDialogOpen(true)}
            disabled={!hasCardsPrinted}
            className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap col-span-2 sm:col-span-1"
            title={!hasCardsPrinted ? 'Print cupping cards first' : 'Scan cupping cards'}
          >
            <Camera className="h-4 w-4" />
            Scan Cards
          </button>
          <button className="px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-sm font-medium whitespace-nowrap">
            Assessment
          </button>
          <button className="px-4 py-2.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors text-sm font-medium whitespace-nowrap">
            Certificate
          </button>
        </div>
      </div>

      {/* New Sample Dialog */}
      <Dialog open={sampleDialogOpen} onOpenChange={setSampleDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sample Intake</DialogTitle>
          </DialogHeader>
          <SampleIntakeForm onSuccess={handleSampleCreated} asDialog={true} />
        </DialogContent>
      </Dialog>

      {/* Scan Cupping Cards Dialog */}
      <DashboardScanDialog
        open={scanDialogOpen}
        onOpenChange={setScanDialogOpen}
        onScoresSubmitted={handleScanComplete}
      />

      {/* In Progress Lane - Cupping Table (Mobile) */}
      {samplesByStatus.inProgress.length > 0 && (
        <div className="sm:hidden space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">Cupping Table - In Progress</h2>
            <span className="text-sm text-muted-foreground">
              {samplesByStatus.inProgress.length} {samplesByStatus.inProgress.length === 1 ? 'sample' : 'samples'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {samplesByStatus.inProgress.map((sample) => (
              <Card
                key={sample.sampleId}
                className="cursor-pointer hover:shadow-md transition-all p-3"
                onClick={() => setPreviewSample(sample)}
              >
                <p className="font-bold text-blue-600 dark:text-blue-400 mb-0.5 text-sm truncate">{sample.trackingNumber}</p>
                <p className="text-[11px] text-muted-foreground truncate">{getSampleSecondaryId(sample) || '\u00A0'}</p>
                <p className="text-xs font-medium truncate mt-1">{sample.client || 'No client'}</p>
                <p className="text-xs text-muted-foreground truncate">{sample.quality}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">{formatCardDate(sample.createdAt) || '\u00A0'}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Under Review Lane (Mobile) */}
      {samplesByStatus.underReview.length > 0 && (
        <div className="sm:hidden space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">Under Review</h2>
            <span className="text-sm text-muted-foreground">
              {samplesByStatus.underReview.length} {samplesByStatus.underReview.length === 1 ? 'sample' : 'samples'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {samplesByStatus.underReview.map((sample) => (
              <Card
                key={sample.sampleId}
                className="cursor-pointer hover:shadow-md transition-all p-3"
                onClick={() => setPreviewSample(sample)}
              >
                <p className="font-bold text-amber-600 dark:text-amber-400 mb-0.5 text-sm truncate">{sample.trackingNumber}</p>
                <p className="text-[11px] text-muted-foreground truncate">{getSampleSecondaryId(sample) || '\u00A0'}</p>
                <p className="text-xs font-medium truncate mt-1">{sample.client || 'No client'}</p>
                <p className="text-xs text-muted-foreground truncate">{sample.quality}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">{formatCardDate(sample.createdAt) || '\u00A0'}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Approved Lane (Mobile) */}
      {samplesByStatus.approved.length > 0 && (
        <div className="sm:hidden space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">Approved</h2>
            <span className="text-sm text-muted-foreground">
              {samplesByStatus.approved.length} {samplesByStatus.approved.length === 1 ? 'sample' : 'samples'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {samplesByStatus.approved.map((sample) => (
              <Card
                key={sample.sampleId}
                className="cursor-pointer hover:shadow-md transition-all p-3"
                onClick={() => setPreviewSample(sample)}
              >
                <p className="font-bold text-emerald-600 dark:text-emerald-400 mb-0.5 text-sm truncate">{sample.trackingNumber}</p>
                <p className="text-[11px] text-muted-foreground truncate">{getSampleSecondaryId(sample) || '\u00A0'}</p>
                <p className="text-xs font-medium truncate mt-1">{sample.client || 'No client'}</p>
                <p className="text-xs text-muted-foreground truncate">{sample.quality}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">{formatCardDate(sample.createdAt) || '\u00A0'}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Rejected Lane (Mobile) */}
      {samplesByStatus.rejected.length > 0 && (
        <div className="sm:hidden space-y-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">Rejected</h2>
            <span className="text-sm text-muted-foreground">
              {samplesByStatus.rejected.length} {samplesByStatus.rejected.length === 1 ? 'sample' : 'samples'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {samplesByStatus.rejected.map((sample) => (
              <Card
                key={sample.sampleId}
                className="cursor-pointer hover:shadow-md transition-all p-3"
                onClick={() => setPreviewSample(sample)}
              >
                <p className="font-bold text-red-600 dark:text-red-400 mb-0.5 text-sm truncate">{sample.trackingNumber}</p>
                <p className="text-[11px] text-muted-foreground truncate">{getSampleSecondaryId(sample) || '\u00A0'}</p>
                <p className="text-xs font-medium truncate mt-1">{sample.client || 'No client'}</p>
                <p className="text-xs text-muted-foreground truncate">{sample.quality}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">{formatCardDate(sample.createdAt) || '\u00A0'}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Sample Lanes - Desktop only */}
      <div className="hidden sm:block space-y-8">
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
            <Card className="p-4 sm:p-6">
              <div className="flex flex-wrap gap-4">
                {samplesByStatus.inProgress.map((sample, index) => (
                  <div key={sample.sampleId} className="flex items-center">
                    <div
                      className="cursor-pointer hover:bg-muted/50 p-3 rounded-lg transition-colors"
                      onClick={() => setPreviewSample(sample)}
                    >
                      <p className="font-bold text-blue-600 dark:text-blue-400 mb-0.5">{sample.trackingNumber}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{getSampleSecondaryId(sample) || '\u00A0'}</p>
                      <p className="text-sm font-medium truncate mt-1">{sample.client || 'No client'}</p>
                      <p className="text-xs text-muted-foreground truncate">{sample.quality}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1.5">{formatCardDate(sample.createdAt) || '\u00A0'}</p>
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
            <Card className="p-4 sm:p-6">
              <div className="flex flex-wrap gap-4">
                {samplesByStatus.underReview.map((sample, index) => (
                  <div key={sample.sampleId} className="flex items-center">
                    <div
                      className="cursor-pointer hover:bg-muted/50 p-3 rounded-lg transition-colors"
                      onClick={() => setPreviewSample(sample)}
                    >
                      <p className="font-bold text-amber-600 dark:text-amber-400 mb-0.5">{sample.trackingNumber}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{getSampleSecondaryId(sample) || '\u00A0'}</p>
                      <p className="text-sm font-medium truncate mt-1">{sample.client || 'No client'}</p>
                      <p className="text-xs text-muted-foreground truncate">{sample.quality}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1.5">{formatCardDate(sample.createdAt) || '\u00A0'}</p>
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
            <Card className="p-4 sm:p-6">
              <div className="flex flex-wrap gap-4">
                {samplesByStatus.approved.map((sample, index) => (
                  <div key={sample.sampleId} className="flex items-center">
                    <div
                      className="cursor-pointer hover:bg-muted/50 p-3 rounded-lg transition-colors"
                      onClick={() => setPreviewSample(sample)}
                    >
                      <p className="font-bold text-emerald-600 dark:text-emerald-400 mb-0.5">{sample.trackingNumber}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{getSampleSecondaryId(sample) || '\u00A0'}</p>
                      <p className="text-sm font-medium truncate mt-1">{sample.client || 'No client'}</p>
                      <p className="text-xs text-muted-foreground truncate">{sample.quality}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1.5">{formatCardDate(sample.createdAt) || '\u00A0'}</p>
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
            <Card className="p-4 sm:p-6">
              <div className="flex flex-wrap gap-4">
                {samplesByStatus.rejected.map((sample, index) => (
                  <div key={sample.sampleId} className="flex items-center">
                    <div
                      className="cursor-pointer hover:bg-muted/50 p-3 rounded-lg transition-colors"
                      onClick={() => setPreviewSample(sample)}
                    >
                      <p className="font-bold text-red-600 dark:text-red-400 mb-0.5">{sample.trackingNumber}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{getSampleSecondaryId(sample) || '\u00A0'}</p>
                      <p className="text-sm font-medium truncate mt-1">{sample.client || 'No client'}</p>
                      <p className="text-xs text-muted-foreground truncate">{sample.quality}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1.5">{formatCardDate(sample.createdAt) || '\u00A0'}</p>
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

      {/* Sample Preview Dialog */}
      <Dialog open={!!previewSample} onOpenChange={(open) => !open && setPreviewSample(null)}>
        <DialogContent className="sm:max-w-[480px]">
          {previewSample && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">{previewSample.trackingNumber}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{previewSample.client || 'No client'}</span>
                  {previewSample.quality && (
                    <Badge variant="secondary" className="text-xs">{previewSample.quality}</Badge>
                  )}
                </div>

                {previewSample.origin && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{previewSample.origin}{previewSample.microOrigin ? ` / ${previewSample.microOrigin}` : ''}</span>
                  </div>
                )}

                <div className="border-t pt-3 space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Supply Chain</h4>
                  <div className="grid grid-cols-[100px_1fr] gap-y-1.5 gap-x-3 text-sm">
                    {previewSample.sellerName && (
                      <>
                        <span className="text-muted-foreground">Seller</span>
                        <span>{previewSample.sellerName}</span>
                      </>
                    )}
                    {previewSample.importerName && (
                      <>
                        <span className="text-muted-foreground">Importer</span>
                        <span>{previewSample.importerName}</span>
                      </>
                    )}
                    {previewSample.roasterName && (
                      <>
                        <span className="text-muted-foreground">Roaster</span>
                        <span>{previewSample.roasterName}</span>
                      </>
                    )}
                    {previewSample.endClientName && (
                      <>
                        <span className="text-muted-foreground">End Client</span>
                        <span>{previewSample.endClientName}</span>
                      </>
                    )}
                    {!previewSample.sellerName && !previewSample.importerName && !previewSample.roasterName && !previewSample.endClientName && (
                      <span className="col-span-2 text-muted-foreground text-xs">No supply chain data</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      router.push(`/samples/${previewSample.sampleId}`)
                      setPreviewSample(null)
                    }}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Full Details
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Lab Insights - HIDDEN on mobile */}
      <div className="hidden sm:grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <span className="text-sm font-medium">Samples per Week</span>
                  <span className="text-lg font-bold">{samplesPerWeekData.currentWeek}</span>
                </div>
                <div className="space-y-1">
                  <div className="bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-green-500 h-full rounded-full transition-all duration-500"
                      style={{width: `${samplesPerWeekData.percentage}%`}}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{samplesPerWeekData.currentWeekLabel}</span>
                    <span>Max: {samplesPerWeekData.allTimeHigh}</span>
                  </div>
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

      {/* Activity Heatmap - HIDDEN on mobile */}
      <div className="hidden sm:block">
        <ActivityHeatmap showLabFilter={profile?.is_global_admin || profile?.qc_role === 'global_admin'} />
      </div>

    </div>
  )
}

function QCAccessMessage() {
  const { user, profile } = useAuth()
  const [accessRequest, setAccessRequest] = useState<Database['public']['Tables']['access_requests']['Row'] | null>(null)
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
    if (!user?.id) return

    try {
      const { data } = await supabase
        .from('access_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        setAccessRequest(data as Database['public']['Tables']['access_requests']['Row'])
      }
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
                {accessRequest && accessRequest.status && accessRequest.created_at && (
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

  // Log UI state transitions
  useEffect(() => {
    if (loading) {
      console.log('[UI] Home: loading state')
    } else if (!user) {
      console.log('[UI] Home: showing login')
    } else if (profile && !profile.qc_enabled) {
      console.log('[UI] Home: showing QC access message')
    } else {
      console.log('[UI] Home: showing dashboard')
    }
  }, [loading, user, profile])

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
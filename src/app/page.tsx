'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { LoginForm } from '@/components/auth/login-form'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, FlaskConical, FileText, Users, DollarSign, TrendingUp } from 'lucide-react'

function DashboardContent() {
  const { profile } = useAuth()

  // Mock dashboard data - replace with real data
  const stats = [
    { title: 'Active Samples', value: '24', change: '+12%', icon: Package, color: 'text-blue-500' },
    { title: 'Pending Assessments', value: '8', change: '-3%', icon: FlaskConical, color: 'text-orange-500' },
    { title: 'Certificates Generated', value: '156', change: '+8%', icon: FileText, color: 'text-green-500' },
    { title: 'Total Users', value: '12', change: '+2', icon: Users, color: 'text-purple-500' },
  ]

  const recentSamples = [
    { id: 'QC-2025-001', origin: 'Colombian Huila', client: 'Roaster ABC', status: 'In Progress' },
    { id: 'QC-2025-002', origin: 'Brazilian Cerrado', client: 'Coffee Co.', status: 'Approved' },
    { id: 'QC-2025-003', origin: 'Ethiopian Yirgacheffe', client: 'Specialty Ltd', status: 'Under Review' },
  ]

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved': return 'bg-green-500/10 text-green-700 dark:text-green-400'
      case 'in progress': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
      case 'under review': return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
      default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-400'
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {profile?.full_name || 'User'}
        </h1>
        <p className="text-muted-foreground">
          Here's what's happening in your laboratory today.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="text-3xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className={stat.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}>
                        {stat.change}
                      </span>
                      {' '}from last month
                    </p>
                  </div>
                  <Icon className={`h-8 w-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Recent samples */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Recent Samples
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentSamples.map((sample) => (
              <div key={sample.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="space-y-1">
                  <p className="font-medium">{sample.id}</p>
                  <p className="text-sm text-muted-foreground">{sample.origin}</p>
                  <p className="text-xs text-muted-foreground">{sample.client}</p>
                </div>
                <Badge className={getStatusColor(sample.status)}>
                  {sample.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-6 text-center space-y-2">
            <Package className="h-8 w-8 mx-auto text-blue-500" />
            <h3 className="font-semibold">New Sample</h3>
            <p className="text-sm text-muted-foreground">Register a new coffee sample</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-6 text-center space-y-2">
            <FlaskConical className="h-8 w-8 mx-auto text-green-500" />
            <h3 className="font-semibold">Start Assessment</h3>
            <p className="text-sm text-muted-foreground">Begin quality assessment</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-6 text-center space-y-2">
            <FileText className="h-8 w-8 mx-auto text-purple-500" />
            <h3 className="font-semibold">Generate Certificate</h3>
            <p className="text-sm text-muted-foreground">Create quality certificate</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function Home() {
  const { user, loading } = useAuth()

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

  return (
    <MainLayout>
      <DashboardContent />
    </MainLayout>
  )
}
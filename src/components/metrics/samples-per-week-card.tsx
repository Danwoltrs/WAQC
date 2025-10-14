'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'

interface WeeklyData {
  currentWeek: number
  allTimeHigh: number
  currentWeekLabel: string
  allTimeHighWeekLabel: string
}

export function SamplesPerWeekCard() {
  const [data, setData] = useState<WeeklyData | null>(null)
  const [loading, setLoading] = useState(true)
  const { user, profile } = useAuth()

  useEffect(() => {
    if (user && profile) {
      fetchWeeklyData()
    }
  }, [user, profile])

  const fetchWeeklyData = async () => {
    if (!user || !profile) return

    try {
      setLoading(true)

      // Build query with lab filter if needed
      let query = supabase
        .from('samples')
        .select('created_at')

      // Apply lab filter based on user role
      if (profile.qc_role === 'lab_personnel' ||
          profile.qc_role === 'lab_quality_manager' ||
          profile.qc_role === 'lab_finance_manager') {
        if (profile.laboratory_id) {
          query = query.eq('laboratory_id', profile.laboratory_id)
        }
      }

      const { data: samples, error } = await query

      if (error) throw error

      if (!samples || samples.length === 0) {
        setData({
          currentWeek: 0,
          allTimeHigh: 0,
          currentWeekLabel: 'This Week',
          allTimeHighWeekLabel: 'All-Time High'
        })
        return
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
        // Get Monday of the week for this sample
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
      let allTimeHighWeekKey = ''

      weekMap.forEach((count, weekKey) => {
        if (count > allTimeHigh) {
          allTimeHigh = count
          allTimeHighWeekKey = weekKey
        }
      })

      // Format week labels
      const currentWeekLabel = `Week of ${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      const allTimeHighDate = new Date(allTimeHighWeekKey)
      const allTimeHighWeekLabel = allTimeHighWeekKey
        ? `Week of ${allTimeHighDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : 'N/A'

      setData({
        currentWeek: currentWeekSamples,
        allTimeHigh,
        currentWeekLabel,
        allTimeHighWeekLabel
      })

    } catch (err) {
      console.error('Error fetching weekly data:', err)
    } finally {
      setLoading(false)
    }
  }

  const percentage = data && data.allTimeHigh > 0
    ? Math.min((data.currentWeek / data.allTimeHigh) * 100, 100)
    : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Samples per Week
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : data ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <p className="text-2xl font-bold">{data.currentWeek}</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{data.currentWeekLabel}</span>
                <span>Max: {data.allTimeHigh}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-500 ease-out"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {data.allTimeHighWeekLabel}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No data available</p>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/providers/auth-provider'

interface DayActivity {
  date: string
  samples: number
  cups: number
}

interface ActivityHeatmapProps {
  showLabFilter?: boolean
}

export function ActivityHeatmap({ showLabFilter = false }: ActivityHeatmapProps) {
  const { profile } = useAuth()
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedLab, setSelectedLab] = useState<string>(profile?.laboratory_id || 'all')
  const [activityData, setActivityData] = useState<DayActivity[]>([])
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [laboratories, setLaboratories] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)

  // Load laboratories for filter (if global admin)
  useEffect(() => {
    if (showLabFilter) {
      loadLaboratories()
    }
  }, [showLabFilter])

  // Load activity data when filters change
  useEffect(() => {
    loadActivityData()
  }, [selectedYear, selectedLab, profile?.laboratory_id])

  const loadLaboratories = async () => {
    try {
      const { data, error } = await supabase
        .from('laboratories')
        .select('id, name')
        .order('name')

      if (error) throw error
      setLaboratories(data || [])
    } catch (error) {
      console.error('Error loading laboratories:', error)
    }
  }

  const loadActivityData = async () => {
    try {
      setLoading(true)

      // Determine which lab to query
      const labId = selectedLab === 'all' ? profile?.laboratory_id : selectedLab

      // Get year range
      const yearStart = new Date(selectedYear, 0, 1)
      const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59)

      // Fetch samples data
      let samplesQuery = supabase
        .from('samples')
        .select('created_at, laboratory_id')
        .gte('created_at', yearStart.toISOString())
        .lte('created_at', yearEnd.toISOString())

      if (labId && labId !== 'all') {
        samplesQuery = samplesQuery.eq('laboratory_id', labId)
      }

      const { data: samplesData, error: samplesError } = await samplesQuery

      if (samplesError) throw samplesError

      // Fetch cupping scores data (count of cups cupped)
      let scoresQuery = supabase
        .from('cupping_scores')
        .select('created_at, cupping_sessions!inner(laboratory_id)')
        .gte('created_at', yearStart.toISOString())
        .lte('created_at', yearEnd.toISOString())

      if (labId && labId !== 'all') {
        scoresQuery = scoresQuery.eq('cupping_sessions.laboratory_id', labId)
      }

      const { data: scoresData, error: scoresError } = await scoresQuery

      if (scoresError) throw scoresError

      // Process data into daily counts
      const dailyMap = new Map<string, { samples: number; cups: number }>()

      // Count samples per day
      samplesData?.forEach(sample => {
        if (sample.created_at) {
          const date = new Date(sample.created_at).toISOString().split('T')[0]
          const existing = dailyMap.get(date) || { samples: 0, cups: 0 }
          dailyMap.set(date, { ...existing, samples: existing.samples + 1 })
        }
      })

      // Count cups per day
      scoresData?.forEach(score => {
        if (score.created_at) {
          const date = new Date(score.created_at).toISOString().split('T')[0]
          const existing = dailyMap.get(date) || { samples: 0, cups: 0 }
          dailyMap.set(date, { ...existing, cups: existing.cups + 1 })
        }
      })

      // Convert to array
      const activities: DayActivity[] = []
      dailyMap.forEach((value, date) => {
        activities.push({ date, samples: value.samples, cups: value.cups })
      })

      setActivityData(activities)

      // Get available years from data
      await loadAvailableYears()
    } catch (error) {
      console.error('Error loading activity data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableYears = async () => {
    try {
      // Get earliest sample date
      const { data, error } = await supabase
        .from('samples')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1)

      if (error) throw error

      if (data && data.length > 0 && data[0].created_at) {
        const earliestYear = new Date(data[0].created_at).getFullYear()
        const currentYear = new Date().getFullYear()
        const years: number[] = []
        for (let year = earliestYear; year <= currentYear; year++) {
          years.push(year)
        }
        setAvailableYears(years)
      } else {
        setAvailableYears([new Date().getFullYear()])
      }
    } catch (error) {
      console.error('Error loading available years:', error)
      setAvailableYears([new Date().getFullYear()])
    }
  }

  // Generate heatmap grid with week metadata
  const generateHeatmapData = () => {
    const weeks: Array<{
      days: Array<{ date: Date; activity: DayActivity | null }>
      weekNumber: number
      monthLabel?: string
    }> = []
    const startDate = new Date(selectedYear, 0, 1)

    // Find the Monday of the first week
    const firstDay = startDate.getDay()
    const daysToMonday = firstDay === 0 ? 6 : firstDay - 1
    const firstMonday = new Date(startDate)
    firstMonday.setDate(startDate.getDate() - daysToMonday)

    let currentMonth = -1

    // Generate 53 weeks (to cover the full year)
    for (let week = 0; week < 53; week++) {
      const weekDays: Array<{ date: Date; activity: DayActivity | null }> = []
      const weekStart = new Date(firstMonday)
      weekStart.setDate(firstMonday.getDate() + (week * 7))

      // Monday to Friday only (5 days, not 7)
      for (let day = 0; day < 5; day++) {
        const currentDate = new Date(firstMonday)
        currentDate.setDate(firstMonday.getDate() + (week * 7) + day)

        // Only include if within selected year
        if (currentDate.getFullYear() === selectedYear) {
          const dateStr = currentDate.toISOString().split('T')[0]
          const activity = activityData.find(a => a.date === dateStr) || null
          weekDays.push({ date: currentDate, activity })
        }
      }

      if (weekDays.length > 0) {
        // Get week number
        const weekNumber = getWeekNumber(weekStart)

        // Check if this is the first week of a new month
        const monthOfWeek = weekStart.getMonth()
        let monthLabel: string | undefined
        if (monthOfWeek !== currentMonth) {
          monthLabel = weekStart.toLocaleDateString('en-US', { month: 'short' })
          currentMonth = monthOfWeek
        }

        weeks.push({ days: weekDays, weekNumber, monthLabel })
      }
    }

    return weeks
  }

  // Calculate ISO week number
  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

  const getActivityColor = (activity: DayActivity | null) => {
    if (!activity || (activity.samples === 0 && activity.cups === 0)) {
      return 'bg-muted/20'
    }

    const total = activity.samples + activity.cups

    // Define intensity levels based on activity - green tones
    if (total >= 20) return 'bg-emerald-600 dark:bg-emerald-500' // High activity
    if (total >= 10) return 'bg-emerald-500 dark:bg-emerald-400' // Medium-high
    if (total >= 5) return 'bg-emerald-400 dark:bg-emerald-300' // Medium
    return 'bg-emerald-300 dark:bg-emerald-200' // Low activity
  }

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const heatmapData = generateHeatmapData()

  // Calculate max activity for tooltip context
  const maxActivity = Math.max(...activityData.map(a => a.samples + a.cups), 1)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            {activityData.reduce((sum, a) => sum + a.samples + a.cups, 0).toLocaleString()} contributions in {selectedYear}
          </CardTitle>
          <div className="flex gap-2">
            {showLabFilter && laboratories.length > 0 && (
              <Select value={selectedLab} onValueChange={setSelectedLab}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select lab" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Labs</SelectItem>
                  {laboratories.map(lab => (
                    <SelectItem key={lab.id} value={lab.id}>
                      {lab.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Heatmap */}
            <div className="overflow-x-auto">
              <div className="inline-flex gap-2">
                {/* Weekday labels column */}
                <div className="flex flex-col">
                  {/* Empty space for month row */}
                  <div className="h-[18px]" />
                  {/* Weekday labels */}
                  <div className="flex flex-col gap-[2px]">
                    {weekdays.map(day => (
                      <div key={day} className="h-[12px] flex items-center justify-end w-[30px]">
                        <span className="text-[10px] text-muted-foreground font-medium">{day}</span>
                      </div>
                    ))}
                  </div>
                  {/* Empty space for week number row */}
                  <div className="h-[14px]" />
                </div>

                {/* Grid with months and week numbers */}
                <div className="flex flex-col">
                  {/* Month labels row */}
                  <div className="flex gap-[2px] h-[18px] mb-1">
                    {heatmapData.map((week, weekIndex) => (
                      <div key={weekIndex} className="w-[12px] flex items-center justify-center">
                        {week.monthLabel && (
                          <span className="text-[11px] font-semibold text-foreground whitespace-nowrap">
                            {week.monthLabel}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Grid */}
                  <div className="flex gap-[2px]">
                    {heatmapData.map((week, weekIndex) => (
                      <div key={weekIndex} className="flex flex-col gap-[2px]">
                        {week.days.map((day, dayIndex) => {
                          const dateStr = day.date.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                          const tooltip = day.activity
                            ? `${dateStr}: ${day.activity.samples} samples, ${day.activity.cups} cups`
                            : `${dateStr}: No activity`

                          return (
                            <div
                              key={dayIndex}
                              className={`w-[12px] h-[12px] rounded-sm ${getActivityColor(day.activity)} transition-all hover:ring-2 hover:ring-primary cursor-pointer`}
                              title={tooltip}
                            />
                          )
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Week numbers row */}
                  <div className="flex gap-[2px] h-[14px] mt-1">
                    {heatmapData.map((week, weekIndex) => (
                      <div key={weekIndex} className="w-[12px] flex items-center justify-center">
                        <span className="text-[8px] text-muted-foreground/60">
                          {week.weekNumber}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Legend and year selector */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Less</span>
                <div className="flex gap-1">
                  <div className="w-3 h-3 rounded-sm bg-muted/20" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-300 dark:bg-emerald-200" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-400 dark:bg-emerald-300" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-400" />
                  <div className="w-3 h-3 rounded-sm bg-emerald-600 dark:bg-emerald-500" />
                </div>
                <span className="text-xs text-muted-foreground">More</span>
              </div>

              {/* Year filters */}
              {availableYears.length > 0 && (
                <div className="flex gap-2">
                  {availableYears.map(year => (
                    <Button
                      key={year}
                      variant={selectedYear === year ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedYear(year)}
                      className="h-8 px-3 text-xs"
                    >
                      {year}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

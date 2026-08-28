'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
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
  const [labDropdownOpen, setLabDropdownOpen] = useState(false)
  const [activityData, setActivityData] = useState<DayActivity[]>([])
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [laboratories, setLaboratories] = useState<Array<{ id: string; name: string; code: string; city: string | null }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (showLabFilter) {
      loadLaboratories()
    }
  }, [showLabFilter])

  useEffect(() => {
    loadActivityData()
  }, [selectedYear, selectedLab, profile?.laboratory_id])

  const loadLaboratories = async () => {
    try {
      const { data, error } = await supabase
        .from('laboratories')
        .select('id, name, code, city')
        .order('name')

      if (error) throw error
      setLaboratories((data || []).map(l => ({
        id: l.id,
        name: l.name,
        code: l.code,
        city: l.city,
      })))
    } catch (error) {
      console.error('Error loading laboratories:', error)
    }
  }

  const loadActivityData = async () => {
    try {
      setLoading(true)

      const labId = selectedLab === 'all' ? null : selectedLab
      const now = new Date()
      const currentYear = now.getFullYear()

      let yearEnd: Date
      if (selectedYear === currentYear) {
        yearEnd = now
      } else {
        yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59)
      }

      const yearStart = new Date(yearEnd)
      yearStart.setDate(yearEnd.getDate() - (52 * 7))

      // Lab units only: a lot covering N contracts is one physical sample
      // received and cupped, not N. Its siblings would inflate the day.
      let samplesQuery = supabase
        .from('samples')
        .select('created_at, laboratory_id')
        .is('lab_source_sample_id', null)
        .gte('created_at', yearStart.toISOString())
        .lte('created_at', yearEnd.toISOString())

      if (labId) {
        samplesQuery = samplesQuery.eq('laboratory_id', labId)
      }

      const { data: samplesData, error: samplesError } = await samplesQuery
      if (samplesError) throw samplesError

      let scoresQuery = supabase
        .from('cupping_scores')
        .select('created_at, cupping_sessions!inner(laboratory_id)')
        .gte('created_at', yearStart.toISOString())
        .lte('created_at', yearEnd.toISOString())

      if (labId) {
        scoresQuery = scoresQuery.eq('cupping_sessions.laboratory_id', labId)
      }

      const { data: scoresData, error: scoresError } = await scoresQuery
      if (scoresError) throw scoresError

      const dailyMap = new Map<string, { samples: number; cups: number }>()

      samplesData?.forEach(sample => {
        if (sample.created_at) {
          const date = new Date(sample.created_at).toISOString().split('T')[0]
          const existing = dailyMap.get(date) || { samples: 0, cups: 0 }
          dailyMap.set(date, { ...existing, samples: existing.samples + 1 })
        }
      })

      scoresData?.forEach(score => {
        if (score.created_at) {
          const date = new Date(score.created_at).toISOString().split('T')[0]
          const existing = dailyMap.get(date) || { samples: 0, cups: 0 }
          dailyMap.set(date, { ...existing, cups: existing.cups + 1 })
        }
      })

      const activities: DayActivity[] = []
      dailyMap.forEach((value, date) => {
        activities.push({ date, samples: value.samples, cups: value.cups })
      })

      setActivityData(activities)
      await loadAvailableYears()
    } catch (error) {
      console.error('Error loading activity data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableYears = async () => {
    try {
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

  // Build a fast lookup map for activity data
  const activityMap = useMemo(() => {
    const map = new Map<string, DayActivity>()
    activityData.forEach(a => map.set(a.date, a))
    return map
  }, [activityData])

  // Generate GitHub-style heatmap: 53 columns x 7 rows (Sun-Sat)
  const heatmapData = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()

    let endDate: Date
    if (selectedYear === currentYear) {
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else {
      endDate = new Date(selectedYear, 11, 31)
    }

    // Find the Saturday ending the current week (end of the row)
    const endDow = endDate.getDay() // 0=Sun, 6=Sat
    const lastSaturday = new Date(endDate)
    lastSaturday.setDate(endDate.getDate() + (6 - endDow))

    // Go back 52 full weeks to start on a Sunday
    const firstSunday = new Date(lastSaturday)
    firstSunday.setDate(lastSaturday.getDate() - (52 * 7))

    const weeks: Array<{
      days: Array<{ date: Date; dateStr: string; activity: DayActivity | null; isFuture: boolean }>
      monthLabel?: string
    }> = []

    let prevMonth = -1
    const current = new Date(firstSunday)
    const todayStr = now.toISOString().split('T')[0]

    for (let w = 0; w < 53; w++) {
      const weekDays: typeof weeks[0]['days'] = []

      for (let d = 0; d < 7; d++) {
        const dateObj = new Date(current)
        const dateStr = dateObj.toISOString().split('T')[0]
        const isFuture = dateStr > todayStr

        weekDays.push({
          date: dateObj,
          dateStr,
          activity: activityMap.get(dateStr) || null,
          isFuture,
        })
        current.setDate(current.getDate() + 1)
      }

      // Check if this week starts a new month
      const weekMonth = weekDays[0].date.getMonth()
      let monthLabel: string | undefined
      if (weekMonth !== prevMonth) {
        monthLabel = weekDays[0].date.toLocaleDateString('en-US', { month: 'short' })
        prevMonth = weekMonth
      }

      weeks.push({ days: weekDays, monthLabel })
    }

    return weeks
  }, [selectedYear, activityMap])

  // Calculate max activity for color scaling
  const maxActivity = useMemo(() => {
    return Math.max(...activityData.map(a => a.samples + a.cups), 1)
  }, [activityData])

  const getActivityColor = (activity: DayActivity | null, isFuture: boolean) => {
    if (isFuture) return 'bg-transparent'

    if (!activity || (activity.samples === 0 && activity.cups === 0)) {
      return 'bg-[#ebedf0] dark:bg-[#161b22]'
    }

    const total = activity.samples + activity.cups
    const ratio = total / maxActivity

    if (ratio > 0.75) return 'bg-[#216e39] dark:bg-[#39d353]'
    if (ratio > 0.5) return 'bg-[#30a14e] dark:bg-[#26a641]'
    if (ratio > 0.25) return 'bg-[#40c463] dark:bg-[#006d32]'
    return 'bg-[#9be9a8] dark:bg-[#0e4429]'
  }

  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', '']

  const totalSamples = activityData.reduce((sum, a) => sum + a.samples, 0)
  const totalCups = activityData.reduce((sum, a) => sum + a.cups, 0)

  const getLabDisplayName = (lab: { id: string; name: string; code: string; city: string | null }) => {
    return lab.city || lab.code || lab.name
  }

  const selectedLabName = selectedLab === 'all'
    ? 'All Labs'
    : getLabDisplayName(laboratories.find(l => l.id === selectedLab) || { id: '', name: 'Lab', code: '', city: null })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {totalSamples.toLocaleString()} samples processed, and a total of {totalCups.toLocaleString()} cups in {selectedYear}
          </CardTitle>
          {showLabFilter && laboratories.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setLabDropdownOpen(!labDropdownOpen)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>{selectedLabName}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {labDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLabDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-md py-1 min-w-[140px]">
                    <button
                      onClick={() => { setSelectedLab('all'); setLabDropdownOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${selectedLab === 'all' ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                    >
                      All Labs
                    </button>
                    {laboratories.map(lab => (
                      <button
                        key={lab.id}
                        onClick={() => { setSelectedLab(lab.id); setLabDropdownOpen(false) }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${selectedLab === lab.id ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                      >
                        {getLabDisplayName(lab)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Heatmap grid */}
            <div className="overflow-x-auto">
              <div className="inline-flex gap-[3px]">
                {/* Day labels column */}
                <div className="flex flex-col gap-[3px] pr-2 pt-[18px]">
                  {dayLabels.map((label, i) => (
                    <div key={i} className="h-[13px] flex items-center justify-end">
                      {label && (
                        <span className="text-[10px] text-muted-foreground leading-none">{label}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Weeks grid */}
                <div className="flex flex-col">
                  {/* Month labels */}
                  <div className="flex gap-[3px] h-[14px] mb-1">
                    {heatmapData.map((week, wi) => (
                      <div key={wi} className="w-[13px] flex-shrink-0">
                        {week.monthLabel && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{week.monthLabel}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Grid of squares */}
                  <div className="flex gap-[3px]">
                    {heatmapData.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-[3px]">
                        {week.days.map((day, di) => {
                          if (day.isFuture) {
                            return <div key={di} className="w-[13px] h-[13px]" />
                          }
                          const tooltip = day.activity
                            ? `${day.activity.samples + day.activity.cups} activities on ${day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${day.activity.samples} samples, ${day.activity.cups} cups)`
                            : `No activity on ${day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

                          return (
                            <div
                              key={di}
                              className={`w-[13px] h-[13px] rounded-[2px] ${getActivityColor(day.activity, day.isFuture)} transition-colors hover:ring-1 hover:ring-foreground/30 cursor-default`}
                              title={tooltip}
                            />
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Legend and year selector */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Less</span>
                <div className="flex gap-[2px]">
                  <div className="w-[13px] h-[13px] rounded-[2px] bg-[#ebedf0] dark:bg-[#161b22]" />
                  <div className="w-[13px] h-[13px] rounded-[2px] bg-[#9be9a8] dark:bg-[#0e4429]" />
                  <div className="w-[13px] h-[13px] rounded-[2px] bg-[#40c463] dark:bg-[#006d32]" />
                  <div className="w-[13px] h-[13px] rounded-[2px] bg-[#30a14e] dark:bg-[#26a641]" />
                  <div className="w-[13px] h-[13px] rounded-[2px] bg-[#216e39] dark:bg-[#39d353]" />
                </div>
                <span className="text-[10px] text-muted-foreground">More</span>
              </div>

              {availableYears.length > 0 && (
                <div className="flex gap-1">
                  {availableYears.map(year => (
                    <Button
                      key={year}
                      variant={selectedYear === year ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedYear(year)}
                      className="h-6 px-2 text-[10px]"
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

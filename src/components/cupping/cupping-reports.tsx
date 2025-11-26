'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Download, Filter, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

// Dynamic import of Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

interface SessionStats {
  session_id: string
  session_date: string
  laboratory_id: string
  lab_name: string
  status: string
  session_type: string
  discrepancy_detected: boolean
  auto_averaged: boolean
  sample_count: number
  cupper_count: number
  avg_session_score: number
  session_score_stddev: number
  finalized_at: string
  created_at: string
}

interface CupperStats {
  cupper_id: string
  cupper_name: string
  session_id: string
  laboratory_id: string
  session_date: string
  samples_scored: number
  avg_total_score: number
  score_stddev: number
  samples_with_defects: number
  session_status: string
}

interface OriginStats {
  origin: string
  laboratory_id: string
  lab_name: string
  sample_count: number
  avg_score: number
  score_stddev: number
  min_score: number
  max_score: number
  samples_with_defects: number
  high_quality_samples: number
}

interface FilterOptions {
  cuppers: { id: string; full_name: string }[]
  origins: string[]
  sessionTypes: string[]
}

interface AnalyticsData {
  sessionStats: SessionStats[]
  cupperStats: CupperStats[]
  originStats: OriginStats[]
  filterOptions: FilterOptions
}

interface CuppingReportsProps {
  laboratoryId?: string
}

export function CuppingReports({ laboratoryId }: CuppingReportsProps) {
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date()
  })
  const [selectedCupper, setSelectedCupper] = useState<string>('all')
  const [selectedSessionType, setSelectedSessionType] = useState<string>('all')
  const [selectedOrigin, setSelectedOrigin] = useState<string>('all')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch analytics data
  useEffect(() => {
    fetchAnalytics()
  }, [dateRange, selectedCupper, selectedSessionType, selectedOrigin, laboratoryId])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()

      if (dateRange.from) {
        params.append('dateFrom', format(dateRange.from, 'yyyy-MM-dd'))
      }
      if (dateRange.to) {
        params.append('dateTo', format(dateRange.to, 'yyyy-MM-dd'))
      }
      if (selectedCupper !== 'all') {
        params.append('cupperId', selectedCupper)
      }
      if (selectedSessionType !== 'all') {
        params.append('sessionType', selectedSessionType)
      }
      if (selectedOrigin !== 'all') {
        params.append('origin', selectedOrigin)
      }
      if (laboratoryId) {
        params.append('laboratoryId', laboratoryId)
      }

      const response = await fetch(`/api/cupping/analytics?${params}`)
      if (!response.ok) throw new Error('Failed to fetch analytics')

      const analyticsData = await response.json()
      setData(analyticsData)
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Date Range Filter */}
            <div className="space-y-2">
              <Label className="text-xs">Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from && dateRange.to ? (
                      <>
                        {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d, yyyy')}
                      </>
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Cupper Filter */}
            <div className="space-y-2">
              <Label className="text-xs">Cupper</Label>
              <Select value={selectedCupper} onValueChange={setSelectedCupper}>
                <SelectTrigger>
                  <SelectValue placeholder="All Cuppers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cuppers</SelectItem>
                  {data?.filterOptions.cuppers.map((cupper) => (
                    <SelectItem key={cupper.id} value={cupper.id}>
                      {cupper.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Session Type Filter */}
            <div className="space-y-2">
              <Label className="text-xs">Session Type</Label>
              <Select value={selectedSessionType} onValueChange={setSelectedSessionType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="calibration">Calibration</SelectItem>
                  <SelectItem value="digital">Digital</SelectItem>
                  <SelectItem value="handwritten">Handwritten</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Origin Filter */}
            <div className="space-y-2">
              <Label className="text-xs">Origin</Label>
              <Select value={selectedOrigin} onValueChange={setSelectedOrigin}>
                <SelectTrigger>
                  <SelectValue placeholder="All Origins" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Origins</SelectItem>
                  {data?.filterOptions.origins.map((origin) => (
                    <SelectItem key={origin} value={origin}>
                      {origin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Export Button */}
            <div className="space-y-2">
              <Label className="text-xs">&nbsp;</Label>
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {data && data.sessionStats.length > 0 ? (
            // @ts-ignore - Plotly.js types are incomplete
            <Plot
              data={[
                {
                  x: data.sessionStats.map(s => s.avg_session_score),
                  type: 'histogram',
                  marker: {
                    color: '#ADADFB',
                  },
                  nbinsx: 20,
                }
              ]}
              layout={{
                autosize: true,
                height: 400,
                xaxis: {
                  title: 'Average Session Score',
                  gridcolor: 'rgba(128, 128, 128, 0.2)',
                },
                yaxis: {
                  title: 'Number of Sessions',
                  gridcolor: 'rgba(128, 128, 128, 0.2)',
                },
                plot_bgcolor: 'transparent',
                paper_bgcolor: 'transparent',
                font: {
                  color: 'hsl(var(--foreground))',
                  size: 12,
                },
                margin: { t: 20, r: 20, b: 50, l: 50 },
              }}
              config={{ displayModeBar: false, responsive: true }}
              className="w-full"
            />
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              No session data available for the selected filters
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cupper Performance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cupper Performance Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          {data && data.cupperStats.length > 0 ? (
            // @ts-ignore - Plotly.js types are incomplete
            <Plot
              data={(() => {
                // Group scores by cupper
                const cupperScores: { [key: string]: number[] } = {}
                data.cupperStats.forEach(stat => {
                  if (!cupperScores[stat.cupper_name]) {
                    cupperScores[stat.cupper_name] = []
                  }
                  cupperScores[stat.cupper_name].push(stat.avg_total_score)
                })

                // Create box plot traces for each cupper
                return Object.entries(cupperScores).map(([name, scores], index) => ({
                  y: scores,
                  type: 'box' as const,
                  name: name,
                  marker: {
                    color: ['#ADADFB', '#A0BCE8', '#6BE6D3', '#7DBBFF', '#B899EB', '#71DD8C'][index % 6],
                  },
                  boxmean: 'sd' as const,
                }))
              })()}
              layout={{
                autosize: true,
                height: 400,
                showlegend: false,
                yaxis: {
                  title: 'Average Score',
                  gridcolor: 'rgba(128, 128, 128, 0.2)',
                },
                xaxis: {
                  title: 'Cupper',
                },
                plot_bgcolor: 'transparent',
                paper_bgcolor: 'transparent',
                font: {
                  color: 'hsl(var(--foreground))',
                  size: 12,
                },
                margin: { t: 20, r: 20, b: 80, l: 50 },
              }}
              config={{ displayModeBar: false, responsive: true }}
              className="w-full"
            />
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              No cupper data available for the selected filters
            </div>
          )}
        </CardContent>
      </Card>

      {/* Origin Analysis Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Origin Performance Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          {data && data.originStats.length > 0 ? (
            // @ts-ignore - Plotly.js types are incomplete
            <Plot
              data={[
                {
                  x: data.originStats.map(s => s.origin),
                  y: data.originStats.map(s => s.avg_score),
                  type: 'bar',
                  marker: {
                    color: '#6BE6D3',
                  },
                  name: 'Average Score',
                },
                {
                  x: data.originStats.map(s => s.origin),
                  y: data.originStats.map(s => s.sample_count),
                  type: 'scatter',
                  mode: 'markers',
                  marker: {
                    color: '#B899EB',
                    size: 10,
                    symbol: 'diamond',
                  },
                  name: 'Sample Count',
                  yaxis: 'y2',
                }
              ]}
              layout={{
                autosize: true,
                height: 400,
                yaxis: {
                  title: 'Average Score',
                  gridcolor: 'rgba(128, 128, 128, 0.2)',
                },
                yaxis2: {
                  title: 'Sample Count',
                  overlaying: 'y',
                  side: 'right',
                },
                xaxis: {
                  title: 'Origin',
                  tickangle: -45,
                },
                plot_bgcolor: 'transparent',
                paper_bgcolor: 'transparent',
                font: {
                  color: 'hsl(var(--foreground))',
                  size: 12,
                },
                margin: { t: 20, r: 60, b: 100, l: 50 },
                legend: {
                  orientation: 'h',
                  y: 1.1,
                },
              }}
              config={{ displayModeBar: false, responsive: true }}
              className="w-full"
            />
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              No origin data available for the selected filters
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

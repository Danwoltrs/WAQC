'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, Download, Filter } from 'lucide-react'
import { format } from 'date-fns'

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
                  {/* TODO: Load cuppers from database */}
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
                  {/* TODO: Load origins from database */}
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
          <CardTitle className="text-base">Session Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            Charts will be implemented with Plotly.js
          </div>
        </CardContent>
      </Card>

      {/* Cupper Performance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cupper Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            Cupper statistics and charts coming soon
          </div>
        </CardContent>
      </Card>

      {/* Origin Analysis Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Origin Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            Origin performance analytics coming soon
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

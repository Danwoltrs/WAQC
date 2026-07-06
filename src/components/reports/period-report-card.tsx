'use client'

/**
 * One period-report generator card (SS / PSS / SS+PSS). Owns its own
 * start/end date pair and shows the four shared presets: Last week,
 * This week (Mon–Fri), 1st half (1–15), 2nd half (16–end).
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { FileText, Calendar, Eye } from 'lucide-react'
import {
  firstHalf,
  secondHalf,
  getCurrentWorkWeek,
  getPreviousWorkWeek,
} from '@/lib/reports/periods'

interface PeriodReportCardProps {
  title: string
  description: string
  defaultStart: string
  defaultEnd: string
  /** True while no client is selected — disables the preview button. */
  disabled: boolean
  onPreview: (start: string, end: string) => void
}

export function PeriodReportCard({
  title,
  description,
  defaultStart,
  defaultEnd,
  disabled,
  onPreview,
}: PeriodReportCardProps) {
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)

  const applyRange = (r: { start: string; end: string }) => {
    setStart(r.start)
    setEnd(r.end)
  }
  // Half-month presets operate on the month of the card's current start date.
  const applyHalf = (half: typeof firstHalf) => {
    const d = new Date(start)
    applyRange(half(d.getFullYear(), d.getMonth()))
  }

  return (
    <Card className="rounded-[20px]">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[12px] bg-[#556b2f]/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-[#556b2f]" />
          </div>
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs mb-2 block">Start date</Label>
            <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs mb-2 block">End date</Label>
            <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => applyRange(getPreviousWorkWeek())}>
            <Calendar className="w-3 h-3 mr-1" />
            Last week (Mon–Fri)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => applyRange(getCurrentWorkWeek())}>
            <Calendar className="w-3 h-3 mr-1" />
            This week (Mon–Fri)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => applyHalf(firstHalf)}>
            <Calendar className="w-3 h-3 mr-1" />
            1st half (1–15)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => applyHalf(secondHalf)}>
            <Calendar className="w-3 h-3 mr-1" />
            2nd half (16–end)
          </Button>
        </div>

        <div className="flex justify-end pt-2 border-t border-border/50">
          <Button
            onClick={() => onPreview(start, end)}
            disabled={disabled || !start || !end}
            className="bg-[#556b2f] hover:bg-[#556b2f]/90"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview report
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

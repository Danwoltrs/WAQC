'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { prefillComments } from '@/lib/tolerance/comments'
import type { ToleranceAssessment, ToleranceQuadrant } from '@/lib/tolerance/types'
import type { IssuedValues } from '@/lib/tolerance/issued-values'

interface Props {
  open: boolean
  assessment: ToleranceAssessment
  issued: IssuedValues | null
  saving?: boolean
  onConfirm: (comments: string[], requestAdditionalSample: boolean) => void
  onCancel: () => void
}

const QUADRANT_TITLE: Record<ToleranceQuadrant, string> = {
  distribution: 'Screen distribution',
  defects: 'Defects',
}

// The order the tables are grouped in. Comment inputs are seeded in this
// same order (rather than raw assessment.items order) so input N always
// corresponds to row N of the tables above it.
const QUADRANT_ORDER: ToleranceQuadrant[] = ['distribution', 'defects']

export function ToleranceConfirmDialog({
  open, assessment, issued, saving, onConfirm, onCancel,
}: Props) {
  const [comments, setComments] = useState<string[]>([])
  const [additional, setAdditional] = useState(true)

  // Stable sort: groups items by quadrant in table order, preserving each
  // item's original relative position within its quadrant.
  const orderedItems = [...assessment.items].sort(
    (a, b) => QUADRANT_ORDER.indexOf(a.quadrant) - QUADRANT_ORDER.indexOf(b.quadrant),
  )

  useEffect(() => {
    if (open) {
      setComments(prefillComments(orderedItems))
      setAdditional(true)
    }
    // orderedItems is derived from assessment on every render; re-seeding
    // keys off `assessment` itself so this doesn't fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assessment])

  const issuedFor = (label: string, quadrant: ToleranceQuadrant): string => {
    if (quadrant === 'defects') return issued?.defects ? String(issued.defects.total) : '—'
    const size = label.replace(/^Screen\s+/i, '')
    const map = issued?.screen_percentages
    const v = map ? (map[size] ?? map[label]) : undefined
    return v === undefined ? '—' : `${Math.round(v * 10) / 10}%`
  }

  const formatActual = (value: number, quadrant: ToleranceQuadrant): string =>
    `${Math.round(value * 10) / 10}${quadrant === 'distribution' ? '%' : ''}`

  const quadrants = (['distribution', 'defects'] as ToleranceQuadrant[]).filter((q) =>
    assessment.items.some((i) => i.quadrant === q),
  )

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Approve with comments</DialogTitle>
          <DialogDescription>
            Review the values that will be issued, edit the seller comment if needed, and confirm.
          </DialogDescription>
        </DialogHeader>

        {quadrants.map((q) => (
          <div key={q} className="mb-4">
            <h4 className="mb-2 text-sm font-semibold">{QUADRANT_TITLE[q]}</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="py-1 text-left">Metric</th>
                  <th className="py-1 text-right">Actual</th>
                  <th className="py-1 text-right">Issued</th>
                  <th className="py-1 text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                {assessment.items.filter((i) => i.quadrant === q).map((i) => (
                  <tr key={i.key} className="border-b last:border-0">
                    <td className="py-1.5">{i.label}</td>
                    <td className="py-1.5 text-right">{formatActual(i.actual, q)}</td>
                    <td className="py-1.5 text-right font-semibold">{issuedFor(i.label, q)}</td>
                    <td className="py-1.5 text-right text-muted-foreground whitespace-nowrap">
                      {formatActual(i.actual, q)} {'→'} {issuedFor(i.label, q)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Seller comment</h4>
          {comments.map((c, idx) => {
            const item = orderedItems[idx]
            const inputId = `tolerance-comment-${item?.key ?? idx}`
            return (
              <div key={item?.key ?? idx} className="space-y-1">
                <label htmlFor={inputId} className="text-xs text-muted-foreground">
                  {item?.label ?? `Comment ${idx + 1}`}
                </label>
                <Input
                  id={inputId}
                  value={c}
                  onChange={(e) => {
                    const next = [...comments]
                    next[idx] = e.target.value
                    setComments(next)
                  }}
                />
              </div>
            )
          })}
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox checked={additional} onCheckedChange={(v) => setAdditional(v === true)} />
          Request additional sample
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(comments, additional)} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

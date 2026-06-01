'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SectionProps {
  params: any
  patch: (slice: Record<string, any>) => void
}

type CupKind = 'clean_cup' | 'uniform_cup'

export function CleanCupsSection({ params, patch }: SectionProps) {
  const rules = params?.cup_status_rules || {}

  const setRule = (kind: CupKind, field: 'max_taints' | 'max_faults', raw: string) => {
    const value = raw === '' ? 0 : parseFloat(raw)
    const next = {
      clean_cup: { max_taints: 0, max_faults: 0, ...(rules.clean_cup || {}) },
      uniform_cup: { max_taints: 0, max_faults: 0, ...(rules.uniform_cup || {}) },
    }
    next[kind] = { ...next[kind], [field]: value }
    patch({ cup_status_rules: next })
  }

  const val = (kind: CupKind, field: 'max_taints' | 'max_faults') => {
    const v = rules?.[kind]?.[field]
    return v != null ? String(v) : ''
  }

  const Card = ({ kind, title }: { kind: CupKind; title: string }) => (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h3 className="text-base font-semibold mb-4">{title}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs">Max taints</Label>
          <Input type="number" value={val(kind, 'max_taints')} placeholder="0"
            onChange={(e) => setRule(kind, 'max_taints', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Max faults</Label>
          <Input type="number" value={val(kind, 'max_faults')} placeholder="0"
            onChange={(e) => setRule(kind, 'max_faults', e.target.value)} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card kind="clean_cup" title="Clean cup" />
        <Card kind="uniform_cup" title="Uniform cup" />
      </div>
      <p className="text-sm text-muted-foreground">
        If no rules are set, both default to true (no defects = clean / uniform).
      </p>
    </div>
  )
}

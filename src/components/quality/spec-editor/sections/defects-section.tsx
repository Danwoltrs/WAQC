'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Plus, X } from 'lucide-react'
import type { DefectConfig, DefectConfiguration } from '@/types/defect-configuration'

interface SectionProps {
  params: any
  patch: (slice: Record<string, any>) => void
}

type Category = 'primary' | 'secondary'

export function DefectsSection({ params, patch }: SectionProps) {
  const config: DefectConfiguration =
    params?.defect_configuration || { defects: [], thresholds: {}, notes: '' }
  const defects: DefectConfig[] = config.defects || []
  const thresholds = config.thresholds || {}

  const setConfig = (next: Partial<DefectConfiguration>) =>
    patch({ defect_configuration: { ...config, ...next } })

  const setThreshold = (key: 'max_primary' | 'max_secondary' | 'max_total', raw: string) =>
    setConfig({ thresholds: { ...thresholds, [key]: raw === '' ? undefined : parseFloat(raw) } })

  // Replace all defects of one category, reindexing display_order within it.
  const setCategory = (category: Category, list: DefectConfig[]) => {
    const others = defects.filter((d) => d.category !== category)
    const reindexed = list.map((d, i) => ({ ...d, display_order: i }))
    setConfig({ defects: [...others, ...reindexed] })
  }

  return (
    <div className="space-y-4">
      {/* Thresholds */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ThresholdField label="Primary max" value={thresholds.max_primary} onChange={(v) => setThreshold('max_primary', v)} />
        <ThresholdField label="Secondary max" value={thresholds.max_secondary} onChange={(v) => setThreshold('max_secondary', v)} />
        <ThresholdField label="Total max" value={thresholds.max_total} onChange={(v) => setThreshold('max_total', v)} />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DefectTable
          title="Primary" category="primary" defectWeightDefault={1.0}
          defects={defects.filter((d) => d.category === 'primary').sort((a, b) => a.display_order - b.display_order)}
          onChange={(list) => setCategory('primary', list)}
        />
        <DefectTable
          title="Secondary" category="secondary" defectWeightDefault={0.2}
          defects={defects.filter((d) => d.category === 'secondary').sort((a, b) => a.display_order - b.display_order)}
          onChange={(list) => setCategory('secondary', list)}
        />
      </div>
    </div>
  )
}

function ThresholdField({ label, value, onChange }: { label: string; value?: number; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring h-10 px-3">
        <span className="text-muted-foreground mr-1.5 select-none">≤</span>
        <input
          type="number" value={value != null ? String(value) : ''} onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm"
        />
      </div>
    </div>
  )
}

function DefectTable({
  title, category, defects, defectWeightDefault, onChange,
}: {
  title: string
  category: Category
  defects: DefectConfig[]
  defectWeightDefault: number
  onChange: (list: DefectConfig[]) => void
}) {
  const [newName, setNewName] = useState('')
  const [newWeight, setNewWeight] = useState(String(defectWeightDefault))

  const weights = defects.map((d) => d.weight)
  const wMin = weights.length ? Math.min(...weights) : null
  const wMax = weights.length ? Math.max(...weights) : null
  const weightSummary = wMin == null ? '' : wMin === wMax ? `weight ${wMin} each` : `weight ${wMin} – ${wMax}`

  const add = () => {
    if (!newName.trim()) return
    onChange([...defects, {
      name: newName.trim(),
      weight: newWeight === '' ? defectWeightDefault : parseFloat(newWeight),
      category,
      display_order: defects.length,
    }])
    setNewName(''); setNewWeight(String(defectWeightDefault))
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{defects.length}{weightSummary && ` · ${weightSummary}`}</span>
      </div>

      <div className="grid grid-cols-[28px_1fr_92px_28px] items-center gap-2 px-1 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        <span>#</span><span>Defect</span><span>Weight</span><span />
      </div>

      <div className="divide-y divide-border/60">
        {defects.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No {title.toLowerCase()} defects yet.</p>
        )}
        {defects.map((d, i) => (
          <div key={i} className="grid grid-cols-[28px_1fr_92px_28px] items-center gap-2 h-[38px] px-1">
            <span className="text-[12px] text-muted-foreground/70">{i + 1}</span>
            <Input
              value={d.name}
              onChange={(e) => onChange(defects.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              className="h-8 border-transparent shadow-none px-2 focus-visible:border-input"
            />
            <Input
              type="number" value={String(d.weight)}
              onChange={(e) => onChange(defects.map((x, j) => j === i ? { ...x, weight: e.target.value === '' ? 0 : parseFloat(e.target.value) } : x))}
              className="h-8 text-center px-1 font-mono text-[13px]"
            />
            <button
              onClick={() => onChange(defects.filter((_, j) => j !== i))}
              className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add-row */}
      <div className="mt-3 pt-3 border-t border-dashed border-border flex items-center gap-2">
        <Input
          value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder={`Add ${title.toLowerCase()} defect…`} className="flex-1"
        />
        <Input
          type="number" value={newWeight} onChange={(e) => setNewWeight(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          className="w-20 text-center font-mono text-[13px]"
        />
        <Button onClick={add} disabled={!newName.trim()} size="icon" className="shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

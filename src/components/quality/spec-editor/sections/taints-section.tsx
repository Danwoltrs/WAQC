'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, X, Check } from 'lucide-react'
import {
  PREDEFINED_TAINT_FAULT_TEMPLATES, createTaintFaultDefect,
  type TaintFaultConfiguration, type TaintFaultDefect,
} from '@/types/taint-fault-configuration'

interface SectionProps {
  params: any
  patch: (slice: Record<string, any>) => void
}

const DEFAULT_CONFIG: TaintFaultConfiguration = {
  defects: [],
  deduction_formula: { taint_multiplier: 0.5, fault_multiplier: 2.0 },
  rules: {},
}

// The mockup exposes a single "taint threshold" = the top of the taint range.
// 0 → no taint range → the defect is always a fault.
const thresholdOf = (d: TaintFaultDefect) => (d.taint_range ? d.taint_range.max : 0)

function rebuildRanges(d: TaintFaultDefect, next: { threshold?: number; maxIntensity?: number; increment?: number }): TaintFaultDefect {
  const inc = next.increment ?? d.increment
  const mi = next.maxIntensity ?? d.max_intensity
  const th = next.threshold ?? thresholdOf(d)
  const taint_range = th > 0 ? { min: 0, max: th } : null
  const fault_min = th > 0 ? Math.round((th + inc) * 1000) / 1000 : inc
  return { ...d, taint_range, fault_range: { min: fault_min, max: mi }, max_intensity: mi, increment: inc }
}

export function TaintsSection({ params, patch }: SectionProps) {
  const config: TaintFaultConfiguration = params?.taint_fault_configuration || DEFAULT_CONFIG
  const defects: TaintFaultDefect[] = config.defects || []
  const rules = config.rules || {}
  const formula = config.deduction_formula || DEFAULT_CONFIG.deduction_formula

  const setConfig = (next: Partial<TaintFaultConfiguration>) =>
    patch({ taint_fault_configuration: { ...config, ...next } })

  const setDefects = (list: TaintFaultDefect[]) =>
    setConfig({ defects: list.map((d, i) => ({ ...d, display_order: i })) })
  const updateDefect = (id: string, mapped: TaintFaultDefect) =>
    setDefects(defects.map((d) => (d.id === id ? mapped : d)))

  const activeCount = defects.filter((d) => d.active !== false).length

  const loadTemplate = (id: string) => {
    const t = PREDEFINED_TAINT_FAULT_TEMPLATES.find((x) => x.id === id)
    if (t) setConfig({ ...t.configuration })
  }

  return (
    <div className="space-y-4">
      {/* Registry */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="max-w-[460px] space-y-1.5 mb-5">
          <Label className="text-xs text-muted-foreground">Load from template</Label>
          <Select value="" onValueChange={loadTemplate}>
            <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>
              {PREDEFINED_TAINT_FAULT_TEMPLATES.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold">Registered defects</h3>
            <span className="text-sm text-muted-foreground">{activeCount} active</span>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5"
            onClick={() => setDefects([...defects, createTaintFaultDefect('New defect', defects.length)])}>
            <Plus className="h-4 w-4" /> Add defect
          </Button>
        </div>

        <div className="grid grid-cols-[1fr_92px_92px_92px_56px_28px] items-center gap-2 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          <span>Defect</span><span>Taint threshold</span><span>Max intensity</span><span>Increment</span><span>Active</span><span />
        </div>

        <div className="divide-y divide-border/60">
          {defects.length === 0 && <p className="text-sm text-muted-foreground py-2">No defects registered yet.</p>}
          {defects.map((d) => (
            <div key={d.id} className="grid grid-cols-[1fr_92px_92px_92px_56px_28px] items-center gap-2 h-[42px] px-1">
              <Input value={d.name} onChange={(e) => updateDefect(d.id, { ...d, name: e.target.value })}
                className="h-8 border-transparent shadow-none px-2 focus-visible:border-input" />
              <Input type="number" value={String(thresholdOf(d))}
                onChange={(e) => updateDefect(d.id, rebuildRanges(d, { threshold: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                className="h-8 text-center px-1 font-mono text-[13px]" />
              <Input type="number" value={String(d.max_intensity)}
                onChange={(e) => updateDefect(d.id, rebuildRanges(d, { maxIntensity: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                className="h-8 text-center px-1 font-mono text-[13px]" />
              <Input type="number" value={String(d.increment)}
                onChange={(e) => updateDefect(d.id, rebuildRanges(d, { increment: e.target.value === '' ? 0.5 : parseFloat(e.target.value) }))}
                className="h-8 text-center px-1 font-mono text-[13px]" />
              <div className="grid place-items-center">
                <button
                  onClick={() => updateDefect(d.id, { ...d, active: !(d.active !== false) })}
                  className={`h-6 w-6 grid place-items-center rounded-md border transition-colors ${
                    d.active !== false
                      ? 'bg-[#15663f] border-[#15663f] text-white'
                      : 'bg-background border-border text-transparent hover:border-foreground/30'
                  }`}
                  title={d.active !== false ? 'Active' : 'Inactive'}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
              <button onClick={() => setDefects(defects.filter((x) => x.id !== d.id))}
                className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Threshold 0 = always counts as a fault.</p>
      </div>

      {/* Validation + multipliers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold mb-4">Sample validation</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Max taints</Label>
              <Input type="number" value={rules.max_taints != null ? String(rules.max_taints) : ''}
                onChange={(e) => setConfig({ rules: { ...rules, max_taints: e.target.value === '' ? undefined : parseFloat(e.target.value) } })} placeholder="—" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Max faults</Label>
              <Input type="number" value={rules.max_faults != null ? String(rules.max_faults) : ''}
                onChange={(e) => setConfig({ rules: { ...rules, max_faults: e.target.value === '' ? undefined : parseFloat(e.target.value) } })} placeholder="—" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold mb-4">Deduction multipliers</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Taint ×</Label>
              <Input type="number" value={String(formula.taint_multiplier)}
                onChange={(e) => setConfig({ deduction_formula: { ...formula, taint_multiplier: e.target.value === '' ? 0 : parseFloat(e.target.value) } })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Fault ×</Label>
              <Input type="number" value={String(formula.fault_multiplier)}
                onChange={(e) => setConfig({ deduction_formula: { ...formula, fault_multiplier: e.target.value === '' ? 0 : parseFloat(e.target.value) } })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 font-mono">deducted = (cups affected / total) × intensity × ×</p>
        </div>
      </div>
    </div>
  )
}

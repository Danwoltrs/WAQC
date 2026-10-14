// src/components/portal/qc-key-picker.tsx
'use client'
import { QC_CAPABILITIES, QC_KEY_LABELS, QC_PRESETS, QC_VIEWS, normalizeQcKeys, type QcKeySet } from '@/lib/portal/qc-keys'

export function QcKeyPicker({ value, onChange, ceiling }: { value: QcKeySet; onChange: (next: QcKeySet) => void; ceiling?: QcKeySet }) {
  const viewAllowed = (k: string) => !ceiling || (ceiling.views as string[]).includes(k)
  const capabilityAllowed = (k: string) => !ceiling || (ceiling.capabilities as string[]).includes(k)

  function applyPreset(keys: QcKeySet) {
    onChange({ views: keys.views.filter(viewAllowed), capabilities: keys.capabilities.filter(capabilityAllowed) })
  }

  function toggle(kind: 'views' | 'capabilities', key: string) {
    const current = value[kind] as string[]
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    onChange(normalizeQcKeys({ ...value, [kind]: next }))
  }

  function box(kind: 'views' | 'capabilities', key: (typeof QC_VIEWS)[number] | (typeof QC_CAPABILITIES)[number]) {
    const allowed = kind === 'views' ? viewAllowed(key) : capabilityAllowed(key)
    const id = `qc-key-${key}`
    return (
      <label key={key} htmlFor={id} className={`flex items-center gap-2 text-[13px] ${allowed ? '' : 'opacity-40'}`}
        title={allowed ? undefined : 'Not part of your own access'}>
        <input id={id} type="checkbox" className="h-4 w-4 accent-[#556b2f]" disabled={!allowed}
          checked={(value[kind] as string[]).includes(key)} onChange={() => toggle(kind, key)} />
        {QC_KEY_LABELS[key]}
      </label>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {QC_PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => applyPreset(p.keys)}
            className="rounded-full border px-3 py-1 text-[12px] hover:bg-black/5">
            {p.label}
          </button>
        ))}
      </div>
      <div>
        <div className="mb-2 text-[12px] font-medium opacity-70">Pages</div>
        <div className="grid grid-cols-2 gap-2">{QC_VIEWS.map((k) => box('views', k))}</div>
      </div>
      <div>
        <div className="mb-2 text-[12px] font-medium opacity-70">Actions</div>
        <div className="grid grid-cols-2 gap-2">{QC_CAPABILITIES.map((k) => box('capabilities', k))}</div>
      </div>
    </div>
  )
}

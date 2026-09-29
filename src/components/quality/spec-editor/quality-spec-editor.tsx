'use client'

/**
 * QualitySpecEditor — full-screen quality template editor.
 *
 * Replaces the old nested-modal TemplateBuilder render with a single surface:
 * sticky top bar + grouped left section-nav (raised-card active state) + an
 * inline scrolling panel. No section opens a modal on top of another.
 *
 * The working state, the nav and the sections live in spec-editor-body.tsx,
 * shared with the intake's "New quality specification" dialog.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Save } from 'lucide-react'
import { SpecEditorBody, useSpecEditorState, type SpecTemplate } from './spec-editor-body'

interface QualitySpecEditorProps {
  template?: SpecTemplate
  onSave: (template: any) => Promise<void>
  onCancel: () => void
}

export function QualitySpecEditor({ template, onSave, onCancel }: QualitySpecEditorProps) {
  const state = useSpecEditorState(template)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const templateName = state.name.trim() || 'Untitled template'

  const handleSave = async () => {
    if (!state.name.trim()) { setError('Template name is required.'); state.setActive('basic'); return }
    setSaving(true); setError(null)
    try {
      await onSave(state.buildPayload())
    } catch (err: any) {
      setError(err?.message || 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Sticky top bar */}
      <header className="flex items-center justify-between gap-4 h-16 px-4 sm:px-6 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onCancel}
            className="h-9 w-9 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            title="Back to templates"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <nav className="flex items-center gap-2 text-sm min-w-0">
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
              Quality Templates
            </button>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-semibold truncate">{templateName}</span>
            {template?.version != null && (
              <span className="font-mono text-[10.5px] font-semibold text-muted-foreground bg-muted rounded px-1.5 py-px shrink-0">
                v{template.version}
              </span>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <label className="hidden sm:flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
            <span className={state.isActive ? 'text-[#15663f] dark:text-[#5fcf8e]' : 'text-muted-foreground'}>Active</span>
            <Switch checked={state.isActive} onCheckedChange={state.setIsActive} />
          </label>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save template'}
          </Button>
        </div>
      </header>

      {error && (
        <div className="px-6 py-2 text-sm text-[#b0322a] bg-[#fbeceb] dark:bg-[#b0322a]/20 dark:text-[#f0928a] border-b border-border">
          {error}
        </div>
      )}

      <SpecEditorBody state={state} />
    </div>
  )
}

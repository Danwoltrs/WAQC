'use client'

/**
 * QualitySpecEditor — full-screen quality template editor.
 *
 * Replaces the old nested-modal TemplateBuilder render with a single surface:
 * PageHeader top bar (the section name is its green crumb) + grouped left section-nav (flat highlight) + an
 * inline scrolling panel. No section opens a modal on top of another.
 *
 * The working state, the nav and the sections live in spec-editor-body.tsx,
 * shared with the intake's "New quality specification" dialog.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Save } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { MainLayoutContext } from '@/components/layout/main-layout-context'
import { SpecEditorBody, sectionTitle, useSpecEditorState, type SpecTemplate } from './spec-editor-body'

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
    <MainLayoutContext.Provider value={false}>
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* The overlay is its own flex column, so the header is not sticky: it
          stays put while the body scrolls. */}
      <PageHeader
        sticky={false}
        back={{ onClick: onCancel, label: 'Back to Quality Templates' }}
        crumbs={[
          { label: 'Quality Templates', onClick: onCancel },
          {
            label: templateName,
            emphasis: true,
            badge: template?.version != null ? (
              <span className="shrink-0 rounded-sm bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
                v{template.version}
              </span>
            ) : undefined,
          },
          { label: sectionTitle(state.active) },
        ]}
        actions={
          <>
            <label className="hidden sm:flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
              <span className={state.isActive ? 'text-primary' : 'text-muted-foreground'}>Active</span>
              <Switch checked={state.isActive} onCheckedChange={state.setIsActive} />
            </label>
            <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save template'}
            </Button>
          </>
        }
      />

      {error && (
        <div className="px-6 py-2 text-sm text-[#b0322a] bg-[#fbeceb] dark:bg-[#b0322a]/20 dark:text-[#f0928a] border-b border-border">
          {error}
        </div>
      )}

      <SpecEditorBody state={state} />
    </div>
    </MainLayoutContext.Provider>
  )
}

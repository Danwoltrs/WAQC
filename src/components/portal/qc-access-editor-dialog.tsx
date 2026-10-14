// src/components/portal/qc-access-editor-dialog.tsx
'use client'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { QcKeySet } from '@/lib/portal/qc-keys'
import { QcKeyPicker } from './qc-key-picker'
import { PORTAL_DIALOG_TONE } from './qc-invite-dialog'

export function QcAccessEditorDialog({
  open, onOpenChange, personLabel, initial, initialAdmin, allowCompanyAdmin, ceiling, onSave, tone = 'app',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personLabel: string
  initial: QcKeySet
  initialAdmin: boolean
  allowCompanyAdmin: boolean
  ceiling?: QcKeySet
  onSave: (keys: QcKeySet, isCompanyAdmin: boolean) => Promise<boolean>
  tone?: 'app' | 'portal'
}) {
  const [keys, setKeys] = useState(initial)
  const [isAdmin, setIsAdmin] = useState(initialAdmin)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setKeys(initial); setIsAdmin(initialAdmin) }
  }, [open, initial, initialAdmin])

  async function save() {
    setBusy(true)
    const ok = await onSave(keys, isAdmin)
    setBusy(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={tone === 'portal' ? PORTAL_DIALOG_TONE : undefined}>
        <DialogHeader>
          <DialogTitle>Access for {personLabel}</DialogTitle>
          <DialogDescription>Choose the pages and actions this person has on the QC portal.</DialogDescription>
        </DialogHeader>
        <QcKeyPicker value={keys} onChange={setKeys} ceiling={ceiling} />
        {allowCompanyAdmin && (
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-4 w-4 accent-[#556b2f]" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Company admin (can invite colleagues and partners)
          </label>
        )}
        <DialogFooter>
          <Button disabled={busy || keys.views.length === 0} onClick={save}>{busy ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

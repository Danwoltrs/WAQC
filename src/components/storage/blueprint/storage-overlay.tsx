'use client'

import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { StorageWorkspace } from './storage-workspace'

interface StorageOverlayProps {
  laboratoryId: string
  labName: string
  initialMode?: 'view' | 'edit'
  onClose: () => void
}

/**
 * Full-screen storage for one lab. Escape or X closes; unsaved edits ask first.
 * Rendered into the page body so nothing in the page that opens it can shift
 * it; the header repeats the sidebar's logo strip, title after its divider.
 */
export function StorageOverlay({ laboratoryId, labName, initialMode, onClose }: StorageOverlayProps) {
  const titleId = useId()
  const [dirty, setDirty] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const requestClose = () => (dirty ? setConfirming(true) : onClose())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || confirming) return
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex h-16 shrink-0 items-center border-b">
        <div className="flex h-full w-64 shrink-0 items-center justify-center border-r px-2">
          <img src="/logos/wolthers-logo-green.png" alt="Wolthers" className="h-10 w-auto dark:hidden" />
          <img src="/logos/wolthers-logo-off-white.svg" alt="Wolthers" className="hidden h-10 w-auto dark:block" />
        </div>
        <h2 id={titleId} className="min-w-0 flex-1 truncate px-4 text-sm font-semibold">Storage · {labName}</h2>
        <Button variant="ghost" size="icon" aria-label="Close storage" className="mr-4" onClick={requestClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <StorageWorkspace laboratoryId={laboratoryId} initialMode={initialMode} onDirtyChange={setDirty} />
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>The floor plan has changes that are not saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>,
    document.body,
  )
}

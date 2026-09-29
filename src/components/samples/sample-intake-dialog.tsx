'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SampleIntakeForm } from './sample-intake-form'

// Shared sizing for the New Sample window (redesign, 2026-09-28/29). On a
// phone or tablet it is the whole screen. From `lg` it is a dialog: Step 1
// (the contract pick) is a compact 620px box like the Wolthers app's New
// Inquiry, sized to its content; Steps 2 and 3 widen to a large dialog for
// their cards and the sub-contracts table. The form marks Step 1 with
// `data-intake-compact`, and the Other-Sample flow (one ~600px column) with
// `data-intake-narrow`; these `has-[…]` variants react to the markers, so no
// host has to track the step. `!flex` overrides DialogContent's base `grid`
// so the form's header / body / footer column gives a reliable scroll
// region: the body (`flex-auto min-h-0 overflow-y-auto`) scrolls and the
// footer (Continue, Create) stays pinned. From lg the dialog is as tall as
// its step and no taller (up to 92vh), so a short step leaves no empty band
// above the footer.
// (Class names spelled out in full: Tailwind only generates what it can read.)
export const INTAKE_DIALOG_CONTENT_CLASS =
  '!flex flex-col gap-0 p-4 w-screen h-[100dvh] max-w-none rounded-none sm:rounded-none border-0 overflow-hidden ' +
  'lg:w-[min(1280px,94vw)] lg:h-auto lg:max-h-[min(92vh,1040px)] lg:rounded-[10px] lg:border lg:p-6 ' +
  'lg:has-[[data-intake-compact]]:w-[620px] ' +
  'lg:has-[[data-intake-narrow]]:w-[640px] lg:has-[[data-intake-narrow]]:h-auto lg:has-[[data-intake-narrow]]:max-h-[90vh]'

interface SampleIntakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (trackingNumber: string) => void
}

export function SampleIntakeDialog({ open, onOpenChange, onSuccess }: SampleIntakeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={INTAKE_DIALOG_CONTENT_CLASS}>
        {/* The form shows its own header (it names the linked contract). */}
        <DialogHeader className="sr-only">
          <DialogTitle>New Sample</DialogTitle>
        </DialogHeader>
        <div className="flex-auto min-h-0 flex flex-col">
          <SampleIntakeForm onSuccess={onSuccess} asDialog={true} onCancel={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

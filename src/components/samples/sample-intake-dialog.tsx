'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SampleIntakeForm } from './sample-intake-form'

// Shared sizing for the New Sample window (redesign, 2026-09-28/29). Steps 2
// and 3 are the whole screen unless the screen is roomy (at least 1280 x 900
// CSS px): on a small laptop a dialog left their cards scrolling inside a
// window with the list showing around it (Daniel 2026-09-29). On a roomy
// screen they are a large dialog for their cards and the sub-contracts table.
// Step 1 (the contract pick) is a compact 620px box from `lg`, like the
// Wolthers app's New Inquiry, sized to its content, and the Other-Sample flow
// (one ~600px column) a 640px box. The form marks Step 1 with
// `data-intake-compact` and the Other-Sample flow with `data-intake-narrow`;
// these `has-[…]` variants react to the markers (and outrank the roomy width),
// so no host has to track the step. `!flex` overrides DialogContent's base
// `grid` so the form's header / body / footer column gives a reliable scroll
// region: the body (`flex-auto min-h-0 overflow-y-auto`) scrolls and the
// footer (Continue, Create) stays pinned. As a dialog it is as tall as its
// step and no taller, so a short step leaves no empty band above the footer.
// (Class names spelled out in full: Tailwind only generates what it can read.)
export const INTAKE_DIALOG_CONTENT_CLASS =
  '!flex flex-col gap-0 p-4 w-screen h-[100dvh] max-w-none rounded-none sm:rounded-none border-0 overflow-hidden ' +
  '[@media(min-width:1280px)_and_(min-height:900px)]:w-[min(1280px,94vw)] [@media(min-width:1280px)_and_(min-height:900px)]:h-auto ' +
  '[@media(min-width:1280px)_and_(min-height:900px)]:max-h-[min(92vh,1040px)] [@media(min-width:1280px)_and_(min-height:900px)]:rounded-[10px] ' +
  '[@media(min-width:1280px)_and_(min-height:900px)]:border [@media(min-width:1280px)_and_(min-height:900px)]:p-6 ' +
  'lg:has-[[data-intake-compact]]:w-[620px] lg:has-[[data-intake-compact]]:h-auto lg:has-[[data-intake-compact]]:max-h-[min(92vh,1040px)] ' +
  'lg:has-[[data-intake-compact]]:rounded-[10px] lg:has-[[data-intake-compact]]:border lg:has-[[data-intake-compact]]:p-6 ' +
  'lg:has-[[data-intake-narrow]]:w-[640px] lg:has-[[data-intake-narrow]]:h-auto lg:has-[[data-intake-narrow]]:max-h-[90vh] ' +
  'lg:has-[[data-intake-narrow]]:rounded-[10px] lg:has-[[data-intake-narrow]]:border lg:has-[[data-intake-narrow]]:p-6'

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

'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SampleIntakeForm } from './sample-intake-form'

// Shared sizing for the Sample Intake modal. Full-screen sheet below `lg`
// (laptops/tablets/phones, where a centered modal can't show everything and
// the lab can't reach "Recipient clients"); centered modal at `lg`+.
// `!flex` overrides DialogContent's base `grid` so the inner header/body/footer
// flex column gives a reliable scroll region.
//
// The QC wizard is wide (supply-chain grids); the Other-Sample flow is a single
// ~600px column. So at `lg`+ the box defaults to 5xl but shrinks to 2xl when the
// Other flow is mounted — it renders a `data-intake-narrow` marker, which this
// `has-[…]` variant reacts to with no parent wiring.
//
// HEIGHT: the wizard needs a DEFINITE height at `lg`+ (`lg:h-[90vh]`), not
// `h-auto + max-h`. The inner body scrolls via `flex-1 min-h-0 overflow-y-auto`,
// but that chain passes through a `h-full` wrapper — a percentage height only
// resolves against a definite parent. With `h-auto` the modal height is
// indefinite, so `h-full` collapses to content height, the body never bounds,
// and the footer (Create Sample) gets pushed past `max-h` and clipped by
// `overflow-hidden` (the bug: works below `lg` where `h-[100dvh]` is definite,
// breaks at `lg`+). The short single-column Other flow keeps auto height (it
// self-scrolls and shouldn't stretch to a tall empty box).
export const INTAKE_DIALOG_CONTENT_CLASS =
  '!flex flex-col gap-0 p-4 w-screen h-[100dvh] max-w-none rounded-none border-0 overflow-hidden ' +
  'lg:w-[95vw] lg:h-[90vh] lg:max-w-5xl lg:rounded-lg lg:border lg:p-6 ' +
  'lg:has-[[data-intake-narrow]]:max-w-2xl lg:has-[[data-intake-narrow]]:h-auto lg:has-[[data-intake-narrow]]:max-h-[90vh]'

interface SampleIntakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (trackingNumber: string) => void
}

export function SampleIntakeDialog({ open, onOpenChange, onSuccess }: SampleIntakeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={INTAKE_DIALOG_CONTENT_CLASS}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Sample Intake</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <SampleIntakeForm onSuccess={onSuccess} asDialog={true} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

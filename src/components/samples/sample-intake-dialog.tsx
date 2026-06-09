'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SampleIntakeForm } from './sample-intake-form'

// Shared sizing for the Sample Intake modal. Full-screen sheet below `2xl`
// (phones, tablets AND laptops — even a 13-16" laptop is small enough that a
// centered modal can't show everything and the lab can't reach "Recipient
// clients"); centered modal only at `2xl`+ (≥1536px, i.e. large external
// monitors). `!flex` overrides DialogContent's base `grid` so the inner
// header/body/footer flex column gives a reliable scroll region.
//
// The QC wizard is wide (supply-chain grids); the Other-Sample flow is a single
// ~600px column. So at `2xl`+ the box defaults to 5xl but shrinks to 2xl-width
// when the Other flow is mounted — it renders a `data-intake-narrow` marker,
// which this `has-[…]` variant reacts to with no parent wiring.
//
// HEIGHT: the modal sizes to its content but caps at `2xl:max-h-[90vh]` (auto
// height, NOT a fixed `h-[90vh]` — a fixed height stretches short steps like the
// contract search into a tall, mostly-empty box). The header/body/footer form a
// flex column where every flexible level uses `flex-auto` (flex:1 1 auto, a
// CONTENT basis) + `min-h-0`, never `h-full`. The content basis is what makes
// both modes work: short content -> the box shrinks to fit; tall content -> the
// box caps at 90vh, the body (`flex-auto min-h-0 overflow-y-auto`) shrinks below
// its content and scrolls, and the footer (`flex-shrink-0`, Create Sample) stays
// pinned and reachable. The earlier `flex-1` (basis 0%) + `h-full` chain had no
// content basis, so it collapsed under `h-auto` and only worked with a fixed
// height — which is exactly what over-stretched the short steps.
export const INTAKE_DIALOG_CONTENT_CLASS =
  '!flex flex-col gap-0 p-4 w-screen h-[100dvh] max-w-none rounded-none border-0 overflow-hidden ' +
  '2xl:w-[95vw] 2xl:h-auto 2xl:max-h-[90vh] 2xl:max-w-5xl 2xl:rounded-lg 2xl:border 2xl:p-6 ' +
  '2xl:has-[[data-intake-narrow]]:max-w-2xl'

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
        <div className="flex-auto min-h-0 flex flex-col">
          <SampleIntakeForm onSuccess={onSuccess} asDialog={true} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

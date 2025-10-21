'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SampleIntakeForm } from './sample-intake-form'

interface SampleIntakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SampleIntakeDialog({ open, onOpenChange }: SampleIntakeDialogProps) {
  const handleSuccess = (trackingNumber: string) => {
    // Form will show success view, then user can close or create another
    // Dialog stays open to show success message
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sample Intake</DialogTitle>
        </DialogHeader>
        <SampleIntakeForm onSuccess={handleSuccess} asDialog={true} />
      </DialogContent>
    </Dialog>
  )
}

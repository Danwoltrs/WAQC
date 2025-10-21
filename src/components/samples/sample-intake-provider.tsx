'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { SampleIntakeDialog } from './sample-intake-dialog'

interface SampleIntakeContextType {
  openIntakeDialog: () => void
  closeIntakeDialog: () => void
}

const SampleIntakeContext = createContext<SampleIntakeContextType | undefined>(undefined)

export function SampleIntakeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const openIntakeDialog = () => setIsOpen(true)
  const closeIntakeDialog = () => setIsOpen(false)

  return (
    <SampleIntakeContext.Provider value={{ openIntakeDialog, closeIntakeDialog }}>
      {children}
      <SampleIntakeDialog open={isOpen} onOpenChange={setIsOpen} />
    </SampleIntakeContext.Provider>
  )
}

export function useSampleIntake() {
  const context = useContext(SampleIntakeContext)
  if (!context) {
    throw new Error('useSampleIntake must be used within SampleIntakeProvider')
  }
  return context
}

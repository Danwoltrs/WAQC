'use client'
import { createContext, useContext, type ReactNode } from 'react'
import type { PortalCompany, PortalMe } from '@/lib/portal/portal-me'

export interface PortalState {
  me: PortalMe
  company: PortalCompany
  switchCompany: (id: string) => void
  fetch: (path: string, init?: RequestInit) => Promise<Response>
}

const PortalContext = createContext<PortalState | null>(null)

export function PortalProvider({ value, children }: { value: PortalState; children: ReactNode }) {
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal(): PortalState {
  const value = useContext(PortalContext)
  if (!value) throw new Error('usePortal must be used inside PortalShell')
  return value
}

export function PortalNotice({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-neutral-50 px-6 py-8 text-center text-sm text-neutral-500">{children}</p>
}

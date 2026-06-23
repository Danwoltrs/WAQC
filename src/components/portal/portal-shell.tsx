'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isClientRole } from '@/lib/portal/portal-auth'
import { PortalTopNav } from './portal-top-nav'

export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      const { data: profile } = await supabase.from('profiles').select('qc_role').eq('id', user.id).single()
      if (!active) return
      if (!isClientRole((profile as any)?.qc_role)) { router.replace('/dashboard'); return }
      setReady(true)
    })()
    return () => { active = false }
  }, [router])

  async function signOut() { await supabase.auth.signOut(); router.replace('/') }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#556b2f]" />
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <PortalTopNav pathname={pathname} onSignOut={signOut} />
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  )
}

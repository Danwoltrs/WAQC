'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { portalFetch, withCompany } from '@/lib/portal/portal-fetch'
import type { PortalMe } from '@/lib/portal/portal-me'
import { PortalTopNav } from './portal-top-nav'
import { visibleNav } from './portal-nav'
import { PortalProvider } from './portal-context'

/** The portal is light-only: undo the app theme's `dark` class while it is open. */
function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains('dark')
    const hadLight = root.classList.contains('light')
    root.classList.remove('dark')
    root.classList.add('light')
    return () => {
      if (!hadLight) root.classList.remove('light')
      if (hadDark) {
        root.classList.remove('light')
        root.classList.add('dark')
      }
    }
  }, [])
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  useForceLightTheme()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requested = searchParams.get('company')
  const [me, setMe] = useState<PortalMe | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const res = await fetch(withCompany('/api/portal/me', requested))
      if (!active) return
      if (res.status === 401) { router.replace('/'); return }
      if (res.status === 403) { router.replace('/auth/no-access'); return }
      if (res.status === 400) {
        // The server's own text, e.g. a staff member who opened /portal without a client.
        const body = await res.json().catch(() => null)
        setError(typeof body?.error === 'string' ? body.error : 'The portal could not load. Please refresh the page.')
        return
      }
      if (!res.ok) { setError('The portal could not load. Please refresh the page.'); return }
      setMe(await res.json())
    })().catch(() => {
      if (active) setError('The portal could not load. Please refresh the page.')
    })
    return () => { active = false }
  }, [requested, router])

  const company = useMemo(
    () => (me ? me.companies.find((c) => c.id === requested) ?? me.companies[0] ?? null : null),
    [me, requested],
  )

  const switchCompany = useCallback((id: string) => router.push(withCompany(pathname, id)), [router, pathname])
  const scopedFetch = useCallback(
    (path: string, init?: RequestInit) => portalFetch(path, company?.id ?? null, init),
    [company?.id],
  )

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center bg-white text-sm text-neutral-500">{error}</div>
  }
  if (!me || !company) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#556b2f]" />
      </div>
    )
  }

  return (
    <PortalProvider value={{ me, company, switchCompany, fetch: scopedFetch }}>
      <div className="min-h-screen bg-white text-neutral-900">
        {me.viewAs && (
          <div className="bg-[#556b2f] px-6 py-2 text-center text-xs text-white">
            Viewing the portal as {company.name} sees it. Read-only.
          </div>
        )}
        <PortalTopNav
          pathname={pathname}
          items={visibleNav(company)}
          companyId={company.id}
          companies={me.companies.map((c) => ({ id: c.id, name: c.name }))}
          onSwitchCompany={switchCompany}
          onSignOut={signOut}
        />
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </div>
    </PortalProvider>
  )
}

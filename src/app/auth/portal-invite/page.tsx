'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Invitation {
  email: string
  firstName: string
  companyName: string
  inviterName: string
  expiresAt: string
  microsoft: boolean
}

function AcceptPortalInvitation() {
  const router = useRouter()
  // Read the token once and keep it in memory only; it is never stored or logged.
  const tokenRef = useRef(useSearchParams().get('token') ?? '')
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const token = tokenRef.current
    // Keep the token out of the address bar and browser history.
    window.history.replaceState(null, '', window.location.pathname)
    if (!token) {
      setError('This invitation is no longer valid.')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/portal/accept?token=${encodeURIComponent(token)}`)
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) setInvitation(body)
        else if (res.status === 410) setError(body.error ?? 'This invitation is no longer valid.')
        else setError('Something went wrong. Please try again.')
      } catch {
        if (!cancelled) setError('Something went wrong. Please try again.')
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function accept(method: 'password' | 'microsoft') {
    if (!invitation) return
    if (method === 'password') {
      if (password.length < 8) { setError('Use a password of at least 8 characters.'); return }
      if (password !== confirm) { setError('The two passwords do not match.'); return }
    }
    setBusy(true)
    setError(null)
    let res: Response
    try {
      res = await fetch('/api/portal/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenRef.current, method, password: method === 'password' ? password : undefined }),
      })
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
      return
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const showServerText = [400, 409, 410].includes(res.status) && typeof body.error === 'string'
      setError(showServerText ? body.error : 'Something went wrong. Please try again.')
      setBusy(false)
      return
    }
    if (method === 'password') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: invitation.email, password })
      if (signInError) {
        setError('Your account is ready, but signing in failed. Please sign in from the home page.')
        setBusy(false)
        return
      }
      router.replace('/portal')
      return
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email profile openid', redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) {
      setError('Your account is ready, but Microsoft sign-in failed. Please sign in from the home page.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-900">
      <div className="w-full max-w-md">
        <h1 className="text-base font-semibold">Wolthers QC portal</h1>
        {!invitation && !error && <p className="mt-4 text-sm text-neutral-500">Loading your invitation...</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#b91c1c]">{error}</p>}
        {invitation && (
          <div className="mt-4 space-y-5">
            <p className="text-sm text-neutral-600">
              {invitation.inviterName} invited you to see {invitation.companyName}&apos;s quality control results.
            </p>
            <div>
              <label htmlFor="em" className="text-xs text-neutral-500">Email</label>
              <input id="em" value={invitation.email} readOnly className="mt-1 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="pw" className="text-xs text-neutral-500">Choose a password</label>
              <input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]" />
            </div>
            <div>
              <label htmlFor="pw2" className="text-xs text-neutral-500">Repeat the password</label>
              <input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]" />
            </div>
            <button disabled={busy} onClick={() => accept('password')}
              className="w-full rounded-full bg-[#556b2f] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {busy ? 'Setting up your access...' : 'Accept and sign in'}
            </button>
            {invitation.microsoft && (
              <button disabled={busy} onClick={() => accept('microsoft')}
                className="w-full rounded-full border border-neutral-200 px-5 py-2.5 text-sm text-neutral-700 disabled:opacity-60">
                Continue with Microsoft
              </button>
            )}
            <p className="text-xs text-neutral-400">
              This invitation expires on {new Date(invitation.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PortalInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptPortalInvitation />
    </Suspense>
  )
}

'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const EXPIRED = 'This link has expired. Ask for a new one from the sign-in page.'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<'checking' | 'yes' | 'no'>('checking')

  useEffect(() => {
    let cancelled = false
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY' || s) setSession('yes')
    })
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession((prev) => (data.session ? 'yes' : prev === 'yes' ? 'yes' : 'no'))
    })
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (password.length < 8) { setError('Use a password of at least 8 characters.'); return }
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      const status = (updateError as { status?: number }).status
      const code = (updateError as { code?: string }).code ?? ''
      const msg = updateError.message ?? ''
      if (status === 401 || status === 403 || /session|jwt|not authenticated|expired/i.test(`${code} ${msg}`)) {
        setError(EXPIRED)
      } else if (/weak_password|same_password|password/i.test(`${code} ${msg}`)) {
        setError(msg)
      } else {
        setError('Could not change the password. Please try again.')
      }
      return
    }
    router.replace('/')
  }

  const inputClass = 'w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]'

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-900">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-base font-semibold">Set a new password</h1>
        {session === 'checking' && <p className="text-sm text-neutral-500">Checking your link...</p>}
        {session === 'no' && (
          <>
            <p role="alert" className="rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#b91c1c]">{EXPIRED}</p>
            <Link href="/" className="text-sm text-[#556b2f] underline">Back to sign in</Link>
          </>
        )}
        {session === 'yes' && (
          <form onSubmit={save} className="space-y-4">
            {error && <p role="alert" className="rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#b91c1c]">{error}</p>}
            <input type="password" autoComplete="new-password" placeholder="New password" aria-label="New password" value={password}
              onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            <input type="password" autoComplete="new-password" placeholder="Repeat the new password" aria-label="Repeat the new password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
            <button type="submit" disabled={busy}
              className="w-full rounded-full bg-[#556b2f] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {busy ? 'Saving...' : 'Save and sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

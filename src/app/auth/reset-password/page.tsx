'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (password.length < 8) { setError('Use a password of at least 8 characters.'); return }
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) { setError('The link has expired. Ask for a new one from the sign-in page.'); return }
    router.replace('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-900">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-base font-semibold">Set a new password</h1>
        {error && <p role="alert" className="rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#b91c1c]">{error}</p>}
        <input type="password" autoComplete="new-password" placeholder="New password" aria-label="New password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]" />
        <input type="password" autoComplete="new-password" placeholder="Repeat the new password" aria-label="Repeat the new password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm outline-none focus:border-[#556b2f]" />
        <button disabled={busy} onClick={save}
          className="w-full rounded-full bg-[#556b2f] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
          {busy ? 'Saving...' : 'Save and sign in'}
        </button>
      </div>
    </div>
  )
}

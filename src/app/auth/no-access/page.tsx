// src/app/auth/no-access/page.tsx
'use client'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function NoAccessPage() {
  const router = useRouter()
  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-base font-semibold text-neutral-900">No access to Wolthers QC</h1>
        <p className="mt-3 text-sm text-neutral-500">
          Access to Wolthers QC is by invitation. If you were invited, open the link in your
          invitation email. If you are signed in with an account that has no access, sign out and
          ask your Wolthers contact to invite you.
        </p>
        <button
          onClick={signOut}
          className="mt-6 rounded-full border border-neutral-200 px-5 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

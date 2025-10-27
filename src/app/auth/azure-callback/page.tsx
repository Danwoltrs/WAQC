'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { handleAzureADRedirect } from '@/lib/azure-ad'
import { supabase } from '@/lib/supabase'

export default function AzureCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Processing authentication...')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        setStatus('Receiving Azure AD response...')

        // Handle the redirect from Azure AD
        const response = await handleAzureADRedirect()

        if (!response) {
          throw new Error('No authentication response received')
        }

        setStatus('Signing in to Wolthers QC system...')

        // Get user info from Azure AD
        const { account, idToken } = response

        if (!account) {
          throw new Error('No account information received')
        }

        // Send the Azure AD token to our backend to create/sign in the user
        const apiResponse = await fetch('/api/auth/azure-signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            idToken,
            account,
          }),
        })

        const data = await apiResponse.json()

        if (!apiResponse.ok) {
          throw new Error(data.error || 'Failed to sign in')
        }

        setStatus('Setting up your session...')

        // Sign in to Supabase using the email
        const email = (account.username as string | undefined) ||
                      (account.idTokenClaims?.email as string | undefined) ||
                      (account.idTokenClaims?.preferred_username as string | undefined) ||
                      ''

        if (!email || typeof email !== 'string') {
          throw new Error('No email found in Azure AD account')
        }

        // Use magic link for passwordless authentication
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email: email,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: `${window.location.origin}/`,
          },
        })

        if (signInError) {
          console.error('Supabase sign-in error:', signInError)
          // Don't throw, continue anyway as profile might exist
        }

        setStatus('Redirecting to dashboard...')

        // Store Azure AD session info
        sessionStorage.setItem('azure_ad_authenticated', 'true')
        sessionStorage.setItem('azure_ad_email', email)
        sessionStorage.setItem('azure_ad_name', account.name || '')

        // Redirect to home
        setTimeout(() => {
          router.push('/')
        }, 1000)
      } catch (err: any) {
        console.error('Azure AD callback error:', err)
        setError(err.message || 'Authentication failed')

        // Redirect to login with error after 3 seconds
        setTimeout(() => {
          router.push(`/?error=${encodeURIComponent(err.message)}`)
        }, 3000)
      }
    }

    handleCallback()
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full p-6 bg-card rounded-lg border border-destructive">
          <h2 className="text-xl font-bold text-destructive mb-4">Authentication Error</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <p className="text-xs text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-6 bg-card rounded-lg border">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <h2 className="text-xl font-bold">Signing you in...</h2>
          <p className="text-sm text-muted-foreground text-center">{status}</p>
        </div>
      </div>
    </div>
  )
}

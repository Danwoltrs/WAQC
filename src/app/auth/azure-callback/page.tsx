'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { handleAzureADRedirect, resetRedirectState } from '@/lib/azure-ad'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FlaskConical, CheckCircle2, AlertCircle } from 'lucide-react'

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
          throw new Error('No authentication response received from Microsoft')
        }

        // Get user info from Azure AD
        const { account } = response

        if (!account) {
          throw new Error('No account information in Microsoft response')
        }

        // Extract email from account
        const email = (account.username as string | undefined) ||
                      (account.idTokenClaims?.email as string | undefined) ||
                      (account.idTokenClaims?.preferred_username as string | undefined) ||
                      ''

        if (!email) {
          throw new Error('No email found in Microsoft account')
        }

        const name = account.name || email.split('@')[0]

        console.log('Azure AD authentication successful:', { email, name })

        setStatus('Setting up your session...')

        // Store Azure AD session info
        sessionStorage.setItem('azure_ad_authenticated', 'true')
        sessionStorage.setItem('azure_ad_email', email)
        sessionStorage.setItem('azure_ad_name', name)

        // For now, just redirect - let the auth provider handle the rest
        setStatus('Redirecting to dashboard...')

        console.log('Redirecting to dashboard...')

        // Redirect immediately
        window.location.href = '/'
      } catch (err: any) {
        console.error('Azure AD callback error:', err)
        setError(err.message || 'Authentication failed')

        // Reset redirect state so user can try again
        resetRedirectState()

        // Show error for 5 seconds before redirecting
        setTimeout(() => {
          window.location.href = `/?error=${encodeURIComponent(err.message)}`
        }, 5000)
      }
    }

    handleCallback()
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-lg border-0 bg-card">
          <CardHeader className="space-y-3 text-center pb-4">
            <div className="mx-auto h-24 w-48 flex items-center justify-center mb-2">
              <Image
                src="/images/logos/wolthers-logo-off-white.svg"
                alt="Wolthers Coffee Logo"
                width={192}
                height={72}
                className="h-20 w-auto hidden dark:block"
              />
              <Image
                src="/images/logos/wolthers-logo-green.svg"
                alt="Wolthers Coffee Logo"
                width={192}
                height={72}
                className="h-20 w-auto dark:hidden"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-destructive">Authentication Error</h2>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-muted-foreground"></div>
              <span>Redirecting to login...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg border-0 bg-card">
        <CardHeader className="space-y-3 text-center pb-4">
          <div className="mx-auto h-24 w-48 flex items-center justify-center mb-2">
            <Image
              src="/images/logos/wolthers-logo-off-white.svg"
              alt="Wolthers Coffee Logo"
              width={192}
              height={72}
              className="h-20 w-auto hidden dark:block"
            />
            <Image
              src="/images/logos/wolthers-logo-green.svg"
              alt="Wolthers Coffee Logo"
              width={192}
              height={72}
              className="h-20 w-auto dark:hidden"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <FlaskConical className="h-10 w-10 text-primary" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">Signing you in...</h2>
              <p className="text-sm text-muted-foreground">Please wait while we set up your session</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">{status}</span>
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Wolthers Coffee Quality Control System
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

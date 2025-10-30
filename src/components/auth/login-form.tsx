'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { signInWithAzureADRedirect, handleAzureADRedirect } from '@/lib/azure-ad'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AlertCircle, FlaskConical, CheckCircle2 } from 'lucide-react'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processingAzure, setProcessingAzure] = useState(false)
  const [azureStatus, setAzureStatus] = useState('')

  // Handle Azure AD redirect on mount
  useEffect(() => {
    const handleAzureCallback = async () => {
      try {
        setAzureStatus('Checking for Microsoft authentication...')

        // Handle the redirect from Azure AD
        const response = await handleAzureADRedirect()

        if (!response) {
          // No Azure AD response, normal login flow
          return
        }

        // We have an Azure AD response, process it
        setProcessingAzure(true)
        setAzureStatus('Receiving Azure AD response...')

        // Get user info from Azure AD
        const { account } = response

        if (!account) {
          throw new Error('No account information in Microsoft response')
        }

        // Extract email from account
        const userEmail = (account.username as string | undefined) ||
                      (account.idTokenClaims?.email as string | undefined) ||
                      (account.idTokenClaims?.preferred_username as string | undefined) ||
                      ''

        if (!userEmail) {
          throw new Error('No email found in Microsoft account')
        }

        const name = account.name || userEmail.split('@')[0]

        console.log('Azure AD authentication successful:', { email: userEmail, name })

        setAzureStatus('Creating your session...')

        // Call backend to create session
        const apiResponse = await fetch('/api/auth/azure-signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail, name }),
        })

        if (!apiResponse.ok) {
          const data = await apiResponse.json()
          throw new Error(data.error || 'Failed to create session')
        }

        const data = await apiResponse.json()
        console.log('Temporary credentials received:', { email: data.email, userId: data.userId })

        setAzureStatus('Signing in...')

        // Sign in with the temporary password using Supabase client
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.tempPassword,
        })

        if (signInError) {
          console.error('Error signing in:', signInError)
          throw new Error('Failed to sign in: ' + signInError.message)
        }

        console.log('Signed in successfully')
        setAzureStatus('Success! Redirecting...')

        // Wait a moment for session to be fully established
        await new Promise(resolve => setTimeout(resolve, 500))

        window.location.href = '/dashboard'
      } catch (err: any) {
        console.error('Azure AD callback error:', err)
        setError(err.message || 'Authentication failed')
        setProcessingAzure(false)
      }
    }

    handleAzureCallback()
  }, [])

  const handleEmailEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && email && !showPassword) {
      setShowPassword(true)
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleMicrosoftLogin = async () => {
    // Prevent multiple simultaneous login attempts
    if (loading) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Use direct Azure AD authentication (via MSAL)
      await signInWithAzureADRedirect()
      // User will be redirected to Microsoft login, then back here
    } catch (err: any) {
      console.error('Microsoft login error:', err)
      setError(err.message || 'An unexpected error occurred')
      setLoading(false)
    }
  }

  // Show processing state when handling Azure AD callback
  if (processingAzure) {
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
                <span className="text-sm text-muted-foreground">{azureStatus}</span>
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card
        className="w-full max-w-sm shadow-lg border-0 bg-card"
      >
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
          <p className="text-xs text-muted-foreground">
            Sign in to access the quality control system
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
            {!showPassword ? (
              <Input
                type="email"
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleEmailEnter}
                required
                className="h-10 bg-background placeholder:font-light"
              />
            ) : (
              <div className="space-y-3">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 bg-background"
                  readOnly
                />
                <Input
                  type="password"
                  placeholder="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 bg-background placeholder:font-light"
                  autoFocus
                />
                <Button
                  type="submit"
                  className="w-full h-10 font-medium"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </div>
            )}
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-card text-muted-foreground">
                OR
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleMicrosoftLogin}
            disabled={loading}
            className="w-full h-10 font-medium"
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#F25022"
                d="M11.4 24H0V12.6h11.4V24z"
              />
              <path
                fill="#00A4EF"
                d="M24 24H12.6V12.6H24V24z"
              />
              <path
                fill="#7FBA00"
                d="M11.4 11.4H0V0h11.4v11.4z"
              />
              <path
                fill="#FFB900"
                d="M24 11.4H12.6V0H24v11.4z"
              />
            </svg>
            Continue with Microsoft
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Don&apos;t have an account? Contact your administrator for access.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
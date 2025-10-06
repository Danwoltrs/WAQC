'use client'

import { useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AlertCircle } from 'lucide-react'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          scopes: 'email profile openid',
          redirectTo: `${window.location.origin}/auth/callback`
        }
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card 
        className="w-full max-w-sm shadow-lg border-0" 
        style={{ backgroundColor: '#FAFAFA' }}
      >
        <CardHeader className="space-y-3 text-center pb-4">
          <div className="mx-auto h-24 w-48 flex items-center justify-center mb-2">
            <Image
              src="/images/logos/wolthers-logo-green.svg"
              alt="Wolthers Coffee Logo"
              width={192}
              height={72}
              className="h-20 w-auto"
            />
          </div>
          <p className="text-xs" style={{ color: 'rgba(0, 0, 0, 0.4)' }}>
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
                className="h-10 bg-white border-gray-300 placeholder:text-gray-400 placeholder:font-light"
                style={{ color: '#000000' }}
              />
            ) : (
              <div className="space-y-3">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 bg-white border-gray-300"
                  style={{ color: '#000000' }}
                  readOnly
                />
                <Input
                  type="password"
                  placeholder="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 bg-white border-gray-300 placeholder:text-gray-400 placeholder:font-light"
                  style={{ color: '#000000' }}
                  autoFocus
                />
                <Button
                  type="submit"
                  className="w-full h-10 font-medium"
                  disabled={loading}
                  style={{ color: '#2E5A47' }}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </div>
            )}
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3" style={{ backgroundColor: '#FAFAFA', color: 'rgba(0, 0, 0, 0.4)' }}>
                OR CONTINUE WITH
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleMicrosoftLogin}
            disabled={loading}
            className="w-full h-10 font-medium bg-white border-gray-300 hover:bg-gray-50"
            style={{ color: '#333333' }}
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

          <p className="text-xs text-center" style={{ color: 'rgba(0, 0, 0, 0.4)' }}>
            Don't have an account? Contact your administrator for access.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
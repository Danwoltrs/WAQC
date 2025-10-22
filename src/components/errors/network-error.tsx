'use client'

import { AlertCircle, Wifi, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface NetworkErrorProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function NetworkError({
  title = 'Connection Error',
  message = 'Unable to connect to the server. This may be due to network restrictions or firewall settings.',
  onRetry
}: NetworkErrorProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry()
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-6 space-y-6">
        <div className="flex items-center justify-center">
          <div className="relative">
            <Wifi className="h-16 w-16 text-muted-foreground" />
            <AlertCircle className="h-8 w-8 text-destructive absolute -bottom-1 -right-1" />
          </div>
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted-foreground">{message}</p>
        </div>

        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium">Possible solutions:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Check your internet connection</li>
              <li>Try using a mobile hotspot</li>
              <li>Contact IT to whitelist *.supabase.co</li>
              <li>Use a different network</li>
            </ul>
          </div>

          <Button
            onClick={handleRetry}
            className="w-full"
            variant="default"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Connection
          </Button>
        </div>

        <div className="text-xs text-center text-muted-foreground">
          If this problem persists, please contact your network administrator
        </div>
      </Card>
    </div>
  )
}

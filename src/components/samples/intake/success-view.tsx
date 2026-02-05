'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { trackingNumberToSlug } from '@/lib/utils'

interface SuccessViewProps {
  trackingNumber: string
  onReset: () => void
  asDialog?: boolean
}

export function SuccessView({ trackingNumber, onReset, asDialog = false }: SuccessViewProps) {
  const Wrapper = asDialog ? 'div' : Card
  const Content = asDialog ? 'div' : CardContent
  const slug = trackingNumberToSlug(trackingNumber)

  return (
    <Wrapper className={asDialog ? '' : 'w-full max-w-4xl mx-auto'}>
      <Content className={asDialog ? '' : 'pt-6'}>
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-2xl font-semibold">Sample Created Successfully</h2>
          <div className="space-y-2">
            <p className="text-muted-foreground">Tracking Number:</p>
            <Link href={`/samples/${slug}`}>
              <Badge variant="outline" className="text-lg px-4 py-2 font-mono cursor-pointer hover:bg-accent transition-colors">
                {trackingNumber}
              </Badge>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-3 mt-4">
            <Link href={`/samples/${slug}`}>
              <Button variant="outline" size="lg">
                View Sample
              </Button>
            </Link>
            <Button onClick={onReset} size="lg">
              Create Another Sample
            </Button>
          </div>
        </div>
      </Content>
    </Wrapper>
  )
}

'use client'

import { useParams } from 'next/navigation'
import { CvaJourney } from '@/components/cupping/cva/CvaJourney'

export default function CvaSessionPage() {
  const params = useParams<{ sessionId: string }>()
  const sessionId = params?.sessionId
  if (!sessionId) return null
  return <CvaJourney sessionId={sessionId} />
}
